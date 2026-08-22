import type { DB } from "./db.js";
import { one, all } from "./db.js";
import { randomBytes } from "node:crypto";

// Teams: a shared code groups accounts; the leaderboard is computed from data
// the server already holds (cards, review_log, activity) — never trusted from
// the client.

// Same unambiguous alphabet as share codes (no 0/O, 1/I/l), 6 chars — team
// codes are read aloud in person, so they stay shorter than share codes.
const TEAM_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const genTeamCode = (): string => {
  let out = "";
  for (const b of randomBytes(6)) out += TEAM_ALPHABET[b % TEAM_ALPHABET.length];
  return out;
};

export interface LeaderRow {
  userId: string;
  email: string;
  mastered: number;
  reviews7d: number;
  streak: number;
}
export type RankedRow = LeaderRow & { rank: number };

/**
 * Sort by mastered desc, then reviews7d desc, then email asc, stamping each
 * row with a 1-based rank. Rows with equal (mastered, reviews7d) share a rank
 * competition-style (two 1sts means the next row ranks 3rd); the email
 * tiebreak only orders equal keys, it never splits a shared rank.
 */
export function rankLeaderboard(members: LeaderRow[]): RankedRow[] {
  const sorted = [...members].sort(
    (a, b) =>
      b.mastered - a.mastered ||
      b.reviews7d - a.reviews7d ||
      (a.email < b.email ? -1 : a.email > b.email ? 1 : 0)
  );
  let prevKey: string | null = null;
  let prevRank = 0;
  return sorted.map((row, i) => {
    const key = `${row.mastered}:${row.reviews7d}`;
    const rank = key === prevKey ? prevRank : i + 1;
    prevKey = key;
    prevRank = rank;
    return { ...row, rank };
  });
}

// --- per-member stats assembled from synced tables -----------------------------

/** Mirror of the client's masteryOf: reps>=3, or reps>=2 on a 6+ day interval. */
const MASTERED_SQL =
  "SELECT COUNT(*) AS n FROM cards WHERE user_id = ? AND deleted = 0 AND (repetitions >= 3 OR (repetitions >= 2 AND interval >= 6))";

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Consecutive-day streak ending today (or yesterday if nothing yet today) —
 * the server-side mirror of the client's computeStreak, over the synced
 * activity table.
 */
export function streakFromDays(days: string[]): number {
  const set = new Set(days);
  const d = new Date();
  let streak = 0;
  if (!set.has(dayKey(d))) d.setUTCDate(d.getUTCDate() - 1);
  while (set.has(dayKey(d))) {
    streak += 1;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return streak;
}

/**
 * Leaderboard rows for a set of member users: mastered cards, reviews in the
 * last 7 days, and the activity streak — everything computed server-side.
 */
export async function leaderboardFor(db: DB, members: { userId: string; email: string }[]): Promise<RankedRow[]> {
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const rows: LeaderRow[] = [];
  for (const member of members) {
    const mastered = await one<{ n: number }>(db, MASTERED_SQL, [member.userId]);
    const reviews = await one<{ n: number }>(
      db, "SELECT COUNT(*) AS n FROM review_log WHERE user_id = ? AND reviewed_at > ?", [member.userId, since7d]
    );
    const days = await all<{ day: string }>(
      db, "SELECT day FROM activity WHERE user_id = ? AND count > 0", [member.userId]
    );
    rows.push({
      userId: member.userId,
      email: member.email,
      mastered: Number(mastered?.n ?? 0),
      reviews7d: Number(reviews?.n ?? 0),
      streak: streakFromDays(days.map((r) => r.day)),
    });
  }
  return rankLeaderboard(rows);
}

/**
 * "Who's learning what": each member's up to 3 most-recently-updated
 * non-deleted set titles.
 */
export async function learningFor(
  db: DB,
  members: { userId: string; email: string }[]
): Promise<{ userId: string; email: string; titles: string[] }[]> {
  const out: { userId: string; email: string; titles: string[] }[] = [];
  for (const member of members) {
    const rows = await all<{ title: string }>(
      db,
      "SELECT title FROM sets WHERE user_id = ? AND deleted = 0 ORDER BY updated_at DESC LIMIT 3",
      [member.userId]
    );
    out.push({ userId: member.userId, email: member.email, titles: rows.map((r) => r.title) });
  }
  return out;
}
