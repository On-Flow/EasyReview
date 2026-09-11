import { z } from "zod";
import { config } from "./config";
import { callLlmJsonWithRetry, type ChatMsg } from "./llmJson";
import type { AiComment, AiReviewMeta } from "./types";

const aiCommentResponseSchema = z.object({
  summary: z.string(),
  comments: z.array(
    z.object({
      path: z.string(),
      line: z.number(),
      body: z.string(),
      severity: z.enum(["high", "moderate", "minor", "nit"]),
    })
  ),
});

const SYSTEM_PROMPT = `You are a careful senior engineer doing a focused code review on a slice of a GitHub pull request. Point out real issues only: bugs, edge cases, missed error handling, security or performance concerns, or code that's genuinely confusing - not style nitpicks. If a file has nothing worth flagging, don't invent filler feedback for it - it's fine to return fewer comments, or none at all.

For each comment, anchor it to an exact line number from the RIGHT (new) side of the diff, using the post-change line numbers as they appear in the diff hunks (a "@@ -a,b +c,d @@" header counts new-side lines starting at c). If you can't confidently pin a comment to one specific line, omit it rather than guessing. Reference files by their exact path as given.

Always also write a "summary": one or two sentences, written every time regardless of whether you found anything, so the reviewer can tell this was actually read rather than skipped. Say what you actually looked at and your overall read - e.g. "Checked the pool-sizing math and the tenant-isolation checks on the allocation endpoints; both look correct, no issues found." Be specific to what's in this diff, not generic ("looks fine", "no issues found" alone) - if there's nothing to flag, say briefly what you checked and confirmed rather than just that nothing was wrong.

Respond with strict JSON only. No markdown fences, no prose outside the JSON. Match this shape exactly:
{"summary":"string","comments":[{"path":"string","line":0,"body":"string","severity":"high|moderate|minor|nit"}]}`;

function buildPrompt(
  files: { path: string; patch: string }[],
  prTitle: string,
  prBody: string | null
): string {
  const header = `PR: ${prTitle}\n\n${prBody ?? "(no description)"}\n\n---\n`;
  const fileBlocks = files
    .map((f) => `### ${f.path}\n\`\`\`diff\n${f.patch}\n\`\`\``)
    .join("\n\n");
  return `${header}\n${fileBlocks}`;
}

// Scoped to whatever file set the caller passes (a group's files, typically)
// rather than the whole PR - keeps prompts small and reviews fast, and unlike
// grouping there's no chunk+merge path here: a group too large to fit the
// context window just fails gracefully (empty result + error in meta) rather
// than adding chunking machinery for what's meant to be a quick, optional pass.
export async function reviewFiles(
  files: { path: string; patch: string }[],
  prTitle: string,
  prBody: string | null
): Promise<{ comments: AiComment[]; summary: string | null; meta: AiReviewMeta }> {
  const knownPaths = new Set(files.map((f) => f.path));

  try {
    const userContent = buildPrompt(files, prTitle, prBody);
    const result = await callLlmJsonWithRetry(aiCommentResponseSchema, (retryContext) => {
      const messages: ChatMsg[] = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ];
      if (retryContext) messages.push({ role: "user", content: retryContext });
      return messages;
    });

    if (!result) {
      return {
        comments: [],
        summary: null,
        meta: {
          model: config.ollamaModel,
          fallback: true,
          error: "LLM did not return valid JSON after retry",
        },
      };
    }

    // Drop comments on files we didn't actually send - a hallucinated path
    // would otherwise never render (no matching DiffPane) and just vanish
    // silently; better to filter it here where it's visible in a count if
    // ever logged.
    const comments: AiComment[] = result.comments
      .filter((c) => knownPaths.has(c.path))
      .map((c, i) => ({
        id: `ai-${c.path}-${i}`,
        path: c.path,
        line: c.line,
        side: "RIGHT" as const,
        body: c.body,
        severity: c.severity,
      }));

    return {
      comments,
      summary: result.summary,
      meta: { model: config.ollamaModel, fallback: false },
    };
  } catch (err) {
    return {
      comments: [],
      summary: null,
      meta: {
        model: config.ollamaModel,
        fallback: true,
        error: err instanceof Error ? err.message : String(err),
      },
    };
  }
}
