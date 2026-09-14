# 02 — Abuse protection: rate limits, sign-up cap, CORS

**Depends on:** nothing.

**Touches:** new `server/src/ratelimit.ts`, `server/src/app.ts`, new
`server/tests/ratelimit.test.ts`, and new `server/tests/auth-limits.test.ts`.

## Why

Nothing currently slows down fake sign-ups or password guessing:

- **`POST /v1/auth/register`** has no email check, issues tokens immediately, and
  has no limit. Every free account gets 3 AI generations a month, so a script that
  creates throwaway accounts can run up the OpenRouter bill without limit.
- **`POST /v1/auth/login`** has no limit, so passwords can be guessed forever.
- **`/v1/coding-grade` and `/v1/blurb`** call the LLM with no quota, so one account
  can call them in a loop.
- **`cors()`** is called with no options, which allows every website. Any page can
  script the API from its visitors' browsers.

The only existing limiter is the share-code lookup inside `createApp` (30 per
minute). Its `Map` never forgets keys. This task replaces it with one shared,
tested limiter.

## Design decisions (don't change these)

- **In memory, per process.** The server is a single Railway instance, and a
  redeploy resetting the counters is acceptable for a throttle. The credit limit
  on the OpenRouter key (a manual step below) is the hard backstop.
- **Limiters are created inside `createApp`,** so each test's app starts with
  clean counters.
- **Account cap per IP: 10 per 24 hours by default,** configurable with
  `SIGNUP_ACCOUNTS_PER_IP_PER_DAY`. It's deliberately generous: schools and
  universities put a whole class behind one IP address.
- **Only accounts actually created count toward the cap.** A duplicate or
  mistyped sign-up doesn't.
- **Failed logins are also limited per submitted email** (distributed guessing
  across many IPs). This applies whether or not the account exists, so the lock
  can't be used to discover which emails are registered.
- **The client IP comes from `X-Forwarded-For`.** Railway's community answers say
  its edge proxy controls this header and that the first entry is the real client.
  Its official docs don't say so, which is why there's a production check below.
  `CLIENT_IP_SOURCE` (`xff-first` default, `xff-last`, `x-real-ip`) lets you
  switch without a code change.
- **A request with no client IP is not IP-limited** and logs a warning once.
  Sharing one "unknown" bucket would lock out every user the moment a header went
  missing.

---

## Step 1 — Write the tests (they should fail)

### 1a. Create `server/tests/ratelimit.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { slidingWindow, clientIp, corsOrigin } from "../src/ratelimit.js";

const H = (h: Record<string, string>) => new Headers(h);

describe("slidingWindow", () => {
  it("allows up to the limit, then blocks", () => {
    const l = slidingWindow({ limit: 3, windowMs: 1000 });
    expect([1, 2, 3].map(() => l.hit("k", 0).allowed)).toEqual([true, true, true]);
    expect(l.hit("k", 0).allowed).toBe(false);
  });

  it("the window slides: old hits stop counting", () => {
    const l = slidingWindow({ limit: 2, windowMs: 1000 });
    l.hit("k", 0);
    l.hit("k", 500);
    expect(l.hit("k", 900).allowed).toBe(false);
    expect(l.hit("k", 1001).allowed).toBe(true); // the hit at 0 has expired
  });

  it("keys are independent", () => {
    const l = slidingWindow({ limit: 1, windowMs: 1000 });
    expect(l.hit("a", 0).allowed).toBe(true);
    expect(l.hit("b", 0).allowed).toBe(true);
    expect(l.hit("a", 0).allowed).toBe(false);
  });

  it("reports when the caller may retry, in whole seconds", () => {
    const l = slidingWindow({ limit: 1, windowMs: 60_000 });
    l.hit("k", 0);
    expect(l.hit("k", 15_000)).toEqual({ allowed: false, retryAfterSec: 45 });
  });

  it("count / record / blocked / clear let a caller charge only on success", () => {
    const l = slidingWindow({ limit: 2, windowMs: 1000 });
    expect(l.blocked("k", 0)).toBe(false);
    l.record("k", 0);
    l.record("k", 0);
    expect(l.count("k", 0)).toBe(2);
    expect(l.blocked("k", 0)).toBe(true);
    l.clear("k");
    expect(l.count("k", 0)).toBe(0);
  });

  it("forgets keys whose hits have all expired (the map must not grow forever)", () => {
    const l = slidingWindow({ limit: 5, windowMs: 1000 });
    for (let i = 0; i < 1000; i++) l.record(`old-${i}`, 0);
    for (let i = 0; i < 1000; i++) l.record(`new-${i}`, 5000);
    expect(l.size()).toBe(1000);
  });
});

