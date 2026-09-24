import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MIGRATIONS } from "../src/db.js";

// A migration is identified by its POSITION in MIGRATIONS (`00${i + 1}`), so the
// list is append-only in the strictest sense. Inserting one in the middle
// renames every entry after it: an applied migration looks unapplied, re-runs,
// and the server dies on boot with "table ... already exists". That is exactly
// what took production down once — the fix was to move the new entry to the end.
//
// These fingerprints freeze what each index means. Appending is free; changing,
// reordering or inserting is not. When you add one at the end, append its
// fingerprint here too (the failure message prints it).

const FROZEN = [
  "3df185fece158ee7", // 001 users
  "6573109da87a1e53", // 002 sets
  "fdc7ea0f1ecd1b9a", // 003 cards
  "3ae572e3f2d941b1", // 004 quiz
  "c1069b061f5d8fe2", // 005 activity
  "e6a5f1adea2cd4e3", // 006 review_log
  "2c47c4e4ca4d6565", // 007 shares
  "b893fc1bd83d2640", // 008 teams
  "4fff19f33a1b4f11", // 009 users.google_sub
  "327aede9355b3f2e", // 010 users.plan + generation_events
  "80ecbefaf5f68303", // 011 generation_events.category
  "e11cf57a3c047fce", // 012 users.billing_customer_id
  "f95adcf3c510e91e", // 013 sets.server_updated_at
  "ec583308c2d37863", // 014 cards.stability
  "442c8d41b7445fc1", // 015 chains + chain_steps
  "51e0f0e615230e98", // 016 sets.chain_overrides
];

const fingerprint = (sql: string) =>
  createHash("sha256").update(sql.replace(/\s+/g, " ").trim()).digest("hex").slice(0, 16);

describe("MIGRATIONS is append-only", () => {
  it("no existing migration has been edited, reordered or inserted", () => {
    const actual = MIGRATIONS.slice(0, FROZEN.length).map(fingerprint);
    for (let i = 0; i < FROZEN.length; i++) {
      expect(
        actual[i],
        `migration ${String(i + 1).padStart(3, "0")} changed. Migrations are named by position: ` +
          `editing or inserting one re-runs somebody else's against a database that already has it. ` +
          `Add new migrations at the end instead.`
      ).toBe(FROZEN[i]);
    }
  });

  it("new migrations are appended, and their fingerprints recorded here", () => {
    const extra = MIGRATIONS.slice(FROZEN.length);
    expect(
      extra.map(fingerprint),
      `${extra.length} migration(s) added without a fingerprint. Append these to FROZEN: ` +
        JSON.stringify(extra.map(fingerprint))
    ).toEqual([]);
  });

  it("every migration ends up with a unique name", () => {
    const names = MIGRATIONS.map((_, i) => `00${i + 1}`);
    expect(new Set(names).size).toBe(names.length);
  });
});
