import { NextResponse } from "next/server";
import { fetchPrMeta, fetchPrFiles, fetchPrComments } from "@/lib/github";
import { readCache, writeCache } from "@/lib/cache";
import { groupPullRequest } from "@/lib/grouping";
import type { PrLoadResult } from "@/lib/types";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ number: string }> }
) {
  const { number } = await params;
  const prNumber = Number(number);
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    return NextResponse.json({ error: "Invalid PR number" }, { status: 400 });
  }

  try {
    const pr = await fetchPrMeta(prNumber);

    const cached = await readCache(prNumber, pr.headSha);
    if (cached) {
      return NextResponse.json({ ...cached, fromCache: true });
    }

    const [files, comments] = await Promise.all([
      fetchPrFiles(prNumber),
      fetchPrComments(prNumber),
    ]);

    const omittedFiles = files
      .filter((f) => !f.patch)
      .map((f) => ({ path: f.path, reason: "diff too large or binary to display" }));

    const { result: grouping, meta: groupingMeta } = await groupPullRequest(
      pr,
      files,
      comments
    );

    const result: PrLoadResult = {
      pr,
      files,
      omittedFiles,
      comments,
      grouping,
      groupingMeta,
      fetchedAt: new Date().toISOString(),
    };

    await writeCache(prNumber, result);

    return NextResponse.json({ ...result, fromCache: false });
  } catch (err) {
    console.error(`Failed to load PR #${prNumber}`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
