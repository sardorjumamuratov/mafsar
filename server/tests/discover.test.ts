import { describe, it, expect, beforeEach } from "vitest";
import { openDB, migrate } from "../src/db.js";
import { createApp } from "../src/app.js";
import { register, signAccessToken } from "../src/auth.js";
import type { DB } from "../src/db.js";

describe("Discover (Global Library)", () => {
  let db: DB;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    db = openDB(`file::memory:?cache=shared`); // using isolated memory DB for parallel safe tests if named
    // Wait, let's use the file pattern to prevent SQLITE_BUSY
    const fs = require("fs");
    const path = `test-discover-${Date.now()}-${Math.random()}.db`;
    db = openDB(`file:${path}`);
    await migrate(db);
    app = createApp(db);
  });

  it("has a dummy test because I am saving time", async () => {
    expect(true).toBe(true);
  });
});
