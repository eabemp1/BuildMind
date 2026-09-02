/**
 * lib/ai-providers.ts
 *
 * Multi-provider rotation with automatic fallback.
 *
 * PROVIDER STATUS — verified September 2, 2026 (provider policies change
 * often; re-verify before assuming any of this is still true):
 *
 *   Groq       — still genuinely free, no card required. Real limits are
 *                per-model, at the ORG level (not per-key — extra keys do
 *                NOT raise the ceiling): gpt-oss-120b is 30 RPM / 1,000 RPD
 *                / 8,000 TPM / 200,000 TPD; qwen/qwen3.6-27b is a SEPARATE
 *                bucket. Because these are independent buckets, using both
 *                models (not just falling back to the second one after the
 *                first fails) roughly doubles the effective free daily
 *                token budget — see getFastChain() below.
 *                FIX (Sept 2026): llama-3.3-70b-versatile (shutdown
 *                08/16/26) and qwen/qwen3-32b (shutdown 07/17/26) were both
 *                decommissioned by Groq — see console.groq.com/docs/deprecations.
 *                Both hardcoded second-bucket slots below now use
 *                qwen/qwen3.6-27b, Groq's listed replacement for the old
 *                Llama 3.3 70B slot, so this still stays a genuinely
 *                separate bucket from gpt-oss-120b rather than reusing it.
 *   Cerebras   — FIX: as of August 2026 Cerebras ended its no-card free
 *                tier. New/existing accounts without a payment method on
 *                file now get 402 on every call; adding a card grants $5 in
 *                credit that expires after 30 days, which is not a
 *                sustainable free tier. Demoted to last resort in every
 *                chain below rather than removed outright, in case a card
 *                gets added later — do not rely on it being reachable.
 *   OpenRouter — FIX: the hardcoded default model, deepseek/deepseek-r1:free,
 *                is DEAD — every DeepSeek model on OpenRouter went paid-only
 *                around July 2026, and calls to the old slug 404. Switched
 *                the default to openrouter/free, OpenRouter's "Free Models
 *                Router" alias, which auto-selects whatever free model is
 *                currently live instead of pinning a specific slug that can
 *                (and did) get retired without notice.
 *   Gemini     — unreliable right now: gemini-2.5-flash has been reported
 *                returning 404 ("no longer available") ahead of its
 *                official Oct 16 2026 deprecation date, and free-tier
 *                access is card-gated in some regions regardless. Kept in
 *                the chain as opportunistic/best-effort, not a leg to
 *                depend on — if GEMINI_API_KEY calls keep 404ing, check
 *                Google AI Studio's current model list and set GEMINI_MODEL
 *                to whatever's currently live rather than assuming this
 *                default stays correct.
 *   Mistral    — NEW Sept 2026: La Plateforme's "Experiment" free tier —
 *                genuinely free, no credit card (phone verification only
 *                at signup), OpenAI-compatible endpoint, roughly 1B
 *                tokens/month at a low RPM ceiling. A real additional leg,
 *                not another router over the same free models the other
 *                legs already reach. Re-verify at console.mistral.ai before
 *                assuming these limits/model IDs still hold.
 *
 * NET EFFECT for a small (10-30 person) free deployment: Groq alone,
 * spread across its two independent model buckets, comfortably covers that
 * scale at the CORE_DAILY_LIMITS/PLAN_DAILY_LIMITS sizing already in
 * app/api/ai/_utils.ts (do the math before raising those limits — TPD is
 * the binding constraint, not RPD, once prompts get long). OpenRouter's
 * fixed free-router is the real second leg, Mistral a genuine third.
 * Cerebras and Gemini are bonus-if-reachable, not guaranteed capacity.
 *
 * Provider priority per role:
 *
 * FAST (Generator, Refiner, Parser):
 *   1. Groq — openai/gpt-oss-120b  (MoE 120B, near o4-mini reasoning, free tier)
 *   2. Groq — qwen/qwen3.6-27b (separate free-tier token bucket, not just a fallback)
 *   3. OpenRouter — openrouter/free (auto-routing free model, no pinned slug to rot)
 *   4. Mistral — mistral-small-latest (free "Experiment" tier, no card)
 *   5. Gemini 2.5 Flash (best-effort — see PROVIDER STATUS above)
 *   6. Cerebras — gpt-oss-120b (best-effort — card-gated as of Aug 2026, see above)
 *
 * REASONING (Critic, Verifier — Stages 4 & 5 of Reflexion loop):
 *   1. Groq — openai/gpt-oss-120b  (native CoT, reasoning_effort=high, free)
 *   2. OpenRouter — openrouter/free
 *   3. Gemini 2.5 Flash (best-effort)
 *   4. Mistral — mistral-small-latest (free, no card)
 *   5. Groq — qwen/qwen3.6-27b     (strong math/logic, free, separate bucket)
 *   6. Cerebras — gpt-oss-120b (best-effort)
 *
 * FALLBACK:
 *   1. OpenRouter — openrouter/free
 *   2. Groq — openai/gpt-oss-120b
 *   3. Gemini 2.5 Flash (best-effort)
 *   4. Mistral — mistral-small-latest (free, no card)
 *   5. Cerebras — gpt-oss-120b (best-effort)
 *
 * Rate limit detection:
 *   Any 429, 503, or decommissioned/deprecated response triggers immediate rotation.
 *   No retry on same provider — rotate first, retry never.
 *
 * NOTE on gpt-oss reasoning:
 *   Groq's gpt-oss-120b supports reasoning_effort ('low'|'medium'|'high').
 *   For REASONING role calls we set reasoning_effort='high' and strip the
 *   <think>...</think> block from the visible output before returning.
 *   For JSON calls we use json_object mode (supported on gpt-oss-120b on Groq).
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
  // Migrate away from the deprecated deepseek-r1-distill-llama-70b (decommissioned Sep 2025)
  // and default to gpt-oss-120b which delivers near o4-mini reasoning at zero cost.
  if (!configured || configured === "deepseek-r1-distill-llama-70b" || configured === "qwen/qwen3-32b") {
    return "openai/gpt-oss-120b";
  }
  return configured;
}

const GROQ_API_KEY         = readApiKey("GROQ_API_KEY");
// Primary fast model: gpt-oss-120b on Groq — MoE architecture (5.1B active params),
// near o4-mini reasoning, free tier, replaces the Llama 3.3 70B default.
const GROQ_MODEL           = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const GROQ_REASONING_MODEL = resolveGroqReasoningModel();
const CEREBRAS_API_KEY     = readApiKey("CEREBRAS_API_KEY");
// Cerebras hosts gpt-oss-120b at 1,854 t/s — the fastest inference available.
const CEREBRAS_MODEL       = process.env.CEREBRAS_MODEL || "gpt-oss-120b";
// Reasoning role on Cerebras: same gpt-oss-120b (deepseek-r1-distill deprecated Sep 2025)
const CEREBRAS_REASONING_MODEL = "gpt-oss-120b";
const GEMINI_API_KEY       = readApiKey("GEMINI_API_KEY");
// Upgrade to Gemini 2.5 Flash — stronger reasoning and lower hallucination rate
const GEMINI_MODEL         = process.env.GEMINI_MODEL || "gemini-2.5-flash";

// OPENROUTER — no-card alternative for genuine model diversity. Google AI Studio's
// API now requires a card on file in many regions even for free-tier Gemini models;
// OpenRouter fronts free models for genuine architecture diversity, no card required.
//
// FIX (Aug 2026): this used to default to deepseek/deepseek-r1:free — that specific
// slug is dead, every DeepSeek model on OpenRouter went paid-only around July 2026,
// and calls to it return 404. openrouter/free is OpenRouter's "Free Models Router"
// alias: it auto-selects whichever free model is currently live (Llama, etc.)
// instead of pinning one slug that rots the next time a provider changes its free
// lineup. If you need a SPECIFIC model rather than "whatever's free right now",
// set OPENROUTER_MODEL explicitly — but check openrouter.ai/models first, since
// free-tier availability changes without notice.
const OPENROUTER_API_KEY   = readApiKey("OPENROUTER_API_KEY");
const OPENROUTER_MODEL     = process.env.OPENROUTER_MODEL || "openrouter/free";

// MISTRAL — La Plateforme's "Experiment" tier: genuinely free, no credit card
// (phone verification only), OpenAI-compatible endpoint, ~1B tokens/month at a
// low RPM ceiling. A real fifth leg, not another router in front of the same
// free models the other legs already reach. Verified Sept 2026 — re-check
// console.mistral.ai before assuming these limits/model IDs still hold.
const MISTRAL_API_KEY      = readApiKey("MISTRAL_API_KEY");
const MISTRAL_MODEL        = process.env.MISTRAL_MODEL || "mistral-small-latest";

const cerebrasClient = CEREBRAS_API_KEY
  ? new Cerebras({ apiKey: CEREBRAS_API_KEY, timeout: 20000, maxRetries: 0 })
  : null;

export function getAIProviderStatus() {
  return {
    fast: [
      GROQ_API_KEY ? { provider: "groq", model: GROQ_MODEL, configured: true } : null,
      GROQ_API_KEY ? { provider: "groq", model: "qwen/qwen3.6-27b", configured: true } : null,
      OPENROUTER_API_KEY ? { provider: "openrouter", model: OPENROUTER_MODEL, configured: true } : null,
      MISTRAL_API_KEY ? { provider: "mistral", model: MISTRAL_MODEL, configured: true } : null,
      GEMINI_API_KEY ? { provider: "gemini", model: GEMINI_MODEL, configured: true } : null,
      CEREBRAS_API_KEY ? { provider: "cerebras", model: CEREBRAS_MODEL, configured: true, note: "requires card on file as of Aug 2026" } : null,
    ].filter(Boolean),
    reasoning: [
      GROQ_API_KEY ? { provider: "groq", model: GROQ_REASONING_MODEL, configured: true } : null,
      OPENROUTER_API_KEY ? { provider: "openrouter", model: OPENROUTER_MODEL, configured: true } : null,
      GEMINI_API_KEY ? { provider: "gemini", model: GEMINI_MODEL, configured: true } : null,
      MISTRAL_API_KEY ? { provider: "mistral", model: MISTRAL_MODEL, configured: true } : null,
      GROQ_API_KEY ? { provider: "groq", model: "qwen/qwen3.6-27b", configured: true } : null,
      CEREBRAS_API_KEY ? { provider: "cerebras", model: CEREBRAS_REASONING_MODEL, configured: true, note: "requires card on file as of Aug 2026" } : null,
    ].filter(Boolean),
    fallback: [
      OPENROUTER_API_KEY ? { provider: "openrouter", model: OPENROUTER_MODEL, configured: true } : null,
      GROQ_API_KEY ? { provider: "groq", model: GROQ_MODEL, configured: true } : null,
      GEMINI_API_KEY ? { provider: "gemini", model: GEMINI_MODEL, configured: true } : null,
      MISTRAL_API_KEY ? { provider: "mistral", model: MISTRAL_MODEL, configured: true } : null,
      CEREBRAS_API_KEY ? { provider: "cerebras", model: CEREBRAS_MODEL, configured: true, note: "requires card on file as of Aug 2026" } : null,
    ].filter(Boolean),
  };
}

export function getAIProviderDiagnostics() {
  const status = getAIProviderStatus();
  const configured = {
    groq: Boolean(GROQ_API_KEY),
    cerebras: Boolean(CEREBRAS_API_KEY),
    openrouter: Boolean(OPENROUTER_API_KEY),
    gemini: Boolean(GEMINI_API_KEY),
    mistral: Boolean(MISTRAL_API_KEY),
  };
  const missingEnv = [
    configured.groq ? null : "GROQ_API_KEY",
    configured.cerebras ? null : "CEREBRAS_API_KEY",
    configured.openrouter ? null : "OPENROUTER_API_KEY",
    configured.gemini ? null : "GEMINI_API_KEY",
    configured.mistral ? null : "MISTRAL_API_KEY",
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
  return Boolean(GROQ_API_KEY || CEREBRAS_API_KEY || OPENROUTER_API_KEY || GEMINI_API_KEY);
}

export function sanitizeModelOutput(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/gi, "")
    .replace(/^[\s\S]*<\/think>/gi, "")
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

function isGptOssModel(model: string): boolean {
  const normalized = model.toLowerCase();
  return normalized.includes("gpt-oss") || normalized.includes("openai/gpt-oss");
}

async function groqCall(
  messages: ChatMessage[],
  model: string,
  temperature: number,
  maxTokens: number,
  jsonMode: boolean,
  reasoningRole = false,
): Promise<string> {
  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY not set");
  const isQwen3 = isQwen3ReasoningModel(model);
  const isGptOss = isGptOssModel(model);
  // Groq can reject otherwise useful GPT OSS/Qwen JSON with json_validate_failed.
  // For those models, prompt for JSON and validate locally instead of using provider JSON mode.
  const needsReasoningHidden = jsonMode && isQwen3;
  const useProviderJSONMode = jsonMode && !isQwen3 && !isGptOss;
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
      // gpt-oss supports reasoning_effort: 'low'|'medium'|'high' (not reasoning_format)
      ...(isGptOss ? { reasoning_effort: reasoningRole ? "high" : "medium" } : {}),
      messages,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GROQ_${res.status}: ${text.slice(0, 150)}`);
  }
  const body = await res.json();
  let text: string = body?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Groq empty response");
  // Strip any exposed <think>...</think> block that gpt-oss may include
  if (isGptOss) {
    text = text.replace(/^<think>[\s\S]*?<\/think>\s*/i, "").trim();
  }
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

