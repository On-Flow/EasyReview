import { Octokit } from "octokit";
import { config } from "./config";
import type {
  PrMeta,
  PrFile,
  PrComments,
  ReviewComment,
  IssueComment,
  Review,
} from "./types";

function client() {
  const token = config.githubToken();
  if (!token) {
    console.warn(
      "GITHUB_TOKEN not set — using unauthenticated GitHub API access (60 req/hr limit, public repos only)."
    );
  }
  return new Octokit(token ? { auth: token } : {});
}

export async function fetchPrMeta(prNumber: number): Promise<PrMeta> {
  const octokit = client();
  const { data } = await octokit.rest.pulls.get({
    owner: config.githubOwner(),
    repo: config.githubRepo(),
    pull_number: prNumber,
  });

  return {
    number: data.number,
    title: data.title,
    body: data.body,
    htmlUrl: data.html_url,
    author: data.user?.login ?? "unknown",
    authorAvatarUrl: data.user?.avatar_url,
    baseRef: data.base.ref,
    headRef: data.head.ref,
    headSha: data.head.sha,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    state: data.state,
  };
}

export async function fetchPrFiles(prNumber: number): Promise<PrFile[]> {
  const octokit = client();
  const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
    owner: config.githubOwner(),
    repo: config.githubRepo(),
    pull_number: prNumber,
    per_page: 100,
  });

  return files.map((f) => ({
    path: f.filename,
    status: f.status,
    additions: f.additions,
    deletions: f.deletions,
    changes: f.changes,
    patch: f.patch ?? null,
    previousPath: f.previous_filename,
  }));
}

export async function fetchPrComments(prNumber: number): Promise<PrComments> {
  const octokit = client();
  const owner = config.githubOwner();
  const repo = config.githubRepo();

  const [reviewCommentsRaw, issueCommentsRaw, reviewsRaw] = await Promise.all([
    octokit.paginate(octokit.rest.pulls.listReviewComments, {
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100,
    }),
    octokit.paginate(octokit.rest.issues.listComments, {
      owner,
      repo,
      issue_number: prNumber,
      per_page: 100,
    }),
    octokit.paginate(octokit.rest.pulls.listReviews, {
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100,
    }),
  ]);

  const reviewComments: ReviewComment[] = reviewCommentsRaw.map((c) => ({
    id: c.id,
    path: c.path,
    line: c.line ?? null,
    originalLine: c.original_line ?? null,
    side: (c.side as "LEFT" | "RIGHT" | undefined) ?? null,
    diffHunk: c.diff_hunk,
    body: c.body,
    author: c.user?.login ?? "unknown",
    authorAvatarUrl: c.user?.avatar_url,
    createdAt: c.created_at,
    inReplyToId: c.in_reply_to_id,
  }));

  const issueComments: IssueComment[] = issueCommentsRaw.map((c) => ({
    id: c.id,
    body: c.body ?? "",
    author: c.user?.login ?? "unknown",
    authorAvatarUrl: c.user?.avatar_url,
    createdAt: c.created_at,
  }));

  const reviews: Review[] = reviewsRaw
    .filter((r) => r.body) // skip empty "approved with no comment" noise-reviews
    .map((r) => ({
      id: r.id,
      body: r.body ?? null,
      state: r.state,
      author: r.user?.login ?? "unknown",
      authorAvatarUrl: r.user?.avatar_url,
      submittedAt: r.submitted_at ?? null,
    }));

  return { reviewComments, issueComments, reviews };
}