describe("clientIp", () => {
  it("defaults to the first X-Forwarded-For entry", () => {
    expect(clientIp(H({ "x-forwarded-for": "203.0.113.7, 10.0.0.2" }))).toBe("203.0.113.7");
  });

  it("can use the last entry, for proxies that append", () => {
    expect(clientIp(H({ "x-forwarded-for": "1.2.3.4, 203.0.113.7" }), null, "xff-last")).toBe("203.0.113.7");
  });

  it("can prefer X-Real-IP", () => {
    expect(clientIp(H({ "x-forwarded-for": "1.2.3.4", "x-real-ip": "198.51.100.9" }), null, "x-real-ip")).toBe("198.51.100.9");
  });

  it("ignores values that are not IP addresses", () => {
    expect(clientIp(H({ "x-forwarded-for": "not-an-ip", "x-real-ip": "198.51.100.9" }))).toBe("198.51.100.9");
  });

  it("accepts IPv6", () => {
    expect(clientIp(H({ "x-forwarded-for": "2001:db8::1" }))).toBe("2001:db8::1");
  });

  it("falls back to the socket address, then null", () => {
    expect(clientIp(H({}), "192.0.2.1")).toBe("192.0.2.1");
    expect(clientIp(H({}))).toBeNull();
  });
});

