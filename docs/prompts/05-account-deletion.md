# 05 — Delete account from inside the app

**Depends on:** nothing. It edits `server/src/app.ts` and
`server/src/privacy.ts`, so run it on its own (see the README).

**Touches:**
- **Server:** new `server/src/account.ts`, `server/src/app.ts`,
  `server/src/schema.ts`, `server/src/billing/provider.ts`,
  `server/src/billing/paddle.ts`, `server/src/billing/stripe.ts`,
  `server/src/privacy.ts`, new `server/tests/account.test.ts`.
- **Extension:** new `src/storage/account.js`, `src/sync/api.js`,
  `src/background/service-worker.js`, new `src/ui/views/delete-account.js`,
  `src/ui/views/you.js`, `src/ui/panel.js`, `src/ui/panel.css`,
  `tests/ui-static.test.mjs`, new `tests/account.test.mjs`.

## Why

- **Deletion is email-only.** The only way to delete an account is to email the
  owner (`server/src/privacy.ts`). Chrome Web Store and GDPR reviewers expect a
  delete button inside the product.
- **Deleted accounts come back to life.** Access tokens are stateless JWTs that
  live 15 minutes, and refresh tokens live 30 days. `POST /v1/auth/refresh` issues
  a new access token without checking the user still exists, and nothing else
  checks either. So after a deletion, the extension would keep syncing for up to
  30 days, and `/v1/sync` would recreate rows for a user who no longer exists.

## Design (don't change)

- **The route is `DELETE /v1/account`,** with body
  `{ "confirm": "DELETE", "password"?: string }`.
- **Password accounts must re-enter the password.** Google-only accounts (empty
  `password_hash`) rely on the typed confirmation.
- **Subscriptions are cancelled before any data is deleted.** If cancelling
  fails, return `502 billing_cancel_failed` and delete **nothing**. A deleted
  account must never still be charged.
- **Deletion is one batch.** It covers every table with a `user_id` or
  `owner_id`. Teams the user owns are dissolved (their members removed), and the
  user leaves teams they joined.
- **Every authenticated `/v1/*` request checks that the user still exists.**
  It's one primary-key lookup, and it closes the resurrection window on every
  route, not only sync.
- **Refresh refuses deleted users.**
- **After deletion, the extension erases its local storage** (auth and study
  data) and shows the sign-in screen.

---

## Step 1 — Write the tests (they should fail)

### 1a. Create `server/tests/account.test.ts`

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { openDB, migrate, run, type DB } from "../src/db.js";
import { createApp } from "../src/app.js";
import { register, signAccessToken, signRefreshToken, upsertGoogleUser } from "../src/auth.js";
import { applySync } from "../src/sync.js";
import { deleteUserData } from "../src/account.js";
import { paddleProvider } from "../src/billing/index.js";

let db: DB;
let app: ReturnType<typeof createApp>;
const T = "2026-01-02T00:00:00.000Z";
const PADDLE_ENV = { PADDLE_API_KEY: "test", PADDLE_WEBHOOK_SECRET: "test", PADDLE_PRICE_ID_PLUS: "pri_test" };

beforeEach(async () => {
  db = openDB(":memory:");
  await migrate(db);
  app = createApp(db);
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const k of Object.keys(PADDLE_ENV)) delete process.env[k];
});

const json = { "content-type": "application/json" };
const auth = (t: string) => ({ authorization: `Bearer ${t}`, ...json });
const del = (token: string, body: unknown) =>
  app.request("/v1/account", { method: "DELETE", headers: auth(token), body: JSON.stringify(body) });

/**
 * Every (table, column) that identifies a user. Discovered from the schema, not
 * listed by hand, so a future table with user_id fails this suite until
 * deleteUserData handles it.
 */
