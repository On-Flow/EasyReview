"use client";

import { useEffect, useMemo, useState } from "react";
import type { PrLoadResult, PrFile, ReviewComment } from "@/lib/types";
import type { CachedPrSummary } from "@/lib/cache";
import PrHeader from "@/components/PrHeader";
import GroupSection from "@/components/GroupSection";
import ConversationPanel from "@/components/ConversationPanel";

export default function Home() {
  const [prNumberInput, setPrNumberInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<(PrLoadResult & { fromCache?: boolean }) | null>(
    null
  );
  const [cachedPrs, setCachedPrs] = useState<CachedPrSummary[]>([]);
  const [viewType, setViewType] = useState<"unified" | "split">("unified");

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
    try {
      const res = await fetch(`/api/pr/${n}/load`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load PR");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load PR");
    } finally {
      setLoading(false);
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

  return (
    <div className="max-w-5xl mx-auto w-full px-6 py-8 space-y-6">
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
                    defaultExpanded={group.significance === "significant"}
                  />
                );
              })}

            {result.grouping.ungrouped.length > 0 && (
              <GroupSection
                title="Uncategorised (not grouped by AI)"
                narrative={result.grouping.ungrouped
                  .map((u) => `${u.path}: ${u.reason}`)
                  .join(" · ")}
                significance="uncategorised"
                files={result.grouping.ungrouped
                  .map((u) => filesByPath.get(u.path))
                  .filter((f): f is PrFile => Boolean(f))}
                viewType={viewType}
                commentsByPath={commentsByPath}
                defaultExpanded={false}
              />
            )}
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
