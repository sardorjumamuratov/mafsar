const fs = require("fs");
let content = fs.readFileSync("server/src/app.ts", "utf8").replace(/\r\n/g, "\n");
content = content.replace(
  `  app.use("/v1/*", async (c, next) => {
    // Auth routes are public; everything else under /v1 requires a token.
    if (c.req.path.startsWith("/v1/auth/") || c.req.path.startsWith("/v1/webhooks/")) return next();
    return requireAuth()(c, next);
  });`,
  `  const isPublicV1 = (path: string) => path.startsWith("/v1/auth/") || path.startsWith("/v1/webhooks/");

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
  });`
);
fs.writeFileSync("server/src/app.ts", content);
