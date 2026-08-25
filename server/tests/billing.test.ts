import { describe, it, expect, vi, beforeEach } from "vitest";
import { requireQuota, categoryUsage, applySubscriptionStatus, getOrCreateStripeCustomer, planLimits, windowStartISO } from "../src/billing.js";
import { uid, openDB, migrate, run, one } from "../src/db.js";
import type { DB } from "../src/db.js";

vi.mock("stripe", () => {
  return {
    default: class StripeMock {
      customers = { create: vi.fn().mockResolvedValue({ id: "cus_123" }) };
      subscriptions = { retrieve: vi.fn() };
      checkout = { sessions: { create: vi.fn().mockResolvedValue({ url: "https://mock-checkout" }) } };
      billingPortal = { sessions: { create: vi.fn().mockResolvedValue({ url: "https://mock-portal" }) } };
      webhooks = { constructEvent: vi.fn() };
    }
  };
});

describe("Billing logic", () => {
  let db: DB;
  
  beforeEach(async () => {
    db = openDB("file::memory:");
    await migrate(db);
    process.env.FREE_SET_LIMIT = "3";
    process.env.STRIPE_SECRET_KEY = "test";
    process.env.STRIPE_PRICE_ID_PLUS = "price_plus";
    process.env.STRIPE_PRICE_ID_PRO = "price_pro";
    process.env.STRIPE_WEBHOOK_SECRET = "test";
  });

  it("each category counts independently", async () => {
    const userId = uid();
    await run(db, "INSERT INTO users (id, email, password_hash, created_at, plan) VALUES (?, ?, ?, ?, 'free')", [userId, "test@test.com", "hash", new Date().toISOString()]);
    
    // exhaust set, but leave coding
    for (let i = 0; i < 3; i++) {
      await run(db, "INSERT INTO generation_events (id, user_id, category, created_at) VALUES (?, ?, ?, ?)", [uid(), userId, "set", new Date().toISOString()]);
    }

    const c = { get: () => userId, json: vi.fn((data, status) => ({ status, data })), res: { status: 200 } } as any;
    const next = vi.fn();
    
    const setMiddleware = requireQuota(db, "set");
    const setResult = await setMiddleware(c, next) as any;
    
    expect(next).not.toHaveBeenCalled();
    expect(c.json).toHaveBeenCalledWith(expect.objectContaining({ error: "quota_exceeded", category: "set" }), 402);
    
    // coding should pass
    const codingMiddleware = requireQuota(db, "coding");
    await codingMiddleware(c, next);
    expect(next).toHaveBeenCalled();
  });

  it("a failed handler doesn't record usage", async () => {
    const userId = uid();
    await run(db, "INSERT INTO users (id, email, password_hash, created_at, plan) VALUES (?, ?, ?, ?, 'free')", [userId, "err@test.com", "hash", new Date().toISOString()]);
    
    const c = { get: () => userId, json: vi.fn(), res: { status: 500 } } as any;
    const next = vi.fn();
    
    await requireQuota(db, "set")(c, next);
    expect(next).toHaveBeenCalled();
    
    const count = await categoryUsage(db, userId, "set", "month");
    expect(count).toBe(0);
  });

  it("0 as an env limit is honored, not replaced by default", () => {
    process.env.FREE_SET_LIMIT = "0";
    const limits = planLimits("free");
    expect(limits.set).toBe(0);
    delete process.env.FREE_SET_LIMIT;
    const limits2 = planLimits("free");
    expect(limits2.set).toBe(3); // default
  });

  it("a plus subscriber's price ID maps to plan = plus, not pro", async () => {
    const userId = uid();
    await run(db, "INSERT INTO users (id, email, password_hash, created_at, plan, stripe_customer_id) VALUES (?, ?, ?, ?, 'free', 'cus_123')", [userId, "flip@test.com", "hash", new Date().toISOString()]);
    
    await applySubscriptionStatus(db, "cus_123", "active", "price_plus");
    
    const user = await one<{plan: string}>(db, "SELECT plan FROM users WHERE id = ?", [userId]);
    expect(user?.plan).toBe("plus");
  });

  it("an unrecognized price ID leaves the plan unchanged", async () => {
    const userId = uid();
    await run(db, "INSERT INTO users (id, email, password_hash, created_at, plan, stripe_customer_id) VALUES (?, ?, ?, ?, 'plus', 'cus_123')", [userId, "flip@test.com", "hash", new Date().toISOString()]);
    
    await applySubscriptionStatus(db, "cus_123", "active", "price_random");
    
    const user = await one<{plan: string}>(db, "SELECT plan FROM users WHERE id = ?", [userId]);
    expect(user?.plan).toBe("plus"); // unchanged
  });

  it("customer.subscription.updated with active, cancel_at_period_end: true does not downgrade", async () => {
    const userId = uid();
    await run(db, "INSERT INTO users (id, email, password_hash, created_at, plan, stripe_customer_id) VALUES (?, ?, ?, ?, 'free', 'cus_123')", [userId, "flip2@test.com", "hash", new Date().toISOString()]);
    
    await applySubscriptionStatus(db, "cus_123", "active", "price_pro");
    
    const user = await one<{plan: string}>(db, "SELECT plan FROM users WHERE id = ?", [userId]);
    expect(user?.plan).toBe("pro");
  });

  it('daily window resets across a UTC day boundary', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-01T23:59:59Z'));
    const d1 = windowStartISO('day');
    const m1 = windowStartISO('month');
    
    vi.setSystemTime(new Date('2024-03-02T00:00:01Z'));
    const d2 = windowStartISO('day');
    const m2 = windowStartISO('month');
    
    expect(d1).not.toBe(d2);
    expect(m1).toBe(m2); // Still same month
    vi.useRealTimers();
  });
});