async function userColumns() {
  const tables = (await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")).rows.map((r) => String(r.name));
  const out: { table: string; column: string }[] = [];
  for (const table of tables) {
    const cols = (await db.execute(`PRAGMA table_info(${table})`)).rows.map((r) => String(r.name));
    for (const column of ["user_id", "owner_id"]) if (cols.includes(column)) out.push({ table, column });
  }
  out.push({ table: "users", column: "id" });
  return out;
}

async function rowsFor(userId: string) {
  let n = 0;
  for (const { table, column } of await userColumns()) {
    const r = await db.execute({ sql: `SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = ?`, args: [userId] });
    n += Number(r.rows[0].n);
  }
  return n;
}

/**
 * A user with data in as many tables as possible. If applySync's input shape has
 * changed since this was written, adapt the seed, not the assertions.
 */
async function seededUser(email: string) {
  const user = (await register(db, email, "password123"))!;
  const token = await signAccessToken(user.id);
  const setId = `set-${user.id}`;
  await applySync(db, user.id, {
    sets: [{ id: setId, title: "Set", createdAt: T, updatedAt: T }],
    cards: [{ id: `card-${user.id}`, setId, front: "front", back: "back", updatedAt: T }],
    quiz: [],
    activity: [],
    reviews: [],
  } as any);
  await app.request("/v1/share", { method: "POST", headers: auth(token), body: JSON.stringify({ setId }) });
  await run(db, "INSERT INTO generation_events (id, user_id, category, created_at) VALUES (?, ?, 'set', ?)", [`ge-${user.id}`, user.id, T]);
  await run(
    db,
    "INSERT INTO review_log (id, user_id, card_id, grade, prev_interval, new_interval, reviewed_at) VALUES (?, ?, ?, 4, 0, 1, ?)",
    [`rl-${user.id}`, user.id, `card-${user.id}`, T]
  );
  return { user, token };
}

async function teamOwnedBy(ownerId: string, memberId: string) {
  const teamId = `team-${ownerId}`;
  await run(db, "INSERT INTO teams (id, name, code, owner_id, created_at) VALUES (?, 'Study group', ?, ?, ?)", [teamId, `CODE${ownerId.slice(0, 6)}`, ownerId, T]);
  await run(db, "INSERT INTO team_members (team_id, user_id, joined_at) VALUES (?, ?, ?)", [teamId, ownerId, T]);
  await run(db, "INSERT INTO team_members (team_id, user_id, joined_at) VALUES (?, ?, ?)", [teamId, memberId, T]);
  return teamId;
}

describe("deleteUserData", () => {
  it("removes the user from every table that references users, and nobody else", async () => {
    const { user } = await seededUser("gone@mafsar.dev");
    const { user: other } = await seededUser("stays@mafsar.dev");
    await teamOwnedBy(other.id, user.id); // the deleted user is a member of someone else's team
    const otherBefore = await rowsFor(other.id);
    expect(await rowsFor(user.id)).toBeGreaterThan(3);

    await deleteUserData(db, user.id);

    expect(await rowsFor(user.id)).toBe(0);
    expect(await rowsFor(other.id)).toBe(otherBefore);
  });

  it("dissolves teams the user owns, including other people's memberships", async () => {
    const { user } = await seededUser("owner@mafsar.dev");
    const { user: member } = await seededUser("member@mafsar.dev");
    const teamId = await teamOwnedBy(user.id, member.id);

    await deleteUserData(db, user.id);

    expect((await db.execute({ sql: "SELECT COUNT(*) AS n FROM teams WHERE id = ?", args: [teamId] })).rows[0].n).toBe(0);
    expect((await db.execute({ sql: "SELECT COUNT(*) AS n FROM team_members WHERE team_id = ?", args: [teamId] })).rows[0].n).toBe(0);
    expect(await rowsFor(member.id)).toBeGreaterThan(0); // the member's own data is untouched
  });
});

describe("DELETE /v1/account", () => {
  it("requires a token", async () => {
    const res = await app.request("/v1/account", { method: "DELETE", headers: json, body: JSON.stringify({ confirm: "DELETE" }) });
    expect(res.status).toBe(401);
  });

  it("requires the typed confirmation", async () => {
    const { user, token } = await seededUser("noconfirm@mafsar.dev");
    expect((await del(token, { password: "password123" })).status).toBe(400);
    expect((await del(token, { confirm: "delete", password: "password123" })).status).toBe(400);
    expect(await rowsFor(user.id)).toBeGreaterThan(0);
  });

  it("refuses a wrong password and deletes nothing", async () => {
    const { user, token } = await seededUser("wrongpw@mafsar.dev");
    const res = await del(token, { confirm: "DELETE", password: "not-my-password" });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("wrong_password");
    expect(await rowsFor(user.id)).toBeGreaterThan(0);
  });

  it("deletes everything with the right password", async () => {
    const { user, token } = await seededUser("bye@mafsar.dev");
    const res = await del(token, { confirm: "DELETE", password: "password123" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(await rowsFor(user.id)).toBe(0);
  });

  it("a Google-only account needs no password", async () => {
    const user = await upsertGoogleUser(db, { sub: "google-123", email: "g@mafsar.dev" });
    const res = await del(await signAccessToken(user.id), { confirm: "DELETE" });
    expect(res.status).toBe(200);
    expect(await rowsFor(user.id)).toBe(0);
  });

  it("cancels an active subscription before deleting", async () => {
    Object.assign(process.env, PADDLE_ENV);
    const { user, token } = await seededUser("payer@mafsar.dev");
    await run(db, "UPDATE users SET billing_customer_id = 'ctm_1', billing_provider = 'paddle', plan = 'pro' WHERE id = ?", [user.id]);
    const cancel = vi.spyOn(paddleProvider, "cancelSubscriptions").mockResolvedValue(undefined);

    const res = await del(token, { confirm: "DELETE", password: "password123" });

    expect(res.status).toBe(200);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cancel.mock.calls[0][0].userId).toBe(user.id);
    expect(await rowsFor(user.id)).toBe(0);
  });

  it("if cancelling the subscription fails, nothing is deleted", async () => {
    Object.assign(process.env, PADDLE_ENV);
    const { user, token } = await seededUser("stuck@mafsar.dev");
    await run(db, "UPDATE users SET billing_customer_id = 'ctm_2', billing_provider = 'paddle', plan = 'plus' WHERE id = ?", [user.id]);
    vi.spyOn(paddleProvider, "cancelSubscriptions").mockRejectedValue(new Error("paddle down"));

    const res = await del(token, { confirm: "DELETE", password: "password123" });

    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("billing_cancel_failed");
    expect(await rowsFor(user.id)).toBeGreaterThan(0);
  });
});

describe("a deleted account stays deleted", () => {
  it("its refresh token no longer works", async () => {
    const { user, token } = await seededUser("refresh@mafsar.dev");
    const refreshToken = await signRefreshToken(user.id);
    await del(token, { confirm: "DELETE", password: "password123" });
    const res = await app.request("/v1/auth/refresh", { method: "POST", headers: json, body: JSON.stringify({ refreshToken }) });
    expect(res.status).toBe(401);
  });

  it("a still-valid access token can't sync data back into existence", async () => {
    const { user, token } = await seededUser("zombie@mafsar.dev");
    await del(token, { confirm: "DELETE", password: "password123" });
    const res = await app.request("/v1/sync", {
      method: "POST",
      headers: auth(token),
      body: JSON.stringify({ sets: [{ id: "resurrected", title: "Back", createdAt: T, updatedAt: T }], cards: [], quiz: [], activity: [], reviews: [] }),
    });
    expect(res.status).toBe(401);
    expect(await rowsFor(user.id)).toBe(0);
  });

  it("every other authenticated route refuses it too", async () => {
    const { token } = await seededUser("me-gone@mafsar.dev");
    await del(token, { confirm: "DELETE", password: "password123" });
    expect((await app.request("/v1/me", { headers: auth(token) })).status).toBe(401);
  });
});

describe("GET /v1/me", () => {
  it("says whether the account has a password, and never returns the hash", async () => {
    const { token } = await seededUser("pw@mafsar.dev");
    const body = await (await app.request("/v1/me", { headers: auth(token) })).json();
    expect(body.hasPassword).toBe(true);
    expect(JSON.stringify(body)).not.toContain("password_hash");
    const g = await upsertGoogleUser(db, { sub: "google-456", email: "gg@mafsar.dev" });
    const gBody = await (await app.request("/v1/me", { headers: auth(await signAccessToken(g.id)) })).json();
    expect(gBody.hasPassword).toBe(false);
  });
});
```

### 1b. Create `tests/account.test.mjs`

```js
// Account-deletion rules the panel enforces before calling the server.
// Run: node tests/account.test.mjs
import assert from "node:assert/strict";
import { canConfirmDeletion, deletionErrorMessage, DELETE_CONFIRM_WORD } from "../src/storage/account.js";

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

test("the confirmation word is DELETE", () => {
  assert.equal(DELETE_CONFIRM_WORD, "DELETE");
});

test("requires DELETE typed exactly (surrounding spaces allowed)", () => {
  assert.equal(canConfirmDeletion({ typed: "DELETE", password: "pw", hasPassword: true }), true);
  assert.equal(canConfirmDeletion({ typed: "  DELETE ", password: "pw", hasPassword: true }), true);
  assert.equal(canConfirmDeletion({ typed: "delete", password: "pw", hasPassword: true }), false);
  assert.equal(canConfirmDeletion({ typed: "", password: "pw", hasPassword: true }), false);
});

test("password accounts must enter a password; Google-only accounts don't", () => {
  assert.equal(canConfirmDeletion({ typed: "DELETE", password: "", hasPassword: true }), false);
  assert.equal(canConfirmDeletion({ typed: "DELETE", password: "", hasPassword: false }), true);
});

test("server errors become messages a person can act on", () => {
  assert.equal(deletionErrorMessage({ error: "wrong_password" }, 403), "That password isn't right.");
  assert.match(deletionErrorMessage({ error: "billing_cancel_failed", message: "We couldn't cancel…" }, 502), /couldn't cancel/);
  assert.match(deletionErrorMessage({}, 401), /sign in again/i);
  assert.match(deletionErrorMessage({}, 500), /500/);
});

console.log(`\n${passed} passed`);
```

### 1c. Append to `tests/ui-static.test.mjs`

Add these just before the final `console.log(...)`, which must stay last. Use the
file's existing `test` helper, and its `fs`, `join` and `__dirname` imports.

```js
test("the You tab offers account deletion, wired end to end", () => {
  const read = (p) => fs.readFileSync(join(__dirname, p), "utf8").replace(/\r\n/g, "\n");
  assert.ok(read("../src/ui/views/you.js").includes('data-action="delete-account-open"'), "You tab needs a Delete account button");
  const panel = read("../src/ui/panel.js");
  assert.ok(panel.includes('case "delete-account-open"') && panel.includes('case "delete-account-confirm"'), "panel.js must handle both actions");
  const view = read("../src/ui/views/delete-account.js");
  assert.ok(view.includes("canConfirmDeletion"), "the confirm button must be gated by canConfirmDeletion");
  const sw = read("../src/background/service-worker.js");
  const branch = sw.slice(sw.indexOf('case "DELETE_ACCOUNT"'), sw.indexOf('case "DELETE_ACCOUNT"') + 600);
  assert.ok(branch.includes("chrome.storage.local.clear()"), "after deleting, the worker must erase local data");
});
```

Run all three and confirm they fail:

```bash
cd server && npx vitest run tests/account.test.ts
```

```bash
node tests/account.test.mjs
```

```bash
node tests/ui-static.test.mjs
```

---

## Step 2 — Server

### 2a. Create `server/src/account.ts`

```ts
import type { DB } from "./db.js";

/**
 * Permanently removes a user and everything that references them, in one batch.
 * Teams they own are dissolved (other members included); they leave teams they
 * joined. tests/account.test.ts discovers every user_id / owner_id column from
 * the schema, so a table added later fails the suite until it's handled here.
 */
export async function deleteUserData(db: DB, userId: string): Promise<void> {
  const ownedTeams = "SELECT id FROM teams WHERE owner_id = ?";
  await db.batch(
    [
      { sql: "DELETE FROM review_log WHERE user_id = ?", args: [userId] },
      { sql: "DELETE FROM activity WHERE user_id = ?", args: [userId] },
      { sql: "DELETE FROM generation_events WHERE user_id = ?", args: [userId] },
      { sql: "DELETE FROM shares WHERE user_id = ?", args: [userId] },
      { sql: "DELETE FROM quiz WHERE user_id = ?", args: [userId] },
      { sql: "DELETE FROM cards WHERE user_id = ?", args: [userId] },
      { sql: "DELETE FROM sets WHERE user_id = ?", args: [userId] },
      { sql: `DELETE FROM team_members WHERE team_id IN (${ownedTeams})`, args: [userId] },
      { sql: "DELETE FROM teams WHERE owner_id = ?", args: [userId] },
      { sql: "DELETE FROM team_members WHERE user_id = ?", args: [userId] },
      { sql: "DELETE FROM pending_logins WHERE user_id = ?", args: [userId] },
      { sql: "DELETE FROM users WHERE id = ?", args: [userId] },
    ],
    "write"
  );
}
```

If the "every table" test finds a table this misses (for example one added since
this was written), add a `DELETE` for it here. Put child tables before their
parents.

### 2b. `server/src/schema.ts`

Add:

```ts
export const deleteAccountSchema = z.object({
  // Exact and case-sensitive: this is the one irreversible call in the API.
  confirm: z.literal("DELETE"),
  password: z.string().max(200).optional(),
});
```

### 2c. Billing providers

In `server/src/billing/provider.ts`, add to the `BillingProvider` interface:

```ts
  /** Cancel every active subscription for this user immediately. Resolves when there is none. */
  cancelSubscriptions(args: { db: DB; userId: string }): Promise<void>;
```

In `server/src/billing/paddle.ts`, add to `paddleProvider`. Import `one` from
`../db.js` if it isn't already.

```ts
  async cancelSubscriptions({ db, userId }) {
    const user = await one<{ billing_customer_id: string | null }>(
      db, "SELECT billing_customer_id FROM users WHERE id = ?", [userId]
    );
    if (!user?.billing_customer_id) return;
    const paddle = paddleClient();
    const subs = paddle.subscriptions.list({
      customerId: [user.billing_customer_id],
      status: ["active", "trialing", "past_due", "paused"],
    });
    for await (const sub of subs) {
      await paddle.subscriptions.cancel(sub.id, { effectiveFrom: "immediately" });
    }
  },
```

In `server/src/billing/stripe.ts`, add to the Stripe provider object. Import
`one` from `../db.js` if needed.

```ts
  async cancelSubscriptions({ db, userId }) {
    const user = await one<{ billing_customer_id: string | null }>(
      db, "SELECT billing_customer_id FROM users WHERE id = ?", [userId]
    );
    if (!user?.billing_customer_id) return;
    const stripe = stripeClient();
    for await (const sub of stripe.subscriptions.list({ customer: user.billing_customer_id, status: "all" })) {
      if (["active", "trialing", "past_due", "unpaid", "incomplete"].includes(sub.status)) {
        await stripe.subscriptions.cancel(sub.id);
      }
    }
  },
```

**Check both SDK calls against the versions installed in `server/node_modules`**
(`@paddle/paddle-node-sdk` and `stripe`): method names, the `status` filter
values, and that the list result supports `for await`. Fix any mismatch, and say
in your report that the real SDK calls are untested, because tests mock the
provider.

### 2d. `server/src/app.ts`

**Imports.** Add `verifyPassword` to the import from `./auth.js`, and add:

```ts
import { deleteUserData } from "./account.js";
```

Add `deleteAccountSchema` to the import from `./schema.js`.

**Auth middleware: add the live-user check.** Find:

```ts
  app.use("/v1/*", async (c, next) => {
    // Auth routes are public; everything else under /v1 requires a token.
    if (c.req.path.startsWith("/v1/auth/") || c.req.path.startsWith("/v1/webhooks/")) return next();
    return requireAuth()(c, next);
  });
```

Replace with:

```ts
  const isPublicV1 = (path: string) => path.startsWith("/v1/auth/") || path.startsWith("/v1/webhooks/");

  app.use("/v1/*", async (c, next) => {
    // Auth routes are public; everything else under /v1 requires a token.
    if (isPublicV1(c.req.path)) return next();
    return requireAuth()(c, next);
  });

  // Tokens are stateless and outlive a deleted account (access 15 min, refresh
  // 30 days). One primary-key lookup per request keeps a deleted user from syncing
  // their data back into existence through any route.
  app.use("/v1/*", async (c, next) => {
    if (isPublicV1(c.req.path)) return next();
    const live = await one(db, "SELECT 1 AS x FROM users WHERE id = ?", [c.get("userId") as string]);
    if (!live) return c.json({ error: "unauthorized" }, 401);
    return next();
  });
```

**Refresh.** In the `/v1/auth/refresh` handler, find:

```ts
      if (payload.typ !== "refresh") throw new Error("wrong token type");
```

Replace with:

```ts
      if (payload.typ !== "refresh") throw new Error("wrong token type");
      const live = await one(db, "SELECT 1 AS x FROM users WHERE id = ?", [payload.sub as string]);
      if (!live) throw new Error("user no longer exists");
```

**`/v1/me`.** Find the query and response:

```ts
    const user = await one<{ id: string; email: string; created_at: string; plan: string }>(
      db, "SELECT id, email, created_at, plan FROM users WHERE id = ?", [userId]
    );
```

Replace with:

```ts
    const row = await one<{ id: string; email: string; created_at: string; plan: string; password_hash: string | null }>(
      db, "SELECT id, email, created_at, plan, password_hash FROM users WHERE id = ?", [userId]
    );
    const { password_hash, ...user } = row ?? ({} as any);
```

Then change `if (!user) return c.json({ error: "not_found" }, 404);` to
`if (!row) return c.json({ error: "not_found" }, 404);`. Also change the final
`return c.json({ user, usage: { ...usage, plan } });` to:

```ts
    // hasPassword tells the delete-account screen whether to ask for one.
    return c.json({ user, hasPassword: !!password_hash, usage: { ...usage, plan } });
```

**The delete route.** Add it directly after the `/v1/me` route:

```ts
  app.delete("/v1/account", async (c) => {
    const userId = c.get("userId") as string;
    const body = deleteAccountSchema.parse(await c.req.json().catch(() => ({})));
    const user = await one<{ password_hash: string | null; billing_customer_id: string | null; billing_provider: string | null }>(
      db, "SELECT password_hash, billing_customer_id, billing_provider FROM users WHERE id = ?", [userId]
    );
    if (!user) return c.json({ error: "unauthorized" }, 401);

    // Re-authenticate password accounts: an access token alone is not enough
    // for the one irreversible action in the API.
    if (user.password_hash) {
      if (!body.password || !(await verifyPassword(body.password, user.password_hash))) {
        return c.json({ error: "wrong_password", message: "That password isn't right." }, 403);
      }
    }

    // Cancel billing first. If that fails, delete nothing: a deleted account
    // must never still be charged.
    if (user.billing_customer_id) {
      try {
        const provider = getProvider(user.billing_provider || undefined);
        if (!provider.configured()) throw new Error("billing provider not configured");
        await provider.cancelSubscriptions({ db, userId });
      } catch (e) {
        console.error("Account deletion: cancelling subscriptions failed", e);
        return c.json({
          error: "billing_cancel_failed",
          message: "We couldn't cancel your subscription, so nothing was deleted. Try again, or email support.",
        }, 502);
      }
    }

    await deleteUserData(db, userId);
    return c.json({ ok: true });
  });
```

### 2e. `server/src/privacy.ts`

Find the "Data deletion" paragraph, which says to email "and we'll remove it
within 7 days". Replace that whole `<p>…</p>` with:

```html
<p>You can delete individual study sets and cards at any time from the
extension. To delete your account, open the <strong>You</strong> tab and choose
<strong>Delete account</strong>. Your account and all associated server-side
data are removed immediately, and any active subscription is cancelled. If you
can't sign in, email <a href="mailto:sardoralien@gmail.com">sardoralien@gmail.com</a>
from the account's registered address and we'll remove it within 7 days.</p>
```

---

## Step 3 — Extension

### 3a. Create `src/storage/account.js`

```js
// Account-deletion rules, kept pure (no chrome.*, no DOM) so they are unit tested.

export const DELETE_CONFIRM_WORD = "DELETE";

/** Whether the "Delete my account" button may be pressed. */
export function canConfirmDeletion({ typed, password, hasPassword }) {
  if (String(typed || "").trim() !== DELETE_CONFIRM_WORD) return false;
  if (hasPassword && !String(password || "")) return false;
  return true;
}

/** A message the person can act on, from the server's error body and status. */
export function deletionErrorMessage(data, status) {
  if (data?.error === "wrong_password") return "That password isn't right.";
  if (data?.error === "billing_cancel_failed") {
    return data.message || "We couldn't cancel your subscription, so nothing was deleted.";
  }
  if (status === 401) return "Your session expired. Sign in again, then delete your account.";
  return data?.message || `Couldn't delete your account (${status}).`;
}
```

### 3b. `src/sync/api.js`

Add at the top, next to the existing import:

```js
import { DELETE_CONFIRM_WORD, deletionErrorMessage } from "../storage/account.js";
```

Add at the end:

```js
/** Permanently deletes the account on the server. Throws with a user-facing message. */
export async function backendDeleteAccount({ password }) {
  const res = await authedFetch("/v1/account", {
    method: "DELETE",
    body: JSON.stringify({ confirm: DELETE_CONFIRM_WORD, password: password || undefined }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(deletionErrorMessage(data, res.status));
  return data;
}
```

### 3c. `src/background/service-worker.js`

Add `backendDeleteAccount` to the existing import from `../sync/api.js`. In
`handle(msg)`'s `switch`, add a case next to the other account and billing cases:

```js
    case "DELETE_ACCOUNT": {
      await backendDeleteAccount({ password: msg.password ? String(msg.password) : "" });
      // The account is gone; nothing local is useful without it, and leaving the
      // auth tokens behind would keep a dead session around.
      await chrome.storage.local.clear();
      return { deleted: true };
    }
```

### 3d. Create `src/ui/views/delete-account.js`

```js
import { app, send, setHTML, toast, topOfView } from "../core.js";
import { showChrome } from "../nav.js";
import { authedFetch } from "../../sync/auth.js";
import { canConfirmDeletion } from "../../storage/account.js";
import { renderAuthGate } from "./you.js";

// Ask for the password until /v1/me says the account has none, so a slow or
// failed lookup can only make the form stricter, never looser.
let hasPassword = true;

export async function renderDeleteAccount() {
  hasPassword = true;
  showChrome(false);
  setHTML(app, `
    <div class="view">
      <div class="ahd">
        <button class="iconbtn" data-action="nav-back" aria-label="Back"><svg class="ic" viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button>
        <div class="h-title" style="font-size:16px">Delete account</div><span style="width:32px"></span>
      </div>
      <div class="block danger-block">
        <div style="font-weight:650">This can't be undone.</div>
        <ul class="danger-list">
          <li>Your sets, cards, quiz questions and review history are deleted from our servers.</li>
          <li>Teams you created are closed, and you leave teams you joined.</li>
          <li>An active Plus or Pro subscription is cancelled immediately, with no further charges.</li>
          <li>Mafsar's data in this browser is erased too.</li>
        </ul>
      </div>
      <div class="field" id="delPassField"><label for="delPass">Your password</label>
        <input id="delPass" type="password" autocomplete="current-password" /></div>
      <div class="field"><label for="delConfirm">Type DELETE to confirm</label>
        <input id="delConfirm" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" /></div>
      <button class="btn btn-primary btn-block btn-danger" data-action="delete-account-confirm" disabled>Delete my account</button>
    </div>`);
  topOfView();
  for (const id of ["delPass", "delConfirm"]) document.getElementById(id)?.addEventListener("input", refreshButton);

  try {
    const res = await authedFetch("/v1/me");
    if (res.ok) {
      hasPassword = !!(await res.json()).hasPassword;
      document.getElementById("delPassField")?.classList.toggle("hidden", !hasPassword);
      refreshButton();
    }
  } catch {
    /* keep the stricter form */
  }
}

function refreshButton() {
  const btn = /** @type {HTMLButtonElement|null} */ (app.querySelector('[data-action="delete-account-confirm"]'));
  if (!btn) return;
  btn.disabled = !canConfirmDeletion({
    typed: /** @type {HTMLInputElement|null} */ (document.getElementById("delConfirm"))?.value,
    password: /** @type {HTMLInputElement|null} */ (document.getElementById("delPass"))?.value,
    hasPassword,
  });
}

export async function confirmDeleteAccount() {
  const typed = /** @type {HTMLInputElement|null} */ (document.getElementById("delConfirm"))?.value;
  const password = /** @type {HTMLInputElement|null} */ (document.getElementById("delPass"))?.value;
  if (!canConfirmDeletion({ typed, password, hasPassword })) return;
  const btn = /** @type {HTMLButtonElement} */ (app.querySelector('[data-action="delete-account-confirm"]'));
  btn.disabled = true;
  btn.textContent = "Deleting…";
  try {
    await send({ type: "DELETE_ACCOUNT", password: hasPassword ? password : "" });
    toast("Your account was deleted.");
    renderAuthGate();
  } catch (e) {
    toast(e.message);
    btn.disabled = false;
    btn.textContent = "Delete my account";
  }
}
```

### 3e. `src/ui/views/you.js`

Find the sign-out button:

```html
<button class="btn btn-ghost btn-block" data-action="auth-signout">Sign out</button>
```

Put this directly after it, inside the same template:

```html
<button class="btn btn-ghost btn-block btn-danger" data-action="delete-account-open">Delete account…</button>
```

### 3f. `src/ui/panel.js`

Import:

```js
import { confirmDeleteAccount, renderDeleteAccount } from "./views/delete-account.js";
```

In the `data-action` switch, add these two cases directly above
`case "auth-signout":`:

```js
    case "delete-account-open": renderDeleteAccount(); break;
    case "delete-account-confirm": confirmDeleteAccount(); break;
```

### 3g. `src/ui/panel.css`

Add at the end of the file:

```css
/* --- destructive actions ------------------------------------------------ */
.btn-danger { color: var(--danger); }
/* --surface, not #fff, for the label: dark mode's --danger is light enough that
   white text on it fails contrast. */
.btn.btn-primary.btn-danger { background: var(--danger); border-color: var(--danger); color: var(--surface); }
.btn-danger:disabled { opacity: .5; cursor: not-allowed; }
.danger-block { border-color: var(--danger); background: var(--danger-soft); }
.danger-list { margin: 8px 0 0; padding-left: 18px; font-size: 12.5px; line-height: 1.5; color: var(--ink); }
```

---

## Verification

```bash
cd server && npx vitest run && npx tsc --noEmit
```

```bash
for f in tests/*.test.mjs; do node "$f" > /dev/null || echo "FAIL $f"; done
```

```bash
npm run typecheck
```

```bash
node tools/build.mjs
```

An existing server test may expect `/v1/me` to return `404` for a missing user.
It now returns `401`, because the live-user check runs first. If so, update that
assertion and say why in your report. Don't remove the check.

## Manual check

Load `dist/chrome` unpacked, point it at a local server, and do each of these:

1. Sign in with a throwaway email account. Go to **You → Delete account…**. The
   button stays disabled until the password is entered and `DELETE` is typed.
2. Enter a wrong password. You should see "That password isn't right", and
   nothing is deleted.
3. Delete the account for real. The panel shows the sign-in screen, and signing in
   with the old credentials fails.
4. With a Google-only account, the password field is hidden.

## Report

- Diffs, and the test output (failing first, then passing).
- The results of the manual check, or a plain statement that you couldn't run it.
- Say that the Paddle and Stripe `cancelSubscriptions` SDK calls weren't exercised
  against a real account.

---

## For the owner, after deploying

In Paddle's **sandbox**, subscribe a test account to Plus, delete that account in
the extension, and confirm Paddle shows the subscription as cancelled.
