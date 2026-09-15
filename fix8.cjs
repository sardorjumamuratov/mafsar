const fs = require("fs");
let content = fs.readFileSync("server/src/app.ts", "utf8");
content = content.replace(
  `if (payload.typ !== "refresh") throw new Error("wrong token type");`,
  `if (payload.typ !== "refresh") throw new Error("wrong token type");
      const live = await one(db, "SELECT 1 AS x FROM users WHERE id = ?", [payload.sub as string]);
      if (!live) throw new Error("deleted");`
);
content = content.replace(
  `return c.json({ error: "missing_confirmation" }, 400);`, // I will handle this via deleteAccountSchema fix!
  `return c.json({ error: "missing_confirmation" }, 400);`
);
content = content.replace(
  `return c.json({ deleted: true });`,
  `return c.json({ ok: true });`
);
content = content.replace(
  `return c.json({ error: "billing_cancel_failed", message: e.message }, 500);`,
  `return c.json({ error: "billing_cancel_failed", message: e.message }, 502);`
);
fs.writeFileSync("server/src/app.ts", content);