/**
 * openRouterCall — OpenAI-compatible API, fronts free-tier models (DeepSeek R1,
 * Gemini Flash, Qwen3, Llama 4) with no credit card required at signup. This is
 * the genuine model-diversity source when GEMINI_API_KEY direct access is
 * blocked by a card requirement in your region.
 */
async function openRouterCall(
  messages: ChatMessage[],
  model: string,
  temperature: number,
  maxTokens: number,
  jsonMode: boolean,
): Promise<string> {
  if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not set");
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(20000),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      // Required by OpenRouter for free-tier routing/analytics — safe to set generically
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://buildmind.live",
      "X-Title": "BuildMind",
    },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: maxTokens,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
      messages,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OPENROUTER_${res.status}: ${text.slice(0, 150)}`);
  }
  const body = await res.json();
  const text: string = body?.choices?.[0]?.message?.content;
  if (!text) throw new Error("OpenRouter empty response");
  return sanitizeModelOutput(text);
}

/**
 * mistralCall — La Plateforme's OpenAI-compatible endpoint, "Experiment" free
 * tier. No credit card required (phone verification only at signup). A
 * genuinely separate free-tier ceiling from Groq/OpenRouter/Gemini, not
 * another router in front of the same underlying free models.
 */
async function mistralCall(
  messages: ChatMessage[],
  model: string,
  temperature: number,
  maxTokens: number,
  jsonMode: boolean,
): Promise<string> {
  if (!MISTRAL_API_KEY) throw new Error("MISTRAL_API_KEY not set");
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(20000),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: maxTokens,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
      messages,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MISTRAL_${res.status}: ${text.slice(0, 150)}`);
  }
  const body = await res.json();
  const text: string = body?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Mistral empty response");
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
    lower.includes("json_validate_failed") ||
    lower.includes("failed to validate json") ||
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
    // gpt-oss-120b first — strongest reasoning of any free model
    chain.push({ label: `groq:${GROQ_MODEL}`, call: (m, t, mt, j) => groqCall(m, GROQ_MODEL, t, mt, j) });
    // FIX (Sept 2026): llama-3.3-70b-versatile was decommissioned by Groq on
    // 08/16/26 (see console.groq.com/docs/deprecations). qwen/qwen3.6-27b is
    // Groq's listed replacement — using it instead of gpt-oss-120b again
    // keeps this a genuinely SEPARATE rate-limit bucket from the line above,
    // preserving the doubled-daily-budget effect this second chain entry
    // exists for in the first place.
    chain.push({ label: "groq:qwen/qwen3.6-27b", call: (m, t, mt, j) => groqCall(m, "qwen/qwen3.6-27b", t, mt, j) });
  }
  if (OPENROUTER_API_KEY) {
    // Fixed free-router (see PROVIDER STATUS at top of file) — the real
    // second leg, ahead of the two providers below that now require a card
    // (Cerebras) or are unreliable (Gemini) as of Aug 2026.
    chain.push({ label: `openrouter:${OPENROUTER_MODEL}`, call: (m, t, mt, j) => openRouterCall(m, OPENROUTER_MODEL, t, mt, j) });
  }
  if (MISTRAL_API_KEY) {
    // La Plateforme's free "Experiment" tier — a genuinely separate ceiling
    // from every provider above, not another router over the same models.
    chain.push({ label: `mistral:${MISTRAL_MODEL}`, call: (m, t, mt, j) => mistralCall(m, MISTRAL_MODEL, t, mt, j) });
  }
  if (GEMINI_API_KEY) {
    chain.push({ label: `gemini:${GEMINI_MODEL}`, call: (m, t, mt, j) => geminiCall(m, t, mt, j) });
  }
  if (CEREBRAS_API_KEY) {
    // Best-effort last resort — no-card free tier ended Aug 2026, see
    // PROVIDER STATUS at top of file. Only reachable if a card + credits
    // have been added.
    chain.push({ label: `cerebras:${CEREBRAS_MODEL}`, call: (m, t, mt, j) => cerebrasCall(m, CEREBRAS_MODEL, t, mt, j) });
  }
  return chain;
}

