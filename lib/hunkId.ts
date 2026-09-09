import { createHash } from "crypto";

// Content-addressed: hashes the file path + the hunk's own header/content, so
// a hunk's id only changes when that hunk's actual code changes. This means
// "reviewed" marks naturally fall away when a later commit touches that hunk
// — no explicit invalidation needed, they just won't match anything anymore.
export function computeHunkId(path: string, hunkContent: string): string {
  return createHash("sha1").update(`${path}\n${hunkContent}`).digest("hex");
}
