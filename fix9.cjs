const fs = require("fs");
let content = fs.readFileSync("server/src/schema.ts", "utf8");
content = content.replace(
  `export const deleteAccountSchema = z.object({
  password: z.string().optional(),
  confirm: z.string()
});`,
  `export const deleteAccountSchema = z.object({
  // Exact and case-sensitive: this is the one irreversible call in the API.
  confirm: z.literal("DELETE"),
  password: z.string().max(200).optional(),
});`
);
fs.writeFileSync("server/src/schema.ts", content);
