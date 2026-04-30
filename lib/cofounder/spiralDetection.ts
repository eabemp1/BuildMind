/**
 * lib/cofounder/spiralDetection.ts
 *
 * CoFounder Core — Module 3A: Spiral Detection
 *
 * Monitors chat input for founder-spiral trigger phrases and activates
 * the Competitor Reframe module immediately. Also tracks repeated avoidance
 * patterns via founderMemory.
 *
 * Builder plan only — requires cofounderCoreDepth.
 */

import { getLimits } from "@/lib/plan";

// ─── Trigger phrase dictionary ────────────────────────────────────────────────
// Ordered by signal strength (highest confidence spiral = first)

const SPIRAL_TRIGGERS: { pattern: RegExp; signal: "competitor" | "motivation" | "avoidance" }[] = [
  // Competitor spiral triggers
  { pattern: /someone (is already|already|just) (doing|built|building|launched|shipped)/i, signal: "competitor" },
  { pattern: /(they already have|there'?s already a) (this|that|something like|an app|a tool|a product)/i, signal: "competitor" },
  { pattern: /what'?s the point/i, signal: "motivation" },
  { pattern: /too late (to|for)/i, signal: "competitor" },
  { pattern: /competitor (just|already|has)/i, signal: "competitor" },
  { pattern: /\b(notion|linear|stripe|figma|vercel|openai|anthropic|google|apple|meta|amazon)\b.{0,40}(already|does this|beat me|built it)/i, signal: "competitor" },
  // Motivation collapse triggers
  { pattern: /i (don'?t|do not) see the point/i, signal: "motivation" },
  { pattern: /why (am i|bother|even)/i, signal: "motivation" },
  { pattern: /nobody (cares|will use|wants)/i, signal: "motivation" },
  { pattern: /this (is|was) a (bad|stupid|dumb|terrible) idea/i, signal: "motivation" },
  { pattern: /i should (just )?give up/i, signal: "motivation" },
  { pattern: /maybe i should (pivot|quit|stop|abandon)/i, signal: "motivation" },
  // Avoidance triggers
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
}

// ─── Detection ────────────────────────────────────────────────────────────────

/**
 * Analyses a chat message for spiral trigger phrases.
 * Returns detection result and suggested module to activate.
 *
 * On free plan: detects but does not activate deep intervention (nudges only).
 * On Builder plan: activates full CoFounder Core response pipeline.
 */
export function detectSpiral(message: string): SpiralDetectionResult {
  for (const { pattern, signal } of SPIRAL_TRIGGERS) {
    if (pattern.test(message)) {
      return {
        detected: true,
        signal,
        matchedPhrase: message.match(pattern)?.[0] ?? undefined,
        suggestedAction:
          signal === "competitor" ? "competitor_reframe" :
          signal === "motivation" ? "motivation_reset" :
          "task_breakdown",
      };
    }
  }
  return { detected: false, signal: null, suggestedAction: null };
}

/**
 * Returns true if the builder plan's deep intervention should activate.
 * Free plan users still get a lightweight nudge — just not the full pipeline.
 */
export function shouldActivateDeepIntervention(): boolean {
  const limits = getLimits();
  return limits.unlimitedAITasks;
}

// ─── Competitor name extraction ───────────────────────────────────────────────

/**
 * Attempts to extract a competitor name or URL from a spiral-triggering message.
 * Used to auto-populate the Competitor Reframe module.
 */
export function extractCompetitorFromMessage(message: string): {
  name?: string;
  url?: string;
} {
  // URL extraction
  const urlMatch = message.match(/https?:\/\/[^\s]+/);
  if (urlMatch) return { url: urlMatch[0] };

  // Named competitor extraction
  const namedPatterns = [
    /(?:like|saw|seen|found|building|launched)\s+([A-Z][a-zA-Z0-9]+(?:\.[a-z]{2,4})?)/,
    /([A-Z][a-zA-Z0-9]+)\s+(?:already|just|is|are|has|have)/,
    /competing with\s+([A-Z][a-zA-Z0-9]+)/i,
  ];

  for (const pattern of namedPatterns) {
    const match = message.match(pattern);
    if (match?.[1]) return { name: match[1] };
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
    const signals: AvoidanceSignal[] = JSON.parse(
      localStorage.getItem(AVOIDANCE_TRACK_KEY) ?? "[]"
    );
    const now = new Date().toISOString();
    const existing = signals.find(s => s.task.toLowerCase() === task.toLowerCase());
    if (existing) {
      existing.count += 1;
      existing.lastSeen = now;
    } else {
      signals.push({ task, count: 1, firstSeen: now, lastSeen: now });
    }
    localStorage.setItem(AVOIDANCE_TRACK_KEY, JSON.stringify(signals));
  } catch {
    // silently fail — non-critical
  }
}

export function getAvoidanceSignals(): AvoidanceSignal[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(AVOIDANCE_TRACK_KEY) ?? "[]");
  } catch {
    return [];
  }
}

/** Returns tasks that have been on the list for 3+ days uncompleted */
export function getChronicAvoidanceTasks(taskList: { task: string; daysSinceAdded: number }[]): string[] {
  return taskList
    .filter(t => t.daysSinceAdded >= 3)
    .map(t => t.task);
}
