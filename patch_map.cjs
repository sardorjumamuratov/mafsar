const fs = require("fs");
let code = fs.readFileSync("mobile/src/sync/map.ts", "utf8");

// update setToWire
code = code.replace(
  'source: s.source ?? null,',
  'description: s.description ?? null,\n    source: s.source ?? null,'
);
code = code.replace(
  'deleted: !!s.deleted,',
  'deleted: !!s.deleted,\n    originSetId: s.origin_set_id ?? null,\n    renamed: !!s.renamed,'
);

// update cardToWire
code = code.replace(
  'deleted: !!c.deleted,',
  'deleted: !!c.deleted,\n    originCardId: c.origin_card_id ?? null,\n    detached: !!c.detached,'
);

// update reviewToWire
code = code.replace(
  'reviewedAt: l.reviewed_at,',
  'reviewedAt: l.reviewed_at,\n    durationMs: typeof l.duration_ms === "number" ? l.duration_ms : undefined,'
);

// update setFromWire
code = code.replace(
  'source: w.source ?? null,',
  'description: w.description ?? null,\n    source: w.source ?? null,'
);
code = code.replace(
  'deleted: w.deleted ? 1 : 0,',
  'deleted: w.deleted ? 1 : 0,\n    origin_set_id: w.originSetId ?? null,\n    renamed: w.renamed ? 1 : 0,'
);

// update cardFromWire
code = code.replace(
  'deleted: w.deleted ? 1 : 0,',
  'deleted: w.deleted ? 1 : 0,\n    origin_card_id: w.originCardId ?? null,\n    detached: w.detached ? 1 : 0,'
);

fs.writeFileSync("mobile/src/sync/map.ts", code);
