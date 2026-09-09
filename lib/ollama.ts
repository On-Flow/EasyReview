import { config } from "./config";

// Rough token estimate for code+prose mixed text. Good enough for sizing
// context windows and deciding when to chunk; not meant to be exact.
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

// Keep this well under the model's 256K native window: prompt processing
// time scales with context size, and this is a POC, not a benchmark.
export const MAX_NUM_CTX = 65536;
// Diff+comments text budget (in estimated tokens) before we chunk by file.
// Leaves headroom in MAX_NUM_CTX for the system prompt and the model's own
// JSON output.
export const SINGLE_PASS_TOKEN_BUDGET = 40000;

function pickNumCtx(promptTokens: number): number {
  const wanted = Math.ceil((promptTokens + 4096) * 1.15);
  const rounded = Math.pow(2, Math.ceil(Math.log2(Math.max(wanted, 4096))));
  return Math.min(rounded, MAX_NUM_CTX);
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function ollamaChatJson(messages: ChatMessage[]): Promise<string> {
  const promptTokens = estimateTokens(messages.map((m) => m.content).join("\n"));
  const res = await fetch(`${config.ollamaHost}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.ollamaModel,
      messages,
      format: "json",
      stream: false,
      options: {
        num_ctx: pickNumCtx(promptTokens),
        temperature: 0.2,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Ollama request failed (${res.status}): ${text || res.statusText}. Is "ollama serve" running with ${config.ollamaModel} pulled?`
    );
  }

  const data = await res.json();
  const content: string | undefined = data?.message?.content;
  if (!content) {
    throw new Error("Ollama returned an empty response");
  }
  return content;
}
