import type { DB } from "./db.js";

/**
 * Permanently removes a user and everything that references them, in one batch.
 * Teams they own are dissolved (other members included); they leave teams they
 * joined. tests/account.test.ts discovers every user_id / owner_id column from
 * the schema, so a table added later fails the suite until it's handled here.
 */
export async function deleteUserData(db: DB, userId: string): Promise<void> {
  const ownedTeams = "SELECT id FROM teams WHERE owner_id = ?";
  await db.batch(
    [
      { sql: "DELETE FROM review_log WHERE user_id = ?", args: [userId] },
      { sql: "DELETE FROM activity WHERE user_id = ?", args: [userId] },
      { sql: "DELETE FROM generation_events WHERE user_id = ?", args: [userId] },
      { sql: "DELETE FROM shares WHERE user_id = ?", args: [userId] },
      { sql: "DELETE FROM quiz WHERE user_id = ?", args: [userId] },
      { sql: "DELETE FROM cards WHERE user_id = ?", args: [userId] },
      { sql: "DELETE FROM sets WHERE user_id = ?", args: [userId] },
      { sql: `DELETE FROM team_members WHERE team_id IN (${ownedTeams})`, args: [userId] },
      { sql: "DELETE FROM teams WHERE owner_id = ?", args: [userId] },
      { sql: "DELETE FROM team_members WHERE user_id = ?", args: [userId] },
      { sql: "DELETE FROM pending_logins WHERE user_id = ?", args: [userId] },
      { sql: "DELETE FROM users WHERE id = ?", args: [userId] },
    ],
    "write"
  );
}
