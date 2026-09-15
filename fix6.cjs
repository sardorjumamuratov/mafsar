const fs = require("fs");
let content = fs.readFileSync("server/src/billing/stripe.ts", "utf8");
content = content.replace(
  `export const stripeProvider: BillingProvider = {`,
  `import { one } from "../db.js";\n\nexport const stripeProvider: BillingProvider = {`
);
content = content.replace(
  `async createCheckout({ db, userId, email, plan, origin }) {`,
  `async cancelSubscriptions({ db, userId }) {
    const user = await one<{ billing_customer_id: string | null }>(
      db, "SELECT billing_customer_id FROM users WHERE id = ?", [userId]
    );
    if (!user?.billing_customer_id) return;
    const stripe = stripeClient();
    for await (const sub of stripe.subscriptions.list({ customer: user.billing_customer_id, status: "all" })) {
      if (["active", "trialing", "past_due", "unpaid", "incomplete"].includes(sub.status)) {
        await stripe.subscriptions.cancel(sub.id);
      }
    }
  },

  async createCheckout({ db, userId, email, plan, origin }) {`
);
fs.writeFileSync("server/src/billing/stripe.ts", content);
