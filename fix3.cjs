const fs = require("fs");
let content = fs.readFileSync("server/src/app.ts", "utf8");
content = content.replace(
  `    return c.json({ user, hasPassword: !!password_hash, usage: { ...usage, plan } });
  });`,
  `    return c.json({ user, hasPassword: !!password_hash, usage: { ...usage, plan } });
  });

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
      } catch (e: any) {
        return c.json({ error: "billing_cancel_failed", message: e.message }, 500);
      }
    }

    await deleteUserData(db, userId);
    return c.json({ deleted: true });
  });`
);
fs.writeFileSync("server/src/app.ts", content);