describe("corsOrigin", () => {
  const base = "https://mafsar-production.up.railway.app";

  it("allows Chrome and Edge extension origins", () => {
    const o = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";
    expect(corsOrigin(o, base)).toBe(o);
  });

  it("allows Firefox extension origins", () => {
    const o = "moz-extension://0b7f4a1e-9c3d-4f2a-8e6b-1a2b3c4d5e6f";
    expect(corsOrigin(o, base)).toBe(o);
  });

  it("allows our own site", () => {
    expect(corsOrigin(base, base)).toBe(base);
  });

  it("refuses every other website", () => {
    expect(corsOrigin("https://evil.example", base)).toBeNull();
    expect(corsOrigin("chrome-extension://short", base)).toBeNull();
    expect(corsOrigin("", base)).toBeNull();
  });

  it("allows localhost only when asked (development)", () => {
    expect(corsOrigin("http://localhost:5173", base, true)).toBe("http://localhost:5173");
    expect(corsOrigin("http://localhost:5173", base, false)).toBeNull();
  });
});
```

### 1b. Create `server/tests/auth-limits.test.ts`

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openDB, migrate, type DB } from "../src/db.js";
import { createApp } from "../src/app.js";
import { register, signAccessToken } from "../src/auth.js";

// Route-level abuse limits. Every request that should count carries an
// X-Forwarded-For, the way Railway's edge delivers it.

let db: DB;
let app: ReturnType<typeof createApp>;
const ENV_KEYS = ["SIGNUP_ACCOUNTS_PER_IP_PER_DAY", "CLIENT_IP_SOURCE"];

async function fresh(env: Record<string, string> = {}) {
  Object.assign(process.env, env);
  db = openDB(":memory:");
  await migrate(db);
  app = createApp(db);
}

beforeEach(async () => {
  await fresh();
});
afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});

const from = (xff: string) => ({ "content-type": "application/json", "x-forwarded-for": xff });
const post = (path: string, body: unknown, headers: Record<string, string>) =>
  app.request(path, { method: "POST", headers, body: JSON.stringify(body) });

describe("login", () => {
  it("limits attempts per IP (30 per 15 minutes)", async () => {
    const codes: number[] = [];
    for (let i = 0; i < 31; i++) {
      codes.push((await post("/v1/auth/login", { email: `nobody${i}@mafsar.dev`, password: "wrongpass1" }, from("203.0.113.5"))).status);
    }
    expect(codes.slice(0, 30).every((s) => s === 401)).toBe(true);
    expect(codes[30]).toBe(429);
  });

  it("a 429 says when to retry", async () => {
    let res!: Response;
    for (let i = 0; i < 31; i++) {
      res = await post("/v1/auth/login", { email: `n${i}@mafsar.dev`, password: "wrongpass1" }, from("203.0.113.6"));
    }
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    const body = await res.json();
    expect(body.error).toBe("rate_limited");
    expect(body.message).toBeTruthy();
  });

  it("other IPs are unaffected", async () => {
    for (let i = 0; i < 31; i++) {
      await post("/v1/auth/login", { email: `x${i}@mafsar.dev`, password: "wrongpass1" }, from("203.0.113.7"));
    }
    expect((await post("/v1/auth/login", { email: "y@mafsar.dev", password: "wrongpass1" }, from("198.51.100.1"))).status).toBe(401);
  });

  it("limits failed attempts per email across IPs (distributed guessing)", async () => {
    await register(db, "victim@mafsar.dev", "correct-horse");
    for (let i = 0; i < 10; i++) {
      const res = await post("/v1/auth/login", { email: "victim@mafsar.dev", password: `guess${i}xx` }, from(`198.51.100.${i + 10}`));
      expect(res.status).toBe(401);
    }
    // While the lock holds, even the right password is refused.
    expect((await post("/v1/auth/login", { email: "victim@mafsar.dev", password: "correct-horse" }, from("192.0.2.200"))).status).toBe(429);
    await register(db, "other@mafsar.dev", "password123");
    expect((await post("/v1/auth/login", { email: "other@mafsar.dev", password: "password123" }, from("192.0.2.201"))).status).toBe(200);
  });

  it("the email lock does not reveal whether an account exists", async () => {
    for (let i = 0; i < 10; i++) {
      await post("/v1/auth/login", { email: "ghost@mafsar.dev", password: `guess${i}xx` }, from(`198.51.100.${i + 50}`));
    }
    expect((await post("/v1/auth/login", { email: "ghost@mafsar.dev", password: "anything1" }, from("192.0.2.202"))).status).toBe(429);
  });

  it("a successful sign-in clears the failure count", async () => {
    await register(db, "me@mafsar.dev", "password123");
    for (let i = 0; i < 9; i++) {
      await post("/v1/auth/login", { email: "me@mafsar.dev", password: `typo${i}xxx` }, from("192.0.2.10"));
    }
    expect((await post("/v1/auth/login", { email: "me@mafsar.dev", password: "password123" }, from("192.0.2.10"))).status).toBe(200);
    for (let i = 0; i < 9; i++) {
      const res = await post("/v1/auth/login", { email: "me@mafsar.dev", password: `typo${i}yyy` }, from("192.0.2.10"));
      expect(res.status).toBe(401);
    }
  });

  it("the email lock is case-insensitive", async () => {
    for (let i = 0; i < 10; i++) {
      await post("/v1/auth/login", { email: "Case@Mafsar.dev", password: `guess${i}xx` }, from(`198.51.100.${i + 100}`));
    }
    expect((await post("/v1/auth/login", { email: "case@mafsar.dev", password: "whatever1" }, from("192.0.2.203"))).status).toBe(429);
  });
});

describe("register", () => {
  it("caps accounts created per IP per day", async () => {
    await fresh({ SIGNUP_ACCOUNTS_PER_IP_PER_DAY: "3" });
    for (let i = 0; i < 3; i++) {
      const res = await post("/v1/auth/register", { email: `u${i}@mafsar.dev`, password: "password123" }, from("203.0.113.20"));
      expect(res.status).toBe(200);
    }
    const blocked = await post("/v1/auth/register", { email: "u3@mafsar.dev", password: "password123" }, from("203.0.113.20"));
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error).toBe("signup_limit");
    expect((await post("/v1/auth/register", { email: "u4@mafsar.dev", password: "password123" }, from("203.0.113.21"))).status).toBe(200);
  });

  it("failed sign-ups don't count toward the account cap", async () => {
    await fresh({ SIGNUP_ACCOUNTS_PER_IP_PER_DAY: "1" });
    await register(db, "taken@mafsar.dev", "password123");
    expect((await post("/v1/auth/register", { email: "taken@mafsar.dev", password: "password123" }, from("203.0.113.22"))).status).toBe(409);
    expect((await post("/v1/auth/register", { email: "new@mafsar.dev", password: "password123" }, from("203.0.113.22"))).status).toBe(200);
  });

  it("limits sign-up attempts per IP (20 per hour)", async () => {
    await register(db, "dupe@mafsar.dev", "password123");
    const codes: number[] = [];
    for (let i = 0; i < 21; i++) {
      codes.push((await post("/v1/auth/register", { email: "dupe@mafsar.dev", password: "password123" }, from("203.0.113.23"))).status);
    }
    expect(codes.slice(0, 20).every((s) => s === 409)).toBe(true);
    expect(codes[20]).toBe(429);
  });
});

describe("client IP source", () => {
  it("default: each distinct leftmost X-Forwarded-For is its own bucket", async () => {
    // Safe only because Railway's edge owns this header. Production has a manual
    // check for exactly this; see the prompt.
    const codes: number[] = [];
    for (let i = 0; i < 35; i++) {
      codes.push((await post("/v1/auth/login", { email: `s${i}@mafsar.dev`, password: "wrongpass1" }, from(`203.0.113.${i + 100}`))).status);
    }
    expect(codes.every((s) => s === 401)).toBe(true);
  });

  it("CLIENT_IP_SOURCE=xff-last ignores a spoofed leftmost entry", async () => {
    await fresh({ CLIENT_IP_SOURCE: "xff-last" });
    const codes: number[] = [];
    for (let i = 0; i < 31; i++) {
      codes.push((await post("/v1/auth/login", { email: `t${i}@mafsar.dev`, password: "wrongpass1" }, from(`10.9.8.${i}, 203.0.113.99`))).status);
    }
    expect(codes[30]).toBe(429);
  });

  it("requests without any client IP are not IP-limited", async () => {
    const codes: number[] = [];
    for (let i = 0; i < 35; i++) {
      codes.push((await post("/v1/auth/login", { email: `z${i}@mafsar.dev`, password: "wrongpass1" }, { "content-type": "application/json" })).status);
    }
    expect(codes.every((s) => s === 401)).toBe(true);
  });
});

describe("other auth routes", () => {
  it("limits token refresh per IP (60 per minute)", async () => {
    const codes: number[] = [];
    for (let i = 0; i < 61; i++) {
      codes.push((await post("/v1/auth/refresh", { refreshToken: "bogus" }, from("203.0.113.30"))).status);
    }
    expect(codes.slice(0, 60).every((s) => s === 401)).toBe(true);
    expect(codes[60]).toBe(429);
  });

  it("limits starting Google sign-in per IP (10 per 10 minutes)", async () => {
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) codes.push((await post("/v1/auth/google/start", {}, from("203.0.113.32"))).status);
    expect(codes[10]).toBe(429);
  });

  it("limits Google sign-in polling per IP (120 per minute)", async () => {
    const codes: number[] = [];
    for (let i = 0; i < 121; i++) {
      codes.push((await post("/v1/auth/google/poll", { pollToken: "x".repeat(40) }, from("203.0.113.31"))).status);
    }
    expect(codes.slice(0, 120).every((s) => s === 410)).toBe(true);
    expect(codes[120]).toBe(429);
  });
});

describe("unmetered LLM routes", () => {
  async function authed() {
    const user = (await register(db, "grader@mafsar.dev", "password123"))!;
    return { "content-type": "application/json", authorization: `Bearer ${await signAccessToken(user.id)}` };
  }

  it("coding-grade is limited to 20 per minute per user", async () => {
    const headers = await authed();
    const codes: number[] = [];
    for (let i = 0; i < 21; i++) {
      codes.push((await app.request("/v1/coding-grade", { method: "POST", headers, body: "{}" })).status);
    }
    // The body is invalid on purpose: the limiter runs before validation, so no model is called.
    expect(codes.slice(0, 20).every((s) => s === 400)).toBe(true);
    expect(codes[20]).toBe(429);
  });

  it("blurb shares the same per-user budget", async () => {
    const headers = await authed();
    for (let i = 0; i < 20; i++) await app.request("/v1/coding-grade", { method: "POST", headers, body: "{}" });
    expect((await app.request("/v1/blurb", { method: "POST", headers, body: "{}" })).status).toBe(429);
  });
});

describe("CORS", () => {
  it("does not grant arbitrary websites access", async () => {
    const res = await app.request("/healthz", { headers: { origin: "https://evil.example" } });
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("grants the extension", async () => {
    const origin = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";
    const res = await app.request("/healthz", { headers: { origin } });
    expect(res.headers.get("access-control-allow-origin")).toBe(origin);
  });
});
```

