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
    (process.env.STRIPE_PRICE_ID_PLUS || process.env.STRIPE_PRICE_ID_PRO || process.env.STRIPE_PRICE_ID) &&
    process.env.STRIPE_WEBHOOK_SECRET
  );
}

export type PlanLimits = {
  window: "month" | "day" | null;
  set: number | null;
  coding: number | null;
  practice: number | null;
};

export const PLANS: Record<string, PlanLimits> = {
  free: { window: "month", set: 3,  coding: 3,  practice: 10 },
  plus: { window: "day",   set: 10, coding: 10, practice: 10 },
  pro:  { window: null,    set: null, coding: null, practice: null },
};

function parseEnvLimit(raw: string | undefined, def: number | null): number | null {
  if (raw === undefined || raw === "") return def;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : def;
}

export function planLimits(plan: string): PlanLimits {
  const base = PLANS[plan] || PLANS.free;
  if (plan === "free") {
    return {
      window: (process.env.FREE_WINDOW === "day" || process.env.FREE_WINDOW === "month" ? process.env.FREE_WINDOW : base.window) as "month" | "day" | null,
      set: parseEnvLimit(process.env.FREE_SET_LIMIT, base.set),
      coding: parseEnvLimit(process.env.FREE_CODING_LIMIT, base.coding),
      practice: parseEnvLimit(process.env.FREE_PRACTICE_LIMIT, base.practice),
    };
  }
  if (plan === "plus") {
    return {
      window: (process.env.PLUS_WINDOW === "month" || process.env.PLUS_WINDOW === "day" ? process.env.PLUS_WINDOW : base.window) as "month" | "day" | null,
      set: parseEnvLimit(process.env.PLUS_SET_LIMIT, base.set),
      coding: parseEnvLimit(process.env.PLUS_CODING_LIMIT, base.coding),
      practice: parseEnvLimit(process.env.PLUS_PRACTICE_LIMIT, base.practice),
    };
  }
  return base;
}

export function resolveOrigin(c: Context): string {
  const configured = process.env.PUBLIC_BASE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("PUBLIC_BASE_URL must be set in production");
  }
  const host = c.req.header("host");
  return host ? `${c.req.header("x-forwarded-proto") || "http"}://${host}` : "http://localhost:3000";
}

export function windowStartISO(window: "month" | "day"): string {
  const now = new Date();
  if (window === "month") {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  }
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

export async function categoryUsage(db: DB, userId: string, category: string, window: "month" | "day"): Promise<number> {
  const res = await one<{ count: number }>(
    db,
    "SELECT COUNT(*) as count FROM generation_events WHERE user_id = ? AND category = ? AND created_at >= ?",
    [userId, category, windowStartISO(window)]
  );
  return res?.count || 0;
}

export async function recordGeneration(db: DB, userId: string, category: string): Promise<void> {
  await run(
    db,
    "INSERT INTO generation_events (id, user_id, category, created_at) VALUES (?, ?, ?, ?)",
    [uid(), userId, category, nowISO()]
  );
}

export async function usageSummary(db: DB, userId: string, plan: string) {
  const limits = planLimits(plan);
  if (limits.window === null) {
    return {
      set: { used: 0, limit: null },
      coding: { used: 0, limit: null },
      practice: { used: 0, limit: null },
      window: null
    };
  }

  const [setUsed, codingUsed, practiceUsed] = await Promise.all([
    categoryUsage(db, userId, "set", limits.window),
    categoryUsage(db, userId, "coding", limits.window),
    categoryUsage(db, userId, "practice", limits.window)
  ]);

  return {
    set: { used: setUsed, limit: limits.set },
    coding: { used: codingUsed, limit: limits.coding },
    practice: { used: practiceUsed, limit: limits.practice },
    window: limits.window
  };
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

export function planForPriceId(priceId: string): "plus" | "pro" | null {
  if (priceId && priceId === process.env.STRIPE_PRICE_ID_PLUS) return "plus";
  if (priceId && priceId === process.env.STRIPE_PRICE_ID_PRO) return "pro";
  if (priceId && priceId === process.env.STRIPE_PRICE_ID) return "pro";
  return null;
}

export async function applySubscriptionStatus(
  db: DB,
  stripeCustomerId: string,
  status: string,
  priceId?: string
): Promise<void> {
  let plan = "free";
  if (status === "active" || status === "trialing") {
    if (!priceId) return;
    const matched = planForPriceId(priceId);
    if (!matched) {
      console.warn("Unrecognized price ID:", priceId);
      return;
    }
    plan = matched;
  }
  await run(db, "UPDATE users SET plan = ? WHERE stripe_customer_id = ?", [
    plan,
    stripeCustomerId,
  ]);
}

export function requireQuota(db: DB, category: "set" | "coding" | "practice") {
  return async (c: Context, next: Next) => {
    const userId = c.get("userId") as string;
    const user = await one<{ plan: string }>(
      db,
      "SELECT plan FROM users WHERE id = ?",
      [userId]
    );
    const plan = user?.plan || "free";
    const limits = planLimits(plan);
    const limit = limits[category];
    
    let used = 0;
    if (limit !== null && limits.window !== null) {
      used = await categoryUsage(db, userId, category, limits.window);
      if (used >= limit) {
        return c.json({ error: "quota_exceeded", category, limit, used, window: limits.window, plan }, 402);
      }
    }
    await next();
    if (c.res.status < 400) {
      await recordGeneration(db, userId, category);
    }
  };
}
