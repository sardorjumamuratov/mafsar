import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { openDB, migrate, run, one, type DB } from "../src/db.js";
import { createApp } from "../src/app.js";
import { register, signAccessToken } from "../src/auth.js";

// Route-level billing tests: the webhook signature gate + event handling, and
// the checkout/portal auth+config states. Stripe is fully mocked — no network.
// constructEvent returns the request body parsed as JSON (so a test controls the
// event by sending it), and throws when the signature header is "bad" — this is
// how the "bad signature -> 400, touches no user row" case is exercised.
vi.mock("stripe", () => ({
  default: class StripeMock {
    customers = { create: vi.fn().mockResolvedValue({ id: "cus_new" }) };
    subscriptions = { retrieve: vi.fn(async (id: string) => ({ id, status: "active", items: { data: [{ price: { id: "price_pro" } }] } })) };
    checkout = { sessions: { create: vi.fn().mockResolvedValue({ url: "https://checkout.example" }) } };
    billingPortal = { sessions: { create: vi.fn().mockResolvedValue({ url: "https://portal.example" }) } };
    webhooks = {
      constructEvent: vi.fn((body: string, sig: string) => {
        if (sig === "bad") throw new Error("invalid signature");
        return JSON.parse(body);
      }),
    };
  },
}));

let db: DB;
let app: ReturnType<typeof createApp>;

const json = { "content-type": "application/json" };
const auth = (t: string) => ({ authorization: `Bearer ${t}`, ...json });

async function newUser(email: string) {
  const user = (await register(db, email, "password123"))!;
  return { user, token: await signAccessToken(user.id) };
}

function setBilling(on: boolean) {
    if (on) {
      process.env.STRIPE_SECRET_KEY = "sk_test";
      process.env.STRIPE_PRICE_ID_PLUS = "price_plus";
      process.env.STRIPE_PRICE_ID_PRO = "price_pro";
      process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    } else {
      delete process.env.STRIPE_SECRET_KEY;
      delete process.env.STRIPE_PRICE_ID_PLUS;
      delete process.env.STRIPE_PRICE_ID_PRO;
      delete process.env.STRIPE_PRICE_ID;
      delete process.env.STRIPE_WEBHOOK_SECRET;
    }
}

beforeEach(async () => {
  db = openDB(":memory:");
  await migrate(db);
  app = createApp(db);
  setBilling(true);
});

afterEach(() => setBilling(false));

describe("stripe webhook", () => {
  const sendEvent = (event: unknown, sig = "good") =>
    app.request("/v1/webhooks/stripe", {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": sig },
      body: JSON.stringify(event),
    });

  it("rejects a bad signature with 400 and touches no user row", async () => {
    const { user } = await newUser("wh1@mafsar.dev");
    await run(db, "UPDATE users SET stripe_customer_id = 'cus_123' WHERE id = ?", [user.id]);
    const res = await sendEvent(
      { type: "customer.subscription.deleted", data: { object: { customer: "cus_123" } } },
      "bad"
    );
    expect(res.status).toBe(400);
    const row = await one<{ plan: string }>(db, "SELECT plan FROM users WHERE id = ?", [user.id]);
    expect(row?.plan).toBe("free"); // unchanged — a forged event must not downgrade/upgrade
  });

  it("checkout.session.completed flips the user to pro", async () => {
    const { user } = await newUser("wh2@mafsar.dev");
    await run(db, "UPDATE users SET stripe_customer_id = 'cus_123' WHERE id = ?", [user.id]);
    const res = await sendEvent({
      type: "checkout.session.completed",
      data: { object: { customer: "cus_123", subscription: "sub_1" } },
    });
    expect(res.status).toBe(200);
    const row = await one<{ plan: string }>(db, "SELECT plan FROM users WHERE id = ?", [user.id]);
    expect(row?.plan).toBe("pro");
  });

  it("subscription.updated active + cancel_at_period_end does NOT downgrade", async () => {
    const { user } = await newUser("wh3@mafsar.dev");
    await run(db, "UPDATE users SET stripe_customer_id = 'cus_123', plan = 'pro' WHERE id = ?", [user.id]);
    const res = await sendEvent({
      type: "customer.subscription.updated",
      data: { object: { customer: "cus_123", status: "active", cancel_at_period_end: true, items: { data: [{ price: { id: "price_pro" } }] } } },
    });
    expect(res.status).toBe(200);
    const row = await one<{ plan: string }>(db, "SELECT plan FROM users WHERE id = ?", [user.id]);
    expect(row?.plan).toBe("pro"); // still paid through the period — the flag is not a downgrade
  });

  it("subscription.deleted downgrades to free", async () => {
    const { user } = await newUser("wh4@mafsar.dev");
    await run(db, "UPDATE users SET stripe_customer_id = 'cus_123', plan = 'pro' WHERE id = ?", [user.id]);
    const res = await sendEvent({
      type: "customer.subscription.deleted",
      data: { object: { customer: "cus_123" } },
    });
    expect(res.status).toBe(200);
    const row = await one<{ plan: string }>(db, "SELECT plan FROM users WHERE id = ?", [user.id]);
    expect(row?.plan).toBe("free");
  });

  it("an event for an unknown customer is a 200 no-op, not a 500", async () => {
    const res = await sendEvent({
      type: "customer.subscription.deleted",
      data: { object: { customer: "cus_ghost" } },
    });
    expect(res.status).toBe(200);
  });

  it("ignores unrecognized event types with 200", async () => {
    const res = await sendEvent({ type: "invoice.paid", data: { object: {} } });
    expect(res.status).toBe(200);
  });
});

