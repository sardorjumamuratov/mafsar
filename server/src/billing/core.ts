import type { Context, Next } from "hono";
import type { DB } from "../db.js";
import { one, run, uid, nowISO } from "../db.js";

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

export function parseEnvLimit(raw: string | undefined, def: number | null): number | null {
  if (raw === undefined || raw === "") return def;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : def;
}

/**
 * Accounts that bypass every quota, listed by email in ADMIN_EMAILS
 * (comma-separated). Keyed on email rather than a user id because ids are
 * random `uid()` strings — there is no stable "first user" row to point at —
 * and kept in the environment rather than the repo so the owner's address is
 * not committed and access can be revoked without a deploy.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const raw = process.env.ADMIN_EMAILS;
  if (!raw) return false;
  const target = email.trim().toLowerCase();
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(target);
}

/**
 * The plan a user is actually served, which is their stored plan unless they
 * are an admin. Admins resolve to "pro" (unlimited) without their `plan`
 * column being rewritten, so revoking admin returns them to whatever they
 * genuinely pay for.
 */
export function effectivePlan(plan: string | null | undefined, email?: string | null): string {
  if (isAdminEmail(email)) return "pro";
  return plan || "free";
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

export async function applyPlanChange(
  db: DB,
  billingCustomerId: string,
  plan: "free" | "plus" | "pro"
): Promise<void> {
  if (!billingCustomerId) {
    throw new Error("Cannot apply plan change: billingCustomerId is falsy");
  }
  await run(db, "UPDATE users SET plan = ? WHERE billing_customer_id = ? OR stripe_customer_id = ?", [plan, billingCustomerId, billingCustomerId]);
}

/** Env value may be a single id or a comma-separated list ("pri_month,pri_year"). */
export function matchPriceId(priceId: string, envValue: string | undefined): boolean {
  if (!priceId || !envValue) return false;
  return envValue.split(",").map(s => s.trim()).filter(Boolean).includes(priceId);
}

export function requireQuota(db: DB, category: "set" | "coding" | "practice") {
  return async (c: Context, next: Next) => {
    const userId = c.get("userId") as string;
    const user = await one<{ plan: string; email: string }>(
      db,
      "SELECT plan, email FROM users WHERE id = ?",
      [userId]
    );
    const plan = effectivePlan(user?.plan, user?.email);
    const limits = planLimits(plan);
    const limit = limits[category];
    
    let eventId = "";

    if (limit !== null && limits.window !== null) {
      // One statement, so the count and the insert cannot interleave: the row
      // only lands if the window is still under the limit at write time.
      eventId = uid();
      const res = await run(
        db,
        `INSERT INTO generation_events (id, user_id, category, created_at)
         SELECT ?, ?, ?, ?
         WHERE (SELECT COUNT(*) FROM generation_events WHERE user_id = ? AND category = ? AND created_at >= ?) < ?`,
        [eventId, userId, category, nowISO(), userId, category, windowStartISO(limits.window), limit]
      );
      
      if (res === 0) {
        const used = await categoryUsage(db, userId, category, limits.window);
        return c.json({ error: "quota_exceeded", category, limit, used, window: limits.window, plan }, 402);
      }
    } else {
      // Unlimited plan
      eventId = uid();
      await run(
        db,
        "INSERT INTO generation_events (id, user_id, category, created_at) VALUES (?, ?, ?, ?)",
        [eventId, userId, category, nowISO()]
      );
    }

    await next();

    // Roll back if the downstream handler failed
    if (c.res.status >= 400 && eventId) {
      await run(db, "DELETE FROM generation_events WHERE id = ?", [eventId]);
    }
  };
}
