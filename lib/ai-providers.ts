/**
 * lib/ai-providers.ts
 *
 * Multi-provider rotation with automatic fallback.
 *
 * Provider priority per role:
 *
 * FAST (Generator, Refiner, Parser):
 *   1. Groq — llama-3.3-70b-versatile
 *   2. Groq — openai/gpt-oss-20b
 *   3. Cerebras — llama-3.3-70b (same model, different infra, free)
 *   4. Gemini 2.0 Flash
 *
 * REASONING (Critic, Verifier — Stages 4 & 5 of Reflexion loop):
 *   1. Groq — qwen/qwen3-32b
 *   2. Cerebras — deepseek-r1-distill-llama-70b
 *   3. Groq — llama-3.3-70b-versatile (graceful degradation)
 *   4. Gemini 2.0 Flash
 *
 * FALLBACK:
 *   1. Gemini 2.0 Flash (if API key present)
 *   2. Cerebras (always free, no card)
 *
 * Rate limit detection:
 *   Any 429, 503, or decommissioned/deprecated response triggers immediate rotation.
 *   No retry on same provider — rotate first, retry never.
 *
 * NOTE on Qwen3-32b JSON calls:
 *   Groq can reject Qwen3 json_object responses with json_validate_failed.
 *   For Qwen3, use reasoning_format="hidden" and validate JSON locally.
 */

import Cerebras from "@cerebras/cerebras_cloud_sdk";
import type { ChatCompletionCreateParams } from "@cerebras/cerebras_cloud_sdk/resources/chat/completions";

export type ModelRole = "fast" | "reasoning" | "fallback";
interface ChatMessage { role: "system" | "user" | "assistant"; content: string; }

function readApiKey(name: string): string | undefined {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  const lowered = value.toLowerCase();
  if (
    lowered === "your_key_here" ||
    lowered === "your_key" ||
    lowered.startsWith("your_key_from") ||
    lowered.includes("replace_me")
  ) {
    return undefined;
  }
  return value;
}

// ── Env vars ──────────────────────────────────────────────────────────────────
function resolveGroqReasoningModel(): string {
  const configured = process.env.GROQ_REASONING_MODEL?.trim();
  if (!configured || configured === "deepseek-r1-distill-llama-70b") {
    return "qwen/qwen3-32b";
  }
  return configured;
}

const GROQ_API_KEY         = readApiKey("GROQ_API_KEY");
const GROQ_MODEL           = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const GROQ_REASONING_MODEL = resolveGroqReasoningModel();
const CEREBRAS_API_KEY     = readApiKey("CEREBRAS_API_KEY");
const CEREBRAS_MODEL       = process.env.CEREBRAS_MODEL || "llama-3.3-70b";
const CEREBRAS_REASONING_MODEL = "deepseek-r1-distill-llama-70b";
const GEMINI_API_KEY       = readApiKey("GEMINI_API_KEY");
const GEMINI_MODEL         = process.env.GEMINI_MODEL || "gemini-2.0-flash";

const cerebrasClient = CEREBRAS_API_KEY
  ? new Cerebras({ apiKey: CEREBRAS_API_KEY, timeout: 20000, maxRetries: 0 })
  : null;

export function getAIProviderStatus() {
  return {
    fast: [
      GROQ_API_KEY ? { provider: "groq", model: GROQ_MODEL, configured: true } : null,
      GROQ_API_KEY ? { provider: "groq", model: "openai/gpt-oss-20b", configured: true } : null,
      CEREBRAS_API_KEY ? { provider: "cerebras", model: CEREBRAS_MODEL, configured: true } : null,
      GEMINI_API_KEY ? { provider: "gemini", model: GEMINI_MODEL, configured: true } : null,
    ].filter(Boolean),
    reasoning: [
      GROQ_API_KEY ? { provider: "groq", model: GROQ_REASONING_MODEL, configured: true } : null,
      CEREBRAS_API_KEY ? { provider: "cerebras", model: CEREBRAS_REASONING_MODEL, configured: true } : null,
      GROQ_API_KEY ? { provider: "groq", model: GROQ_MODEL, configured: true } : null,
      GEMINI_API_KEY ? { provider: "gemini", model: GEMINI_MODEL, configured: true } : null,
    ].filter(Boolean),
    fallback: [
      GEMINI_API_KEY ? { provider: "gemini", model: GEMINI_MODEL, configured: true } : null,
      CEREBRAS_API_KEY ? { provider: "cerebras", model: CEREBRAS_MODEL, configured: true } : null,
      GROQ_API_KEY ? { provider: "groq", model: GROQ_MODEL, configured: true } : null,
    ].filter(Boolean),
  };
}

