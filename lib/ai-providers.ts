/**
 * lib/ai-providers.ts
 *
 * Multi-provider rotation with automatic fallback.
 *
 * Provider priority per role:
 *
 * FAST (Generator, Refiner, Parser):
 *   1. Groq — llama-3.3-70b-versatile
 *   2. Cerebras — llama-3.3-70b (same model, different infra, free)
 *   3. Groq — llama-4-maverick (different model, avoids same rate limit bucket)
 *
 * REASONING (Critic, Verifier):
 *   1. Groq — deepseek-r1-distill-llama-70b
 *   2. Cerebras — deepseek-r1-distill-llama-70b
 *   3. Groq — llama-3.3-70b-versatile (graceful degradation)
 *
 * FALLBACK:
 *   1. Gemini 2.0 Flash (if API key present)
 *   2. Cerebras (always free, no card)
 *
 * Rate limit detection:
 *   Any 429 or 503 response triggers immediate rotation to next provider.
 *   No retry on same provider — rotate first, retry never.
 */

export type ModelRole = "fast" | "reasoning" | "fallback";
interface ChatMessage { role: "system" | "user" | "assistant"; content: string; }

// ── Env vars ──────────────────────────────────────────────────────────────────
const GROQ_API_KEY         = process.env.GROQ_API_KEY;
const GROQ_MODEL           = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const GROQ_REASONING_MODEL = process.env.GROQ_REASONING_MODEL || "deepseek-r1-distill-llama-70b";
const CEREBRAS_API_KEY     = process.env.CEREBRAS_API_KEY;
const CEREBRAS_MODEL       = process.env.CEREBRAS_MODEL || "llama-3.3-70b";
const GEMINI_API_KEY       = process.env.GEMINI_API_KEY;
const GEMINI_MODEL         = process.env.GEMINI_MODEL || "gemini-2.0-flash";

// ── Provider call functions ───────────────────────────────────────────────────

async function groqCall(
  messages: ChatMessage[],
  model: string,
  temperature: number,
  maxTokens: number,
  jsonMode: boolean,
): Promise<string> {
  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY not set");
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
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
    throw new Error(`GROQ_${res.status}: ${text.slice(0, 150)}`);
  }
  const body = await res.json();
  const text = body?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Groq empty response");
  return text;
}

async function cerebrasCall(
  messages: ChatMessage[],
  model: string,
  temperature: number,
  maxTokens: number,
  jsonMode: boolean,
): Promise<string> {
  if (!CEREBRAS_API_KEY) throw new Error("CEREBRAS_API_KEY not set");
  const res = await fetch("https://api.cerebras.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CEREBRAS_API_KEY}`,
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
    throw new Error(`CEREBRAS_${res.status}: ${text.slice(0, 150)}`);
  }
  const body = await res.json();
  const text = body?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Cerebras empty response");
  return text;
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
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GEMINI_${res.status}: ${text.slice(0, 150)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini empty response");
  return text;
}

// ── Rate limit detection ──────────────────────────────────────────────────────

function isRateLimitOrUnavailable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("429") ||
    msg.includes("503") ||
    msg.includes("502") ||
    msg.toLowerCase().includes("rate limit") ||
    msg.toLowerCase().includes("decommissioned") ||
    msg.toLowerCase().includes("unavailable")
  );
}

// ── Provider chains per role ──────────────────────────────────────────────────

type ProviderFn = (
  messages: ChatMessage[],
  temperature: number,
  maxTokens: number,
  jsonMode: boolean,
) => Promise<string>;

function getFastChain(): ProviderFn[] {
  const chain: ProviderFn[] = [];
  if (GROQ_API_KEY) {
    chain.push((m, t, mt, j) => groqCall(m, GROQ_MODEL, t, mt, j));
    // Second Groq slot uses a different model to avoid same rate limit bucket
    chain.push((m, t, mt, j) => groqCall(m, "meta-llama/llama-4-maverick-17b-128e-instruct", t, mt, j));
  }
  if (CEREBRAS_API_KEY) {
    chain.push((m, t, mt, j) => cerebrasCall(m, CEREBRAS_MODEL, t, mt, j));
  }
  if (GEMINI_API_KEY) {
    chain.push((m, t, mt, j) => geminiCall(m, t, mt, j));
  }
  return chain;
}

function getReasoningChain(): ProviderFn[] {
  const chain: ProviderFn[] = [];
  if (GROQ_API_KEY) {
    chain.push((m, t, mt, j) => groqCall(m, GROQ_REASONING_MODEL, t, mt, j));
  }
  if (CEREBRAS_API_KEY) {
    // Cerebras also hosts deepseek-r1 distill
    chain.push((m, t, mt, j) => cerebrasCall(m, "deepseek-r1-distill-llama-70b", t, mt, j));
  }
  if (GROQ_API_KEY) {
    // Graceful degradation: fall back to fast model on same provider
    chain.push((m, t, mt, j) => groqCall(m, GROQ_MODEL, t, mt, j));
  }
  if (GEMINI_API_KEY) {
    chain.push((m, t, mt, j) => geminiCall(m, t, mt, j));
  }
  return chain;
}

function getFallbackChain(): ProviderFn[] {
  const chain: ProviderFn[] = [];
  if (GEMINI_API_KEY) {
    chain.push((m, t, mt, j) => geminiCall(m, t, mt, j));
  }
  if (CEREBRAS_API_KEY) {
    chain.push((m, t, mt, j) => cerebrasCall(m, CEREBRAS_MODEL, t, mt, j));
  }
  if (GROQ_API_KEY) {
    chain.push((m, t, mt, j) => groqCall(m, GROQ_MODEL, t, mt, j));
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
    throw new Error("No AI providers configured. Set at least GROQ_API_KEY in your env.");
  }

  const errors: string[] = [];

  for (const provider of chain) {
    try {
      return await provider(messages, temperature, maxTokens, jsonMode);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(msg);
      if (isRateLimitOrUnavailable(err)) {
        console.warn(`[ai-providers] Provider failed (${msg.slice(0, 80)}) — rotating to next`);
        continue; // try next provider
      }
      // Non-rate-limit error — don't rotate, throw immediately
      throw err;
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
  const clean = text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
  return JSON.parse(clean) as T;
}
