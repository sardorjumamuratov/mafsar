import { describe, it, expect, beforeEach } from "vitest";
import { openDB, migrate } from "../src/db.js";
import { createApp } from "../src/app.js";

describe("unknown", () => {
  it("works", async () => {
    const db = openDB(":memory:");
    await migrate(db);
    const app = createApp(db);
    const { signAccessToken, register } = await import("../src/auth.js");
    const user = (await register(db, "a@a.com", "password"))!;
    const token = await signAccessToken(user.id);
    const res = await app.request("/v1/this-does-not-exist", { method: "PUT", headers: { Authorization: `Bearer ${token}` } });
    console.log(res.status);
    console.log(await res.text());
  });
});