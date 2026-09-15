const fs = require("fs");
let content = fs.readFileSync("server/src/billing/paddle.ts", "utf8");
content = content.replace(
  `export const paddleProvider: BillingProvider = {`,
  `import { one } from "../db.js";\n\nexport const paddleProvider: BillingProvider = {`
);
content = content.replace(
  `async createCheckout({ db, userId, email, plan, origin }) {`,
  `async cancelSubscriptions({ db, userId }) {
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

  async createCheckout({ db, userId, email, plan, origin }) {`
);
fs.writeFileSync("server/src/billing/paddle.ts", content);