Run them and confirm they fail:

```bash
cd server && npx vitest run tests/ratelimit.test.ts tests/auth-limits.test.ts
```

---

## Step 2 — Implement

### 2a. Create `server/src/ratelimit.ts`

```ts
import { isIP } from "node:net";
import type { Context, Next } from "hono";

// Abuse limits. In memory and per process on purpose: the server is a single
// Railway instance, and a deploy resetting the counters is fine for a throttle.
// The hard backstop against a runaway AI bill is the credit limit on the
// provider key, not this file.

export interface WindowLimiter {
  /** Hits recorded for `key` inside the window ending at `now`. */
  count(key: string, now?: number): number;
  /** True once `key` has reached the limit. */
  blocked(key: string, now?: number): boolean;
  /** Record one hit for `key`. */
  record(key: string, now?: number): void;
  /** Check and record in one step. A blocked hit is not recorded. */
  hit(key: string, now?: number): { allowed: boolean; retryAfterSec: number };
  /** Whole seconds until `key` is under the limit again (0 if it already is). */
  retryAfter(key: string, now?: number): number;
  clear(key: string): void;
  /** Keys currently tracked. Exposed so tests can prove stale keys are dropped. */
  size(): number;
}

export function slidingWindow(opts: { limit: number; windowMs: number }): WindowLimiter {
  const hits = new Map<string, number[]>();
  let writesSinceSweep = 0;

  const fresh = (key: string, now: number): number[] => {
    const list = hits.get(key);
    if (!list) return [];
    const kept = list.filter((t) => now - t < opts.windowMs);
    if (kept.length) hits.set(key, kept);
    else hits.delete(key);
    return kept;
  };

  // Keys are IPs and emails, so without this the map grows for the life of the
  // process. Sweeping every 1000 writes keeps it proportional to recent traffic.
  const sweep = (now: number) => {
    if (++writesSinceSweep < 1000) return;
    writesSinceSweep = 0;
    for (const key of [...hits.keys()]) fresh(key, now);
  };

  const api: WindowLimiter = {
    count: (key, now = Date.now()) => fresh(key, now).length,
    blocked: (key, now = Date.now()) => fresh(key, now).length >= opts.limit,
    record(key, now = Date.now()) {
      const list = fresh(key, now);
      list.push(now);
      hits.set(key, list);
      sweep(now);
    },
    retryAfter(key, now = Date.now()) {
      const list = fresh(key, now);
      if (list.length < opts.limit) return 0;
      return Math.max(1, Math.ceil((list[0] + opts.windowMs - now) / 1000));
    },
    hit(key, now = Date.now()) {
      if (api.blocked(key, now)) return { allowed: false, retryAfterSec: api.retryAfter(key, now) };
      api.record(key, now);
      return { allowed: true, retryAfterSec: 0 };
    },
    clear: (key) => {
      hits.delete(key);
    },
    size: () => hits.size,
  };
  return api;
}

export const DEFAULT_LIMITS = {
  loginPerIp: { limit: 30, windowMs: 15 * 60_000 },
  loginFailuresPerEmail: { limit: 10, windowMs: 15 * 60_000 },
  registerPerIp: { limit: 20, windowMs: 60 * 60_000 },
  // Generous on purpose: a school or university puts a whole class behind one IP.
  accountsPerIp: { limit: 10, windowMs: 24 * 60 * 60_000 },
  refreshPerIp: { limit: 60, windowMs: 60_000 },
  googleStartPerIp: { limit: 10, windowMs: 10 * 60_000 },
  // The extension polls every couple of seconds while a Google sign-in tab is open.
  googlePollPerIp: { limit: 120, windowMs: 60_000 },
  // LLM routes with no quota of their own.
  llmPerUser: { limit: 20, windowMs: 60_000 },
};

export type IpSource = "xff-first" | "xff-last" | "x-real-ip";

/**
 * The client's IP address, or null.
 *
 * On Railway the edge proxy owns X-Forwarded-For and (per Railway's community
 * answers, not its docs) the first entry is the connecting client. That claim is
 * verified against production by hand; see docs/prompts/02-abuse-protection.md.
 * If it ever stops holding, switch CLIENT_IP_SOURCE rather than editing this.
 */
export function clientIp(
  headers: { get(name: string): string | null },
  remoteAddr?: string | null,
  source: IpSource = "xff-first"
): string | null {
  const xff = (headers.get("x-forwarded-for") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const real = (headers.get("x-real-ip") || "").trim();
  const order =
    source === "xff-last" ? [xff[xff.length - 1], real]
    : source === "x-real-ip" ? [real, xff[0]]
    : [xff[0], real];
  for (const candidate of [...order, remoteAddr]) {
    if (candidate && isIP(candidate)) return candidate;
  }
  return null;
}

/**
 * The Access-Control-Allow-Origin value for a browser request, or null to send
 * none. Only the extension (Chrome/Edge and Firefox origin formats), our own
 * site, and, in development, localhost are allowed.
 */
export function corsOrigin(origin: string, publicBaseUrl?: string, allowLocalhost = false): string | null {
  if (!origin) return null;
  if (/^chrome-extension:\/\/[a-p]{32}$/.test(origin)) return origin;
  if (/^moz-extension:\/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(origin)) return origin;
  if (publicBaseUrl) {
    try {
      if (new URL(publicBaseUrl).origin === origin) return origin;
    } catch {
      /* a malformed PUBLIC_BASE_URL just doesn't match */
    }
  }
  if (allowLocalhost && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return null;
}

export function tooMany(
  c: Context,
  retryAfterSec: number,
  message = "Too many attempts. Try again shortly.",
  error = "rate_limited"
) {
  c.header("Retry-After", String(retryAfterSec));
  return c.json({ error, message, retryAfter: retryAfterSec }, 429);
}

let warnedNoIp = false;

/** Limit a route per client IP. A request with no IP is let through (and logged once). */
export function limitByIp(limiter: WindowLimiter, getIp: (c: Context) => string | null) {
  return async (c: Context, next: Next) => {
    const ip = getIp(c);
    if (!ip) {
      if (!warnedNoIp) {
        warnedNoIp = true;
        console.warn("rate limit: request has no client IP; IP limits are not applied");
      }
      return next();
    }
    const r = limiter.hit(ip);
    if (!r.allowed) return tooMany(c, r.retryAfterSec);
    return next();
  };
}

/** Limit a route per signed-in user. Must run after requireAuth. */
export function limitByUser(limiter: WindowLimiter) {
  return async (c: Context, next: Next) => {
    const userId = c.get("userId") as string | undefined;
    if (!userId) return next();
    const r = limiter.hit(userId);
    if (!r.allowed) return tooMany(c, r.retryAfterSec, "Slow down: too many requests in a minute.");
    return next();
  };
}
```

