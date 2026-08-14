// Standalone migration runner: npm run migrate
import { readFileSync, existsSync } from "node:fs";
import { openDB } from "./db.js";

if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

openDB(process.env.DATABASE_PATH ?? "mafsar.sqlite");
console.log("migrations applied");
