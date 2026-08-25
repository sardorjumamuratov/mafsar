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

// 30/month: comfortably covers casual use (a few captured chats + one light
// practice session is ~15-25 calls) without ever pinching a free user who
// isn't cramming for something. Someone studying hard daily clears it within
// days — right when they're most motivated to upgrade. The actual per-call
// LLM cost (~$0.0006, see llm.ts) makes this a behavioral choice, not a cost
// one: even a generous free tier costs the business pennies per user.
const DEFAULT_FREE_MONTHLY_GENERATIONS = 30;

export function freeMonthlyLimit(): number {
  const raw = process.env.FREE_MONTHLY_GENERATIONS;
  // `Number(raw) || N` would silently turn an intentional "0" (kill the free
  // tier during an incident) back into the default — 0 is falsy, not unset.
  if (raw === undefined || raw === "") return DEFAULT_FREE_MONTHLY_GENERATIONS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_FREE_MONTHLY_GENERATIONS;
}

/** Stripe's success/cancel/return URLs must point at Mafsar's own domain — a
 * spoofed Host header (passed through by most proxies) would otherwise let a
 * request redirect a post-checkout user to an attacker-controlled origin.
 * Production must set PUBLIC_BASE_URL explicitly; only dev falls back to the
 * request's own headers. */
export function resolveOrigin(c: Context): string {
  const configured = process.env.PUBLIC_BASE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("PUBLIC_BASE_URL must be set in production");
  }
  const host = c.req.header("host");
  return host ? `${c.req.header("x-forwarded-proto") || "http"}://${host}` : "http://localhost:3000";
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

  // Two concurrent checkout attempts (e.g. a double-click before the button
  // disables) can both reach here with stripe_customer_id still NULL — the
  // `WHERE ... IS NULL` guard means only the first UPDATE actually lands. If
  // this one lost the race, the winner's id is what the webhook will later
  // match against, so use that instead of the orphaned customer just created.
  const changed = await run(
    db,
    "UPDATE users SET stripe_customer_id = ? WHERE id = ? AND stripe_customer_id IS NULL",
    [customer.id, userId]
  );
  if (changed === 0) {
    const existing = await one<{ stripe_customer_id: string | null }>(
      db,
      "SELECT stripe_customer_id FROM users WHERE id = ?",
      [userId]
    );
    if (existing?.stripe_customer_id) return existing.stripe_customer_id;
  }

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
      const limit = freeMonthlyLimit();
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
