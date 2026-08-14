import { Hono } from "hono";
import { cors } from "hono/cors";
import type { DB } from "./db.js";
import {
  register, login, requireAuth, signAccessToken, signRefreshToken,
} from "./auth.js";
import { syncSchema, registerSchema, loginSchema } from "./schema.js";
import { applySync, changesSince } from "./sync.js";
import { nowISO, one } from "./db.js";

export function createApp(db: DB) {
  const app = new Hono();

  // The extension / future web app call the API cross-origin.
  app.use("*", cors());

  app.use("/v1/*", async (c, next) => {
    // Auth routes are public; everything else under /v1 requires a token.
    if (c.req.path.startsWith("/v1/auth/")) return next();
    return requireAuth()(c, next);
  });

  app.onError((err, c) => {
    if (err.name === "ZodError") {
      return c.json({ error: "validation", details: err.issues }, 400);
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

  // --- Phase 2: LLM proxy (mode-aware) — TODO ---
  app.post("/v1/generate", (c) =>
    c.json({ error: "not_implemented", phase: 2, todo: "transcript/sourceText -> flashcards + quiz + summary" }, 501));
  app.post("/v1/grade", (c) =>
    c.json({ error: "not_implemented", phase: 2, todo: "AI short-answer / IRAC grading" }, 501));
  app.post("/v1/hypothetical", (c) =>
    c.json({ error: "not_implemented", phase: 2, todo: "fresh fact-pattern for adaptive practice" }, 501));

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
