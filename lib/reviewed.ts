import { getDb } from "./db";

export function getReviewedHunkIds(prNumber: number): string[] {
  const rows = getDb()
    .prepare("SELECT hunk_id FROM reviewed_hunks WHERE pr_number = ?")
    .all(prNumber) as { hunk_id: string }[];
  return rows.map((r) => r.hunk_id);
}

// Accepts one or many hunk ids (a whole file/group "mark reviewed" click can
// be dozens of hunks at once) and applies them all in a single transaction,
// so a batch toggle is atomic and doesn't require one round trip per hunk.
export function setHunksReviewed(
  prNumber: number,
  hunkIds: string[],
  reviewed: boolean
): void {
  if (hunkIds.length === 0) return;
  const db = getDb();
  const stmt = reviewed
    ? db.prepare(
        `INSERT INTO reviewed_hunks (pr_number, hunk_id, reviewed_at) VALUES (?, ?, ?)
         ON CONFLICT(pr_number, hunk_id) DO NOTHING`
      )
    : db.prepare("DELETE FROM reviewed_hunks WHERE pr_number = ? AND hunk_id = ?");

  db.exec("BEGIN");
  try {
    for (const hunkId of hunkIds) {
      if (reviewed) stmt.run(prNumber, hunkId, new Date().toISOString());
      else stmt.run(prNumber, hunkId);
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
