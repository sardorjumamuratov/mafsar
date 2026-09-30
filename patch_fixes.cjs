const fs = require("fs");

// 1. db.ts comma fix
let dbCode = fs.readFileSync("server/src/db.ts", "utf8");
dbCode = dbCode.replace(
  '  )\n  `\n  `\n    ALTER TABLE cards',
  '  )\n  `,\n  `\n    ALTER TABLE cards'
);
fs.writeFileSync("server/src/db.ts", dbCode);

// 2. ratings.ts fixes
let ratings = fs.readFileSync("server/src/ratings.ts", "utf8");
ratings = ratings.replace('import { zValidator } from "@hono/zod-validator";', '');
ratings = ratings.replace('import { limitByUser } from "./ratelimit.js";', 'import { limitByUser, slidingWindow } from "./ratelimit.js";');
ratings = ratings.replace('const rateLimit = limitByUser({ max: 60, windowMs: 60000 });', 'const rateLimit = limitByUser(slidingWindow({ limit: 60, windowMs: 60000 }));');

ratings = ratings.replace('const user = c.get("user");', 'const userId = c.get("userId") as string;');
ratings = ratings.replace('const user = c.get("user");', 'const userId = c.get("userId") as string;');
ratings = ratings.replace('const user = c.get("user");', 'const userId = c.get("userId") as string;');

ratings = ratings.replace('user.id', 'userId');
ratings = ratings.replace('user.id', 'userId');
ratings = ratings.replace('user.id', 'userId');
ratings = ratings.replace('user.id', 'userId');
ratings = ratings.replace('user.id', 'userId');
ratings = ratings.replace('user.id', 'userId');
ratings = ratings.replace('user.id', 'userId');
ratings = ratings.replace('user.id', 'userId');

ratings = ratings.replace('app.put("/v1/sets/:id/rating", requireAuth, rateLimit, zValidator("json", z.object({\n    stars: z.number().int().min(1).max(5)\n  })), async (c) => {', 'app.put("/v1/sets/:id/rating", requireAuth, rateLimit, async (c) => {');
ratings = ratings.replace('const { stars } = c.req.valid("json");', 'const body = await c.req.json();\n    const stars = body.stars;\n    if (typeof stars !== "number" || stars < 1 || stars > 5) return c.json({error: "bad_request"}, 400);');

ratings = ratings.replace('app.post("/v1/ratings/lookup", requireAuth, zValidator("json", z.object({\n    ids: z.array(z.string()).max(200)\n  })), async (c) => {', 'app.post("/v1/ratings/lookup", requireAuth, async (c) => {');
ratings = ratings.replace('const { ids } = c.req.valid("json");', 'const body = await c.req.json();\n    const ids = body.ids;\n    if (!Array.isArray(ids)) return c.json({error: "bad_request"}, 400);');

fs.writeFileSync("server/src/ratings.ts", ratings);

// 3. sync.ts payload fix
let sync = fs.readFileSync("server/src/sync.ts", "utf8");
sync = sync.replace('lastReview?: string | number | null;', 'lastReview?: string | number | null;\n  originCardId?: string | null;\n  detached?: boolean;');
fs.writeFileSync("server/src/sync.ts", sync);

// 4. schema.test.ts count
let schema = fs.readFileSync("server/tests/schema.test.ts", "utf8");
schema = schema.replace('expect(tables).toBe(15);', 'expect(tables).toBe(15); // Wait, if I added reports and set_ratings, it should be 17!');
// Let's actually find what the number should be.
fs.writeFileSync("server/tests/schema.test.ts", schema);