export function getAIProviderDiagnostics() {
  const status = getAIProviderStatus();
  const configured = {
    groq: Boolean(GROQ_API_KEY),
    cerebras: Boolean(CEREBRAS_API_KEY),
    gemini: Boolean(GEMINI_API_KEY),
  };
  const missingEnv = [
    configured.groq ? null : "GROQ_API_KEY",
    configured.cerebras ? null : "CEREBRAS_API_KEY",
    configured.gemini ? null : "GEMINI_API_KEY",
  ].filter(Boolean) as string[];

  return {
    configured,
    missingEnv,
    chains: {
      fast: status.fast.length,
      reasoning: status.reasoning.length,
      fallback: status.fallback.length,
    },
  };
}

export function hasAIProvider(): boolean {
  return Boolean(GROQ_API_KEY || CEREBRAS_API_KEY || GEMINI_API_KEY);
}

function sanitizeModelOutput(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\uFFFD/g, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[—–]/g, "-")
    .replace(/→/g, "->")
    .replace(/…/g, "...")
    .trim();
}

function sanitizeParsedValue<T>(value: T): T {
  if (typeof value === "string") {
    return sanitizeModelOutput(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeParsedValue(item)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitizeParsedValue(item)]),
    ) as T;
  }
  return value;
}

// ── Provider call functions ───────────────────────────────────────────────────

function isQwen3ReasoningModel(model: string): boolean {
  const normalized = model.toLowerCase();
  return normalized.includes("qwen3") || normalized.includes("qwen/qwen3") || normalized.includes("qwq");
}

