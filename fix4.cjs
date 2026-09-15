const fs = require("fs");
let content = fs.readFileSync("server/src/billing/provider.ts", "utf8");
content = content.replace(
  `createCheckout(args: { db: DB; userId: string; email: string; plan: "plus" | "pro"; origin: string }): Promise<string>;`,
  `createCheckout(args: { db: DB; userId: string; email: string; plan: "plus" | "pro"; origin: string }): Promise<string>;
  /** Cancel every active subscription for this user immediately. Resolves when there is none. */
  cancelSubscriptions(args: { db: DB; userId: string }): Promise<void>;`
);
fs.writeFileSync("server/src/billing/provider.ts", content);
