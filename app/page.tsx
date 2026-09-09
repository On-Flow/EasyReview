"use client";

import { useEffect, useMemo, useState } from "react";
import type { PrLoadResult, PrFile, ReviewComment, AiComment } from "@/lib/types";
import type { CachedPrSummary } from "@/lib/cache";
import { getFileHunkIds } from "@/lib/diffUtils";
import PrHeader from "@/components/PrHeader";
import GroupSection from "@/components/GroupSection";
import ConversationPanel from "@/components/ConversationPanel";
import ReviewProgressBadge from "@/components/ReviewProgressBadge";

export default function Home() {
  const [prNumberInput, setPrNumberInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<
    (PrLoadResult & { fromCache?: boolean; reviewedHunkIds: string[] }) | null
  >(null);
  const [cachedPrs, setCachedPrs] = useState<CachedPrSummary[]>([]);
  const [viewType, setViewType] = useState<"unified" | "split">("unified");
  const [reviewedHunkIds, setReviewedHunkIds] = useState<Set<string>>(new Set());
  const [aiCommentsByPath, setAiCommentsByPath] = useState<Map<string, AiComment[]>>(
    new Map()
  );
  const [aiReviewingGroups, setAiReviewingGroups] = useState<Set<string>>(new Set());
  const [aiReviewResults, setAiReviewResults] = useState<
    Map<string, { count: number; error?: string }>
  >(new Map());

  useEffect(() => {
    fetch("/api/cached")
      .then((r) => r.json())
      .then((d) => setCachedPrs(d.cached ?? []))
      .catch(() => {});
  }, []);

  async function loadPr(number: string) {
    const n = Number(number);
    if (!Number.isInteger(n) || n <= 0) {
      setError("Enter a valid PR number");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    setAiCommentsByPath(new Map());
    setAiReviewResults(new Map());
    try {
      const res = await fetch(`/api/pr/${n}/load`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load PR");
      setResult(data);
      setReviewedHunkIds(new Set<string>(data.reviewedHunkIds ?? []));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load PR");
    } finally {
      setLoading(false);
    }
  }

  function toggleHunksReviewed(hunkIds: string[], reviewed: boolean) {
    if (!result || hunkIds.length === 0) return;
    const prNumber = result.pr.number;

    setReviewedHunkIds((prev) => {
      const next = new Set(prev);
      for (const id of hunkIds) {
        if (reviewed) next.add(id);
        else next.delete(id);
      }
      return next;
    });

    fetch(`/api/pr/${prNumber}/reviewed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hunkIds, reviewed }),
    }).catch(() => {
      // Revert on failure so the UI doesn't claim a state that isn't persisted.
      setReviewedHunkIds((prev) => {
        const next = new Set(prev);
        for (const id of hunkIds) {
          if (reviewed) next.delete(id);
          else next.add(id);
        }
        return next;
      });
    });
  }

  async function runAiReview(groupId: string, files: PrFile[]) {
    if (!result) return;
    const reviewableFiles = files.filter(
      (f): f is PrFile & { patch: string } => typeof f.patch === "string"
    );
    if (reviewableFiles.length === 0) return;

    setAiReviewingGroups((prev) => new Set(prev).add(groupId));
    try {
      const res = await fetch(`/api/pr/${result.pr.number}/ai-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: reviewableFiles.map((f) => ({ path: f.path, patch: f.patch })),
          prTitle: result.pr.title,
          prBody: result.pr.body,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "AI review failed");

      const comments = data.comments as AiComment[];
      setAiCommentsByPath((prev) => {
        const next = new Map(prev);
        // Replace (not append) any prior AI comments for the files just
        // re-reviewed, so clicking the button again doesn't duplicate them.
        for (const f of reviewableFiles) next.delete(f.path);
        for (const c of comments) {
          next.set(c.path, [...(next.get(c.path) ?? []), c]);
        }
        return next;
      });

      if (data.meta?.fallback) {
        const message = data.meta.error ?? "failed to produce comments";
        setAiReviewResults((prev) => new Map(prev).set(groupId, { count: 0, error: message }));
        setError(`AI review: ${message}`);
      } else {
        setAiReviewResults((prev) => new Map(prev).set(groupId, { count: comments.length }));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "AI review failed";
      setAiReviewResults((prev) => new Map(prev).set(groupId, { count: 0, error: message }));
      setError(message);
    } finally {
      setAiReviewingGroups((prev) => {
        const next = new Set(prev);
        next.delete(groupId);
        return next;
      });
    }
  }

  const filesByPath = useMemo(() => {
    if (!result) return new Map<string, PrFile>();
    return new Map(result.files.map((f) => [f.path, f]));
  }, [result]);

  const commentsByPath = useMemo(() => {
    const map = new Map<string, ReviewComment[]>();
    if (!result) return map;
    for (const c of result.comments.reviewComments) {
      map.set(c.path, [...(map.get(c.path) ?? []), c]);
    }
    return map;
  }, [result]);

  const allHunkIdsInPr = useMemo(() => {
    if (!result) return [];
    return result.files.flatMap(getFileHunkIds);
  }, [result]);
  const totalReviewedCount = useMemo(
    () => allHunkIdsInPr.filter((id) => reviewedHunkIds.has(id)).length,
    [allHunkIdsInPr, reviewedHunkIds]
  );

  return (
    <div
      className={`${
        viewType === "split" ? "max-w-[1800px]" : "max-w-5xl"
      } mx-auto w-full px-6 py-8 space-y-6 transition-[max-width]`}
    >
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">PR Review Grouping Tool</h1>
          <p className="text-sm text-gray-500">
            AI-grouped review vs. GitHub&apos;s file-by-file view — POC
          </p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            loadPr(prNumberInput);
          }}
          className="flex items-center gap-2"
        >
          <input
            type="number"
            min={1}
            value={prNumberInput}
            onChange={(e) => setPrNumberInput(e.target.value)}
            placeholder="PR number"
            className="border border-gray-300 dark:border-gray-700 rounded px-3 py-1.5 text-sm w-32 bg-white dark:bg-gray-950"
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-black text-white dark:bg-white dark:text-black rounded px-4 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            {loading ? "Loading…" : "Load PR"}
          </button>
        </form>
      </header>

      {cachedPrs.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="text-gray-500">Cached:</span>
          {cachedPrs.map((c) => (
            <button
              key={c.number}
              onClick={() => {
                setPrNumberInput(String(c.number));
                loadPr(String(c.number));
              }}
              className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              #{c.number} {c.title.slice(0, 30)}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded border border-red-300 bg-red-50 dark:bg-red-950/40 dark:border-red-800 text-red-800 dark:text-red-300 text-sm px-4 py-3">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-6">
          <PrHeader pr={result.pr} />

          {allHunkIdsInPr.length > 0 && (
            <div className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-800 px-4 py-3">
              <ReviewProgressBadge reviewed={totalReviewedCount} total={allHunkIdsInPr.length} size="md" />
              <div className="flex-1 h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    totalReviewedCount === allHunkIdsInPr.length ? "bg-green-500" : "bg-amber-400"
                  }`}
                  style={{
                    width: `${Math.round((totalReviewedCount / allHunkIdsInPr.length) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}

          {result.groupingMeta.fallback && (
            <div className="rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-sm px-4 py-3">
              AI grouping failed ({result.groupingMeta.error ?? "unknown error"}) —
              showing all files ungrouped instead.
            </div>
          )}

          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>
              {result.fromCache ? "Loaded from cache" : "Freshly fetched"} · model{" "}
              {result.groupingMeta.model}
              {result.groupingMeta.chunked &&
                ` · chunked into ${result.groupingMeta.chunkCount} passes`}
            </span>
            <div className="flex items-center gap-1 border border-gray-300 dark:border-gray-700 rounded-full p-0.5">
              {(["unified", "split"] as const).map((vt) => (
                <button
                  key={vt}
                  onClick={() => setViewType(vt)}
                  className={`px-3 py-1 rounded-full text-xs ${
                    viewType === vt
                      ? "bg-black text-white dark:bg-white dark:text-black"
                      : "text-gray-500"
                  }`}
                >
                  {vt === "unified" ? "Inline" : "Side-by-side"}
                </button>
              ))}
            </div>
          </div>

          {result.omittedFiles.length > 0 && (
            <div className="text-xs text-gray-500">
              {result.omittedFiles.length} file(s) too large/binary to display:{" "}
              {result.omittedFiles.map((f) => f.path).join(", ")}
            </div>
          )}

          <div className="space-y-3">
            {result.grouping.groups
              .slice()
              .sort((a, b) =>
                a.significance === b.significance ? 0 : a.significance === "significant" ? -1 : 1
              )
              .map((group) => {
                const files = group.files
                  .map((f) => filesByPath.get(f.path))
                  .filter((f): f is PrFile => Boolean(f));
                if (files.length === 0) return null;
                return (
                  <GroupSection
                    key={group.id}
                    title={group.title}
                    narrative={group.narrative}
                    significance={group.significance}
                    files={files}
                    viewType={viewType}
                    commentsByPath={commentsByPath}
                    aiCommentsByPath={aiCommentsByPath}
                    defaultExpanded={group.significance === "significant"}
                    reviewedHunkIds={reviewedHunkIds}
                    onToggleHunksReviewed={toggleHunksReviewed}
                    onRunAiReview={() => runAiReview(group.id, files)}
                    aiReviewing={aiReviewingGroups.has(group.id)}
                    aiReviewResult={aiReviewResults.get(group.id)}
                  />
                );
              })}

            {result.grouping.ungrouped.length > 0 &&
              (() => {
                const ungroupedFiles = result.grouping.ungrouped
                  .map((u) => filesByPath.get(u.path))
                  .filter((f): f is PrFile => Boolean(f));
                return (
                  <GroupSection
                    title="Uncategorised (not grouped by AI)"
                    narrative={result.grouping.ungrouped
                      .map((u) => `${u.path}: ${u.reason}`)
                      .join(" · ")}
                    significance="uncategorised"
                    files={ungroupedFiles}
                    viewType={viewType}
                    commentsByPath={commentsByPath}
                    aiCommentsByPath={aiCommentsByPath}
                    defaultExpanded={false}
                    reviewedHunkIds={reviewedHunkIds}
                    onToggleHunksReviewed={toggleHunksReviewed}
                    onRunAiReview={() => runAiReview("ungrouped", ungroupedFiles)}
                    aiReviewing={aiReviewingGroups.has("ungrouped")}
                    aiReviewResult={aiReviewResults.get("ungrouped")}
                  />
                );
              })()}
          </div>

          <ConversationPanel
            issueComments={result.comments.issueComments}
            reviews={result.comments.reviews}
          />
        </div>
      )}
    </div>
  );
}
