/**
 * Pluggable LLM provider.
 *
 * The intent router is the only part of this library that needs a model, and it
 * degrades to a keyword fallback when no provider is configured. Everything else
 * (all data sources, the guard, the metrics) runs with no model at all.
 *
 * Bring your own provider:
 *
 *   import { setLLMProvider } from "ai-powered-finance-agent";
 *
 *   setLLMProvider(async ({ system, user, jsonMode, maxTokens }) => {
 *     const res = await myClient.chat({ system, user, maxTokens });
 *     return res.text;
 *   });
 *
 * Adapters for OpenAI-compatible and Anthropic-compatible endpoints live in
 * `examples/providers.ts`.
 */

export interface ChatRequest {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
}

export type LLMProvider = (req: ChatRequest) => Promise<string>;

let provider: LLMProvider | null = null;

/** Register the model backend. Call once at startup. */
export function setLLMProvider(next: LLMProvider): void {
  provider = next;
}

/** True when a provider has been registered. */
export function llmConfigured(): boolean {
  return provider !== null;
}

/**
 * Returns the model's reply, or an empty string when no provider is registered or
 * the call fails. Callers treat "" as "no answer" and fall back, so a missing
 * model never throws.
 */
export async function chatRaw(opts: ChatRequest): Promise<string> {
  if (!provider) return "";
  try {
    return (await provider(opts)) ?? "";
  } catch {
    return "";
  }
}
