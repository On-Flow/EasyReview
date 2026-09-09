import { z } from "zod";
import { config } from "./config";
import { ollamaChatJson, estimateTokens, SINGLE_PASS_TOKEN_BUDGET } from "./ollama";
import type {
  PrMeta,
  PrFile,
  PrComments,
  GroupingResult,
  GroupingMeta,
  Group,
} from "./types";

const groupSchema = z.object({
  id: z.string(),
  title: z.string(),
  narrative: z.string(),
  significance: z.enum(["significant", "minor"]),
  files: z.array(
    z.object({
      path: z.string(),
      hunks: z
        .array(z.object({ startLine: z.number(), endLine: z.number() }))
        .optional(),
    })
  ),
});

const groupingSchema = z.object({
  groups: z.array(groupSchema),
  ungrouped: z.array(z.object({ path: z.string(), reason: z.string() })),
});

const SYSTEM_PROMPT = `You are a senior engineer reviewing a GitHub pull request. Your job is to split the diff into logical change-groups so a human reviewer can understand the PR faster than reading it file-by-file.

Rules:
- Group by logical purpose, not by file. One group can span multiple files. One file's changes can split across groups if it's doing unrelated things (rare - prefer one file per group unless it's clearly mixing concerns).
- significance is "minor" for docs, comments, formatting, renames, dependency bumps, or config tweaks with no behavioural change. Everything else is "significant".
- Each group needs a short title (< 8 words) and a 1-3 sentence narrative in plain English explaining what the group does and why, based on reading the diff - do not just restate line-by-line what changed.
- If existing review comments are attached to a file, use them to inform your narrative and avoid repeating what a human reviewer already said, but do not merge their comments into your narrative or quote them.
- Reference files by their exact path as given.
- If some files genuinely don't fit any logical group, or you can't confidently classify them, list them in "ungrouped" with a short reason instead of forcing a bad grouping.
- Respond with strict JSON only. No markdown fences, no prose outside the JSON. Match this shape exactly:
{"groups":[{"id":"string","title":"string","narrative":"string","significance":"significant|minor","files":[{"path":"string"}]}],"ungrouped":[{"path":"string","reason":"string"}]}`;

function formatFileForPrompt(file: PrFile, comments: PrComments): string {
  const fileComments = comments.reviewComments.filter((c) => c.path === file.path);
  const commentBlock = fileComments.length
    ? `\nExisting review comments on this file:\n${fileComments
        .map((c) => `  - (line ${c.line ?? c.originalLine ?? "?"}) ${c.author}: ${c.body}`)
        .join("\n")}`
    : "";
  return `### ${file.path} (${file.status}, +${file.additions}/-${file.deletions})${commentBlock}\n\`\`\`diff\n${file.patch}\n\`\`\``;
}

function buildSinglePassPrompt(
  pr: PrMeta,
  files: PrFile[],
  comments: PrComments
): string {
  const header = `PR #${pr.number}: ${pr.title}\n\n${pr.body ?? "(no description)"}\n\n---\n`;
  const fileBlocks = files.map((f) => formatFileForPrompt(f, comments)).join("\n\n");
  return `${header}\n${fileBlocks}`;
}

function stripJsonFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return fenced ? fenced[1] : trimmed;
}

function tryParseGrouping(raw: string): GroupingResult | null {
  try {
    const parsed = JSON.parse(stripJsonFences(raw));
    const validated = groupingSchema.parse(parsed);
    return validated;
  } catch {
    return null;
  }
}

function reconcileWithKnownFiles(
  result: GroupingResult,
  knownPaths: string[]
): GroupingResult {
  const known = new Set(knownPaths);
  const seen = new Set<string>();

  // Sequential, not map+forEach: a file the model assigned to two different
  // groups must be claimed by whichever group we process first and dropped
  // from the rest, so `seen` has to be live (mutated) as we go rather than
  // populated only after every group's files were already filtered.
  const groups: Group[] = [];
  for (const g of result.groups) {
    const files = g.files.filter((f) => known.has(f.path) && !seen.has(f.path));
    files.forEach((f) => seen.add(f.path));
    if (files.length > 0) groups.push({ ...g, files });
  }

  const ungrouped = result.ungrouped.filter(
    (u) => known.has(u.path) && !seen.has(u.path)
  );
  ungrouped.forEach((u) => seen.add(u.path));

  for (const path of knownPaths) {
    if (!seen.has(path)) {
      ungrouped.push({ path, reason: "not classified by the model" });
    }
  }

  return { groups, ungrouped };
}

async function callWithRetry(
  buildMessages: (retryContext?: string) => { role: "system" | "user"; content: string }[]
): Promise<GroupingResult | null> {
  const first = await ollamaChatJson(buildMessages());
  const parsedFirst = tryParseGrouping(first);
  if (parsedFirst) return parsedFirst;

  const second = await ollamaChatJson(
    buildMessages(
      `Your previous response was not valid JSON matching the required schema. Raw response was:\n${first.slice(0, 2000)}\n\nReturn ONLY the corrected JSON object, nothing else.`
    )
  );
  return tryParseGrouping(second);
}