### 2b. `server/src/app.ts`

**Imports.** Add:

```ts
import { DEFAULT_LIMITS, clientIp, corsOrigin, limitByIp, limitByUser, slidingWindow, tooMany, type IpSource } from "./ratelimit.js";
```

**CORS and limiters.** Find:

```ts
  // The extension / future web app call the API cross-origin.
  app.use("*", cors());
```

Replace with:

```ts
  // CORS stops other websites from calling the API from a visitor's browser.
  // The extension is exempt anyway (it holds a host permission for this origin),
  // and server-to-server callers such as payment webhooks send no Origin.
  app.use("*", cors({
    origin: (origin) => corsOrigin(origin, process.env.PUBLIC_BASE_URL, process.env.NODE_ENV !== "production"),
  }));

  // Abuse limits: see src/ratelimit.ts. Created here so each app instance, and so
  // each test, starts with clean counters.
  const ipSource = (): IpSource => {
    const v = process.env.CLIENT_IP_SOURCE;
    return v === "xff-last" || v === "x-real-ip" ? v : "xff-first";
  };
  const requestIp = (c: any): string | null =>
    clientIp(c.req.raw.headers, c.env?.incoming?.socket?.remoteAddress, ipSource());
  const limits = {
    loginPerIp: slidingWindow(DEFAULT_LIMITS.loginPerIp),
    loginFailuresPerEmail: slidingWindow(DEFAULT_LIMITS.loginFailuresPerEmail),
    registerPerIp: slidingWindow(DEFAULT_LIMITS.registerPerIp),
    accountsPerIp: slidingWindow({
      ...DEFAULT_LIMITS.accountsPerIp,
      limit: Number(process.env.SIGNUP_ACCOUNTS_PER_IP_PER_DAY) || DEFAULT_LIMITS.accountsPerIp.limit,
    }),
    refreshPerIp: slidingWindow(DEFAULT_LIMITS.refreshPerIp),
    googleStartPerIp: slidingWindow(DEFAULT_LIMITS.googleStartPerIp),
    googlePollPerIp: slidingWindow(DEFAULT_LIMITS.googlePollPerIp),
    llmPerUser: slidingWindow(DEFAULT_LIMITS.llmPerUser),
  };
```