describe("checkout + portal routes", () => {
  it("checkout requires a token (401)", async () => {
    const res = await app.request("/v1/billing/checkout", { method: "POST", headers: json, body: "{}" });
    expect(res.status).toBe(401);
  });

  it("checkout returns 501 when billing is not configured", async () => {
    setBilling(false);
    const { token } = await newUser("co1@mafsar.dev");
    const res = await app.request("/v1/billing/checkout", { method: "POST", headers: auth(token), body: "{}" });
    expect(res.status).toBe(501);
  });

  it("checkout creates a session and returns its url for plus", async () => {
    const { token } = await newUser("co2@mafsar.dev");
    const res = await app.request("/v1/billing/checkout", { method: "POST", headers: auth(token), body: '{"plan":"plus"}' });
    expect(res.status).toBe(200);
    expect((await res.json()).url).toBe("https://checkout.example");
  });
  
  it("checkout creates a session and returns its url for pro", async () => {
    const { token } = await newUser("co22@mafsar.dev");
    const res = await app.request("/v1/billing/checkout", { method: "POST", headers: auth(token), body: '{"plan":"pro"}' });
    expect(res.status).toBe(200);
    expect((await res.json()).url).toBe("https://checkout.example");
  });
  
  it("checkout rejects invalid plan", async () => {
    const { token } = await newUser("co23@mafsar.dev");
    const res = await app.request("/v1/billing/checkout", { method: "POST", headers: auth(token), body: '{"plan":"unknown"}' });
    expect(res.status).toBe(400);
  });
  
  it("/v1/blurb never increments any counter", async () => {
    const { user, token } = await newUser("blurb@mafsar.dev");
    await run(db, "UPDATE users SET plan = 'free' WHERE id = ?", [user.id]);
    const res = await app.request("/v1/blurb", { method: "POST", headers: auth(token), body: JSON.stringify({ title: "T", cardFronts: ["F"] }) });
    const count = await one(db, "SELECT COUNT(*) as c FROM generation_events WHERE user_id = ?", [user.id]);
    expect((count as any)?.c).toBe(0);
  });
  
  it("/v1/coding-grade never increments any counter", async () => {
    const { user, token } = await newUser("cgrade@mafsar.dev");
    await run(db, "UPDATE users SET plan = 'free' WHERE id = ?", [user.id]);
    const res = await app.request("/v1/coding-grade", { method: "POST", headers: auth(token), body: JSON.stringify({ concept: "C", reference: "R", language: "javascript", code: "code" }) });
    const count = await one(db, "SELECT COUNT(*) as c FROM generation_events WHERE user_id = ?", [user.id]);
    expect((count as any)?.c).toBe(0);
  });

  it("portal 404s when the user has no Stripe customer yet", async () => {
    const { token } = await newUser("co3@mafsar.dev");
    const res = await app.request("/v1/billing/portal", { method: "POST", headers: auth(token), body: "{}" });
    expect(res.status).toBe(404);
  });

  it("portal returns its url once a customer exists", async () => {
    const { user, token } = await newUser("co4@mafsar.dev");
    await run(db, "UPDATE users SET stripe_customer_id = 'cus_123' WHERE id = ?", [user.id]);
    const res = await app.request("/v1/billing/portal", { method: "POST", headers: auth(token), body: "{}" });
    expect(res.status).toBe(200);
    expect((await res.json()).url).toBe("https://portal.example");
  });

  it("portal requires a token (401)", async () => {
    const res = await app.request("/v1/billing/portal", { method: "POST", headers: json, body: "{}" });
    expect(res.status).toBe(401);
  });
});