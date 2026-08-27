import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { openDB, migrate, run, one, type DB } from "../src/db.js";
import { createApp } from "../src/app.js";
import { register, signAccessToken } from "../src/auth.js";
import { Environment } from "@paddle/paddle-node-sdk";

vi.mock("@paddle/paddle-node-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@paddle/paddle-node-sdk")>();
  return {
    ...actual,
    Paddle: class PaddleMock {
      customers = {
        create: vi.fn().mockResolvedValue({ id: "ctm_new" }),
        list: vi.fn().mockReturnValue([{ id: "ctm_existing" }])
      };
      pricingPreview = vi.fn().mockResolvedValue({
        details: { lineItems: [{ formattedTotals: { total: ".00" } }] }
      });
      webhooks = {
        unmarshal: vi.fn((body: string, secret: string, sig: string) => {
          if (sig === "bad") throw new Error("invalid signature");
          return JSON.parse(body);
        })
      };
    },
    Environment: actual.Environment,
    EventName: actual.EventName,
    SubscriptionStatus: actual.SubscriptionStatus
  };
});

let db: DB;
let app: ReturnType<typeof createApp>;

const json = { "content-type": "application/json" };
const auth = (t: string) => ({ authorization: 'Bearer ' + t, ...json });

async function newUser(email: string) {
  const user = (await register(db, email, "password123"))!;
  return { user, token: await signAccessToken(user.id) };
}

function setBilling(on: boolean) {
    if (on) {
      process.env.BILLING_PROVIDER = "paddle";
      process.env.PADDLE_API_KEY = "test_key";
      process.env.PADDLE_PRICE_ID_PLUS = "pri_plus";
      process.env.PADDLE_PRICE_ID_PRO = "pri_pro";
      process.env.PADDLE_WEBHOOK_SECRET = "whsec_test";
    } else {
      delete process.env.BILLING_PROVIDER;
      delete process.env.PADDLE_API_KEY;
      delete process.env.PADDLE_PRICE_ID_PLUS;
      delete process.env.PADDLE_PRICE_ID_PRO;
      delete process.env.PADDLE_WEBHOOK_SECRET;
    }
}

beforeEach(async () => {
  db = openDB(":memory:");
  await migrate(db);
  app = createApp(db);
  setBilling(true);
});

afterEach(() => setBilling(false));

describe("paddle webhook", () => {
  const sendEvent = (event: unknown, sig = "good") =>
    app.request("/v1/webhooks/paddle", {
      method: "POST",
      headers: { "content-type": "application/json", "paddle-signature": sig },
      body: JSON.stringify(event),
    });

  it("rejects a bad signature with 400 and touches no user row", async () => {
    const { user } = await newUser("wh1@mafsar.dev");
    await run(db, "UPDATE users SET billing_customer_id = 'ctm_123' WHERE id = ?", [user.id]);
    const res = await sendEvent(
      { eventType: "subscription.canceled", data: { customerId: "ctm_123" } },
      "bad"
    );
    expect(res.status).toBe(400);
    const row = await one<{ plan: string }>(db, "SELECT plan FROM users WHERE id = ?", [user.id]);
    expect(row?.plan).toBe("free");
  });

  it("subscription.activated flips the user to pro", async () => {
    const { user } = await newUser("wh2@mafsar.dev");
    await run(db, "UPDATE users SET billing_customer_id = 'ctm_123' WHERE id = ?", [user.id]);
    const res = await sendEvent({
      eventType: "subscription.activated",
      data: { customerId: "ctm_123", items: [{ price: { id: "pri_pro" } }], status: "active" },
    });
    expect(res.status).toBe(200);
    const row = await one<{ plan: string }>(db, "SELECT plan FROM users WHERE id = ?", [user.id]);
    expect(row?.plan).toBe("pro");
  });

  it("subscription.updated active does NOT downgrade", async () => {
    const { user } = await newUser("wh3@mafsar.dev");
    await run(db, "UPDATE users SET billing_customer_id = 'ctm_123', plan = 'pro' WHERE id = ?", [user.id]);
    const res = await sendEvent({
      eventType: "subscription.updated",
      data: { customerId: "ctm_123", items: [{ price: { id: "pri_pro" } }], status: "active", scheduledChange: { action: "cancel" } },
    });
    expect(res.status).toBe(200);
    const row = await one<{ plan: string }>(db, "SELECT plan FROM users WHERE id = ?", [user.id]);
    expect(row?.plan).toBe("pro");
  });

  it("subscription.canceled downgrades to free", async () => {
    const { user } = await newUser("wh4@mafsar.dev");
    await run(db, "UPDATE users SET billing_customer_id = 'ctm_123', plan = 'pro' WHERE id = ?", [user.id]);
    const res = await sendEvent({
      eventType: "subscription.canceled",
      data: { customerId: "ctm_123", items: [{ price: { id: "pri_pro" } }], status: "canceled" },
    });
    expect(res.status).toBe(200);
    const row = await one<{ plan: string }>(db, "SELECT plan FROM users WHERE id = ?", [user.id]);
    expect(row?.plan).toBe("free");
  });

  it("subscription.updated past_due does NOT downgrade (dunning)", async () => {
    const { user } = await newUser("wh_pastdue@mafsar.dev");
    await run(db, "UPDATE users SET billing_customer_id = 'ctm_123', plan = 'pro' WHERE id = ?", [user.id]);
    const res = await sendEvent({
      eventType: "subscription.updated",
      data: { customerId: "ctm_123", status: "past_due" },
    });
    expect(res.status).toBe(200);
    const row = await one<{ plan: string }>(db, "SELECT plan FROM users WHERE id = ?", [user.id]);
    expect(row?.plan).toBe("pro");
  });

  it("webhook missing customer id does not throw and ignores", async () => {
    const res = await sendEvent({
      eventType: "subscription.updated",
      data: { status: "active", items: [{ price: { id: "pri_pro" } }] }, // No customerId
    });
    expect(res.status).toBe(200);
  });

});
