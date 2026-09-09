"use client";

import { useMemo } from "react";
import { Diff, Hunk, parseDiff } from "react-diff-view";
import type { PrFile, ReviewComment } from "@/lib/types";
import { buildSyntheticDiff, findWidgetChangeKey } from "@/lib/diffUtils";
import CommentWidget from "./CommentWidget";

interface DiffPaneProps {
  file: PrFile;
  viewType: "unified" | "split";
  comments: ReviewComment[];
}

export default function DiffPane({ file, viewType, comments }: DiffPaneProps) {
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

  if (!file.patch || !parsed) {
    return (
      <div className="rounded border border-dashed border-gray-300 dark:border-gray-700 p-3 text-sm text-gray-500">
        {file.path} — diff too large or binary to display.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-800">
      <div className="bg-gray-50 dark:bg-gray-900 px-3 py-1.5 text-xs font-mono text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-gray-800">
        {file.previousPath && file.previousPath !== file.path
          ? `${file.previousPath} → ${file.path}`
          : file.path}
        <span className="ml-2 text-green-600">+{file.additions}</span>{" "}
        <span className="text-red-600">-{file.deletions}</span>
      </div>
      <Diff
        viewType={viewType}
        diffType={parsed.type}
        hunks={parsed.hunks}
        widgets={widgets}
        gutterType="default"
      >
        {(hunks) => hunks.map((hunk) => <Hunk key={hunk.content} hunk={hunk} />)}
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