**Register and login.** Find the two routes, which today read:

```ts
  app.post("/v1/auth/register", async (c) => {
    const body = registerSchema.parse(await c.req.json());
    const user = await register(db, body.email, body.password);
    if (!user) return c.json({ error: "email_taken" }, 409);
    return c.json({
      accessToken: await signAccessToken(user.id),
      refreshToken: await signRefreshToken(user.id),
      user: { id: user.id, email: user.email },
    });
  });

  app.post("/v1/auth/login", async (c) => {
    const body = loginSchema.parse(await c.req.json());
    const user = await login(db, body.email, body.password);
    if (!user) return c.json({ error: "invalid_credentials" }, 401);
    return c.json({
      accessToken: await signAccessToken(user.id),
      refreshToken: await signRefreshToken(user.id),
      user: { id: user.id, email: user.email },
    });
  });
```

Replace with:

```ts
  app.post("/v1/auth/register", limitByIp(limits.registerPerIp, requestIp), async (c) => {
    const ip = requestIp(c);
    // Checked before hashing (cheap to refuse), recorded only once an account
    // actually exists, so a duplicate or mistyped sign-up costs nothing.
    if (ip && limits.accountsPerIp.blocked(ip)) {
      return tooMany(
        c,
        limits.accountsPerIp.retryAfter(ip),
        "Too many accounts were created from this network today. Try again tomorrow.",
        "signup_limit"
      );
    }
    const body = registerSchema.parse(await c.req.json());
    const user = await register(db, body.email, body.password);
    if (!user) return c.json({ error: "email_taken" }, 409);
    if (ip) limits.accountsPerIp.record(ip);
    return c.json({
      accessToken: await signAccessToken(user.id),
      refreshToken: await signRefreshToken(user.id),
      user: { id: user.id, email: user.email },
    });
  });

  app.post("/v1/auth/login", limitByIp(limits.loginPerIp, requestIp), async (c) => {
    const body = loginSchema.parse(await c.req.json());
    // Keyed on the submitted email whether or not the account exists, so the
    // lock can't be used to find out which emails are registered.
    const emailKey = body.email.trim().toLowerCase();
    if (limits.loginFailuresPerEmail.blocked(emailKey)) {
      return tooMany(
        c,
        limits.loginFailuresPerEmail.retryAfter(emailKey),
        "Too many failed sign-ins for this email. Try again in a few minutes."
      );
    }
    const user = await login(db, body.email, body.password);
    if (!user) {
      limits.loginFailuresPerEmail.record(emailKey);
      return c.json({ error: "invalid_credentials" }, 401);
    }
    limits.loginFailuresPerEmail.clear(emailKey);
    return c.json({
      accessToken: await signAccessToken(user.id),
      refreshToken: await signRefreshToken(user.id),
      user: { id: user.id, email: user.email },
    });
  });
```

