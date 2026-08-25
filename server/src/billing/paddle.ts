import { Paddle, Environment } from "@paddle/paddle-node-sdk";
import type { DB } from "../db.js";
import { one, run } from "../db.js";
import { matchPriceId } from "./core.js";
import { type BillingProvider, type WebhookOutcome, NoSubscriptionError } from "./provider.js";

export function paddleClient(): Paddle {
  const key = process.env.PADDLE_API_KEY;
  if (!key) throw new Error("PADDLE_API_KEY is not set");
  return new Paddle(key, {
    environment: process.env.PADDLE_ENV === "production" ? Environment.production : Environment.sandbox,
  });
}

export async function getOrCreatePaddleCustomer(
  db: DB,
  paddle: Paddle,
  userId: string,
  email: string
): Promise<string> {
  const user = await one<{ billing_customer_id: string | null }>(
    db,
    "SELECT billing_customer_id FROM users WHERE id = ?",
    [userId]
  );
  if (user?.billing_customer_id) {
    return user.billing_customer_id;
  }

  let customerId: string;
  try {
    const customer = await paddle.customers.create({ email });
    customerId = customer.id;
  } catch (err: any) {
    // Paddle rejects a duplicate email with a customer_already_exists error.
    // Adopt the existing customer id by listing matching customer records.
    const customers: any[] = [];
    for await (const c of paddle.customers.list({ email: [email] })) {
      customers.push(c);
    }
    if (customers.length > 0) {
      customerId = customers[0].id;
    } else {
      throw err;
    }
  }

  const changed = await run(
    db,
    "UPDATE users SET billing_customer_id = ?, billing_provider = 'paddle' WHERE id = ? AND billing_customer_id IS NULL",
    [customerId, userId]
  );
  if (changed === 0) {
    const existing = await one<{ billing_customer_id: string | null }>(
      db,
      "SELECT billing_customer_id FROM users WHERE id = ?",
      [userId]
    );
    if (existing?.billing_customer_id) return existing.billing_customer_id;
  }

  return customerId;
}

export function planForPaddlePriceId(priceId: string): "plus" | "pro" | null {
  if (!priceId) return null;
  if (matchPriceId(priceId, process.env.PADDLE_PRICE_ID_PLUS)) return "plus";
  if (matchPriceId(priceId, process.env.PADDLE_PRICE_ID_PRO)) return "pro";
  return null;
}

export const paddleProvider: BillingProvider = {
  name: "paddle",

  configured(): boolean {
    return !!(
      process.env.PADDLE_API_KEY &&
      process.env.PADDLE_WEBHOOK_SECRET &&
      (process.env.PADDLE_PRICE_ID_PLUS || process.env.PADDLE_PRICE_ID_PRO)
    );
  },

  async createCheckout({ db, userId, email, plan, origin }) {
    const priceId = plan === "plus"
      ? process.env.PADDLE_PRICE_ID_PLUS
      : process.env.PADDLE_PRICE_ID_PRO;
    if (!priceId) {
      throw new Error(`Paddle price ID not configured for plan ${plan}`);
    }

    const paddle = paddleClient();
    const customerId = await getOrCreatePaddleCustomer(db, paddle, userId, email);
    const primaryPriceId = priceId.split(",")[0].trim();

    const txn = await paddle.transactions.create({
      items: [{ priceId: primaryPriceId, quantity: 1 }],
      customerId,
    });

    if (!txn.checkout?.url) {
      throw new Error(
        "Paddle transaction checkout URL is missing. Ensure a default payment link is configured in the Paddle dashboard (Checkout -> Settings)."
      );
    }

    return txn.checkout.url;
  },

  async createPortal({ db, userId }) {
    const user = await one<{ billing_customer_id: string | null }>(
      db,
      "SELECT billing_customer_id FROM users WHERE id = ?",
      [userId]
    );
    if (!user?.billing_customer_id) {
      throw new NoSubscriptionError("no_subscription");
    }

    const paddle = paddleClient();
    const session = await paddle.customerPortalSessions.create(user.billing_customer_id, []);
    if (!session.urls?.general?.overview) {
      throw new Error("Paddle portal session URL is missing");
    }
    return session.urls.general.overview;
  },

  async handleWebhook(rawBody: string, signature: string): Promise<WebhookOutcome> {
    
    const secret = process.env.PADDLE_WEBHOOK_SECRET;
    if (!secret || !signature) {
      return { kind: "invalid_signature" };
    }

    const paddle = paddleClient();
    let event: any;
    try {
      event = await paddle.webhooks.unmarshal(rawBody, secret, signature);
    } catch {
      return { kind: "invalid_signature" };
    }

    if (!event) {
      return { kind: "invalid_signature" };
    }

    const eventType = event.eventType || event.event_type;
    const data = event.data;

    if (
      eventType === "subscription.created" ||
      eventType === "subscription.updated" ||
      eventType === "subscription.activated"
    ) {
      const status = data?.status;
      const customerId = data?.customerId || data?.customer_id;

      if (status === "active" || status === "trialing") {
        const priceId = data?.items?.[0]?.price?.id;
        if (!priceId) return { kind: "ignored" };
        const plan = planForPaddlePriceId(priceId);
        if (!plan) {
          console.warn("Unrecognized price ID:", priceId);
          return { kind: "ignored" };
        }
        return { kind: "plan_change", customerId, plan };
      } else if (
        status === "canceled" ||
        status === "past_due" ||
        status === "paused"
      ) {
        return { kind: "plan_change", customerId, plan: "free" };
      }
      return { kind: "ignored" };
    }

    if (eventType === "subscription.canceled") {
      const customerId = data?.customerId || data?.customer_id;
      return { kind: "plan_change", customerId, plan: "free" };
    }

    return { kind: "ignored" };
  },
};
