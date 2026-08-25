import Stripe from "stripe";
import type { DB } from "../db.js";
import { one, run } from "../db.js";
import { matchPriceId } from "./core.js";
import { type BillingProvider, type WebhookOutcome, NoSubscriptionError } from "./provider.js";

export function stripeClient(): Stripe {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  return new Stripe(secret);
}

export async function getOrCreateStripeCustomer(
  db: DB,
  stripe: Stripe,
  userId: string,
  email: string
): Promise<string> {
  const user = await one<{ billing_customer_id: string | null; stripe_customer_id: string | null }>(
    db,
    "SELECT billing_customer_id, stripe_customer_id FROM users WHERE id = ?",
    [userId]
  );
  if (user?.billing_customer_id) {
    return user.billing_customer_id;
  }
  if (user?.stripe_customer_id) {
    return user.stripe_customer_id;
  }

  const customer = await stripe.customers.create({
    email,
    metadata: { mafsar_user_id: userId },
  });

  const changed = await run(
    db,
    "UPDATE users SET billing_customer_id = ?, billing_provider = 'stripe', stripe_customer_id = ? WHERE id = ? AND billing_customer_id IS NULL",
    [customer.id, customer.id, userId]
  );
  if (changed === 0) {
    const existing = await one<{ billing_customer_id: string | null; stripe_customer_id: string | null }>(
      db,
      "SELECT billing_customer_id, stripe_customer_id FROM users WHERE id = ?",
      [userId]
    );
    if (existing?.billing_customer_id) return existing.billing_customer_id;
    if (existing?.stripe_customer_id) return existing.stripe_customer_id;
  }

  return customer.id;
}

export function planForPriceId(priceId: string): "plus" | "pro" | null {
  if (!priceId) return null;
  if (matchPriceId(priceId, process.env.STRIPE_PRICE_ID_PLUS)) return "plus";
  if (matchPriceId(priceId, process.env.STRIPE_PRICE_ID_PRO)) return "pro";
  if (matchPriceId(priceId, process.env.STRIPE_PRICE_ID)) return "pro";
  return null;
}

export async function applySubscriptionStatus(
  db: DB,
  stripeCustomerId: string,
  status: string,
  priceId?: string
): Promise<void> {
  let plan: "free" | "plus" | "pro" = "free";
  if (status === "active" || status === "trialing") {
    if (!priceId) return;
    const matched = planForPriceId(priceId);
    if (!matched) {
      console.warn("Unrecognized price ID:", priceId);
      return;
    }
    plan = matched;
  }
  await run(db, "UPDATE users SET plan = ? WHERE billing_customer_id = ? OR stripe_customer_id = ?", [
    plan,
    stripeCustomerId,
    stripeCustomerId,
  ]);
}

export const stripeProvider: BillingProvider = {
  name: "stripe",

  configured(): boolean {
    return !!(
      process.env.STRIPE_SECRET_KEY &&
      (process.env.STRIPE_PRICE_ID_PLUS || process.env.STRIPE_PRICE_ID_PRO || process.env.STRIPE_PRICE_ID) &&
      process.env.STRIPE_WEBHOOK_SECRET
    );
  },

  async createCheckout({ db, userId, email, plan, origin }) {
    const priceId = plan === "plus"
      ? process.env.STRIPE_PRICE_ID_PLUS
      : (process.env.STRIPE_PRICE_ID_PRO || process.env.STRIPE_PRICE_ID);
    if (!priceId) {
      throw new Error(`Stripe price ID not configured for plan ${plan}`);
    }

    const stripe = stripeClient();
    const customer = await getOrCreateStripeCustomer(db, stripe, userId, email);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/billing/success`,
      cancel_url: `${origin}/billing/cancel`,
    });

    if (!session.url) {
      throw new Error("Stripe checkout session URL is missing");
    }
    return session.url;
  },

  async createPortal({ db, userId, origin }) {
    const user = await one<{ billing_customer_id: string | null; stripe_customer_id: string | null }>(
      db,
      "SELECT billing_customer_id, stripe_customer_id FROM users WHERE id = ?",
      [userId]
    );
    const customerId = user?.billing_customer_id || user?.stripe_customer_id;
    if (!customerId) {
      throw new NoSubscriptionError("no_subscription");
    }

    const stripe = stripeClient();
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/billing/return`,
    });

    if (!session.url) {
      throw new Error("Stripe portal session URL is missing");
    }
    return session.url;
  },

  async handleWebhook(rawBody: string, signature: string): Promise<WebhookOutcome> {
    
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret || !signature) {
      return { kind: "invalid_signature" };
    }

    const stripe = stripeClient();
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch {
      return { kind: "invalid_signature" };
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.customer && session.subscription) {
        const sub = await stripe.subscriptions.retrieve(session.subscription as string);
        const priceId = sub.items?.data?.[0]?.price?.id;
        if (sub.status === "active" || sub.status === "trialing") {
          if (!priceId) return { kind: "ignored" };
          const plan = planForPriceId(priceId);
          if (!plan) {
            console.warn("Unrecognized price ID:", priceId);
            return { kind: "ignored" };
          }
          return { kind: "plan_change", customerId: session.customer as string, plan };
        } else {
          return { kind: "plan_change", customerId: session.customer as string, plan: "free" };
        }
      }
    } else if (event.type === "customer.subscription.updated") {
      const sub = event.data.object as Stripe.Subscription;
      const priceId = sub.items?.data?.[0]?.price?.id;
      if (sub.status === "active" || sub.status === "trialing") {
        if (!priceId) return { kind: "ignored" };
        const plan = planForPriceId(priceId);
        if (!plan) {
          console.warn("Unrecognized price ID:", priceId);
          return { kind: "ignored" };
        }
        return { kind: "plan_change", customerId: sub.customer as string, plan };
      } else {
        return { kind: "plan_change", customerId: sub.customer as string, plan: "free" };
      }
    } else if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      return { kind: "plan_change", customerId: sub.customer as string, plan: "free" };
    }

    return { kind: "ignored" };
  },
};
