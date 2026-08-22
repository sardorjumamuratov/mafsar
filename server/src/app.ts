import { Hono } from "hono";
import { cors } from "hono/cors";
import type { DB } from "./db.js";
import {
  register, login, requireAuth, signAccessToken, signRefreshToken,
} from "./auth.js";
import { syncSchema, registerSchema, loginSchema, generateSchema, gradeSchema, hypotheticalSchema, summarizeSchema, blurbSchema, codingTaskSchema, codingGradeSchema, shareCreateSchema, shareRevokeSchema } from "./schema.js";
import { applySync, changesSince } from "./sync.js";
import { nowISO, one, all, run } from "./db.js";
import { randomBytes } from "node:crypto";
import { generateStudySet, gradeAnswer, generateHypothetical, summarizeConversation, setBlurb, generateCodingTask, gradeCode } from "./llm.js";
import { PRIVACY_HTML } from "./privacy.js";

export function createApp(db: DB) {
  const app = new Hono<{ Variables: { userId: string } }>();

  // The extension / future web app call the API cross-origin.
  app.use("*", cors());

  // Public — required by the Chrome Web Store / Firefox Add-ons listings.
  app.get("/privacy", (c) => c.html(PRIVACY_HTML));

  app.use("/v1/*", async (c, next) => {
    // Auth routes are public; everything else under /v1 requires a token.
    if (c.req.path.startsWith("/v1/auth/")) return next();
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

  app.get("/v1/me", async (c) => {
    const userId = c.get("userId") as string;
    const user = await one(
      db, "SELECT id, email, created_at FROM users WHERE id = ?", [userId]
    );
    if (!user) return c.json({ error: "not_found" }, 404);
    return c.json({ user });
  });

  app.post("/v1/sync", async (c) => {
    const userId = c.get("userId") as string;
    const body = syncSchema.parse(await c.req.json().catch(() => ({})));
    await applySync(db, userId, body);
    const serverTime = nowISO();
    return c.json({ serverTime, ...(await changesSince(db, userId, body.since)) });
  });

  // --- Phase 2: LLM proxy (server key, grounded in user-supplied source) ---
  app.post("/v1/generate", async (c) => {
    const body = generateSchema.parse(await c.req.json());
    const generated = await generateStudySet(body.messages);
    return c.json(generated);
  });

  app.post("/v1/grade", async (c) => {
    const body = gradeSchema.parse(await c.req.json());
    return c.json(await gradeAnswer(body.question, body.reference, body.answer));
  });

  app.post("/v1/hypothetical", async (c) => {
    const body = hypotheticalSchema.parse(await c.req.json());
    return c.json(await generateHypothetical(body.concept, body.reference));
  });

  app.post("/v1/summarize", async (c) => {
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
  app.post("/v1/coding-task", async (c) => {
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

  // --- Phase 4: teams + Redis — TODO ---
  app.post("/v1/teams", (c) =>
    c.json({ error: "not_implemented", phase: 4, todo: "teams, invites, shared sets, leaderboards" }, 501));

  // --- Phase 5: payments + notifications — TODO ---

  app.get("/healthz", (c) => c.json({ ok: true }));

  return app;
}
