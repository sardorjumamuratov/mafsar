import { describe, expect, it } from "vitest";
import { reviewSchema, syncSchema } from "../src/schema.js";
// The real client helper, imported across the boundary on purpose: a row shape
// that drifts from the schema is not a typo, it is a sync that fails for the
// whole batch and retries forever.
// @ts-expect-error - plain ESM from the extension, no types
import { DRILL_KINDS, drillLogEntry } from "../../src/storage/drill-log.js";

describe("rows the extension writes are rows this server accepts", () => {
  it("every drill kind produces a valid review row", () => {
    for (const kind of DRILL_KINDS as string[]) {
      for (const fraction of [0, 0.34, 0.5, 0.86, 1]) {
        const row = drillLogEntry({ kind, sessionId: "sess1", fraction, id: `r-${kind}-${fraction}` });
        const parsed = reviewSchema.safeParse(row);
        expect(parsed.success, `${kind} @ ${fraction}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
      }
    }
  });

  it("a drill row never carries an empty cardId or a missing grade", () => {
    // Both have happened. Either one fails validation for every other row too.
    for (const kind of DRILL_KINDS as string[]) {
      const row = drillLogEntry({ kind, sessionId: "sess1", fraction: 1, id: "r1" });
      expect(row.cardId).toBeTruthy();
      expect(typeof row.grade).toBe("number");
    }
  });

  it("a batch of drill rows passes the sync schema as a whole", () => {
    const reviews = (DRILL_KINDS as string[]).map((kind, i) =>
      drillLogEntry({ kind, sessionId: "sess1", fraction: 0.9, id: `r${i}`, chainId: "ch1" })
    );
    const parsed = syncSchema.safeParse({ reviews });
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it("an unknown drill kind is refused at the source, not at the server", () => {
    expect(() => drillLogEntry({ kind: "not-a-drill", sessionId: "s", fraction: 1, id: "x" })).toThrow();
  });
});
