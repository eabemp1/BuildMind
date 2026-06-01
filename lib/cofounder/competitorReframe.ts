/**
 * lib/cofounder/competitorReframe.ts
 *
 * CoFounder Core — Module 1: Competitor Reframe
 *
 * When a founder pastes a competitor URL or describes a competitor, this module
 * performs real analysis against their project context and returns four structured
 * outputs in under 30 seconds:
 *   1. Their gap — what the competitor is NOT solving for your target user
 *   2. Your differentiator — pulled from project description + stage data
 *   3. Market reframe — recontextualises the competitor as market proof
 *   4. One task — single concrete action to take in the next 20 minutes
 *
 * Also tracks competitor check frequency and flags avoidance patterns.
 */

import { getLimits } from "@/lib/plan";
import { storage } from "@/lib/storage";
import { fetchBehaviorState, persistBehaviorState } from "@/lib/userBehaviorState";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CompetitorReframeInput {
  competitorUrl?: string;
  competitorName?: string;
  projectDescription: string;
  projectStage: string;
  validationReceipts?: ValidationReceipt[];
  founderMemoryContext?: {
    avoidance_zones: string[];
    emotional_signals: { trigger: string; type: string }[];
    personality_tags: string[];
  };
}

export interface CompetitorReframeOutput {
  theirGap: string;
  yourDifferentiator: string;
  marketReframe: string;
  oneTask: string;
  avoidanceFlag?: string; // set if competitor checked 3+ times in a week
  receiptsUsed?: string[]; // which validation receipts were surfaced
}

export interface ValidationReceipt {
  id: string;
  personName: string;
  quote: string;         // what they said
  channel: string;       // "twitter" | "reddit" | "email" | "discord" | "in-person"
  date: string;          // ISO
  problemConfirmed: boolean;
}

export interface CompetitorHistoryEntry {
  name: string;
  url?: string;
  count: number;
  lastSeen: string; // ISO date
}

// ─── Local storage helpers ────────────────────────────────────────────────────

const COMPETITOR_HISTORY_KEY = "bm_competitor_history";
const REFRAME_USAGE_KEY = "bm_reframe_usage"; // { week: "YYYY-Www", count: number }

function getCompetitorHistory(): CompetitorHistoryEntry[] {
  if (typeof window === "undefined") return [];
  return storage.getJSON<CompetitorHistoryEntry[]>(COMPETITOR_HISTORY_KEY, []);
}

function saveCompetitorHistory(history: CompetitorHistoryEntry[]): void {
  if (typeof window === "undefined") return;
  storage.setJSON(COMPETITOR_HISTORY_KEY, history);
  persistBehaviorState({ competitor_history: history });
}

export async function syncCompetitorReframeStateFromServer(): Promise<void> {
  if (typeof window === "undefined") return;
  const values = await fetchBehaviorState<{
    competitor_history: CompetitorHistoryEntry[];
    reframe_usage: { week?: string; count?: number };
  }>(["competitor_history", "reframe_usage"]);
  if (Array.isArray(values.competitor_history)) {
    storage.setJSON(COMPETITOR_HISTORY_KEY, values.competitor_history);
  }
  if (values.reframe_usage && typeof values.reframe_usage === "object") {
    storage.setJSON(REFRAME_USAGE_KEY, values.reframe_usage);
  }
}

function getISOWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

/** Track a competitor lookup and return how many times it's been seen this week */
export function trackCompetitorLookup(name: string, url?: string): number {
  const history = getCompetitorHistory();
  const now = new Date().toISOString();
  const thisWeek = getISOWeek(new Date());

  const existing = history.find(
    h => h.name.toLowerCase() === name.toLowerCase() || (url && h.url === url)
  );

  if (existing) {
    existing.count += 1;
    existing.lastSeen = now;
  } else {
    history.push({ name, url, count: 1, lastSeen: now });
  }
  saveCompetitorHistory(history);

  // Count lookups this week
  const weeklyCount = history
    .filter(h => {
      const entryWeek = getISOWeek(new Date(h.lastSeen));
      return h.name.toLowerCase() === name.toLowerCase() && entryWeek === thisWeek;
    })
    .reduce((sum, h) => sum + h.count, 0);

  return weeklyCount;
}

/** Check if the user has weekly reframe uses remaining (free plan: 3/week) */
export function getReframeUsageThisWeek(): { used: number; limit: number; canUse: boolean } {
  if (typeof window === "undefined") return { used: 0, limit: 3, canUse: false };
  const limits = getLimits();
  const weekLimit = limits.unlimitedAITasks ? -1 : 3;
  if (weekLimit === -1) return { used: 0, limit: -1, canUse: true };

  const thisWeek = getISOWeek(new Date());
  const stored = storage.getJSON<{ week?: string; count?: number }>(REFRAME_USAGE_KEY, {});
  const used = stored.week === thisWeek ? (stored.count ?? 0) : 0;
  return { used, limit: weekLimit, canUse: used < weekLimit };
}

function incrementReframeUsage(): void {
  if (typeof window === "undefined") return;
  const thisWeek = getISOWeek(new Date());
  const stored = storage.getJSON<{ week?: string; count?: number }>(REFRAME_USAGE_KEY, {});
  const currentCount = stored.week === thisWeek ? (stored.count ?? 0) : 0;
  const next = { week: thisWeek, count: currentCount + 1 };
  storage.setJSON(REFRAME_USAGE_KEY, next);
  persistBehaviorState({ reframe_usage: next });
}

// ─── Main reframe call ────────────────────────────────────────────────────────

/**
 * Calls /api/cofounder/reframe and returns structured competitor reframe output.
 * Handles usage gating, avoidance detection, and receipt surfacing.
 */
export async function runCompetitorReframe(
  input: CompetitorReframeInput
): Promise<CompetitorReframeOutput & { gated?: true; usageExhausted?: true }> {
  await syncCompetitorReframeStateFromServer();
  const { canUse } = getReframeUsageThisWeek();
  if (!canUse) {
    return {
      theirGap: "",
      yourDifferentiator: "",
      marketReframe: "",
      oneTask: "",
      usageExhausted: true,
    };
  }

  const competitorLabel = input.competitorName ?? input.competitorUrl ?? "this competitor";
  const weeklyCount = trackCompetitorLookup(competitorLabel, input.competitorUrl);

  const res = await fetch("/api/cofounder/reframe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!res.ok) throw new Error("Reframe API call failed");

  const output: CompetitorReframeOutput = await res.json();
  incrementReframeUsage();

  // Inject avoidance flag if this competitor has been checked 3+ times this week
  if (weeklyCount >= 3) {
    output.avoidanceFlag = `You've checked ${competitorLabel} ${weeklyCount} times this week. That's not research — that's avoidance. What are you actually afraid of right now?`;
  }

  // Surface validation receipts
  if (input.validationReceipts?.length) {
    const confirmedReceipts = input.validationReceipts.filter(r => r.problemConfirmed);
    output.receiptsUsed = confirmedReceipts.map(r => `${r.personName}: "${r.quote}"`);
  }

  return output;
}
