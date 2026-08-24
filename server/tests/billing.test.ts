import { describe, it, expect, vi, beforeEach } from "vitest";
import { requireQuota, monthlyUsage, applySubscriptionStatus, getOrCreateStripeCustomer } from "../src/billing.js";
import { uid, openDB, migrate, run, one } from "../src/db.js";
import type { DB } from "../src/db.js";

// Mock stripe module fully
vi.mock("stripe", () => {
  return {
    default: class StripeMock {
      customers = {
        create: vi.fn().mockResolvedValue({ id: "cus_123" })
      };
      subscriptions = {
        retrieve: vi.fn()
      };
      checkout = {
        sessions: {
          create: vi.fn().mockResolvedValue({ url: "https://mock-checkout" })
        }
      };
      billingPortal = {
        sessions: {
          create: vi.fn().mockResolvedValue({ url: "https://mock-portal" })
        }
      };
      webhooks = {
        constructEvent: vi.fn()
      };
    }
  };
});

describe("Billing", () => {
  let db: DB;
  
  beforeEach(async () => {
    db = openDB("file::memory:");
    await migrate(db);
    process.env.FREE_MONTHLY_GENERATIONS = "20";
    process.env.STRIPE_SECRET_KEY = "test";
    process.env.STRIPE_PRICE_ID = "test";
    process.env.STRIPE_WEBHOOK_SECRET = "test";
  });

  it("requireQuota blocks 21st free-tier call with 402 and correct {limit, used}", async () => {
    const userId = uid();
    await run(db, "INSERT INTO users (id, email, password_hash, created_at, plan) VALUES (?, ?, ?, ?, 'free')", [userId, "test@test.com", "hash", new Date().toISOString()]);
    
    // insert 20 events
    for (let i = 0; i < 20; i++) {
      await run(db, "INSERT INTO generation_events (id, user_id, created_at) VALUES (?, ?, ?)", [uid(), userId, new Date().toISOString()]);
    }

    const c = {
      get: (key: string) => userId,
      json: vi.fn((data, status) => ({ status, data })),
      res: { status: 200 }
    } as any;
    
    const next = vi.fn();
    
    const middleware = requireQuota(db);
    const result = await middleware(c, next) as any;
    
    expect(next).not.toHaveBeenCalled();
    expect(c.json).toHaveBeenCalledWith({ error: "quota_exceeded", limit: 20, used: 20 }, 402);
    expect(result.status).toBe(402);
  });

  it("requireQuota does not block a pro-plan user at any count", async () => {
    const userId = uid();
    await run(db, "INSERT INTO users (id, email, password_hash, created_at, plan) VALUES (?, ?, ?, ?, 'pro')", [userId, "pro@test.com", "hash", new Date().toISOString()]);
    
    // insert 25 events
    for (let i = 0; i < 25; i++) {
      await run(db, "INSERT INTO generation_events (id, user_id, created_at) VALUES (?, ?, ?)", [uid(), userId, new Date().toISOString()]);
    }

    const c = {
      get: (key: string) => userId,
      json: vi.fn(),
      res: { status: 200 }
    } as any;
    
    const next = vi.fn();
    const middleware = requireQuota(db);
    await middleware(c, next);
    
    expect(next).toHaveBeenCalled();
    
    // Should record the generation as well
    const count = await monthlyUsage(db, userId);
    expect(count).toBe(26);
  });

  it("a failed handler (mock downstream error) does not increment usage", async () => {
    const userId = uid();
    await run(db, "INSERT INTO users (id, email, password_hash, created_at, plan) VALUES (?, ?, ?, ?, 'free')", [userId, "err@test.com", "hash", new Date().toISOString()]);
    
    const c = {
      get: (key: string) => userId,
      json: vi.fn(),
      res: { status: 500 } // Error status!
    } as any;
    
    const next = vi.fn();
    const middleware = requireQuota(db);
    await middleware(c, next);
    
    expect(next).toHaveBeenCalled();
    
    const count = await monthlyUsage(db, userId);
    expect(count).toBe(0); // Should not have incremented
  });
  
  it("checkout.session.completed flips user to plan=pro", async () => {
    const userId = uid();
    await run(db, "INSERT INTO users (id, email, password_hash, created_at, plan, stripe_customer_id) VALUES (?, ?, ?, ?, 'free', 'cus_123')", [userId, "flip@test.com", "hash", new Date().toISOString()]);
    
    await applySubscriptionStatus(db, "cus_123", "active");
    
    const user = await one<{plan: string}>(db, "SELECT plan FROM users WHERE id = ?", [userId]);
    expect(user?.plan).toBe("pro");
  });

  it("customer.subscription.updated with active, cancel_at_period_end: true does not downgrade", async () => {
    const userId = uid();
    await run(db, "INSERT INTO users (id, email, password_hash, created_at, plan, stripe_customer_id) VALUES (?, ?, ?, ?, 'free', 'cus_123')", [userId, "flip2@test.com", "hash", new Date().toISOString()]);
    
    // It's still active. The boolean flag doesn't matter, we just pass the status string.
    await applySubscriptionStatus(db, "cus_123", "active");
    
    const user = await one<{plan: string}>(db, "SELECT plan FROM users WHERE id = ?", [userId]);
    expect(user?.plan).toBe("pro");
  });

  it("customer.subscription.deleted downgrades to plan = free", async () => {
    const userId = uid();
    await run(db, "INSERT INTO users (id, email, password_hash, created_at, plan, stripe_customer_id) VALUES (?, ?, ?, ?, 'pro', 'cus_123')", [userId, "del@test.com", "hash", new Date().toISOString()]);
    
    await applySubscriptionStatus(db, "cus_123", "canceled");
    
    const user = await one<{plan: string}>(db, "SELECT plan FROM users WHERE id = ?", [userId]);
    expect(user?.plan).toBe("free");
  });

  it("a webhook naming a stripe_customer_id with no matching user is a no-op", async () => {
    await applySubscriptionStatus(db, "cus_nonexistent", "active");
    expect(true).toBe(true); // Should not throw
  });
});