function fallbackResult(files: PrFile[]): GroupingResult {
  return {
    groups: [],
    ungrouped: files.map((f) => ({
      path: f.path,
      reason: "AI grouping failed for this PR; showing files ungrouped",
    })),
  };
}

async function groupSinglePass(
  pr: PrMeta,
  files: PrFile[],
  comments: PrComments
): Promise<GroupingResult | null> {
  const userContent = buildSinglePassPrompt(pr, files, comments);
  return callWithRetry((retryContext) => {
    const messages: { role: "system" | "user"; content: string }[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ];
    if (retryContext) messages.push({ role: "user", content: retryContext });
    return messages;
  });
}

function chunkFiles(files: PrFile[], tokenBudget: number): PrFile[][] {
  const chunks: PrFile[][] = [];
  let current: PrFile[] = [];
  let currentTokens = 0;
  for (const file of files) {
    const fileTokens = estimateTokens(file.patch ?? "");
    if (current.length > 0 && currentTokens + fileTokens > tokenBudget) {
      chunks.push(current);
      current = [];
      currentTokens = 0;
    }
    current.push(file);
    currentTokens += fileTokens;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

async function groupChunked(
  pr: PrMeta,
  files: PrFile[],
  comments: PrComments
): Promise<{ result: GroupingResult | null; chunkCount: number }> {
  const chunks = chunkFiles(files, SINGLE_PASS_TOKEN_BUDGET);

  const provisional: GroupingResult[] = [];
  for (const chunk of chunks) {
    const chunkResult = await groupSinglePass(pr, chunk, comments);
    if (chunkResult) provisional.push(chunkResult);
  }

  if (provisional.length === 0) {
    return { result: null, chunkCount: chunks.length };
  }

  // Second pass: merge duplicate/near-duplicate groups across chunks, given
  // only titles/narratives/file lists (not full diffs) to keep this cheap.
  const mergeInput = provisional.flatMap((r) => r.groups);
  const mergeUngrouped = provisional.flatMap((r) => r.ungrouped);

  if (mergeInput.length <= 1) {
    return {
      result: {
        groups: mergeInput,
        ungrouped: mergeUngrouped,
      },
      chunkCount: chunks.length,
    };
  }

  const mergePrompt = `This PR was too large to review in one pass, so it was split into ${chunks.length} chunks and grouped separately. Merge duplicate or near-duplicate groups below into a final grouping. Keep distinct groups distinct. Preserve every file path exactly (don't drop any). You may rewrite titles/narratives for clarity when merging.

Provisional groups:
${JSON.stringify(mergeInput.map((g) => ({ title: g.title, narrative: g.narrative, significance: g.significance, files: g.files.map((f) => f.path) })), null, 2)}

Files marked ungrouped in a chunk (merge into final "ungrouped" unless you can now confidently place them in a group above):
${JSON.stringify(mergeUngrouped, null, 2)}

Respond with strict JSON only, matching the same schema as before.`;

  const merged = await callWithRetry((retryContext) => {
    const messages: { role: "system" | "user"; content: string }[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: mergePrompt },
    ];
    if (retryContext) messages.push({ role: "user", content: retryContext });
    return messages;
  });

  return { result: merged, chunkCount: chunks.length };
}

export async function groupPullRequest(
  pr: PrMeta,
  files: PrFile[],
  comments: PrComments
): Promise<{ result: GroupingResult; meta: GroupingMeta }> {
  const groupableFiles = files.filter((f) => f.patch);
  const totalTokens = estimateTokens(
    groupableFiles.map((f) => f.patch ?? "").join("\n")
  );
  const chunked = totalTokens > SINGLE_PASS_TOKEN_BUDGET;

  try {
    if (!chunked) {
      const result = await groupSinglePass(pr, groupableFiles, comments);
      if (!result) {
        return {
          result: fallbackResult(groupableFiles),
          meta: {
            model: config.ollamaModel,
            chunked: false,
            fallback: true,
            error: "LLM did not return valid JSON after retry",
          },
        };
      }
      return {
        result: reconcileWithKnownFiles(
          result,
          groupableFiles.map((f) => f.path)
        ),
        meta: { model: config.ollamaModel, chunked: false, fallback: false },
      };
    }

    const { result, chunkCount } = await groupChunked(pr, groupableFiles, comments);
    if (!result) {
      return {
        result: fallbackResult(groupableFiles),
        meta: {
          model: config.ollamaModel,
          chunked: true,
          chunkCount,
          fallback: true,
          error: "LLM did not return valid JSON after retry (chunked path)",
        },
      };
    }
    return {
      result: reconcileWithKnownFiles(
        result,
        groupableFiles.map((f) => f.path)
      ),
      meta: { model: config.ollamaModel, chunked: true, chunkCount, fallback: false },
    };
  } catch (err) {
    return {
      result: fallbackResult(groupableFiles),
      meta: {
        model: config.ollamaModel,
        chunked,
        fallback: true,
        error: err instanceof Error ? err.message : String(err),
      },
    };
  }
}
