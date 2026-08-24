import Stripe from "stripe";
import type { Context, Next } from "hono";
import type { DB } from "./db.js";
import { one, run, uid, nowISO } from "./db.js";

export function stripeClient(): Stripe {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  return new Stripe(secret);
}

export function billingConfigured(): boolean {
  return !!(
    process.env.STRIPE_SECRET_KEY &&
    process.env.STRIPE_PRICE_ID &&
    process.env.STRIPE_WEBHOOK_SECRET
  );
}

export function startOfMonthISO(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export async function monthlyUsage(db: DB, userId: string): Promise<number> {
  const res = await one<{ count: number }>(
    db,
    "SELECT COUNT(*) as count FROM generation_events WHERE user_id = ? AND created_at >= ?",
    [userId, startOfMonthISO()]
  );
  return res?.count || 0;
}

export async function recordGeneration(db: DB, userId: string): Promise<void> {
  await run(
    db,
    "INSERT INTO generation_events (id, user_id, created_at) VALUES (?, ?, ?)",
    [uid(), userId, nowISO()]
  );
}

export async function getOrCreateStripeCustomer(
  db: DB,
  stripe: Stripe,
  userId: string,
  email: string
): Promise<string> {
  const user = await one<{ stripe_customer_id: string | null }>(
    db,
    "SELECT stripe_customer_id FROM users WHERE id = ?",
    [userId]
  );
  if (user?.stripe_customer_id) {
    return user.stripe_customer_id;
  }

  const customer = await stripe.customers.create({
    email,
    metadata: { mafsar_user_id: userId },
  });

  await run(db, "UPDATE users SET stripe_customer_id = ? WHERE id = ?", [
    customer.id,
    userId,
  ]);

  return customer.id;
}

export async function applySubscriptionStatus(
  db: DB,
  stripeCustomerId: string,
  status: string
): Promise<void> {
  const plan = status === "active" || status === "trialing" ? "pro" : "free";
  await run(db, "UPDATE users SET plan = ? WHERE stripe_customer_id = ?", [
    plan,
    stripeCustomerId,
  ]);
}

export function requireQuota(db: DB) {
  return async (c: Context, next: Next) => {
    const userId = c.get("userId") as string;
    const user = await one<{ plan: string }>(
      db,
      "SELECT plan FROM users WHERE id = ?",
      [userId]
    );
    if (user?.plan !== "pro") {
      const used = await monthlyUsage(db, userId);
      const limit = Number(process.env.FREE_MONTHLY_GENERATIONS) || 20;
      if (used >= limit) {
        return c.json({ error: "quota_exceeded", limit, used }, 402);
      }
    }
    await next();
    if (c.res.status < 400) {
      await recordGeneration(db, userId);
    }
  };
}
