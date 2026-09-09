"use client";

import { useMemo } from "react";
import { Diff, Hunk, Decoration, parseDiff } from "react-diff-view";
import type { HunkData } from "react-diff-view";
import type { PrFile, ReviewComment } from "@/lib/types";
import { buildSyntheticDiff, findWidgetChangeKey } from "@/lib/diffUtils";
import { computeHunkId } from "@/lib/hunkId";
import CommentWidget from "./CommentWidget";

interface DiffPaneProps {
  file: PrFile;
  viewType: "unified" | "split";
  comments: ReviewComment[];
  reviewedHunkIds: Set<string>;
  onToggleHunkReviewed: (hunkId: string, reviewed: boolean) => void;
}

export default function DiffPane({
  file,
  viewType,
  comments,
  reviewedHunkIds,
  onToggleHunkReviewed,
}: DiffPaneProps) {
  const parsed = useMemo(() => {
    if (!file.patch) return null;
    try {
      const [parsedFile] = parseDiff(buildSyntheticDiff(file));
      return parsedFile ?? null;
    } catch {
      return null;
    }
  }, [file]);

  const { widgets, unanchored } = useMemo(() => {
    if (!parsed) return { widgets: {}, unanchored: comments };
    const widgetMap: Record<string, React.ReactNode> = {};
    const leftover: ReviewComment[] = [];

    // Group comments by change key so multiple comments on one line share a widget.
    const byKey = new Map<string, ReviewComment[]>();
    for (const comment of comments) {
      const key = findWidgetChangeKey(parsed.hunks, comment);
      if (key) {
        byKey.set(key, [...(byKey.get(key) ?? []), comment]);
      } else {
        leftover.push(comment);
      }
    }
    for (const [key, list] of byKey) {
      widgetMap[key] = <CommentWidget comments={list} />;
    }
    return { widgets: widgetMap, unanchored: leftover };
  }, [parsed, comments]);

  const reviewedCount = useMemo(() => {
    if (!parsed) return 0;
    return parsed.hunks.filter((h) => reviewedHunkIds.has(computeHunkId(file.path, h.content)))
      .length;
  }, [parsed, reviewedHunkIds, file.path]);

  if (!file.patch || !parsed) {
    return (
      <div className="rounded border border-dashed border-gray-300 dark:border-gray-700 p-3 text-sm text-gray-500">
        {file.path} — diff too large or binary to display.
      </div>
    );
  }

  const renderHunk = (hunk: HunkData) => {
    const hunkId = computeHunkId(file.path, hunk.content);
    const isReviewed = reviewedHunkIds.has(hunkId);

    if (isReviewed) {
      return (
        <Decoration key={`d-${hunk.content}`}>
          <div className="flex items-center justify-between px-3 py-1 bg-green-50 dark:bg-green-950/30 text-xs text-green-700 dark:text-green-400">
            <span>
              ✓ Reviewed — lines {hunk.newStart}-{hunk.newStart + hunk.newLines}
            </span>
            <button
              type="button"
              onClick={() => onToggleHunkReviewed(hunkId, false)}
              className="underline hover:no-underline"
            >
              Mark unreviewed
            </button>
          </div>
        </Decoration>
      );
    }

    return [
      <Decoration key={`d-${hunk.content}`}>
        <div className="flex justify-end px-3 py-1 bg-gray-50 dark:bg-gray-900 text-xs">
          <button
            type="button"
            onClick={() => onToggleHunkReviewed(hunkId, true)}
            className="text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
          >
            Mark reviewed
          </button>
        </div>
      </Decoration>,
      <Hunk key={`h-${hunk.content}`} hunk={hunk} />,
    ];
  };

  return (
    <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-800">
      <div className="bg-gray-50 dark:bg-gray-900 px-3 py-1.5 text-xs font-mono text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
        <span>
          {file.previousPath && file.previousPath !== file.path
            ? `${file.previousPath} → ${file.path}`
            : file.path}
          <span className="ml-2 text-green-600">+{file.additions}</span>{" "}
          <span className="text-red-600">-{file.deletions}</span>
        </span>
        {parsed.hunks.length > 0 && (
          <span className="text-gray-400">
            {reviewedCount}/{parsed.hunks.length} hunks reviewed
          </span>
        )}
      </div>
      <Diff
        viewType={viewType}
        diffType={parsed.type}
        hunks={parsed.hunks}
        widgets={widgets}
        gutterType="default"
      >
        {(hunks) => hunks.flatMap(renderHunk)}
      </Diff>
      {unanchored.length > 0 && (
        <div className="border-t border-gray-200 dark:border-gray-800 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-2">
          <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
            Comments not anchored to a visible line:
          </p>
          {unanchored.map((c) => (
            <div key={c.id} className="text-sm">
              <span className="font-mono text-xs text-gray-500">
                {c.path}:{c.line ?? c.originalLine ?? "?"}
              </span>{" "}
              <span className="font-medium">{c.author}</span>: {c.body}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
