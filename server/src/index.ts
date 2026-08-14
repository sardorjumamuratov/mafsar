import { serve } from "@hono/node-server";
import { readFileSync, existsSync } from "node:fs";
import { openDB } from "./db.js";
import { createApp } from "./app.js";

// .env loading without a dependency: KEY=VALUE lines, nothing fancier.
if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const db = openDB(process.env.DATABASE_PATH ?? "mafsar.sqlite");
const app = createApp(db);

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`mafsar-server listening on http://localhost:${info.port}`);
});
