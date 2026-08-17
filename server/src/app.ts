import { Hono } from "hono";
import { cors } from "hono/cors";
import type { DB } from "./db.js";
import {
  register, login, requireAuth, signAccessToken, signRefreshToken,
} from "./auth.js";
import { syncSchema, registerSchema, loginSchema, generateSchema, gradeSchema, hypotheticalSchema, summarizeSchema, blurbSchema } from "./schema.js";
import { applySync, changesSince } from "./sync.js";
import { nowISO, one } from "./db.js";
import { generateStudySet, gradeAnswer, generateHypothetical, summarizeConversation, setBlurb } from "./llm.js";

export function createApp(db: DB) {
  const app = new Hono<{ Variables: { userId: string } }>();

  // The extension / future web app call the API cross-origin.
  app.use("*", cors());

  app.use("/v1/*", async (c, next) => {
    // Auth routes are public; everything else under /v1 requires a token.
    if (c.req.path.startsWith("/v1/auth/")) return next();
    return requireAuth()(c, next);
  });

  app.onError((err, c) => {
    const e = err as Error & { issues?: unknown };
    if (e.name === "ZodError") {
      return c.json({ error: "validation", details: e.issues }, 400);
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

  // --- Phase 3: analytics — TODO ---
  app.get("/v1/insights", (c) =>
    c.json({ error: "not_implemented", phase: 3, todo: "weak topics, exam readiness, forgetting model from review_log" }, 501));

  // --- Phase 4: teams + Redis — TODO ---
  app.post("/v1/teams", (c) =>
    c.json({ error: "not_implemented", phase: 4, todo: "teams, invites, shared sets, leaderboards" }, 501));

  // --- Phase 5: payments + notifications — TODO ---

  app.get("/healthz", (c) => c.json({ ok: true }));

  return app;
}
