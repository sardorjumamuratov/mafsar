import type { DB } from "./db.js";

// In-memory counters: "day|route|mode" -> count
let counters = new Map<string, number>();
let flushInterval: ReturnType<typeof setInterval> | null = null;

export function trackUsage(route: string, mode: string) {
  // Use YYYY-MM-DD
  const day = new Date().toISOString().split("T")[0];
  const key = `${day}|${route}|${mode}`;
  counters.set(key, (counters.get(key) || 0) + 1);
}

export function startAnalyticsFlushing(db: DB, intervalMs = 60000) {
  if (flushInterval) clearInterval(flushInterval);
  flushInterval = setInterval(() => flushUsage(db), intervalMs);
}

export async function flushUsage(db: DB) {
  if (counters.size === 0) return;
  const toFlush = counters;
  counters = new Map<string, number>();

  const stmts = [];
  for (const [key, count] of toFlush.entries()) {
    const [day, route, mode] = key.split("|");
    stmts.push({
      sql: `
        INSERT INTO usage_counts (day, route, mode, count)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(day, route, mode) DO UPDATE SET count = usage_counts.count + ?
      `,
      args: [day, route, mode, count, count],
    });
  }
  
  try {
    await db.batch(stmts, "write");
  } catch (e) {
    console.error("Failed to flush usage counts", e);
    // Put them back to retry next flush
    for (const [key, count] of toFlush.entries()) {
      counters.set(key, (counters.get(key) || 0) + count);
    }
  }
}

export async function getUsageCounts(db: DB) {
  const res = await db.execute("SELECT day, route, mode, count FROM usage_counts ORDER BY day DESC, route ASC, mode ASC");
  return res.rows;
}
