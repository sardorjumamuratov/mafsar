const fs = require("fs");
let mapTs = fs.readFileSync("mobile/src/sync/map.ts", "utf8");

mapTs = mapTs.replace(
  'due_date: number | string | null; updated_at: string; deleted: number;',
  'due_date: number | string | null; updated_at: string; deleted: number;\n  origin_set_id?: string | null;\n  renamed?: number;\n  description?: string | null;'
);
mapTs = mapTs.replace(
  'lapses: number | null; last_review: number | string | null;',
  'lapses: number | null; last_review: number | string | null;\n  origin_card_id?: string | null;\n  detached?: number;'
);

mapTs = mapTs.replace(
  'export interface ReviewRowDB {',
  'export interface ReviewRowDB {\n  duration_ms?: number | null;'
);

fs.writeFileSync("mobile/src/sync/map.ts", mapTs);