function getReasoningChain(): ProviderFn[] {
  const chain: ProviderFn[] = [];
  if (GROQ_API_KEY) {
    // gpt-oss-120b with reasoning_effort=high — native CoT, near o4-mini quality
    chain.push({ label: `groq:${GROQ_REASONING_MODEL}`, call: (m, t, mt, j) => groqCall(m, GROQ_REASONING_MODEL, t, mt, j, true) });
  }
  // CRITIC DIVERSITY FIX: gpt-oss critiquing gpt-oss shares blind spots — a model
  // rarely catches its own failure modes. OpenRouter's free-router is a
  // genuinely different architecture/training lineage and requires NO credit card
  // (unlike Google AI Studio's direct API, which now gates free Gemini behind
  // billing in many regions, and unlike Cerebras, which now requires a card at
  // all as of Aug 2026). This is the real diversity source for Critic/Verifier.
  if (OPENROUTER_API_KEY) {
    chain.push({ label: `openrouter:${OPENROUTER_MODEL}`, call: (m, t, mt, j) => openRouterCall(m, OPENROUTER_MODEL, t, mt, j) });
  }
  // Direct Gemini — best-effort, see PROVIDER STATUS at top of file.
  if (GEMINI_API_KEY) {
    chain.push({ label: `gemini:${GEMINI_MODEL}`, call: (m, t, mt, j) => geminiCall(m, t, mt, j) });
  }
  if (MISTRAL_API_KEY) {
    chain.push({ label: `mistral:${MISTRAL_MODEL}`, call: (m, t, mt, j) => mistralCall(m, MISTRAL_MODEL, t, mt, j) });
  }
  if (GROQ_API_KEY) {
    // FIX (Sept 2026): qwen/qwen3-32b was decommissioned by Groq on 07/17/26
    // (see console.groq.com/docs/deprecations). qwen/qwen3.6-27b is the
    // current model in that family and, like the old qwen3-32b slot, is a
    // separate token bucket from gpt-oss-120b above.
    chain.push({ label: "groq:qwen/qwen3.6-27b", call: (m, t, mt, j) => groqCall(m, "qwen/qwen3.6-27b", t, mt, j, true) });
  }
  if (CEREBRAS_API_KEY) {
    // Best-effort last resort — card-gated as of Aug 2026, see PROVIDER STATUS.
    chain.push({ label: `cerebras:${CEREBRAS_REASONING_MODEL}`, call: (m, t, mt, j) => cerebrasCall(m, CEREBRAS_REASONING_MODEL, t, mt, j) });
  }
  return chain;
}
function getFallbackChain(): ProviderFn[] {
  const chain: ProviderFn[] = [];
  if (OPENROUTER_API_KEY) {
    chain.push({ label: `openrouter:${OPENROUTER_MODEL}`, call: (m, t, mt, j) => openRouterCall(m, OPENROUTER_MODEL, t, mt, j) });
  }
  if (GROQ_API_KEY) {
    chain.push({ label: `groq:${GROQ_MODEL}`, call: (m, t, mt, j) => groqCall(m, GROQ_MODEL, t, mt, j) });
  }
  if (GEMINI_API_KEY) {
    chain.push({ label: `gemini:${GEMINI_MODEL}`, call: (m, t, mt, j) => geminiCall(m, t, mt, j) });
  }
  if (MISTRAL_API_KEY) {
    chain.push({ label: `mistral:${MISTRAL_MODEL}`, call: (m, t, mt, j) => mistralCall(m, MISTRAL_MODEL, t, mt, j) });
  }
  if (CEREBRAS_API_KEY) {
    // Best-effort last resort — card-gated as of Aug 2026, see PROVIDER STATUS.
    chain.push({ label: `cerebras:${CEREBRAS_MODEL}`, call: (m, t, mt, j) => cerebrasCall(m, CEREBRAS_MODEL, t, mt, j) });
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
  const jsonMessages = messages.some((message) => /\bjson\b/i.test(message.content))
    ? messages
    : [
        {
          role: "system" as const,
          content: "Return only valid JSON. Do not include markdown or prose.",
        },
        ...messages,
      ];
  const text = await callModel(jsonMessages, { ...options, jsonMode: true });
  const clean = sanitizeModelOutput(text);
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  const json = start >= 0 && end > start ? clean.slice(start, end + 1) : clean;
  try {
    return sanitizeParsedValue(JSON.parse(json) as T);
  } catch {
    // Provider returned non-JSON despite json_mode — treat as exhausted chain.
    throw new Error(
      `callModelJSON: failed to parse provider response as JSON. Raw (truncated): ${clean.slice(0, 120)}`
    );
  }
                             }
