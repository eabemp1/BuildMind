/**
 * lib/cofounder/spiralDetection.ts
 *
 * CoFounder Core — Module 3A: Spiral Detection  (AI Improvement #1)
 *
 * V2: Hybrid approach — regex fast-path for the 16 known high-confidence
 * phrases, then an LLM pre-classifier for everything that regex misses.
 *
 * The LLM classifier is a lightweight ~50-token call that catches nuanced
 * spiral signals regex cannot: "I've been sitting on this for weeks",
 * "I'm questioning whether to continue", "Maybe this isn't going to work".
 *
 * Cost: ~50 input + ~10 output tokens per Coach message where regex misses.
 * Latency: fires in parallel with the main pipeline — does not add wall time.
 *
 * Builder plan only — free plan uses regex-only path.
 */

import { getLimits } from "@/lib/plan";
import { storage } from "@/lib/storage";

// ─── Regex fast-path (16 high-confidence patterns) ───────────────────────────

const SPIRAL_TRIGGERS: { pattern: RegExp; signal: "competitor" | "motivation" | "avoidance" }[] = [
  { pattern: /someone (is already|already|just) (doing|built|building|launched|shipped)/i, signal: "competitor" },
  { pattern: /(they already have|there'?s already) (a |an )?(this|that|something like|app|tool|product)/i, signal: "competitor" },
  { pattern: /what'?s the point/i, signal: "motivation" },
  { pattern: /too late (to|for)/i, signal: "competitor" },
  { pattern: /competitor (just|already|has)/i, signal: "competitor" },
  { pattern: /\b(notion|linear|stripe|figma|vercel|openai|anthropic|google|apple|meta|amazon)\b.{0,40}(already|does this|beat me|built it)/i, signal: "competitor" },
  { pattern: /i (don'?t|do not) see the point/i, signal: "motivation" },
  { pattern: /why (am i|bother|even)/i, signal: "motivation" },
  { pattern: /nobody (cares|will use|wants)/i, signal: "motivation" },
  { pattern: /this (is|was) a (bad|stupid|dumb|terrible) idea/i, signal: "motivation" },
  { pattern: /i should (just )?give up/i, signal: "motivation" },
  { pattern: /maybe i should (pivot|quit|stop|abandon)/i, signal: "motivation" },
  { pattern: /i keep (putting off|avoiding|procrastinating|delaying)/i, signal: "avoidance" },
  { pattern: /haven'?t (touched|worked on|opened|started)/i, signal: "avoidance" },
  { pattern: /i'?m stuck (on|at|with)/i, signal: "avoidance" },
  { pattern: /can'?t bring myself to/i, signal: "avoidance" },
];

export type SpiralSignal = "competitor" | "motivation" | "avoidance" | null;

export interface SpiralDetectionResult {
  detected: boolean;
  signal: SpiralSignal;
  matchedPhrase?: string;
  suggestedAction: "competitor_reframe" | "motivation_reset" | "task_breakdown" | null;
  detectedBy: "regex" | "llm" | null;
}

// ─── Regex detection (always runs first — zero latency) ───────────────────────

function detectByRegex(message: string): SpiralDetectionResult | null {
  for (const { pattern, signal } of SPIRAL_TRIGGERS) {
    if (pattern.test(message)) {
      return {
        detected: true,
        signal,
        matchedPhrase: message.match(pattern)?.[0] ?? undefined,
        suggestedAction:
          signal === "competitor" ? "competitor_reframe" :
          signal === "motivation"  ? "motivation_reset"  : "task_breakdown",
        detectedBy: "regex",
      };
    }
  }
  return null;
}

// ─── LLM classifier (fires when regex misses — AI Improvement #1) ─────────────

/**
 * classifySpiralWithLLM — lightweight pre-classification call to Groq.
 * ~50 tokens input. Returns { spiral: bool; signal: string | null }.
 * Fires server-side only (API key never exposed to browser).
 *
 * NOTE: call this from the /api/ai/coach route BEFORE the main Reflexion
 * pipeline, in parallel. If it detects a spiral, inject `spiralContext`
 * into the ReflexionContext before the Generator stage.
 */
export async function classifySpiralWithLLM(message: string): Promise<SpiralDetectionResult> {
  // Guard: only meaningful messages need LLM classification
  if (message.trim().length < 8) {
    return { detected: false, signal: null, suggestedAction: null, detectedBy: null };
  }

  try {
    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) throw new Error("No GROQ_API_KEY");

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${groqKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant", // smallest/fastest — classification only
        max_tokens: 20,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You detect founder psychological spiral signals. A spiral signal is when a founder expresses: doubt about whether their idea is viable ("competitor" signal), loss of motivation or purpose ("motivation" signal), or chronic avoidance of a key task ("avoidance" signal).

Reply ONLY with JSON: {"spiral": true/false, "signal": "competitor"|"motivation"|"avoidance"|null}

Examples:
"I've been sitting on this for weeks" → {"spiral":true,"signal":"avoidance"}
"Maybe this isn't going to work" → {"spiral":true,"signal":"motivation"}
"How do I add auth?" → {"spiral":false,"signal":null}
"I'm questioning whether to continue" → {"spiral":true,"signal":"motivation"}`,
          },
          { role: "user", content: message.slice(0, 300) }, // cap at 300 chars
        ],
      }),
      signal: AbortSignal.timeout(3000), // 3s timeout — non-blocking
    });

    if (!res.ok) throw new Error(`Groq ${res.status}`);
    const data = await res.json() as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content ?? "{}";
    let parsed: { spiral?: boolean; signal?: string | null };
    try {
      parsed = JSON.parse(text) as { spiral?: boolean; signal?: string | null };
    } catch {
      // Malformed LLM response — treat as no spiral detected rather than crashing
      // the evening-check worker and dropping the user's notification entirely.
      return { detected: false, signal: null, suggestedAction: null, detectedBy: "llm" };
    }

    if (!parsed.spiral) {
      return { detected: false, signal: null, suggestedAction: null, detectedBy: "llm" };
    }

    const sig = (["competitor", "motivation", "avoidance"].includes(parsed.signal ?? "")
      ? parsed.signal
      : "motivation") as SpiralSignal;

    return {
      detected: true,
      signal: sig,
      suggestedAction:
        sig === "competitor" ? "competitor_reframe" :
        sig === "motivation"  ? "motivation_reset"  : "task_breakdown",
      detectedBy: "llm",
    };
  } catch {
    // LLM classifier failure is non-fatal — fall through to no-detection
    return { detected: false, signal: null, suggestedAction: null, detectedBy: null };
  }
}

// ─── Primary entry point ──────────────────────────────────────────────────────

/**
 * detectSpiral — synchronous, always uses the regex fast-path.
 * Use this for real-time UI checks (e.g. debounced on keyup).
 *
 * For deeper server-side detection, call classifySpiralWithLLM() in parallel
 * with the main Reflexion pipeline in /api/ai/coach/route.ts.
 */
export function detectSpiral(message: string): SpiralDetectionResult {
  return detectByRegex(message) ?? {
    detected: false, signal: null, suggestedAction: null, detectedBy: null,
  };
}

/**
 * detectSpiralFull — async version that runs regex first and falls back to
 * LLM only when regex returns nothing. Use this server-side.
 */
export async function detectSpiralFull(message: string): Promise<SpiralDetectionResult> {
  const regexResult = detectByRegex(message);
  if (regexResult) return regexResult;
  return classifySpiralWithLLM(message);
}

export function shouldActivateDeepIntervention(): boolean {
  const limits = getLimits();
  return limits.unlimitedAITasks;
}

// ─── Competitor name extraction ───────────────────────────────────────────────

export function extractCompetitorFromMessage(message: string): {
  name?: string;
  url?: string;
} {
  const urlMatch = message.match(/https?:\/\/[^\s]+/);
  if (urlMatch) return { url: urlMatch[0] };

  const namedPatterns = [
    /(?:like|saw|seen|found|building|launched)\s+([A-Z][a-zA-Z0-9]+(?:\.[a-z]{2,4})?)/,
    /competing with\s+([A-Z][a-zA-Z0-9]+)/i,
    /([A-Z][a-zA-Z0-9]{2,})\s+(?:already|just|is|are|has|have)/,
  ];

  const COMMON_WORDS = new Set([
    "There", "They", "This", "That", "These", "Those",
    "The", "Our", "Your", "Their", "Its", "My", "His", "Her",
    "What", "When", "Where", "Why", "How", "Who", "Which",
    "Some", "Many", "Most", "Much", "More", "Any", "All",
    "Just", "Also", "Even", "Already", "Still",
  ]);

  for (const pattern of namedPatterns) {
    const match = message.match(pattern);
    if (match?.[1] && !COMMON_WORDS.has(match[1])) return { name: match[1] };
  }

  return {};
}

// ─── Avoidance zone tracker ───────────────────────────────────────────────────

const AVOIDANCE_TRACK_KEY = "bm_avoidance_signals";

interface AvoidanceSignal {
  task: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
}

export function recordAvoidanceSignal(task: string): void {
  if (typeof window === "undefined") return;
  try {
    const signals = storage.getJSON<AvoidanceSignal[]>(AVOIDANCE_TRACK_KEY, []);
    const now = new Date().toISOString();
    const existing = signals.find(s => s.task.toLowerCase() === task.toLowerCase());
    if (existing) {
      existing.count += 1;
      existing.lastSeen = now;
    } else {
      signals.push({ task, count: 1, firstSeen: now, lastSeen: now });
    }
    storage.setJSON(AVOIDANCE_TRACK_KEY, signals);
  } catch {
    // silently fail — non-critical
  }
}

export function getAvoidanceSignals(): AvoidanceSignal[] {
  if (typeof window === "undefined") return [];
  return storage.getJSON<AvoidanceSignal[]>(AVOIDANCE_TRACK_KEY, []);
}

export function getChronicAvoidanceTasks(taskList: { task: string; daysSinceAdded: number }[]): string[] {
  return taskList
    .filter(t => t.daysSinceAdded >= 3)
    .map(t => t.task);
}

