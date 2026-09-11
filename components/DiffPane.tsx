"use client";

import { useMemo } from "react";
import { Diff, Hunk, Decoration, parseDiff, tokenize } from "react-diff-view";
import type { HunkData } from "react-diff-view";
import refractor from "refractor";
import type { PrFile, ReviewComment, AiComment } from "@/lib/types";
import { buildSyntheticDiff, findWidgetChangeKey } from "@/lib/diffUtils";
import { computeHunkId } from "@/lib/hunkId";
import { languageForPath } from "@/lib/syntaxLanguage";
import CommentWidget from "./CommentWidget";
import AiCommentWidget from "./AiCommentWidget";
import ReviewToggleButton from "./ReviewToggleButton";
import ReviewProgressBadge from "./ReviewProgressBadge";

interface DiffPaneProps {
  file: PrFile;
  viewType: "unified" | "split";
  comments: ReviewComment[];
  aiComments: AiComment[];
  reviewedHunkIds: Set<string>;
  onToggleHunksReviewed: (hunkIds: string[], reviewed: boolean) => void;
}

export default function DiffPane({
  file,
  viewType,
  comments,
  aiComments,
  reviewedHunkIds,
  onToggleHunksReviewed,
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

  const { widgets, unanchored, unanchoredAi } = useMemo(() => {
    if (!parsed) {
      return { widgets: {}, unanchored: comments, unanchoredAi: aiComments };
    }
    const widgetMap: Record<string, React.ReactNode> = {};
    const leftover: ReviewComment[] = [];
    const leftoverAi: AiComment[] = [];

    // Group comments by change key so multiple comments on one line share a widget.
    const humanByKey = new Map<string, ReviewComment[]>();
    for (const comment of comments) {
      const key = findWidgetChangeKey(parsed.hunks, comment);
      if (key) {
        humanByKey.set(key, [...(humanByKey.get(key) ?? []), comment]);
      } else {
        leftover.push(comment);
      }
    }

    const aiByKey = new Map<string, AiComment[]>();
    for (const comment of aiComments) {
      const key = findWidgetChangeKey(parsed.hunks, comment);
      if (key) {
        aiByKey.set(key, [...(aiByKey.get(key) ?? []), comment]);
      } else {
        leftoverAi.push(comment);
      }
    }

    for (const key of new Set([...humanByKey.keys(), ...aiByKey.keys()])) {
      const humanList = humanByKey.get(key);
      const aiList = aiByKey.get(key);
      widgetMap[key] = (
        <>
          {humanList && <CommentWidget comments={humanList} />}
          {aiList && <AiCommentWidget comments={aiList} />}
        </>
      );
    }

    return { widgets: widgetMap, unanchored: leftover, unanchoredAi: leftoverAi };
  }, [parsed, comments, aiComments]);

  const fileHunkIds = useMemo(() => {
    if (!parsed) return [];
    return parsed.hunks.map((h) => computeHunkId(file.path, h.content));
  }, [parsed, file.path]);

  const tokens = useMemo(() => {
    if (!parsed) return undefined;
    const language = languageForPath(file.path);
    if (!language) return undefined;
    try {
      return tokenize(parsed.hunks, { highlight: true, refractor, language });
    } catch {
      // Malformed/partial snippets can occasionally trip up the tokenizer -
      // fall back to plain text rather than losing the diff over it.
      return undefined;
    }
  }, [parsed, file.path]);

  const reviewedCount = useMemo(
    () => fileHunkIds.filter((id) => reviewedHunkIds.has(id)).length,
    [fileHunkIds, reviewedHunkIds]
  );

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
          <div className="flex items-center justify-between px-3 py-1.5 bg-green-50 dark:bg-green-950/30 text-xs text-green-700 dark:text-green-400">
            <span>
              Reviewed — lines {hunk.newStart}-{hunk.newStart + hunk.newLines}
            </span>
            <ReviewToggleButton
              reviewed
              scopeLabel="hunk"
              onClick={() => onToggleHunksReviewed([hunkId], false)}
            />
          </div>
        </Decoration>
      );
    }

    return [
      <Decoration key={`d-${hunk.content}`}>
        <div className="flex justify-end px-3 py-1.5 bg-gray-50 dark:bg-gray-900 text-xs">
          <ReviewToggleButton
            reviewed={false}
            scopeLabel="hunk"
            onClick={() => onToggleHunksReviewed([hunkId], true)}
          />
        </div>
      </Decoration>,
      <Hunk key={`h-${hunk.content}`} hunk={hunk} />,
    ];
  };

  return (
    // The sticky file header must NOT sit inside the overflow-x-auto wrapper
    // below - overflow other than visible on an ancestor captures the sticky
    // positioning context and stops it from sticking to the page.
    <div className="rounded border border-gray-200 dark:border-gray-800">
      <div className="sticky top-[var(--group-header-h,0px)] z-10 rounded-t bg-gray-50 dark:bg-gray-900 px-3 py-1.5 text-xs font-mono text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
        <span>
          {file.previousPath && file.previousPath !== file.path
            ? `${file.previousPath} → ${file.path}`
            : file.path}
          <span className="ml-2 text-green-600">+{file.additions}</span>{" "}
          <span className="text-red-600">-{file.deletions}</span>
        </span>
        {fileHunkIds.length > 0 && (
          <span className="flex items-center gap-2 shrink-0">
            <ReviewProgressBadge reviewed={reviewedCount} total={fileHunkIds.length} />
            <ReviewToggleButton
              reviewed={reviewedCount === fileHunkIds.length}
              scopeLabel="file"
              onClick={() =>
                onToggleHunksReviewed(fileHunkIds, reviewedCount < fileHunkIds.length)
              }
            />
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <Diff
          viewType={viewType}
          diffType={parsed.type}
          hunks={parsed.hunks}
          widgets={widgets}
          tokens={tokens}
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
        {unanchoredAi.length > 0 && (
          <div className="border-t border-gray-200 dark:border-gray-800 bg-indigo-50 dark:bg-indigo-950/30 p-3 space-y-2">
            <p className="text-xs font-medium text-indigo-700 dark:text-indigo-400">
              AI review comments not anchored to a visible line:
            </p>
            {unanchoredAi.map((c) => (
              <div key={c.id} className="text-sm">
                <span className="font-mono text-xs text-gray-500">
                  {c.path}:{c.line ?? "?"}
                </span>{" "}
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300">
                  {c.severity}
                </span>{" "}
                {c.body}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
