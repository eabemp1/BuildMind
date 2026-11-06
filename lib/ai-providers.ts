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
 *                / 8,000 TPM / 200,000 TPD; qwen/qwen3.8-27b is a SEPARATE
 *                bucket. Because these are independent buckets, using both
 *                models (not just falling back to the second one after the
 *                first fails) roughly doubles the effective free daily
 *                token budget — see getFastChain() below.
 *                FIX (Sept 2026): llama-3.3-70b-versatile (shutdown
 *                08/16/26) and qwen/qwen3-32b (shutdown 07/17/26) were both
 *                decommissioned by Groq — see console.groq.com/docs/deprecations.
 *                Both hardcoded second-bucket slots below now use
 *                qwen/qwen3.8-27b, Groq's listed replacement for the old
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
 *   2. Groq — qwen/qwen3.8-27b (separate free-tier token bucket, not just a fallback)
 *   3. OpenRouter — openrouter/free (auto-routing free model, no pinned slug to rot)
 *   4. Mistral — mistral-small-latest (free "Experiment" tier, no card)
 *   5. Gemini Flash (best-effort — see PROVIDER STATUS above)
 *   6. Cerebras — gpt-oss-120b (best-effort — card-gated as of Aug 2026, see above)
 *
 * REASONING (Critic, Verifier — Stages 4 & 5 of Reflexion loop):
 *   1. Groq — openai/gpt-oss-120b  (native CoT, reasoning_effort=high, free)
 *   2. Mistral — mistral-small-latest (TEMPORARY, see FIX in getReasoningChain()
 *      below — moved ahead of OpenRouter/Gemini on 09/03/26 because both are
 *      currently failing every reasoning call in production logs; move back
 *      once they're confirmed working again)
 *   3. OpenRouter — openrouter/free
 *   4. Gemini Flash (best-effort)
 *   5. Groq — qwen/qwen3.8-27b     (strong math/logic, free, separate bucket)
 *   6. Cerebras — gpt-oss-120b (best-effort)
 *
 * FALLBACK:
 *   1. OpenRouter — openrouter/free
 *   2. Groq — openai/gpt-oss-120b
 *   3. Gemini Flash (best-effort)
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
// Default is Gemini 3.8 Flash. GEMINI_MODEL in Vercel overrides it (swap models there, no code change).
const GEMINI_MODEL         = process.env.GEMINI_MODEL || "gemini-3.8-flash";
// Pages that ask for Gemini first (callModel `prefer: "gemini"`). Today never does.
// Set GEMINI_PREFERRED=off to switch the preference off without a deploy of code.
// Gemini models tried in order, so a busy one hands over to the next. GEMINI_MODEL leads;
// GEMINI_FALLBACK_MODELS (comma separated) follows. Set it empty to use only GEMINI_MODEL.
const GEMINI_MODELS = Array.from(new Set([
  GEMINI_MODEL,
  ...(process.env.GEMINI_FALLBACK_MODELS ?? "gemini-3.6-flash").split(",").map((m) => m.trim()).filter(Boolean),
]));
// A model that just answered 503 is skipped for a while, so the next request does not pay for it again.
// Lives in memory per server instance: it is a shortcut, not shared state.
const geminiCooldown = new Map<string, number>();
const GEMINI_COOLDOWN_MS = 90_000;
const GEMINI_PREFERRED     = (process.env.GEMINI_PREFERRED ?? "on").toLowerCase() !== "off";
// Gemini 3.x thinks deeply by default, which is what causes its slow replies. "low" keeps the
// reasoning but caps the time. Allowed: low | medium | high. Override with GEMINI_THINKING_LEVEL.
const GEMINI_THINKING_LEVEL = (["low", "medium", "high"].includes((process.env.GEMINI_THINKING_LEVEL ?? "").toLowerCase())
  ? (process.env.GEMINI_THINKING_LEVEL as string).toLowerCase()
  : "low");

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

// FIX (Sept 3, 2026): production logs (Vercel function export,
// 2026-09-03T08-48-40) showed the OpenRouter free-router leg alone taking
// the full 20s to fail ("The operation was aborted due to timeout") inside
// a route hard-capped at maxDuration=30 (see today-action/route.ts and
// today-action/stream/route.ts). With Gemini currently 404ing outright and
// Groq/OpenRouter both unreliable for the reasoning role, a full rotation
// through 4-5 legs at 20s each could exceed the 30s ceiling on its own —
// confirmed in the same log export: one request hit
// "Vercel Runtime Timeout Error: Task timed out after 30 seconds" after
// OpenRouter alone ate 20 of those seconds, and a "successful" request
// still took 21.8s. 8s per leg lets a full 5-leg rotation finish in <=40s
// worst case while still giving a real provider time to respond — tune
// down further if 504s persist, but don't go so low that a slow-but-live
// provider (any provider under real production load, not a dead endpoint)
// gets cut off before it can succeed.
const PROVIDER_TIMEOUT_MS = 8000;

const cerebrasClient = CEREBRAS_API_KEY
  ? new Cerebras({ apiKey: CEREBRAS_API_KEY, timeout: PROVIDER_TIMEOUT_MS, maxRetries: 0 })
  : null;

export function getAIProviderStatus() {
  return {
    fast: [
      GROQ_API_KEY ? { provider: "groq", model: GROQ_MODEL, configured: true } : null,
      GROQ_API_KEY ? { provider: "groq", model: "qwen/qwen3.8-27b", configured: true } : null,
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
      GROQ_API_KEY ? { provider: "groq", model: "qwen/qwen3.8-27b", configured: true } : null,
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

/**
 * checkAllProviders — real, live health check.
 *
 * RESTORED (Sept 21, 2026): this function was dropped from a prior deploy
 * because it only ever existed in an earlier session's delivered output,
 * not in this repo — a sandbox reset meant the file handed over next time
 * was reconstructed from the original source and silently didn't include
 * it, breaking app/api/admin/ai-provider-status/route.ts's import at build
 * time. Restoring it here, in the repo itself this time, specifically so
 * this can't happen again the same way.
 *
 * getAIProviderDiagnostics() above only checks whether an API key env var
 * is SET — not whether the provider is actually reachable right now. This
 * function bypasses the rotation chains and calls every configured
 * provider directly, in parallel, so one dead leg can't hide behind an
 * earlier one succeeding.
 *
 * maxTokens is 120, not the 8 this function originally shipped with — 8
 * was too small for reasoning-capable models (gpt-oss, whatever
 * "openrouter/free" currently routes to) and produced false-negative
 * "empty response" results purely from the health check itself, not from
 * the provider actually being down. 120 matches the budget the
 * pre-existing /api/ai/provider-test route already used successfully.
 *
 * Costs a handful of real tokens per call — run on demand, never on a hot
 * path.
 */
export interface ProviderHealth {
  provider: string;
  model: string;
  configured: boolean;
  ok: boolean;
  latencyMs: number | null;
  error: string | null;
}

export async function checkAllProviders(): Promise<ProviderHealth[]> {
  const ping: ChatMessage[] = [{ role: "user", content: "Reply with exactly: ok" }];

  async function probe(
    provider: string,
    model: string,
    configured: boolean,
    fn: () => Promise<string>,
  ): Promise<ProviderHealth> {
    if (!configured) return { provider, model, configured: false, ok: false, latencyMs: null, error: "not configured" };
    const start = Date.now();
    try {
      await fn();
      return { provider, model, configured: true, ok: true, latencyMs: Date.now() - start, error: null };
    } catch (err) {
      return {
        provider, model, configured: true, ok: false,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message.slice(0, 200) : "unknown error",
      };
    }
  }

  const results = await Promise.all([
    probe("groq", GROQ_MODEL, Boolean(GROQ_API_KEY), () => groqCall(ping, GROQ_MODEL, 0, 120, false)),
    probe("groq", "qwen/qwen3.8-27b", Boolean(GROQ_API_KEY), () => groqCall(ping, "qwen/qwen3.8-27b", 0, 120, false)),
    probe("openrouter", OPENROUTER_MODEL, Boolean(OPENROUTER_API_KEY), () => openRouterCall(ping, OPENROUTER_MODEL, 0, 120, false)),
    probe("mistral", MISTRAL_MODEL, Boolean(MISTRAL_API_KEY), () => mistralCall(ping, MISTRAL_MODEL, 0, 120, false)),
    probe("gemini", GEMINI_MODEL, Boolean(GEMINI_API_KEY), () => geminiCall(ping, 0, 120, false)),
    probe("cerebras", CEREBRAS_MODEL, Boolean(CEREBRAS_API_KEY), () => cerebrasCall(ping, CEREBRAS_MODEL, 0, 120, false)),
  ]);

  return results;
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
  reasoningRole = false, // currently unused in this function's body — kept for call-site signature stability; reasoning_effort is now hardcoded to "low" for gpt-oss regardless of role (see FIX #2 below)
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
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: maxTokens,
      ...(useProviderJSONMode ? { response_format: { type: "json_object" } } : {}),
      // FIX (Sept 21, 2026 — production log buildmind-log-export-2026-09-21T11-57-26.csv):
      // gpt-oss's reasoning goes into a SEPARATE `message.reasoning` field, not
      // inline in `content` — and if the model spends its whole max_tokens
      // budget on that reasoning before ever writing to `content`, content
      // comes back genuinely empty. Logged as "Groq empty response" and
      // misread as a Groq outage — it wasn't, this was a real code gap.
      // IMPORTANT: gpt-oss does NOT support reasoning_format at all (Groq's
      // FIX #2 (Sept 23, 2026 — production log buildmind-log-export-2026-09-23,
      // gpt-oss STILL failing with "Groq empty response" even after the
      // include_reasoning:false fix above): that fix addressed the wrong
      // lever. include_reasoning controls whether reasoning tokens are
      // DISPLAYED in the response — it does not stop the model from
      // SPENDING max_tokens budget on reasoning internally before ever
      // writing to `content`. Found the real fix via a different project
      // that hit this exact bug from the exact same root cause (Groq
      // retiring llama-3.3-70b-versatile on 08/16/26, gpt-oss-120b as the
      // reasoning-model replacement): their fix was lowering
      // reasoning_effort itself, not hiding the output. finish_reason:
      // "length" with the entire token budget shown as reasoning_tokens
      // and empty content is the exact signature of this failure — the
      // model runs out of budget while still reasoning, never reaches the
      // answer. "low" leaves enough headroom for content at the maxTokens
      // levels this app actually uses (300-700); "medium"/"high" were
      // eating that budget on internal reasoning before any of these
      // prompts (which don't need deep reasoning — they're mostly
      // structured extraction/evaluation tasks) got a chance to answer.
      // include_reasoning:false is kept — it's still correct to exclude
      // reasoning content from the payload, it just wasn't the actual fix.
      ...(needsReasoningHidden ? { reasoning_format: "hidden" } : {}),
      ...(isGptOss ? { reasoning_effort: "low", include_reasoning: false } : {}),
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

export interface GeminiOptions {
  /** Thinking tier. Defaults to GEMINI_THINKING_LEVEL ("low"). */
  thinking?: "low" | "medium" | "high";
  /** Per-attempt timeout. Defaults to PROVIDER_TIMEOUT_MS. */
  timeoutMs?: number;
  /** Images attached to the last user message (base64, no data: prefix). Gemini only. */
  images?: Array<{ mimeType: string; data: string }>;
}

async function geminiCall(
  messages: ChatMessage[],
  temperature: number,
  maxTokens: number,
  jsonMode: boolean,
  opts: GeminiOptions = {},
): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");
  const systemMsg = messages.find(m => m.role === "system")?.content ?? "";
  const userMessages = messages.filter(m => m.role !== "system");
  const lastUser = userMessages.map((m) => m.role).lastIndexOf("user");
  const contents = userMessages.map((m, i) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [
      { text: m.content },
      ...(i === lastUser && opts.images?.length ? opts.images.map((img) => ({ inlineData: { mimeType: img.mimeType, data: img.data } })) : []),
    ],
  }));
  const timeoutMs = opts.timeoutMs ?? PROVIDER_TIMEOUT_MS;
  const thinkingLevel = opts.thinking ?? GEMINI_THINKING_LEVEL;
  const buildBody = (withThinking: boolean): string => JSON.stringify({
    contents,
    generationConfig: {
      temperature,
      // Thinking tokens count against this cap, so leave room for the answer.
      maxOutputTokens: withThinking ? maxTokens + 1024 : maxTokens,
      ...(jsonMode ? { responseMimeType: "application/json" } : {}),
      ...(withThinking ? { thinkingConfig: { thinkingLevel } } : {}),
    },
    ...(systemMsg ? { systemInstruction: { parts: [{ text: systemMsg }] } } : {}),
  });
  // Try each Gemini model in turn inside ONE shared time budget (timeoutMs). A 503 from Google means
  // "this model is busy", and it rarely clears in under a second, so waiting and retrying the same
  // model only burns the budget. Moving to the next model (its own capacity pool) is the retry.
  const started = Date.now();
  const now = () => Date.now();
  const candidates = GEMINI_MODELS.filter((m) => (geminiCooldown.get(m) ?? 0) <= now());
  if (candidates.length === 0) throw new Error("GEMINI_503: all Gemini models are busy, skipped for now");
  let res: Response | null = null;
  let lastFailure = "";
  for (const model of candidates) {
    const remaining = timeoutMs - (now() - started);
    if (remaining < 1500) break;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
    const send = (withThinking: boolean) =>
      fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: buildBody(withThinking), signal: AbortSignal.timeout(Math.max(1000, timeoutMs - (now() - started))) });
    try {
      let withThinking = true;
      let attempt = await send(withThinking);
      // Older models (2.5) reject thinkingLevel. Ask once with it, and once without if Google says no.
      if (attempt.status === 400) {
        const text = await attempt.text();
        if (/thinking/i.test(text)) { withThinking = false; attempt = await send(withThinking); }
        else throw new Error(`GEMINI_400: ${text.slice(0, 150)}`);
      }
      if ([429, 500, 502, 503, 504].includes(attempt.status)) {
        geminiCooldown.set(model, now() + GEMINI_COOLDOWN_MS);
        lastFailure = `GEMINI_${attempt.status} (${model})`;
        continue;
      }
      if (attempt.status === 404) { // model id not available on this key; do not ask again for a while
        geminiCooldown.set(model, now() + 60 * 60_000);
        lastFailure = `GEMINI_404 (${model})`;
        continue;
      }
      res = attempt;
      break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/abort|timeout/i.test(msg)) geminiCooldown.set(model, now() + 60_000);
      throw err;
    }
  }
  if (!res) throw new Error(`${lastFailure || "GEMINI_503"}: no Gemini model answered in time`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GEMINI_${res.status}: ${text.slice(0, 150)}`);
  }
  const data = await res.json();
  // Exact usage as Google reports it. Thinking tokens bill as output and are what makes a call slow.
  const usage = data?.usageMetadata as { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number } | undefined;
  if (usage) {
    console.info("[ai-cost]", JSON.stringify({
      provider: "gemini", thinking: thinkingLevel,
      promptTokens: usage.promptTokenCount, outputTokens: usage.candidatesTokenCount, thinkingTokens: usage.thoughtsTokenCount,
      exact: true,
    }));
  }
  // Skip thought parts; only the answer is returned.
  const parts = (data?.candidates?.[0]?.content?.parts ?? []) as Array<{ text?: string; thought?: boolean }>;
  const text = parts.filter((p) => !p.thought && typeof p.text === "string").map((p) => p.text).join("");
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
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
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
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
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

/**
 * Slices model output down to its outermost JSON value - object OR array.
 * Looking only for { ... } cut a top-level array "[{a},{b}]" down to "{a},{b}",
 * which never parses, so every provider was rejected in turn.
 */
export function extractJSONText(clean: string): string {
  const firstObj = clean.indexOf("{");
  const firstArr = clean.indexOf("[");
  const isArray = firstArr >= 0 && (firstObj < 0 || firstArr < firstObj);
  const start = isArray ? firstArr : firstObj;
  const end = isArray ? clean.lastIndexOf("]") : clean.lastIndexOf("}");
  return start >= 0 && end > start ? clean.slice(start, end + 1) : clean;
}

function assertValidJSONModeOutput(text: string): void {
  const clean = sanitizeModelOutput(text);
  const json = extractJSONText(clean);
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
    // 08/16/26 (see console.groq.com/docs/deprecations). qwen/qwen3.6-27b was
    // Groq's listed replacement — using it instead of gpt-oss-120b again
    // keeps this a genuinely SEPARATE rate-limit bucket from the line above,
    // preserving the doubled-daily-budget effect this second chain entry
    // exists for in the first place.
    //
    // SECOND FIX (Sept 21, 2026 — production log
    // buildmind-log-export-2026-09-21T11-57-26.csv showed GROQ_404 on this
    // exact model): qwen/qwen3.6-27b was itself deprecated by Groq, in favor
    // of qwen/qwen3.8-27b — same 131K context, same modes, direct successor
    // per Groq's own deprecation docs. Two deprecations of the same slot in
    // about a month is the actual pace of this specific string rotting, not
    // a one-time event — the next time this 404s, check
    // console.groq.com/docs/deprecations again rather than assume something
    // else broke.
    chain.push({ label: "groq:qwen/qwen3.8-27b", call: (m, t, mt, j) => groqCall(m, "qwen/qwen3.8-27b", t, mt, j) });
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
    // gpt-oss-120b with reasoning_effort=high — native CoT, near o4-mini quality.
    // Kept first despite recently failing every reasoning call (see FIX below)
    // because its own failure is fast (~2-3s, not a timeout) — cheap to try,
    // and picks the best model automatically the moment Groq's reasoning path
    // recovers, with no code change needed. As of Sept 23, 2026 this should
    // actually start succeeding again — see the reasoning_effort fix in
    // groqCall above (it was burning its whole token budget on internal
    // reasoning before ever writing an answer; lowered to "low").
    chain.push({ label: `groq:${GROQ_REASONING_MODEL}`, call: (m, t, mt, j) => groqCall(m, GROQ_REASONING_MODEL, t, mt, j, true) });

    // FIX (Sept 23, 2026 — production log buildmind-log-export-2026-09-23):
    // moved qwen up from 5th to 2nd position. Mistral was placed ahead of
    // OpenRouter/Gemini on Sept 3 because it was, at that time, the only leg
    // succeeding on every logged call — that assessment is now stale and
    // actively counterproductive. Today's log shows Mistral persistently
    // rate-limited, OpenRouter alternating between empty response and an
    // ~8-20s timeout, and Gemini hard-404ing (env var still pointing at a
    // retired model, unresolved — see PROVIDER STATUS at top of file) — on
    // EVERY single attempt, both times this chain ran. Meanwhile
    // groq:qwen/qwen3.8-27b succeeded on every attempt in that same log.
    // Every stage was burning 6-10 seconds fighting through three
    // consistently-dead legs before reaching the one that actually works —
    // directly responsible for the shared request deadline running out
    // before a 3rd sequential stage could even start. This is the same
    // "respond to current reality, not a permanent ranking" pattern as the
    // Sept 3 reorder below — re-check next time any of Mistral/OpenRouter/
    // Gemini are confirmed reliable again, don't leave qwen pinned here
    // out of habit once the picture changes.
    chain.push({ label: "groq:qwen/qwen3.8-27b", call: (m, t, mt, j) => groqCall(m, "qwen/qwen3.8-27b", t, mt, j, true) });
  }
  // FIX (Sept 3, 2026): production logs (Vercel function export,
  // 2026-09-03T08-48-40) show OpenRouter's free-router and direct Gemini
  // BOTH currently failing on every single reasoning call — OpenRouter with
  // either an empty response or (worse) a ~20s hang before erroring, Gemini
  // with a hard 404 (gemini-2.0-flash was shut down by Google 06/01/26; fix
  // the GEMINI_MODEL env var separately). Mistral is the only leg that has
  // succeeded on every logged reasoning call. Moved ahead of both broken
  // legs so a real request doesn't pay their failure cost every time —
  // reorder back once OpenRouter/Gemini are confirmed working again, this
  // is a response to their CURRENT breakage, not a permanent quality
  // ranking (gpt-oss-120b/OpenRouter's critic diversity are still the
  // better choice when actually reachable).
  //
  // STILL HERE, still worth trying, now 3rd/4th/5th rather than 2nd — see
  // the Sept 23 fix above for why qwen jumped ahead of all three of these.
  if (MISTRAL_API_KEY) {
    chain.push({ label: `mistral:${MISTRAL_MODEL}`, call: (m, t, mt, j) => mistralCall(m, MISTRAL_MODEL, t, mt, j) });
  }
  // CRITIC DIVERSITY: gpt-oss critiquing gpt-oss shares blind spots — a model
  // rarely catches its own failure modes. OpenRouter's free-router is a
  // genuinely different architecture/training lineage and requires NO credit card
  // (unlike Google AI Studio's direct API, which now gates free Gemini behind
  // billing in many regions, and unlike Cerebras, which now requires a card at
  // all as of Aug 2026). This is the real diversity source for Critic/Verifier
  // — demoted below Mistral (and now qwen) only while it's actively broken.
  if (OPENROUTER_API_KEY) {
    chain.push({ label: `openrouter:${OPENROUTER_MODEL}`, call: (m, t, mt, j) => openRouterCall(m, OPENROUTER_MODEL, t, mt, j) });
  }
  // Direct Gemini — best-effort, see PROVIDER STATUS at top of file.
  if (GEMINI_API_KEY) {
    chain.push({ label: `gemini:${GEMINI_MODEL}`, call: (m, t, mt, j) => geminiCall(m, t, mt, j) });
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
    /**
     * Absolute deadline (Date.now()-style timestamp), not a duration. Lets a
     * caller making several sequential callModel invocations in one request
     * (today-action/stream/route.ts's Agent A → Critic → Refiner) share ONE
     * real time budget instead of each call getting its own fresh allowance
     * — see the FIX comment below for why that distinction turned out to
     * matter in practice, not just in theory.
     */
    deadlineMs?: number;
    /**
     * Try Gemini first, then the normal chain. For pages where depth matters more than speed
     * (Break My Startup, AI Coach). Never set on Today. Ignored when Gemini is not configured
     * or GEMINI_PREFERRED=off.
     */
    prefer?: "gemini";
    /** Name of the feature making the call, written to the [ai-cost] log line. Defaults to the role. */
    feature?: string;
    /** Per-attempt Gemini timeout when `prefer` is set. Default and maximum 14s. */
    geminiTimeoutMs?: number;
    geminiThinking?: "low" | "medium" | "high";
  } = {},
): Promise<string> {
  const {
    role = "fast",
    temperature = 0.3,
    maxTokens = 600,
    jsonMode = false,
    deadlineMs,
    prefer,
    feature,
    geminiTimeoutMs: requestedGeminiTimeout = 14_000,
    geminiThinking,
  } = options;
  // Hard ceiling: no single Gemini attempt waits longer than 14s, whatever a caller asks for.
  const geminiTimeoutMs = Math.min(requestedGeminiTimeout, 14_000);

  let chain =
    role === "reasoning" ? getReasoningChain() :
    role === "fallback"  ? getFallbackChain()  :
    getFastChain();

  const geminiFirst = prefer === "gemini" && GEMINI_PREFERRED && Boolean(GEMINI_API_KEY);
  if (geminiFirst) {
    // Gemini leads with its own longer timeout; its normal slot in the chain is dropped so a slow
    // Gemini is not tried twice.
    chain = [
      { label: `gemini:${GEMINI_MODEL}`, call: (m, t, mt, j) => geminiCall(m, t, mt, j, { timeoutMs: geminiTimeoutMs, thinking: geminiThinking }) },
      ...chain.filter((p) => !p.label.startsWith("gemini:")),
    ];
  }

  if (chain.length === 0) {
    const diagnostics = getAIProviderDiagnostics();
    throw new Error(
      `No AI providers configured for role "${role}". Set at least one provider env var: ${diagnostics.missingEnv.join(", ")}.`,
    );
  }

  const errors: string[] = [];
  const callStartedAt = Date.now();

  // FIX (Sept 21, 2026 — production log buildmind-log-export-2026-09-21T11-57-26.csv
  // showed "Vercel Runtime Timeout Error: Task timed out after 30 seconds"):
  // this loop previously had no awareness of wall-clock time at all — it would
  // keep trying every remaining chain entry regardless of how much time had
  // already been spent on earlier failures. With up to 6 providers in a chain
  // and an 8s PROVIDER_TIMEOUT_MS each, a bad run (several slow-failing legs
  // in a row — OpenRouter in particular can hang near its full timeout before
  // erroring, per that provider's own comment above) could exceed 30 seconds
  // on its OWN, before even accounting for Today's action-generation flow
  // calling this three times in sequence (Agent A, Critic, Refiner).
  //
  // FIX #2 (Sept 22, 2026 — CONFIRMED in production, not just a theoretical
  // risk): the first version of this fix gave every callModel invocation its
  // own fresh 9s budget. Today's real logs showed exactly the gap that left
  // open — individual providers failed fast, the loop reached Groq's qwen
  // model near the end of the reasoning chain, and the FUNCTION was killed
  // by Vercel's 30s limit before that attempt could return, because three
  // separately-budgeted 9s stages still summed past what was actually left.
  // A caller can now pass an absolute deadlineMs, computed ONCE at the start
  // of the whole request and threaded through all three sequential calls, so
  // stage 2 knows how much time stage 1 actually used rather than assuming a
  // fresh allowance it may not really have. Falls back to a fresh 9s budget
  // when no deadline is passed, so existing single-call callers are
  // unaffected.
  // A Gemini-first call gets its own timeout on top, so a slow Gemini cannot use up the time the
  // fallback providers need.
  const effectiveDeadline = deadlineMs ?? (Date.now() + 9000 + (geminiFirst ? geminiTimeoutMs : 0));

  for (const provider of chain) {
    if (Date.now() >= effectiveDeadline) {
      console.warn(`[ai-providers] ${role} call deadline reached before trying ${provider.label} — stopping early rather than risk the function timeout`);
      break;
    }
    try {
      // With an explicit shared deadline, a provider call may not outlive it.
      // Without this a call started at 23s of a 24s budget could still run its
      // own 8s timeout and push the function past Vercel's 30s kill.
      let text: string;
      if (deadlineMs !== undefined) {
        const remaining = Math.max(500, effectiveDeadline - Date.now());
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          text = await Promise.race([
            provider.call(messages, temperature, maxTokens, jsonMode),
            new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("deadline reached mid-call")), remaining); }),
          ]);
        } finally { if (timer) clearTimeout(timer); }
      } else {
        text = await provider.call(messages, temperature, maxTokens, jsonMode);
      }
      if (jsonMode) assertValidJSONModeOutput(text);
      console.info(`[ai-providers] ${role} succeeded via ${provider.label}`);
      // One line per call, so Vercel logs can answer "which feature costs what". Token counts are
      // estimates (characters / 4); Gemini also logs its own exact usage figures.
      console.info("[ai-cost]", JSON.stringify({
        feature: feature ?? role,
        provider: provider.label,
        ms: Date.now() - callStartedAt,
        approxInTokens: Math.round(messages.reduce((n, m) => n + m.content.length, 0) / 4),
        approxOutTokens: Math.round(text.length / 4),
        estimate: true,
      }));
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
  const json = extractJSONText(clean);
  try {
    return sanitizeParsedValue(JSON.parse(json) as T);
  } catch {
    // Provider returned non-JSON despite json_mode — treat as exhausted chain.
    throw new Error(
      `callModelJSON: failed to parse provider response as JSON. Raw (truncated): ${clean.slice(0, 120)}`
    );
  }
      }

/** One image-reading call to an OpenAI-compatible endpoint (Groq, OpenRouter). Returns the text or throws. */
async function visionChatCall(
  url: string, key: string, model: string, prompt: string,
  images: Array<{ mimeType: string; data: string }>, maxTokens: number, timeoutMs: number,
  opts: { json: boolean; headers?: Record<string, string> },
): Promise<string> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, ...(opts.headers ?? {}) },
    body: JSON.stringify({
      model, temperature: 0.3, max_tokens: maxTokens,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      messages: [{ role: "user", content: [{ type: "text", text: prompt }, ...images.map((i) => ({ type: "image_url", image_url: { url: `data:${i.mimeType};base64,${i.data}` } }))] }],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`vision ${model}: HTTP ${res.status}`);
  const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const out = j.choices?.[0]?.message?.content;
  if (!out) throw new Error(`vision ${model}: empty response`);
  return out;
}

/**
 * geminiVisionJSON — read images and answer in JSON. Gemini first (capped at 10 seconds when a fallback key is set,
 * otherwise 14). If Gemini fails (for example a 503), it tries Groq's vision model, then an OpenRouter free vision
 * model, each only when its key is set. Models are set with GROQ_VISION_MODEL and OPENROUTER_VISION_MODEL.
 * Throws if every reader fails, so the caller must handle that.
 */
export async function geminiVisionJSON<T>(
  prompt: string,
  images: Array<{ mimeType: string; data: string }>,
  options: { maxTokens?: number; timeoutMs?: number } = {},
): Promise<T> {
  const maxTokens = options.maxTokens ?? 1400;
  const hasFallback = Boolean(GROQ_API_KEY || OPENROUTER_API_KEY);
  const readers: Array<() => Promise<string>> = [
    () => geminiCall([{ role: "user", content: prompt }], 0.3, maxTokens, true, { images, timeoutMs: Math.min(options.timeoutMs ?? 14_000, hasFallback ? 10_000 : 14_000) }),
  ];
  if (GROQ_API_KEY) {
    readers.push(() => visionChatCall("https://api.groq.com/openai/v1/chat/completions", GROQ_API_KEY, process.env.GROQ_VISION_MODEL?.trim() || "qwen/qwen3.8-27b", prompt, images, maxTokens, 7_000, { json: true }));
  }
  if (OPENROUTER_API_KEY) {
    readers.push(() => visionChatCall("https://openrouter.ai/api/v1/chat/completions", OPENROUTER_API_KEY, process.env.OPENROUTER_VISION_MODEL?.trim() || "google/gemma-4-26b-a4b-it:free", prompt, images, maxTokens, 7_000, {
      json: false,
      headers: { "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://buildmind.live", "X-Title": "BuildMind" },
    }));
  }
  let lastErr: unknown = null;
  for (const read of readers) {
    try {
      const clean = sanitizeModelOutput(await read());
      return sanitizeParsedValue(JSON.parse(extractJSONText(clean)) as T);
    } catch (err) {
      lastErr = err; // 503, timeout or unreadable output: try the next reader
    }
  }
  throw new Error(`geminiVisionJSON: every image reader failed. Last error: ${lastErr instanceof Error ? lastErr.message.slice(0, 120) : "unknown"}`);
}
