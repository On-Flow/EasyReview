import { getDb } from "./db";
import type { PrLoadResult } from "./types";

export async function readCache(
  prNumber: number,
  headSha: string
): Promise<PrLoadResult | null> {
  const row = getDb()
    .prepare("SELECT head_sha, data FROM prs WHERE pr_number = ?")
    .get(prNumber) as { head_sha: string; data: string } | undefined;

  if (!row || row.head_sha !== headSha) return null; // stale: new commits pushed
  try {
    return JSON.parse(row.data) as PrLoadResult;
  } catch {
    return null;
  }
}

export async function writeCache(
  prNumber: number,
  result: PrLoadResult
): Promise<void> {
  getDb()
    .prepare(
      `INSERT INTO prs (pr_number, head_sha, data, fetched_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(pr_number) DO UPDATE SET head_sha = excluded.head_sha, data = excluded.data, fetched_at = excluded.fetched_at`
    )
    .run(prNumber, result.pr.headSha, JSON.stringify(result), result.fetchedAt);
}

export interface CachedPrSummary {
  number: number;
  title: string;
  fetchedAt: string;
}

export async function listCachedPrs(): Promise<CachedPrSummary[]> {
  const rows = getDb()
    .prepare("SELECT pr_number, data, fetched_at FROM prs ORDER BY pr_number DESC")
    .all() as { pr_number: number; data: string; fetched_at: string }[];

  return rows.flatMap((row) => {
    try {
      const parsed = JSON.parse(row.data) as PrLoadResult;
      return [{ number: row.pr_number, title: parsed.pr.title, fetchedAt: row.fetched_at }];
    } catch {
      return [];
    }
  });
}
