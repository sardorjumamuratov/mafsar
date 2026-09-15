const fs = require("fs");
let content = fs.readFileSync("server/src/app.ts", "utf8");
content = content.replace(
  `    const user = await one<{ id: string; email: string; created_at: string; plan: string }>(
      db, "SELECT id, email, created_at, plan FROM users WHERE id = ?", [userId]
    );`,
  `    const row = await one<{ id: string; email: string; created_at: string; plan: string; password_hash: string | null }>(
      db, "SELECT id, email, created_at, plan, password_hash FROM users WHERE id = ?", [userId]
    );
    const { password_hash, ...user } = row ?? ({} as any);`
);
content = content.replace(
  `if (!user) return c.json({ error: "not_found" }, 404);`,
  `if (!row) return c.json({ error: "not_found" }, 404);`
);
content = content.replace(
  `return c.json({ user, usage: { ...usage, plan } });`,
  `return c.json({ user, hasPassword: !!password_hash, usage: { ...usage, plan } });`
);
fs.writeFileSync("server/src/app.ts", content);
