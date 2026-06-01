/**
 * lib/cofounder/blueprintMode.ts
 *
 * CoFounder Core — Module 4: Blueprint Mode
 *
 * Reframes competitor research from a spiral trigger into a structured
 * intelligence session. Extends BreakMyStartupAnalysis (lib/api.ts) with
 * a founder-oriented "steal / skip / next move" framing.
 *
 * Consumes BreakMyStartupAnalysis.competitors[] directly — no changes to api.ts.
 * Basic steal/skip: free plan (1 use per project).
 * Full intelligence (web search + history): Builder plan.
 */

import { getLimits } from "@/lib/plan";
import { storage } from "@/lib/storage";
import { fetchBehaviorState, persistBehaviorState } from "@/lib/userBehaviorState";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Shape of a single competitor entry in BreakMyStartupAnalysis */
export interface BreakMyStartupCompetitor {
  name: string;
  betterAt: string[];
  yourMoat: string;
  successRate?: number;
}

export interface BlueprintIntelligence {
  competitorName: string;
  steal: string[];       // features / positioning / UX patterns worth adapting
  skip: string[];        // where they are overbuilt or solving the wrong version
  nextMove: string;      // one specific thing their existence proves you should do
  marketSignal: string;  // what their traction / funding / user count says about market size
  weakestPoint: string;  // the one gap the founder can attack immediately
}

export interface BlueprintModeResult {
  blueprints: BlueprintIntelligence[];
  overallInsight: string;
  founderAction: string; // single clearest next step across all competitors
}

// ─── Free plan usage tracking ─────────────────────────────────────────────────

const BLUEPRINT_USAGE_KEY = "bm_blueprint_uses"; // { projectId: number }
type BlueprintUses = Record<string, number>;

function getBlueprintUses(): BlueprintUses {
  try {
    return JSON.parse(storage.get(BLUEPRINT_USAGE_KEY) ?? "{}") as BlueprintUses;
  } catch {
    return {};
  }
}

export async function syncBlueprintUsesFromServer(): Promise<BlueprintUses> {
  if (typeof window === "undefined") return {};
  const values = await fetchBehaviorState<{ blueprint_uses: BlueprintUses }>(["blueprint_uses"]);
  if (values.blueprint_uses && typeof values.blueprint_uses === "object") {
    storage.set(BLUEPRINT_USAGE_KEY, JSON.stringify(values.blueprint_uses));
    return values.blueprint_uses;
  }
  return getBlueprintUses();
}

export function getBlueprintUsesForProject(projectId: string): number {
  if (typeof window === "undefined") return 0;
  return getBlueprintUses()[projectId] ?? 0;
}

export function canUseBlueprintMode(projectId: string): boolean {
  const limits = getLimits();
  if (limits.unlimitedAITasks) return true; // builder — unlimited
  return getBlueprintUsesForProject(projectId) < 1; // free — 1 per project
}

function incrementBlueprintUse(projectId: string): void {
  if (typeof window === "undefined") return;
  const stored = getBlueprintUses();
  stored[projectId] = (stored[projectId] ?? 0) + 1;
  storage.set(BLUEPRINT_USAGE_KEY, JSON.stringify(stored));
  persistBehaviorState({ blueprint_uses: stored });
}

// ─── Core transformer ─────────────────────────────────────────────────────────

/**
 * Transforms BreakMyStartupAnalysis competitor data into Blueprint Mode output.
 * Free plan: runs locally against existing competitor data (no extra API call).
 * Builder plan: calls /api/cofounder/blueprint for AI-enriched intelligence
 *               with web search and competitor tracking history.
 */
export async function runBlueprintMode(
  projectId: string,
  competitors: BreakMyStartupCompetitor[],
  projectDescription: string,
  projectStage: string,
): Promise<BlueprintModeResult & { gated?: true }> {
  await syncBlueprintUsesFromServer();
  if (!canUseBlueprintMode(projectId)) {
    return {
      blueprints: [],
      overallInsight: "",
      founderAction: "",
      gated: true,
    };
  }

  const limits = getLimits();

  if (limits.unlimitedAITasks) {
    // Builder plan: full AI intelligence with web search
    const res = await fetch("/api/cofounder/blueprint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, competitors, projectDescription, projectStage }),
    });
    if (!res.ok) throw new Error("Blueprint Mode API failed");
    incrementBlueprintUse(projectId);
    return res.json();
  }

  // Free plan: local transformation of BreakMyStartup data
  const blueprints: BlueprintIntelligence[] = competitors.map(c => ({
    competitorName: c.name,
    steal: c.betterAt.slice(0, 2).map(b => `Adapt their approach to: ${b}`),
    skip: [
      `Skip replicating their ${c.betterAt[c.betterAt.length - 1] ?? "core feature"} — they've over-invested there`,
    ],
    nextMove: `Lean into your moat: ${c.yourMoat}`,
    marketSignal: `${c.name} existing proves this market has real demand. You don't need to create the category — just win a segment.`,
    weakestPoint: c.yourMoat,
  }));

  const founderAction = blueprints[0]
    ? `Start with: ${blueprints[0].nextMove}`
    : "Define your single differentiator before your next build session.";

  incrementBlueprintUse(projectId);

  return {
    blueprints,
    overallInsight: `${competitors.length} competitor(s) analysed. Their existence is proof of market demand — not a threat to your idea.`,
    founderAction,
  };
}