**Other auth routes.** Add the limiter as the first handler of each. Change only
the route line:

| Find | Replace with |
|---|---|
| `app.post("/v1/auth/refresh", async (c) => {` | `app.post("/v1/auth/refresh", limitByIp(limits.refreshPerIp, requestIp), async (c) => {` |
| `app.post("/v1/auth/google/start", async (c) => {` | `app.post("/v1/auth/google/start", limitByIp(limits.googleStartPerIp, requestIp), async (c) => {` |
| `app.post("/v1/auth/google/poll", async (c) => {` | `app.post("/v1/auth/google/poll", limitByIp(limits.googlePollPerIp, requestIp), async (c) => {` |

**Unmetered LLM routes:**

| Find | Replace with |
|---|---|
| `app.post("/v1/coding-grade", async (c) => {` | `app.post("/v1/coding-grade", limitByUser(limits.llmPerUser), async (c) => {` |
| `app.post("/v1/blurb", async (c) => {` | `app.post("/v1/blurb", limitByUser(limits.llmPerUser), async (c) => {` |

**Share lookups: move to the shared limiter.** Find:

```ts
  const shareLookups = new Map<string, number[]>();
  function shareRateLimited(userId: string): boolean {
    const now = Date.now();
    const hits = (shareLookups.get(userId) || []).filter((t) => now - t < 60_000);
    hits.push(now);
    shareLookups.set(userId, hits);
    return hits.length > 30;
  }
```

