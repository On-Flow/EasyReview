"use client";

import { useState } from "react";
import type { PrFile, ReviewComment, Significance } from "@/lib/types";
import DiffPane from "./DiffPane";

interface GroupSectionProps {
  title: string;
  narrative?: string;
  significance: Significance | "uncategorised";
  files: PrFile[];
  viewType: "unified" | "split";
  commentsByPath: Map<string, ReviewComment[]>;
  defaultExpanded: boolean;
  reviewedHunkIds: Set<string>;
  onToggleHunkReviewed: (hunkId: string, reviewed: boolean) => void;
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
  defaultExpanded,
  reviewedHunkIds,
  onToggleHunkReviewed,
}: GroupSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <section className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-950 hover:bg-gray-50 dark:hover:bg-gray-900 text-left"
      >
        <span className="text-gray-400 w-4">{expanded ? "▾" : "▸"}</span>
        <span className="font-semibold flex-1">{title}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${badgeStyles[significance]}`}>
          {significance}
        </span>
        <span className="text-xs text-gray-500">
          {files.length} file{files.length === 1 ? "" : "s"}
        </span>
      </button>
      {expanded && (
        <div className="p-4 space-y-4 bg-gray-50/50 dark:bg-black/20">
          {narrative && (
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
              {narrative}
            </p>
          )}
          <div className="space-y-3">
            {files.map((file) => (
              <DiffPane
                key={file.path}
                file={file}
                viewType={viewType}
                comments={commentsByPath.get(file.path) ?? []}
                reviewedHunkIds={reviewedHunkIds}
                onToggleHunkReviewed={onToggleHunkReviewed}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
