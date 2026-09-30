import { describe, it, expect, beforeEach } from "vitest";
import { openDB, migrate } from "../src/db.js";
import { createApp } from "../src/app.js";

describe("health", () => {
  it("works", async () => {
    const db = openDB(":memory:");
    await migrate(db);
    const app = createApp(db);
    const res = await app.request("/healthz");
    console.log(res.status);
    console.log(await res.text());
    
    const put = await app.request("/v1/sets/s1/rating", { method: "PUT" });
    console.log("PUT status", put.status);
    console.log("PUT body", await put.text());
  });
});