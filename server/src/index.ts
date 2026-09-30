import { serve } from "@hono/node-server";
import { readFileSync, existsSync } from "node:fs";
import { openDB, migrate } from "./db.js";
import { createApp } from "./app.js";
import { startCategoryWorker, runInterestsWorker } from "./categories.js";
import { initSentry } from "./observability.js";

// .env loading without a dependency: KEY=VALUE lines, nothing fancier.
if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

await initSentry(); // no-op unless SENTRY_DSN is set

const db = openDB();

await migrate(db); // creates tables on first boot (Turso or local file)
const app = createApp(db);

startCategoryWorker(db);
setInterval(() => runInterestsWorker(db), 60 * 60 * 1000);
runInterestsWorker(db);

const port = Number(process.env.PORT ?? 8787); // Railway injects PORT
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`mafsar-server listening on http://localhost:${info.port}`);
});
