# 06 — Server error reporting (Sentry)

**Depends on:** nothing. It edits `server/src/app.ts` and
`server/src/privacy.ts`, so run it on its own (see the README).

**Touches:** new `server/src/observability.ts`, `server/src/app.ts`,
`server/src/index.ts`, `server/src/privacy.ts`, `server/package.json` (adds
`@sentry/node`), and new `server/tests/observability.test.ts`.

## Why

The server's only record of an error is `console.error`. If "Capture this page"
or generation starts failing for users, nobody finds out until someone complains.

## Design (don't change)

- **One seam.** All reporting goes through `reportError()` in
  `src/observability.ts`. It sends to a pluggable *sink*: a no-op by default,
  Sentry when `SENTRY_DSN` is set, and a fake in tests. Nothing else imports
  Sentry.
- **What gets reported:**
  - **Every unhandled error**, at level `error`.
  - **`LLMError`**, at level `warning`. It's operational (a provider outage or a
    retired model), but it must still be visible.
  - **Billing errors** that routes catch themselves.
- **What doesn't:** validation errors (400). They're the caller's mistake.
- **Privacy.** Reports carry only these tags: the error and stack, the HTTP
  method, a *normalized* route (share and team codes replaced), the status, and
  the random user id. Never request bodies (they hold the user's captured text),
  never Authorization headers or cookies, and never email addresses.
- **Reporting must never break a request.** If the sink throws, the error is
  swallowed and the normal error response still goes out.

---

## Step 1 — Write the tests (they should fail)

Create `server/tests/observability.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openDB, migrate, type DB } from "../src/db.js";
import { createApp } from "../src/app.js";
import { register, signAccessToken } from "../src/auth.js";
import { registerSchema } from "../src/schema.js";
import { initSentry, normalizeRoute, setErrorSink, type ErrorEvent } from "../src/observability.js";

let db: DB;
let app: ReturnType<typeof createApp>;
let events: ErrorEvent[];

beforeEach(async () => {
  events = [];
  setErrorSink((e) => events.push(e));
  db = openDB(":memory:");
  await migrate(db);
  app = createApp(db);
});
afterEach(() => {
  setErrorSink(null);
  delete process.env.SENTRY_DSN;
});

const SECRET = "captured-private-lecture-notes";

describe("reporting from the error handler", () => {
  it("reports an unhandled error once, with route tags and no request content", async () => {
    app.post("/boom", async (c) => {
      await c.req.json();
      throw new Error("database exploded");
    });
    const res = await app.request("/boom", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer should-not-leak" },
      body: JSON.stringify({ text: SECRET }),
    });

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "internal" });
    expect(events).toHaveLength(1);
    const [e] = events;
    expect(e.level).toBe("error");
    expect((e.error as Error).message).toBe("database exploded");
    expect(e.tags).toMatchObject({ method: "POST", route: "/boom", status: "500" });
    const tagText = JSON.stringify(e.tags);
    expect(tagText).not.toContain(SECRET);
    expect(tagText).not.toContain("should-not-leak");
  });

  it("reports LLM failures as warnings and still returns the actionable 502", async () => {
    app.get("/llm-down", () => {
      throw Object.assign(new Error("provider is down"), { name: "LLMError", status: 502 });
    });
    const res = await app.request("/llm-down");
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("llm_error");
    expect(events).toHaveLength(1);
    expect(events[0].level).toBe("warning");
  });

  it("does not report validation errors", async () => {
    app.post("/invalid", () => {
      registerSchema.parse({});
      return new Response("unreachable");
    });
    expect((await app.request("/invalid", { method: "POST" })).status).toBe(400);
    expect(events).toHaveLength(0);
  });

  it("tags the signed-in user by id, never by email", async () => {
    const user = (await register(db, "tagged@mafsar.dev", "password123"))!;
    app.get("/v1/boom", () => {
      throw new Error("x");
    });
    await app.request("/v1/boom", { headers: { authorization: `Bearer ${await signAccessToken(user.id)}` } });
    expect(events[0].tags.userId).toBe(user.id);
    expect(JSON.stringify(events[0].tags)).not.toContain("tagged@mafsar.dev");
  });

  it("a broken sink never breaks the response", async () => {
    setErrorSink(() => {
      throw new Error("sink down");
    });
    app.get("/boom2", () => {
      throw new Error("x");
    });
    const res = await app.request("/boom2");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "internal" });
  });
});

describe("normalizeRoute", () => {
  it("replaces share and team codes so they never reach the error tracker", () => {
    expect(normalizeRoute("/v1/share/7KX2M9QRTA")).toBe("/v1/share/:code");
    expect(normalizeRoute("/v1/share/revoke")).toBe("/v1/share/revoke");
    expect(normalizeRoute("/v1/share")).toBe("/v1/share");
    expect(normalizeRoute("/v1/teams/abc123/leave")).toBe("/v1/teams/:id/leave");
    expect(normalizeRoute("/v1/teams/join")).toBe("/v1/teams/join");
    expect(normalizeRoute("/v1/teams")).toBe("/v1/teams");
    expect(normalizeRoute("/s/ABCDEF")).toBe("/s/:code");
    expect(normalizeRoute("/t/ABCDEF")).toBe("/t/:code");
    expect(normalizeRoute("/v1/sync")).toBe("/v1/sync");
  });
});

describe("initSentry", () => {
  it("does nothing without SENTRY_DSN", async () => {
    delete process.env.SENTRY_DSN;
    expect(await initSentry()).toBe(false);
  });
});
```

Run it and confirm it fails:

```bash
cd server && npx vitest run tests/observability.test.ts
```

---

## Step 2 — Implement

### 2a. Add the dependency

```bash
cd server && npm install @sentry/node
```

### 2b. Create `server/src/observability.ts`

```ts
// Error reporting. Everything goes through reportError() into a sink: a no-op by
// default, Sentry when SENTRY_DSN is set (initSentry), a fake in tests. Nothing
// else in the server imports Sentry.
//
// Privacy: events carry the error, its stack, and a few tags (method, normalized
// route, status, random user id). Never request bodies (they hold captured study
// text), headers, cookies or email addresses. privacy.ts describes this.

export type ErrorLevel = "error" | "warning";
export type ErrorEvent = { error: unknown; level: ErrorLevel; tags: Record<string, string> };
export type ErrorSink = (event: ErrorEvent) => void;

const noop: ErrorSink = () => {};
let sink: ErrorSink = noop;

export function setErrorSink(next: ErrorSink | null): void {
  sink = next ?? noop;
}

/** Share and team codes are secrets-ish handles; keep them out of the error tracker. */
export function normalizeRoute(path: string): string {
  return path
    .replace(/^\/v1\/share\/(?!revoke$)[^/]+/, "/v1/share/:code")
    .replace(/^\/v1\/teams\/(?!join$)[^/]+/, "/v1/teams/:id")
    .replace(/^\/(s|t)\/[^/]+/, "/$1/:code");
}

export function reportError(
  error: unknown,
  ctx: { level?: ErrorLevel; method?: string; path?: string; status?: number; userId?: string } = {}
): void {
  try {
    const tags: Record<string, string> = {};
    if (ctx.method) tags.method = ctx.method;
    if (ctx.path) tags.route = normalizeRoute(ctx.path);
    if (ctx.status) tags.status = String(ctx.status);
    if (ctx.userId) tags.userId = ctx.userId;
    sink({ error, level: ctx.level ?? "error", tags });
  } catch {
    // Reporting must never turn one failure into two.
  }
}

/** Wire the sink to Sentry. Returns false (and loads nothing) when SENTRY_DSN is unset. */
export async function initSentry(dsn = process.env.SENTRY_DSN): Promise<boolean> {
  if (!dsn) return false;
  const Sentry = await import("@sentry/node");
  Sentry.init({
    dsn,
    environment: process.env.RAILWAY_ENVIRONMENT_NAME || process.env.NODE_ENV || "development",
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend(event) {
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        if (event.request.headers) {
          delete event.request.headers.authorization;
          delete event.request.headers.Authorization;
          delete event.request.headers.cookie;
        }
      }
      if (event.user) event.user = { id: event.user.id };
      return event;
    },
  });
  setErrorSink(({ error, level, tags }) => {
    Sentry.withScope((scope) => {
      scope.setLevel(level);
      for (const [k, v] of Object.entries(tags)) scope.setTag(k, v);
      if (tags.userId) scope.setUser({ id: tags.userId });
      Sentry.captureException(error);
    });
  });
  process.on("unhandledRejection", (reason) => reportError(reason, { level: "error" }));
  return true;
}
```

If the installed `@sentry/node` version names any of these APIs differently
(`init`, `withScope`, `captureException`, `beforeSend`), follow its README and
say what you changed.

### 2c. `server/src/app.ts`

**Import:**

```ts
import { reportError } from "./observability.js";
```

**Error handler.** Find:

```ts
    if (e.name === "LLMError") {
      console.error("LLM:", e.message);
      return c.json({ error: "llm_error", message: e.message }, (e.status ?? 502) as 502);
    }
    console.error(err);
    return c.json({ error: "internal" }, 500);
```

Replace with:

```ts
    const where = { method: c.req.method, path: c.req.path, userId: c.get("userId") as string | undefined };
    if (e.name === "LLMError") {
      console.error("LLM:", e.message);
      const status = (e.status ?? 502) as 502;
      reportError(err, { ...where, level: "warning", status });
      return c.json({ error: "llm_error", message: e.message }, status);
    }
    console.error(err);
    reportError(err, { ...where, status: 500 });
    return c.json({ error: "internal" }, 500);
```

**Billing errors that routes catch themselves.** The checkout, portal and both
webhook handlers log with `console.error(...)` inside their own `catch` and
return an error response, so `onError` never sees them. After each of those
`console.error(...)` lines, add:

```ts
      reportError(e, { method: c.req.method, path: c.req.path, userId: c.get("userId") as string | undefined });
```

### 2d. `server/src/index.ts`

Add the import:

```ts
import { initSentry } from "./observability.js";
```

Directly after the `.env` loading block (before `openDB()`), add:

```ts
await initSentry(); // no-op unless SENTRY_DSN is set
```

### 2e. `server/src/privacy.ts`

Insert this immediately before `<h2>Children's privacy</h2>`:

```html
<h2>Error reports</h2>
<p>When our backend hits an unexpected error, it sends a report to Sentry, our
error-monitoring service. The report contains the error message and technical
details, the part of our API involved, and your random account ID. It never
includes your email address, password, sign-in tokens, or the content you
capture.</p>

```

---

## Verification

```bash
cd server && npx vitest run && npx tsc --noEmit
```

```bash
cd server && npx tsx src/index.ts
```

With no `SENTRY_DSN`, the server must start and serve `/healthz` exactly as
before. Stop it once you've checked.

## Report

- Diffs, test output (failing first, then passing), and the installed
  `@sentry/node` version.
- Say plainly that nothing was sent to a real Sentry project.

---

## For the owner, after deploying

1. Create a free **Node.js** project at sentry.io and copy its DSN.
2. Add `SENTRY_DSN` in Railway. It redeploys.
3. Create an alert rule in Sentry, for example email on every new issue.
4. Want no third party at all? Skip Sentry. Instead, set a Railway log alert on
   lines matching `LLM:` or `internal`. `reportError` then stays a no-op.
