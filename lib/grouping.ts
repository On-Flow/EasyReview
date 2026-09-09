import { z } from "zod";
import { config } from "./config";
import { estimateTokens, SINGLE_PASS_TOKEN_BUDGET } from "./ollama";
import { callLlmJsonWithRetry, type ChatMsg } from "./llmJson";
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

const SYSTEM_PROMPT = `You are a senior engineer preparing a GitHub pull request for human review. Your output replaces GitHub's file-by-file diff: minor groups render collapsed by default, significant groups render expanded. The entire point is to let the reviewer skip the noise and spend their attention only on what actually matters - so be strict and skeptical about what you call "significant", and work in two passes.

PASS 1 - find the noise first, before grouping anything as significant. Scan every file and pull out anything mechanical: pure renames (variables, functions, files) with no behavioural change, formatting/whitespace, comment/doc-only edits, import reordering, dependency bumps, lockfile/generated-file changes, config tweaks with no behavioural change. Consolidate ALL of this into as few minor groups as make sense - typically one per distinct kind of mechanical change (e.g. one group for "renamed X to Y across N files", a separate one for "dependency bumps" if both are present) - never one minor group per file. If a file mixes a real change with an incidental rename, its group is still significant overall, but call the rename out briefly in the narrative rather than letting it inflate or dilute the description of what actually changed.

PASS 2 - group what's left by logical purpose, not by file. Prefer more, smaller groups over fewer large ones: a group spanning many files, or one whose purpose needs more than 2-3 sentences to explain, is almost always actually two or more distinct concerns - split it. Each group should be narrow enough that its title alone tells the reviewer exactly what to expect, with every file in it doing the same specific thing for the same specific reason. Never merge two distinct significant changes into one group just because they landed in the same PR or touch the same file.

Rules:
- One group can span multiple files. One file's changes can split across groups if it's doing genuinely unrelated things (rare).
- significance is "minor" only for the mechanical/noise categories from PASS 1. Everything else is "significant" - but a "significant" group should still be about ONE specific behavioural change, never several bundled together.
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
  return callLlmJsonWithRetry(groupingSchema, (retryContext) => {
    const messages: ChatMsg[] = [
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

  const mergePrompt = `This PR was too large to review in one pass, so it was split into ${chunks.length} chunks and grouped separately. Merge duplicate or near-duplicate groups below into a final grouping - each chunk may have produced its own separate minor bucket for the same kind of noise (e.g. renames), merge those into one. Otherwise keep distinct significant groups distinct: don't merge two different behavioural changes into one group just because they came from different chunks of the same PR - more, smaller groups is still better than fewer large ones. Preserve every file path exactly (don't drop any). You may rewrite titles/narratives for clarity when merging.

Provisional groups:
${JSON.stringify(mergeInput.map((g) => ({ title: g.title, narrative: g.narrative, significance: g.significance, files: g.files.map((f) => f.path) })), null, 2)}

Files marked ungrouped in a chunk (merge into final "ungrouped" unless you can now confidently place them in a group above):
${JSON.stringify(mergeUngrouped, null, 2)}

Respond with strict JSON only, matching the same schema as before.`;

  const merged = await callLlmJsonWithRetry(groupingSchema, (retryContext) => {
    const messages: ChatMsg[] = [
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