Replace with:

```ts
  const shareLookups = slidingWindow({ limit: 30, windowMs: 60_000 });
```

Keep the comment above it. Then find `if (shareRateLimited(userId)) {` and replace
it with `if (!shareLookups.hit(userId).allowed) {`. The existing test in
`tests/share.test.ts` must still pass unchanged.

---

## Verification

```bash
cd server && npx vitest run && npx tsc --noEmit
```

Every server test must pass, old and new. An existing test may break because it
makes more than 10 wrong logins for one email. If so, don't loosen the limit.
Give that test a distinct email per attempt and explain why in your report.

```bash
for f in tests/*.test.mjs; do node "$f" > /dev/null || echo "FAIL $f"; done
```

## Report

- The diff of every changed file, and the test output (failing first, then passing).
- **Say explicitly that you did not run the production checks below.** They are
  for the owner.

---

## For the owner, after deploying

### 1. Check that the IP limit can't be bypassed with a fake header

Run this from your own machine against production. Each request sends a
*different* fake `X-Forwarded-For` and a different email:

```bash
for i in $(seq 1 35); do curl -s -o /dev/null -w "%{http_code}\n" -X POST https://mafsar-production.up.railway.app/v1/auth/login -H "content-type: application/json" -H "X-Forwarded-For: 203.0.113.$i" -d "{\"email\":\"probe$i@example.com\",\"password\":\"wrongpass1\"}"; done
```

- **Expected:** `401` for the first 30 lines, then `429`. Railway ignored the fake
  header and counted your real IP.
- **If all 35 are `401`:** the fake header is being trusted. Set
  `CLIENT_IP_SOURCE=xff-last` in Railway, redeploy, and run it again. If that
  still doesn't produce `429`, try `x-real-ip`.

Running this locks sign-in from your IP for 15 minutes.

### 2. Put a hard cap on AI spend

In OpenRouter, open the API key Railway uses and set a **credit limit**, for
example a little above a normal month. Even if every limit here failed, the
bill couldn't pass that number.

### 3. Optional: loosen the sign-up cap

If a school or university hits the account cap, raise
`SIGNUP_ACCOUNTS_PER_IP_PER_DAY` in Railway. No deploy of new code is needed.
