import { z } from "zod";
import { ollamaChatJson } from "./ollama";

export interface ChatMsg {
  role: "system" | "user";
  content: string;
}

function stripJsonFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return fenced ? fenced[1] : trimmed;
}

export function tryParseJson<T>(schema: z.ZodType<T>, raw: string): T | null {
  try {
    return schema.parse(JSON.parse(stripJsonFences(raw)));
  } catch {
    return null;
  }
}

// Calls Ollama expecting strict JSON matching `schema`. Models drift from
// schema sometimes, so on a parse/validation failure this retries once with
// the error appended, then gives up (null) rather than looping - callers
// decide the fallback.
export async function callLlmJsonWithRetry<T>(
  schema: z.ZodType<T>,
  buildMessages: (retryContext?: string) => ChatMsg[]
): Promise<T | null> {
  const first = await ollamaChatJson(buildMessages());
  const parsedFirst = tryParseJson(schema, first);
  if (parsedFirst) return parsedFirst;

  const second = await ollamaChatJson(
    buildMessages(
      `Your previous response was not valid JSON matching the required schema. Raw response was:\n${first.slice(0, 2000)}\n\nReturn ONLY the corrected JSON object, nothing else.`
    )
  );
  return tryParseJson(schema, second);
}
