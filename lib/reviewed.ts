import { getDb } from "./db";

export function getReviewedHunkIds(prNumber: number): string[] {
  const rows = getDb()
    .prepare("SELECT hunk_id FROM reviewed_hunks WHERE pr_number = ?")
    .all(prNumber) as { hunk_id: string }[];
  return rows.map((r) => r.hunk_id);
}

export function setHunkReviewed(
  prNumber: number,
  hunkId: string,
  reviewed: boolean
): void {
  if (reviewed) {
    getDb()
      .prepare(
        `INSERT INTO reviewed_hunks (pr_number, hunk_id, reviewed_at) VALUES (?, ?, ?)
         ON CONFLICT(pr_number, hunk_id) DO NOTHING`
      )
      .run(prNumber, hunkId, new Date().toISOString());
  } else {
    getDb()
      .prepare("DELETE FROM reviewed_hunks WHERE pr_number = ? AND hunk_id = ?")
      .run(prNumber, hunkId);
  }
}
