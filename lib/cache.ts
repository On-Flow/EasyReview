import { promises as fs } from "fs";
import path from "path";
import type { PrLoadResult } from "./types";

const CACHE_DIR = path.join(process.cwd(), ".cache");

function cachePath(prNumber: number): string {
  return path.join(CACHE_DIR, `pr-${prNumber}.json`);
}

export async function readCache(
  prNumber: number,
  headSha: string
): Promise<PrLoadResult | null> {
  try {
    const raw = await fs.readFile(cachePath(prNumber), "utf-8");
    const parsed = JSON.parse(raw) as PrLoadResult;
    if (parsed.pr?.headSha !== headSha) return null; // stale: new commits pushed
    return parsed;
  } catch {
    return null;
  }
}

export async function writeCache(
  prNumber: number,
  result: PrLoadResult
): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(cachePath(prNumber), JSON.stringify(result, null, 2), "utf-8");
}

export interface CachedPrSummary {
  number: number;
  title: string;
  fetchedAt: string;
}

export async function listCachedPrs(): Promise<CachedPrSummary[]> {
  try {
    const entries = await fs.readdir(CACHE_DIR);
    const summaries = await Promise.all(
      entries
        .filter((e) => e.startsWith("pr-") && e.endsWith(".json"))
        .map(async (e) => {
          try {
            const raw = await fs.readFile(path.join(CACHE_DIR, e), "utf-8");
            const parsed = JSON.parse(raw) as PrLoadResult;
            return {
              number: parsed.pr.number,
              title: parsed.pr.title,
              fetchedAt: parsed.fetchedAt,
            };
          } catch {
            return null;
          }
        })
    );
    return summaries
      .filter((s): s is CachedPrSummary => s !== null)
      .sort((a, b) => b.number - a.number);
  } catch {
    return [];
  }
}