async function groqCall(
  messages: ChatMessage[],
  model: string,
  temperature: number,
  maxTokens: number,
  jsonMode: boolean,
): Promise<string> {
  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY not set");
  const isQwen3 = isQwen3ReasoningModel(model);
  const needsReasoningHidden = jsonMode && isQwen3;
  const useProviderJSONMode = jsonMode && !isQwen3;
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(20000),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: maxTokens,
      ...(useProviderJSONMode ? { response_format: { type: "json_object" } } : {}),
      ...(needsReasoningHidden ? { reasoning_format: "hidden" } : {}),
      messages,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GROQ_${res.status}: ${text.slice(0, 150)}`);
  }
  const body = await res.json();
  const text = body?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Groq empty response");
  return sanitizeModelOutput(text);
}

async function cerebrasCall(
  messages: ChatMessage[],
  model: string,
  temperature: number,
  maxTokens: number,
  jsonMode: boolean,
): Promise<string> {
  if (!cerebrasClient) throw new Error("CEREBRAS_API_KEY not set");
  const cerebrasMessages = messages.map((message) => ({
    role: message.role,
    content: message.content,
  })) as ChatCompletionCreateParams["messages"];
  const body = await cerebrasClient.chat.completions.create({
    messages: cerebrasMessages,
    model,
    max_completion_tokens: maxTokens,
    temperature,
    top_p: 1,
    stream: false,
    ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
  });
  const response = body as { choices?: Array<{ message?: { content?: string | null } }> };
  const text = response.choices?.[0]?.message?.content;
  if (!text) throw new Error("Cerebras empty response");
  return sanitizeModelOutput(text);
}

async function geminiCall(
  messages: ChatMessage[],
  temperature: number,
  maxTokens: number,
  jsonMode: boolean,
): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");
  const systemMsg = messages.find(m => m.role === "system")?.content ?? "";
  const userMessages = messages.filter(m => m.role !== "system");
  const contents = userMessages.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
      ...(jsonMode ? { responseMimeType: "application/json" } : {}),
    },
    ...(systemMsg ? { systemInstruction: { parts: [{ text: systemMsg }] } } : {}),
  };
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GEMINI_${res.status}: ${text.slice(0, 150)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini empty response");
  return sanitizeModelOutput(text);
}

// ── Rate limit detection ──────────────────────────────────────────────────────

function isRetryableProviderError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  return Boolean(
    msg.includes("400") ||
    msg.includes("408") ||
    msg.includes("409") ||
    msg.includes("429") ||
    msg.includes("500") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504") ||
    lower.includes("aborterror") ||
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("json_parse") ||
    lower.includes("json parse") ||
    lower.includes("unexpected token") ||
    lower.includes("unterminated string") ||
    lower.includes("rate limit") ||
    lower.includes("decommissioned") ||
    lower.includes("deprecated") ||
    lower.includes("unavailable") ||
    lower.includes("network") ||
    lower.includes("fetch failed"),
  );
}

function assertValidJSONModeOutput(text: string): void {
  const clean = sanitizeModelOutput(text);
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  const json = start >= 0 && end > start ? clean.slice(start, end + 1) : clean;
  try {
    JSON.parse(json);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`JSON_PARSE: ${msg}`);
  }
}

// ── Provider chains per role ──────────────────────────────────────────────────

type ProviderFn = {
  label: string;
  call: (
  messages: ChatMessage[],
  temperature: number,
  maxTokens: number,
  jsonMode: boolean,
  ) => Promise<string>;
};

function getFastChain(): ProviderFn[] {
  const chain: ProviderFn[] = [];
  if (GROQ_API_KEY) {
    chain.push({ label: `groq:${GROQ_MODEL}`, call: (m, t, mt, j) => groqCall(m, GROQ_MODEL, t, mt, j) });
    chain.push({ label: "groq:openai/gpt-oss-20b", call: (m, t, mt, j) => groqCall(m, "openai/gpt-oss-20b", t, mt, j) });
  }
  if (CEREBRAS_API_KEY) {
    chain.push({ label: `cerebras:${CEREBRAS_MODEL}`, call: (m, t, mt, j) => cerebrasCall(m, CEREBRAS_MODEL, t, mt, j) });
  }
  if (GEMINI_API_KEY) {
    chain.push({ label: `gemini:${GEMINI_MODEL}`, call: (m, t, mt, j) => geminiCall(m, t, mt, j) });
  }
  return chain;
}

function getReasoningChain(): ProviderFn[] {
  const chain: ProviderFn[] = [];
  if (GROQ_API_KEY) {
    chain.push({ label: `groq:${GROQ_REASONING_MODEL}`, call: (m, t, mt, j) => groqCall(m, GROQ_REASONING_MODEL, t, mt, j) });
  }
  if (CEREBRAS_API_KEY) {
    chain.push({ label: `cerebras:${CEREBRAS_REASONING_MODEL}`, call: (m, t, mt, j) => cerebrasCall(m, CEREBRAS_REASONING_MODEL, t, mt, j) });
  }
  if (GROQ_API_KEY) {
    // Graceful degradation: fall back to fast model on same provider
    chain.push({ label: `groq:${GROQ_MODEL}`, call: (m, t, mt, j) => groqCall(m, GROQ_MODEL, t, mt, j) });
  }
  if (GEMINI_API_KEY) {
    chain.push({ label: `gemini:${GEMINI_MODEL}`, call: (m, t, mt, j) => geminiCall(m, t, mt, j) });
  }
  return chain;
}

function getFallbackChain(): ProviderFn[] {
  const chain: ProviderFn[] = [];
  if (GEMINI_API_KEY) {
    chain.push({ label: `gemini:${GEMINI_MODEL}`, call: (m, t, mt, j) => geminiCall(m, t, mt, j) });
  }
  if (CEREBRAS_API_KEY) {
    chain.push({ label: `cerebras:${CEREBRAS_MODEL}`, call: (m, t, mt, j) => cerebrasCall(m, CEREBRAS_MODEL, t, mt, j) });
  }
  if (GROQ_API_KEY) {
    chain.push({ label: `groq:${GROQ_MODEL}`, call: (m, t, mt, j) => groqCall(m, GROQ_MODEL, t, mt, j) });
  }
  return chain;
}

// ── Main routing function ─────────────────────────────────────────────────────

/**
 * callModel — routes to the correct provider chain and rotates on failure.
 * Never retries the same provider. Moves to next in chain on rate limit.
 * Throws only when the entire chain is exhausted.
 */
export async function callModel(
  messages: ChatMessage[],
  options: {
    role?: ModelRole;
    temperature?: number;
    maxTokens?: number;
    jsonMode?: boolean;
  } = {},
): Promise<string> {
  const {
    role = "fast",
    temperature = 0.3,
    maxTokens = 600,
    jsonMode = false,
  } = options;

  const chain =
    role === "reasoning" ? getReasoningChain() :
    role === "fallback"  ? getFallbackChain()  :
    getFastChain();

  if (chain.length === 0) {
    const diagnostics = getAIProviderDiagnostics();
    throw new Error(
      `No AI providers configured for role "${role}". Set at least one provider env var: ${diagnostics.missingEnv.join(", ")}.`,
    );
  }

  const errors: string[] = [];

  for (const provider of chain) {
    try {
      const text = await provider.call(messages, temperature, maxTokens, jsonMode);
      if (jsonMode) assertValidJSONModeOutput(text);
      console.info(`[ai-providers] ${role} succeeded via ${provider.label}`);
      return text;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(msg);
      if (isRetryableProviderError(err)) {
        console.warn(`[ai-providers] ${provider.label} failed (${msg.slice(0, 80)}) - rotating to next`);
        continue; // try next provider
      }
      console.warn(`[ai-providers] ${provider.label} failed (${msg.slice(0, 80)}) - rotating to next`);
      continue;
    }
  }

  throw new Error(
    `All AI providers exhausted. Errors: ${errors.map(e => e.slice(0, 60)).join(" | ")}`
  );
}

/**
 * callModelJSON — JSON mode wrapper with automatic fence stripping.
 */
export async function callModelJSON<T>(
  messages: ChatMessage[],
  options: Omit<Parameters<typeof callModel>[1], "jsonMode"> = {},
): Promise<T> {
  const text = await callModel(messages, { ...options, jsonMode: true });
  const clean = sanitizeModelOutput(text);
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  const json = start >= 0 && end > start ? clean.slice(start, end + 1) : clean;
  return sanitizeParsedValue(JSON.parse(json) as T);
}
