import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { cors } from "hono/cors";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import type { DB } from "./db.js";
import {
  register, login, requireAuth, signAccessToken, signRefreshToken, upsertGoogleUser,
} from "./auth.js";
import { syncSchema, registerSchema, loginSchema, generateSchema, gradeSchema, hypotheticalSchema, summarizeSchema, blurbSchema, codingTaskSchema, codingGradeSchema, shareCreateSchema, shareRevokeSchema, teamCreateSchema, teamJoinSchema, pollSchema } from "./schema.js";
import { googleConfigured, buildAuthUrl, pkcePair, exchangeCode, verifyIdToken } from "./google.js";
import { applySync, changesSince } from "./sync.js";
import { nowISO, one, all, run, uid } from "./db.js";
import { genTeamCode, leaderboardFor, learningFor } from "./teams.js";
import { generateStudySet, gradeAnswer, generateHypothetical, summarizeConversation, setBlurb, generateCodingTask, gradeCode } from "./llm.js";
import { PRIVACY_HTML } from "./privacy.js";
import { getProvider, billingConfigured, requireQuota, usageSummary, effectivePlan, resolveOrigin, applyPlanChange, stripeProvider, paddleProvider, NoSubscriptionError } from "./billing/index.js";

export function createApp(db: DB) {
  const app = new Hono<{ Variables: { userId: string } }>();

  // The extension / future web app call the API cross-origin.
  app.use("*", cors());

  // Public — required by the Chrome Web Store / Firefox Add-ons listings.
  app.get("/privacy", (c) => c.html(PRIVACY_HTML));

  // Serve landing page and its assets
  app.use("/assets/*", serveStatic({ root: "../landing" }));
  app.get("/", serveStatic({ path: "../landing/index.html" }));
  app.get("/s/:code", serveStatic({ path: "../landing/index.html" }));
  app.get("/t/:code", serveStatic({ path: "../landing/index.html" }));

  app.use("/v1/*", async (c, next) => {
    // Auth routes are public; everything else under /v1 requires a token.
    if (c.req.path.startsWith("/v1/auth/") || c.req.path.startsWith("/v1/webhooks/")) return next();
    return requireAuth()(c, next);
  });

  app.onError((err, c) => {
    const e = err as Error & { issues?: unknown; status?: number };
    if (e.name === "ZodError") {
      return c.json({ error: "validation", details: e.issues }, 400);
    }
    // LLM failures are operational (missing key, retired model, upstream
    // outage), not bugs — report the reason so the user sees something
    // actionable rather than "generation failed".
    if (e.name === "LLMError") {
      console.error("LLM:", e.message);
      return c.json({ error: "llm_error", message: e.message }, (e.status ?? 502) as 502);
    }
    console.error(err);
    return c.json({ error: "internal" }, 500);
  });

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

  app.post("/v1/auth/refresh", async (c) => {
    const { refreshToken } = await c.req.json<{ refreshToken?: string }>();
    if (!refreshToken) return c.json({ error: "unauthorized" }, 401);
    const { jwtVerify } = await import("jose");
    try {
      const { payload } = await jwtVerify(refreshToken, (await import("./auth.js")).secretKey());
      if (payload.typ !== "refresh") throw new Error("wrong token type");
      return c.json({ accessToken: await signAccessToken(payload.sub as string) });
    } catch {
      return c.json({ error: "unauthorized" }, 401);
    }
  });

  app.post("/v1/auth/google/start", async (c) => {
    if (!googleConfigured()) return c.json({ error: "google_unavailable" }, 501);
    await run(db, "DELETE FROM pending_logins WHERE expires_at < ?", [nowISO()]);
    
    const state = uid();
    const { verifier, challenge } = pkcePair();
    const pollToken = randomBytes(32).toString("base64url");
    const pollHash = createHash("sha256").update(pollToken).digest("hex");
    
    const authUrl = buildAuthUrl({ state, codeChallenge: challenge });
    const expiresAt = new Date(Date.now() + 600 * 1000).toISOString();
    
    await run(db, "INSERT INTO pending_logins (id, poll_hash, code_verifier, created_at, expires_at) VALUES (?, ?, ?, ?, ?)", [state, pollHash, verifier, nowISO(), expiresAt]);
    return c.json({ authUrl, pollToken, expiresIn: 600 });
  });

  app.get("/v1/auth/google/callback", async (c) => {
    const error = c.req.query("error");
    const state = c.req.query("state");
    const code = c.req.query("code");
    
    if (!state) return c.html(`<style>body { font-family: system-ui; text-align: center; margin-top: 50px; }</style><h2>Sign-in failed</h2><p>Missing state parameter.</p>`);
    
    if (error === "access_denied") {
      await run(db, "UPDATE pending_logins SET status = 'error', error = 'Sign-in cancelled' WHERE id = ?", [state]);
      return c.html(`<style>body { font-family: system-ui; text-align: center; margin-top: 50px; }</style><h2>Sign-in cancelled</h2><p>You can close this tab and try again.</p>`);
    }
    
    const pending = await one<{ code_verifier: string }>(db, "SELECT code_verifier FROM pending_logins WHERE id = ? AND expires_at > ?", [state, nowISO()]);
    if (!pending) {
      return c.html(`<style>body { font-family: system-ui; text-align: center; margin-top: 50px; }</style><h2>Link expired</h2><p>This sign-in request expired or was already used. Please try again.</p>`);
    }

    try {
      if (!code) throw new Error("No code parameter");
      const { id_token } = await exchangeCode(code, pending.code_verifier);
      const profile = await verifyIdToken(id_token);
      const user = await upsertGoogleUser(db, profile);
      const accessToken = await signAccessToken(user.id);
      const refreshToken = await signRefreshToken(user.id);
      
      await run(db, "UPDATE pending_logins SET status = 'ready', user_id = ?, access_token = ?, refresh_token = ?, email = ? WHERE id = ?", [user.id, accessToken, refreshToken, user.email, state]);
      
      return c.html(`<style>body { font-family: system-ui; text-align: center; margin-top: 50px; }</style><h2>Success!</h2><p>You are signed in. You can close this tab and return to Mafsar.</p>`);
    } catch (e: any) {
      const msg = e.message ? String(e.message).substring(0, 100) : "Unknown error";
      await run(db, "UPDATE pending_logins SET status = 'error', error = ? WHERE id = ?", [msg, state]);
      return c.html(`<style>body { font-family: system-ui; text-align: center; margin-top: 50px; }</style><h2>Sign-in failed</h2><p>Something went wrong. Please try again.</p>`);
    }
  });

  app.post("/v1/auth/google/poll", async (c) => {
    const { pollToken } = pollSchema.parse(await c.req.json());
    const pollHash = createHash("sha256").update(pollToken).digest("hex");
    
    const rows = await all<{ id: string; poll_hash: string; status: string; error: string; user_id: string; access_token: string; refresh_token: string; email: string; expires_at: string }>(db, "SELECT * FROM pending_logins", []);
    const row = rows.find(r => {
      if (r.poll_hash.length !== pollHash.length) return false;
      return timingSafeEqual(Buffer.from(r.poll_hash, 'hex'), Buffer.from(pollHash, 'hex'));
    });
    
    if (!row || row.expires_at < nowISO()) {
      return c.json({ status: "expired" }, 410);
    }
    if (row.status === "pending") {
      return c.json({ status: "pending" });
    }
    if (row.status === "error") {
      return c.json({ status: "error", error: row.error });
    }
    if (row.status === "ready") {
      await run(db, "DELETE FROM pending_logins WHERE id = ?", [row.id]);
      return c.json({
        status: "ready",
        accessToken: row.access_token,
        refreshToken: row.refresh_token,
        user: { id: row.user_id, email: row.email }
      });
    }
    return c.json({ status: "error", error: "unknown state" });
  });

  app.get("/v1/me", async (c) => {
    const userId = c.get("userId") as string;
    const user = await one<{ id: string; email: string; created_at: string; plan: string }>(
      db, "SELECT id, email, created_at, plan FROM users WHERE id = ?", [userId]
    );
    if (!user) return c.json({ error: "not_found" }, 404);
    // Report the plan the user is actually served, so an admin's panel shows
    // unlimited rather than a free-tier meter they will never hit.
    const plan = effectivePlan(user.plan, user.email);
    const usage = await usageSummary(db, userId, plan);
    return c.json({ user, usage: { ...usage, plan } });
  });

  app.post("/v1/sync", async (c) => {
    const userId = c.get("userId") as string;
    const body = syncSchema.parse(await c.req.json().catch(() => ({})));
    await applySync(db, userId, body);
    const serverTime = nowISO();
    return c.json({ serverTime, ...(await changesSince(db, userId, body.since)) });
  });

  // --- Billing & Subscriptions ---
  app.post("/v1/billing/checkout", async (c) => {
    if (!billingConfigured()) return c.json({ error: "billing_unavailable" }, 501);
    const raw = await c.req.json().catch(() => ({}));
    const plan = raw?.plan;
    if (plan !== "plus" && plan !== "pro") return c.json({ error: "invalid_plan" }, 400);

    const userId = c.get("userId") as string;
    const user = await one<{ email: string }>(db, "SELECT email FROM users WHERE id = ?", [userId]);
    if (!user) return c.json({ error: "not_found" }, 404);

    try {
      const provider = getProvider();
      const url = await provider.createCheckout({ db, userId, email: user.email, plan, origin: resolveOrigin(c) });
      return c.json({ url });
    } catch (e: any) {
      if (e.message === "billing_not_configured") return c.json({ error: "billing_not_configured" }, 501);
      console.error("Checkout error:", e.stack);
      return c.json({ error: "internal" }, 500);
    }
  });

  app.post("/v1/billing/portal", async (c) => {
    if (!billingConfigured()) return c.json({ error: "billing_unavailable" }, 501);
    const userId = c.get("userId") as string;
    
    try {
      const provider = getProvider();
      const url = await provider.createPortal({ db, userId, origin: resolveOrigin(c) });
      return c.json({ url });
    } catch (e: any) {
      if (e instanceof NoSubscriptionError) return c.json({ error: "no_subscription" }, 404);
      console.error("Portal error:", e.stack);
      return c.json({ error: "internal" }, 500);
    }
  });

  app.post("/v1/webhooks/stripe", async (c) => {
    if (!billingConfigured() || getProvider().name !== "stripe") return c.json({ error: "billing_unavailable" }, 501);
    const body = await c.req.text();
    const sig = c.req.header("stripe-signature") ?? "";
    
    try {
      const outcome = await stripeProvider.handleWebhook(body, sig);
      if (outcome.kind === "invalid_signature") return c.json({ error: "invalid_signature" }, 400);
      if (outcome.kind === "plan_change") {
        await applyPlanChange(db, outcome.customerId, outcome.plan);
      }
      return c.json({});
    } catch (e: any) {
      console.error(e.stack);
      return c.json({ error: "internal" }, 500);
    }
  });

  app.post("/v1/webhooks/paddle", async (c) => {
    if (!billingConfigured() || getProvider().name !== "paddle") return c.json({ error: "billing_unavailable" }, 501);
    const body = await c.req.text();
    const sig = c.req.header("paddle-signature") ?? "";
    
    try {
      const outcome = await paddleProvider.handleWebhook(body, sig);
      if (outcome.kind === "invalid_signature") return c.json({ error: "invalid_signature" }, 400);
      if (outcome.kind === "plan_change") {
        await applyPlanChange(db, outcome.customerId, outcome.plan);
      }
      return c.json({});
    } catch (e: any) {
      console.error(e.stack);
      return c.json({ error: "internal" }, 500);
    }
  });


  app.get("/billing/success", (c) => c.html(`<style>body { font-family: system-ui; text-align: center; margin-top: 50px; }</style><h2>Thank you!</h2><p>Your subscription is active. You can close this tab and return to Mafsar.</p>`));
  app.get("/billing/cancel", (c) => c.html(`<style>body { font-family: system-ui; text-align: center; margin-top: 50px; }</style><h2>Checkout cancelled</h2><p>You can close this tab and return to Mafsar.</p>`));
  app.get("/billing/return", (c) => c.html(`<style>body { font-family: system-ui; text-align: center; margin-top: 50px; }</style><h2>Portal Closed</h2><p>You can close this tab and return to Mafsar.</p>`));

  // --- Phase 2: LLM proxy (server key, grounded in user-supplied source) ---
  // Every route below costs a real LLM call, so requireQuota(db) runs first on
  // each one — inline per-route rather than a separate hand-maintained path
  // list (Hono's `use()` also has no array-of-paths overload to hang that list
  // off), so a new metered route can't be added here without its gate.
  app.post("/v1/generate", requireQuota(db, "set"), async (c) => {
    const body = generateSchema.parse(await c.req.json());
    const generated = await generateStudySet(body.messages);
    return c.json(generated);
  });

  app.post("/v1/grade", requireQuota(db, "practice"), async (c) => {
    const body = gradeSchema.parse(await c.req.json());
    return c.json(await gradeAnswer(body.question, body.reference, body.answer));
  });

  app.post("/v1/hypothetical", requireQuota(db, "practice"), async (c) => {
    const body = hypotheticalSchema.parse(await c.req.json());
    return c.json(await generateHypothetical(body.concept, body.reference));
  });

  app.post("/v1/summarize", requireQuota(db, "practice"), async (c) => {
    const body = summarizeSchema.parse(await c.req.json());
    return c.json(await summarizeConversation(body.messages));
  });

  app.post("/v1/blurb", async (c) => {
    const body = blurbSchema.parse(await c.req.json());
    return c.json(await setBlurb(body.title, body.cardFronts));
  });

  // Coding mode: one small task from a card's concept, then rubric grading of the
  // submitted code. Separate routes rather than extending /v1/hypothetical and
  // /v1/grade — the response shapes differ substantially, and those two are already
  // used by the Apply and Type-answers flows.
  app.post("/v1/coding-task", requireQuota(db, "coding"), async (c) => {
    const body = codingTaskSchema.parse(await c.req.json());
    return c.json(await generateCodingTask(body.concept, body.reference, body.language));
  });

  app.post("/v1/coding-grade", async (c) => {
    const body = codingGradeSchema.parse(await c.req.json());
    return c.json(await gradeCode(body));
  });

  // --- Phase 3: analytics — TODO ---
  app.get("/v1/insights", (c) =>
    c.json({ error: "not_implemented", phase: 3, todo: "weak topics, exam readiness, forgetting model from review_log" }, 501));

  // --- Sharing: a short code hands someone a COPY of one of your sets ------
  // Codes are the only handle protecting shared content, so they come from
  // crypto.randomBytes over an unambiguous alphabet (no 0/O, 1/I/l) — short
  // enough to read aloud, long enough not to be guessed.
  const SHARE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  const genShareCode = () => {
    let out = "";
    for (const b of randomBytes(10)) out += SHARE_ALPHABET[b % SHARE_ALPHABET.length];
    return out;
  };

  // GET /v1/share/:code serves another user's content by design; without a
  // per-user cap a signed-in client could walk the code space. 30/min is far
  // above human use and far below brute-force speed. In-memory on purpose —
  // a deploy resetting the window is fine for a throttle.
  const shareLookups = new Map<string, number[]>();
  function shareRateLimited(userId: string): boolean {
    const now = Date.now();
    const hits = (shareLookups.get(userId) || []).filter((t) => now - t < 60_000);
    hits.push(now);
    shareLookups.set(userId, hits);
    return hits.length > 30;
  }

  app.post("/v1/share", async (c) => {
    const userId = c.get("userId") as string;
    const body = shareCreateSchema.parse(await c.req.json());
    const set = await one(
      db, "SELECT id FROM sets WHERE id = ? AND user_id = ? AND deleted = 0", [body.setId, userId]
    );
    if (!set) return c.json({ error: "not_found", message: "No such set for this account." }, 404);
    // Re-sharing returns the live code instead of stacking rows.
    const existing = await one<{ code: string }>(
      db, "SELECT code FROM shares WHERE set_id = ? AND user_id = ? AND revoked = 0", [body.setId, userId]
    );
    if (existing) return c.json({ code: existing.code });
    let code = genShareCode();
    while (await one(db, "SELECT 1 AS x FROM shares WHERE code = ?", [code])) code = genShareCode();
    await run(
      db, "INSERT INTO shares (code, set_id, user_id, created_at, revoked) VALUES (?, ?, ?, ?, 0)",
      [code, body.setId, userId, nowISO()]
    );
    return c.json({ code });
  });

  app.get("/v1/share/:code", async (c) => {
    const userId = c.get("userId") as string;
    if (shareRateLimited(userId)) {
      return c.json({ error: "rate_limited", message: "Too many lookups — try again in a minute." }, 429);
    }
    const share = await one<{ set_id: string }>(
      db, "SELECT set_id FROM shares WHERE code = ? AND revoked = 0", [c.req.param("code")]
    );
    if (!share) return c.json({ error: "not_found", message: "Unknown or revoked code." }, 404);
    const set = await one<{ title: string }>(db, "SELECT title FROM sets WHERE id = ?", [share.set_id]);
    const cards = await all(db, "SELECT front, back FROM cards WHERE set_id = ? AND deleted = 0", [share.set_id]);
    const quiz = await all<{ question: string; options_json: string; answer: number; explain: string | null }>(
      db, "SELECT question, options_json, answer, explain FROM quiz WHERE set_id = ? AND deleted = 0", [share.set_id]
    );
    // Deliberately content only: no original ids (they would collide on
    // import), no SM-2 fields or examDate (personal progress), no owner
    // identity. The recipient builds their own schedule from scratch.
    return c.json({
      title: set?.title ?? "Shared set",
      cards,
      quiz: quiz.map((q) => ({
        q: q.question, options: JSON.parse(q.options_json), answer: q.answer, explain: q.explain ?? "",
      })),
    });
  });

  app.post("/v1/share/revoke", async (c) => {
    const userId = c.get("userId") as string;
    const body = shareRevokeSchema.parse(await c.req.json());
    const n = await run(
      db, "UPDATE shares SET revoked = 1 WHERE code = ? AND user_id = ? AND revoked = 0", [body.code, userId]
    );
    if (!n) return c.json({ error: "not_found", message: "No active share with that code." }, 404);
    return c.json({ ok: true });
  });

  // --- Teams: a shared code groups accounts; stats stay server-computed -----
  // Member emails and set titles are visible to members only, so every route
  // below re-checks membership against team_members — never the client's word.
  app.post("/v1/teams", async (c) => {
    const userId = c.get("userId") as string;
    const body = teamCreateSchema.parse(await c.req.json());
    const id = uid();
    // 6-char code from the same unambiguous alphabet as shares; retry on the
    // (astronomically unlikely) collision.
    let code = genTeamCode();
    while (await one(db, "SELECT 1 AS x FROM teams WHERE code = ?", [code])) code = genTeamCode();
    await run(
      db, "INSERT INTO teams (id, name, code, owner_id, created_at) VALUES (?, ?, ?, ?, ?)",
      [id, body.name, code, userId, nowISO()]
    );
    await run(
      db, "INSERT INTO team_members (team_id, user_id, joined_at) VALUES (?, ?, ?)",
      [id, userId, nowISO()]
    );
    return c.json({ id, name: body.name, code });
  });

  app.post("/v1/teams/join", async (c) => {
    const userId = c.get("userId") as string;
    const body = teamJoinSchema.parse(await c.req.json());
    const team = await one<{ id: string; name: string; code: string }>(
      db, "SELECT id, name, code FROM teams WHERE code = ?", [body.code.toUpperCase()]
    );
    if (!team) return c.json({ error: "not_found", message: "No team with that code." }, 404);
    // Idempotent: re-joining an existing membership is a no-op, not an error.
    await run(
      db, "INSERT OR IGNORE INTO team_members (team_id, user_id, joined_at) VALUES (?, ?, ?)",
      [team.id, userId, nowISO()]
    );
    return c.json(team);
  });

  app.get("/v1/teams", async (c) => {
    const userId = c.get("userId") as string;
    const teams = await all<{ id: string; name: string; code: string; memberCount: number }>(
      db,
      `SELECT t.id, t.name, t.code,
         (SELECT COUNT(*) FROM team_members mc WHERE mc.team_id = t.id) AS memberCount
       FROM teams t
       WHERE t.id IN (SELECT team_id FROM team_members WHERE user_id = ?)
       ORDER BY t.created_at DESC`,
      [userId]
    );
    return c.json(teams.map((t) => ({ ...t, memberCount: Number(t.memberCount) })));
  });

  app.get("/v1/teams/:id", async (c) => {
    const userId = c.get("userId") as string;
    const id = c.req.param("id");
    const team = await one<{ id: string; name: string; code: string }>(
      db, "SELECT id, name, code FROM teams WHERE id = ?", [id]
    );
    if (!team) return c.json({ error: "not_found" }, 404);
    const member = await one(
      db, "SELECT 1 AS x FROM team_members WHERE team_id = ? AND user_id = ?", [id, userId]
    );
    if (!member) return c.json({ error: "forbidden", message: "You're not a member of this team." }, 403);
    const members = (await all<{ user_id: string; email: string }>(
      db,
      `SELECT m.user_id, u.email FROM team_members m JOIN users u ON u.id = m.user_id
       WHERE m.team_id = ? ORDER BY m.joined_at ASC`,
      [id]
    )).map((m) => ({ userId: m.user_id, email: m.email }));
    return c.json({
      ...team,
      members,
      leaderboard: await leaderboardFor(db, members),
      learning: await learningFor(db, members),
    });
  });

  app.post("/v1/teams/:id/leave", async (c) => {
    const userId = c.get("userId") as string;
    const id = c.req.param("id");
    const team = await one(db, "SELECT 1 AS x FROM teams WHERE id = ?", [id]);
    if (!team) return c.json({ error: "not_found" }, 404);
    const n = await run(
      db, "DELETE FROM team_members WHERE team_id = ? AND user_id = ?", [id, userId]
    );
    if (!n) return c.json({ error: "forbidden", message: "You're not a member of this team." }, 403);
    return c.json({ ok: true });
  });

  // --- Phase 5: payments + notifications — TODO ---

  app.get("/healthz", (c) => c.json({ ok: true }));

  return app;
}
