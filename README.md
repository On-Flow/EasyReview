# PR Review Grouping Tool (POC)

Fetches a GitHub PR's diff + comments, asks a local Ollama model to split it into
logical change-groups with a narrative and significance rating per group, and
renders it GitHub-style with groups that collapse/expand by significance.

This is a POC to test whether AI-grouped review beats GitHub's file-by-file view.
Read-only, single hardcoded repo, no auth, no posting back to GitHub.

## Setup

```bash
cp .env.local.example .env.local
# edit .env.local: set GITHUB_OWNER / GITHUB_REPO to the repo you want to review
npm install
npm run dev
```

Open http://localhost:3000, enter a PR number, click **Load PR**.

`GITHUB_TOKEN` is optional — without it, GitHub access is unauthenticated
(60 requests/hr, public repos only). Set it for private repos or to avoid the
rate limit.

You need [Ollama](https://ollama.com) running locally (`ollama serve`) with the
model pulled: `ollama pull qwen3-coder:30b`.

## Model choice

Went with **`qwen3-coder:30b`** (the `30b-a3b` MoE variant — 19GB, 256K native
context, ~70% code in pretraining). Checked what was realistically pullable and
fast on this machine (M5 Max, 128GB RAM): it's code-specialized, only ~3B params
are active per token so inference stays fast even at large context sizes, and it
comfortably fits in RAM alongside everything else running. Verified end-to-end
against a real PR ([sindresorhus/pify#35](https://github.com/sindresorhus/pify/pull/35))
using an already-pulled model (`gemma4:26b`) while `qwen3-coder` downloaded — both
the single-pass and chunked/merge code paths produced correct, sensible groupings.

Swap it via `OLLAMA_MODEL` in `.env.local` if you want to compare against
something else pulled locally.

## Decisions on the open questions from the spec

- **Comment pagination**: implemented (not punted) — `octokit.paginate` makes it
  free, so review comments, issue comments, and reviews are all paginated.
- **Hunk-level vs file-level grouping**: went file-level, per the spec's own
  recommendation. The LLM schema still accepts optional `hunks` per file for
  future use, but the UI renders the whole file's diff per group rather than
  slicing by line range — hunk-level line mapping from an LLM response isn't
  reliable enough to drive UI slicing without a lot more validation work than a
  POC warrants.
- **GITHUB_TOKEN**: made optional rather than required. Unauthenticated GitHub
  API access works fine for public repos (just rate-limited), which made this
  much easier to try and to smoke-test without needing to mint a token first.
  Still recommended for private repos or heavier use.
- **Cache storage (JSON vs SQLite)**: migrated from a flat JSON file to SQLite
  once per-hunk "mark reviewed" state came up — that's many small, frequent
  writes, which a whole-file JSON read-modify-write handles poorly (race
  between two quick clicks can clobber a write), while a per-hunk SQLite
  `UPSERT` is atomic by construction. Used `node:sqlite` (built into Node 22+)
  instead of a package like `better-sqlite3` — zero new dependencies, no native
  compile step.
- **Reviewed-state lifetime across commits**: kept intentionally simple — a
  hunk's id is a hash of its own content, so a mark just stops applying once
  that hunk changes, rather than trying to track renames/moves/whitespace
  reflows across commits.

## How it works

1. `POST /api/pr/[number]/load` fetches PR metadata, files+patches, and all
   comments (review comments, issue comments, reviews) from GitHub.
2. Files with no `patch` (binary/too large) are flagged and skipped rather than
   failing the whole load.
3. The diff (+ PR title/body + existing review comments) goes to Ollama in one
   prompt if it fits a ~40K token budget. Larger PRs get chunked by file, grouped
   per chunk, then merged in a second pass that only sees group titles/narratives
   (not full diffs) to keep it cheap.
4. The model's JSON response is validated with zod. Invalid JSON gets one retry
   with the parse error appended; if that also fails, the whole PR falls back to
   a visible "ungrouped" section with an error banner rather than crashing.
5. Every known file path is reconciled against the model's output — hallucinated
   paths are dropped, and any file the model didn't classify gets added to
   "ungrouped" instead of silently disappearing.
6. Successful results are cached in SQLite (`.cache/easyreview.db`, `prs` table),
   keyed by PR number + head SHA, so reloading without new commits skips Ollama
   entirely.
7. The UI renders PR header → collapsible groups (significant expanded, minor
   collapsed) → uncategorised section → conversation (issue comments + reviews).
   Review comments render as inline widgets anchored to their exact diff line
   where possible ([react-diff-view](https://github.com/otakustay/react-diff-view)),
   falling back to a per-file list when a comment's line isn't in the rendered
   hunks (e.g. an outdated comment).
8. Each hunk has a "Mark reviewed" control that collapses it and persists the
   mark to SQLite (`reviewed_hunks` table), independent of the cached diff/
   grouping blob so toggling doesn't require rewriting it. A hunk's id is a
   hash of its file path + its own header/content, so it's content-addressed:
   if a later commit changes that hunk, the id changes and the old mark simply
   stops matching anything — reviewed state falls away for changed hunks
   without any explicit invalidation logic. Unchanged hunks stay marked across
   commits touching *other* parts of the PR.

## Stack

Next.js 16 (App Router) + TypeScript, Tailwind, `octokit`, `react-diff-view`,
`zod`, `react-markdown`. SQLite (`node:sqlite`, built into Node 22+, no extra
dependency) for both the PR cache and reviewed-hunk state — no auth, API routes
call GitHub and Ollama server-side so the token never reaches the client.
