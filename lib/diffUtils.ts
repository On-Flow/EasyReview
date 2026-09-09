import { getChangeKey, type ChangeData, type HunkData } from "react-diff-view";
import type { PrFile, ReviewComment } from "./types";

// GitHub's `files[].patch` is just the hunk lines (starting with `@@`), with
// no `diff --git` header. react-diff-view (via gitdiff-parser) needs that
// header to know the file paths and change type, so we synthesize one.
export function buildSyntheticDiff(file: PrFile): string {
  const oldPath = file.previousPath ?? file.path;
  const newPath = file.path;
  const lines: string[] = [`diff --git a/${oldPath} b/${newPath}`];

  if (file.status === "added") {
    lines.push("new file mode 100644");
    lines.push("index 0000000..0000000");
    lines.push("--- /dev/null");
    lines.push(`+++ b/${newPath}`);
  } else if (file.status === "removed") {
    lines.push("deleted file mode 100644");
    lines.push("index 0000000..0000000");
    lines.push(`--- a/${oldPath}`);
    lines.push("+++ /dev/null");
  } else if (file.status === "renamed") {
    lines.push("similarity index 50%");
    lines.push(`rename from ${oldPath}`);
    lines.push(`rename to ${newPath}`);
    lines.push(`--- a/${oldPath}`);
    lines.push(`+++ b/${newPath}`);
  } else {
    lines.push("index 0000000..0000000 100644");
    lines.push(`--- a/${oldPath}`);
    lines.push(`+++ b/${newPath}`);
  }

  lines.push(file.patch ?? "");
  return lines.join("\n");
}

// Find the react-diff-view change key a GitHub review comment anchors to, so
// it can be rendered as an inline widget rather than falling back to the
// sidebar list. Returns null if the comment's line isn't present in the
// rendered hunks (e.g. it's on an outdated diff, or on unchanged context
// outside any hunk).
export function findWidgetChangeKey(
  hunks: HunkData[],
  comment: ReviewComment
): string | null {
  const targetLine = comment.line ?? comment.originalLine;
  if (targetLine == null) return null;

  const wantsOldSide = comment.side === "LEFT";
  const allChanges: ChangeData[] = hunks.flatMap((h) => h.changes);

  for (const change of allChanges) {
    if (wantsOldSide) {
      if (change.type === "delete" && change.lineNumber === targetLine) {
        return getChangeKey(change);
      }
      if (change.type === "normal" && change.oldLineNumber === targetLine) {
        return getChangeKey(change);
      }
    } else {
      if (change.type === "insert" && change.lineNumber === targetLine) {
        return getChangeKey(change);
      }
      if (change.type === "normal" && change.newLineNumber === targetLine) {
        return getChangeKey(change);
      }
    }
  }
  return null;
}
