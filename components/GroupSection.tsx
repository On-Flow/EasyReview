"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PrFile, ReviewComment, AiComment, Significance } from "@/lib/types";
import { getFileHunkIds } from "@/lib/diffUtils";
import DiffPane from "./DiffPane";
import ReviewToggleButton from "./ReviewToggleButton";
import ReviewProgressBadge from "./ReviewProgressBadge";

interface GroupSectionProps {
  title: string;
  narrative?: string;
  significance: Significance | "uncategorised";
  files: PrFile[];
  viewType: "unified" | "split";
  commentsByPath: Map<string, ReviewComment[]>;
  aiCommentsByPath: Map<string, AiComment[]>;
  defaultExpanded: boolean;
  reviewedHunkIds: Set<string>;
  onToggleHunksReviewed: (hunkIds: string[], reviewed: boolean) => void;
  onRunAiReview: () => void;
  aiReviewing: boolean;
  aiReviewResult?: { count: number; summary?: string | null; error?: string };
}

const badgeStyles: Record<string, string> = {
  significant: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  minor: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  uncategorised: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300",
};

export default function GroupSection({
  title,
  narrative,
  significance,
  files,
  viewType,
  commentsByPath,
  aiCommentsByPath,
  defaultExpanded,
  reviewedHunkIds,
  onToggleHunksReviewed,
  onRunAiReview,
  aiReviewing,
  aiReviewResult,
}: GroupSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  // Measured so file headers can stick just below this group header, whatever
  // height it wraps to (badges/buttons can wrap onto a second line).
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const update = () => setHeaderHeight(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const allHunkIds = useMemo(() => files.flatMap(getFileHunkIds), [files]);
  const reviewedCount = useMemo(
    () => allHunkIds.filter((id) => reviewedHunkIds.has(id)).length,
    [allHunkIds, reviewedHunkIds]
  );
  const reviewableFileCount = useMemo(() => files.filter((f) => f.patch).length, [files]);
  const fullyReviewed = allHunkIds.length > 0 && reviewedCount === allHunkIds.length;

  return (
    <section
      className={`rounded-lg border ${
        fullyReviewed
          ? "border-green-300 dark:border-green-800"
          : "border-gray-200 dark:border-gray-800"
      }`}
      style={{ "--group-header-h": `${headerHeight}px` } as React.CSSProperties}
    >
      {/* No overflow-hidden here (even though it'd tidy up the rounded
          corners) - it would capture the sticky positioning context below
          and stop the header from sticking. Rounding is handled per-edge
          on the header/body instead. */}
      <div
        ref={headerRef}
        className={`sticky top-0 z-20 w-full flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-900 ${
          expanded ? "rounded-t-lg" : "rounded-lg"
        } ${
          fullyReviewed
            ? "bg-green-50 dark:bg-green-950"
            : "bg-white dark:bg-gray-950"
        }`}
      >
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center gap-3 flex-1 min-w-0 text-left"
        >
          <span className="text-gray-400 w-4 shrink-0">{expanded ? "▾" : "▸"}</span>
          <span className="font-semibold truncate">{title}</span>
        </button>
        <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${badgeStyles[significance]}`}>
          {significance}
        </span>
        <ReviewProgressBadge reviewed={reviewedCount} total={allHunkIds.length} />
        <span className="text-xs text-gray-500 shrink-0">
          {files.length} file{files.length === 1 ? "" : "s"}
        </span>
        {reviewableFileCount > 0 && (
          <span className="flex items-center gap-2 shrink-0">
            {!aiReviewing && aiReviewResult && (
              <span
                className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full ${
                  aiReviewResult.error
                    ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                    : aiReviewResult.count > 0
                      ? "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300"
                      : "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400"
                }`}
              >
                {aiReviewResult.error
                  ? "AI review failed"
                  : aiReviewResult.count > 0
                    ? `AI: ${aiReviewResult.count} comment${aiReviewResult.count === 1 ? "" : "s"}`
                    : "AI: checked, clear"}
              </span>
            )}
            <button
              type="button"
              onClick={onRunAiReview}
              disabled={aiReviewing}
              className="text-xs font-medium px-2.5 py-1 rounded-md border shadow-sm transition-colors cursor-pointer border-indigo-300 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900 disabled:opacity-60 disabled:cursor-wait"
            >
              {aiReviewing ? "Reviewing…" : aiReviewResult ? "Re-run AI review" : "AI review group"}
            </button>
          </span>
        )}
        {allHunkIds.length > 0 && (
          <ReviewToggleButton
            reviewed={reviewedCount === allHunkIds.length}
            scopeLabel="group"
            onClick={() => onToggleHunksReviewed(allHunkIds, reviewedCount < allHunkIds.length)}
            className="shrink-0"
          />
        )}
      </div>
      {expanded && (
        // rounded-b-lg only (no overflow-hidden - see note above; the p-4
        // padding already keeps children clear of the corners).
        <div className="rounded-b-lg p-4 space-y-4 bg-gray-50/50 dark:bg-black/20">
          {narrative && (
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
              {narrative}
            </p>
          )}
          {aiReviewResult && !aiReviewResult.error && (
            <div className="rounded-lg border-2 border-indigo-200 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950/40 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-indigo-700 dark:text-indigo-400 mb-1">
                AI review{aiReviewResult.count > 0 ? ` — ${aiReviewResult.count} comment${aiReviewResult.count === 1 ? "" : "s"}` : " — no issues found"}
              </p>
              <p className="text-sm text-indigo-900 dark:text-indigo-200">
                {aiReviewResult.summary ?? "Reviewed - no summary returned."}
              </p>
            </div>
          )}
          {aiReviewResult?.error && (
            <div className="rounded-lg border-2 border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-red-700 dark:text-red-400 mb-1">
                AI review failed
              </p>
              <p className="text-sm text-red-900 dark:text-red-200">{aiReviewResult.error}</p>
            </div>
          )}
          <div className="space-y-3">
            {files.map((file) => (
              <DiffPane
                key={file.path}
                file={file}
                viewType={viewType}
                comments={commentsByPath.get(file.path) ?? []}
                aiComments={aiCommentsByPath.get(file.path) ?? []}
                reviewedHunkIds={reviewedHunkIds}
                onToggleHunksReviewed={onToggleHunksReviewed}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
