/**
 * lib/ai-providers.ts
 * 
 * Centralised model routing for all AI calls in BuildMind.
 * 
 * Model assignment:
 *   FAST model    → llama-3.3-70b-versatile (Groq)
 *                   Used for: Generator, Refiner, Input Parser, all high-volume calls
 *   REASONING model → qwen-qwq-32b (Groq)
 *                   Used for: Critic (Stage 4), Verifier (Stage 5)
 *                   These stages need to catch weak logic — stronger reasoning matters
 *   FALLBACK model  → gemini-2.0-flash (Google)
 *                   Used when Groq rate limits or errors. Automatic fallback.
 */

const GROQ_API_KEY = process.env.GROQ_API_KEY!;
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const GROQ_REASONING_MODEL = process.env.GROQ_REASONING_MODEL || "qwen-qwq-32b";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

export type ModelRole = "fast" | "reasoning" | "fallback";

interface ChatMessage { role: "system" | "user" | "assistant"; content: string; }

// ── Groq call ────────────────────────────────────────────────────────────────

async function groqProviderCall(
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

  if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text().then(t => t.slice(0, 200))}`);
  const body = await res.json();
  const text = body?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Groq returned empty response");
  return text;
}

// ── Gemini call ──────────────────────────────────────────────────────────────

async function geminiProviderCall(
  messages: ChatMessage[],
  temperature: number,
  maxTokens: number,
  jsonMode: boolean,
): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");

  // Convert messages to Gemini format
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
  };

  if (systemMsg) {
    body.systemInstruction = { parts: [{ text: systemMsg }] };
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text().then(t => t.slice(0, 200))}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned empty response");
  return text;
}

// ── Main routing function ────────────────────────────────────────────────────

/**
 * callModel — routes to the correct provider based on role.
 * Automatically falls back to Gemini if Groq fails (rate limit or error).
 * 
 * @param role    "fast" = llama-3.3-70b | "reasoning" = qwen-qwq-32b | "fallback" = gemini
 * @param jsonMode  If true, enforces JSON output mode
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

  // Direct fallback path
  if (role === "fallback") {
    return geminiProviderCall(messages, temperature, maxTokens, jsonMode);
  }

  // Groq path (fast or reasoning)
  const model = role === "reasoning" ? GROQ_REASONING_MODEL : GROQ_MODEL;

  try {
    return await groqProviderCall(messages, model, temperature, maxTokens, jsonMode);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    const isRateLimit = msg.includes("429") || msg.toLowerCase().includes("rate limit");
    const isUnavailable = msg.includes("503") || msg.includes("502");

    // Fallback to Gemini on rate limit or service errors
    if ((isRateLimit || isUnavailable) && GEMINI_API_KEY) {
      console.warn(`[ai-providers] Groq ${role} failed (${msg.slice(0, 60)}) — falling back to Gemini`);
      return geminiProviderCall(messages, temperature, maxTokens, jsonMode);
    }

    throw err;
  }
}

/**
 * callModelJSON — convenience wrapper that always uses jsonMode: true
 * and parses the response. Throws if parsing fails.
 */
export async function callModelJSON<T>(
  messages: ChatMessage[],
  options: Omit<Parameters<typeof callModel>[1], "jsonMode"> = {},
): Promise<T> {
  const text = await callModel(messages, { ...options, jsonMode: true });
  // Strip markdown code fences if present (some models add them despite jsonMode)
  const clean = text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
  return JSON.parse(clean) as T;
}
