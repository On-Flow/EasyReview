// Shared types for PR data, grouping, and comments.

export interface PrMeta {
  number: number;
  title: string;
  body: string | null;
  htmlUrl: string;
  author: string;
  authorAvatarUrl?: string;
  baseRef: string;
  headRef: string;
  headSha: string;
  createdAt: string;
  updatedAt: string;
  state: string;
}

export interface PrFile {
  path: string;
  status: string; // added | removed | modified | renamed | copied | changed | unchanged
  additions: number;
  deletions: number;
  changes: number;
  patch: string | null; // null when GitHub omits it (binary / too large)
  previousPath?: string;
}

export interface ReviewComment {
  id: number;
  path: string;
  line: number | null;
  originalLine: number | null;
  side: "LEFT" | "RIGHT" | null;
  diffHunk: string;
  body: string;
  author: string;
  authorAvatarUrl?: string;
  createdAt: string;
  inReplyToId?: number;
}

export interface IssueComment {
  id: number;
  body: string;
  author: string;
  authorAvatarUrl?: string;
  createdAt: string;
}

export interface Review {
  id: number;
  body: string | null;
  state: string;
  author: string;
  authorAvatarUrl?: string;
  submittedAt: string | null;
}

export interface PrComments {
  reviewComments: ReviewComment[];
  issueComments: IssueComment[];
  reviews: Review[];
}

export type Significance = "significant" | "minor";

export interface GroupFileRef {
  path: string;
  hunks?: { startLine: number; endLine: number }[];
}

export interface Group {
  id: string;
  title: string;
  narrative: string;
  significance: Significance;
  files: GroupFileRef[];
}

export interface UngroupedFile {
  path: string;
  reason: string;
}

export interface GroupingResult {
  groups: Group[];
  ungrouped: UngroupedFile[];
}

export interface GroupingMeta {
  model: string;
  chunked: boolean;
  chunkCount?: number;
  fallback: boolean; // true if we fell back to a single ungrouped section
  error?: string;
}

export interface PrLoadResult {
  pr: PrMeta;
  files: PrFile[];
  omittedFiles: { path: string; reason: string }[];
  comments: PrComments;
  grouping: GroupingResult;
  groupingMeta: GroupingMeta;
  fetchedAt: string;
}
