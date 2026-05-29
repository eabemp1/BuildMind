import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/server/logger";

export type PromptId =
  | "reflexion_generator"
  | "reflexion_critic"
  | "reflexion_refiner"
  | "reflexion_rationale"
  | "coach_system"
  | "morning_briefing"
  | "evening_check"
  | "founder_insight"
  | "archetype_classifier"
  | "break_startup_market"
  | "break_startup_competitor"
  | "break_startup_risk";

export interface PromptMetrics {
  quality_pass_rate?: number;
  helpfulness_score?: number;
  specificity_score?: number;
  hallucination_flag_rate?: number;
  session_retention?: number;
  sample_count?: number;
}

export interface PromptVersion {
  id: PromptId;
  version: string;
  text: string;
  author: string;
  notes?: string;
  created_at: string;
  metrics?: PromptMetrics;
}

export interface ActivePrompt {
  id: PromptId;
  version: string;
  text: string;
  notes?: string;
  metrics?: PromptMetrics;
  challenger?: {
    version: string;
    text: string;
    traffic_pct: number;
  };
}

const PROMPT_REGISTRY: Record<PromptId, ActivePrompt> = {
  reflexion_generator: {
    id: "reflexion_generator",
    version: "v1",
    notes: "Baseline extraction from lib/reflexion.ts runReflexionLoop().",
    text: "You are a world-class startup execution consultant with behavioral intelligence about this specific founder.\n{contextBlock}\n{archetypeContext}\n{knowledgeBaseContext}\n{debtContext}\n{additionalInstruction}{newUserInstruction}\nTASK: {task}\nBe specific to this founder's situation. No generic startup advice.",
  },
  reflexion_critic: {
    id: "reflexion_critic",
    version: "v1",
    notes: "Baseline extraction from lib/reflexion.ts critic prompt.",
    text: "{criticPersonaPrompt}\nReject weak advice. Respond in JSON with verdict, reason, and improved_version.\nStage: {stage} | Target users: {targetUsers} | Momentum: {momentumScore}\nAdvice: {generated}",
  },
  reflexion_refiner: {
    id: "reflexion_refiner",
    version: "v1",
    notes: "Baseline extraction from lib/reflexion.ts refiner prompt.",
    text: "You are BuildMind's execution engine. {refinerMode}\nInput: {baseForRefinement}\nCritique: {critique}\nStage: {stage} | Momentum: {momentumScore} | Target users: {targetUsers}",
  },
  reflexion_rationale: {
    id: "reflexion_rationale",
    version: "v1",
    notes: "Baseline extraction from lib/reflexion.ts rationale prompt.",
    text: "Extract one sentence explaining why this advice is right now. Advice: {refined}",
  },
  coach_system: {
    id: "coach_system",
    version: "v1",
    notes: "Baseline extraction from app/api/ai/coach/route.ts.",
    text: "You are BuildMind, an agentic execution partner for solo founders. Be direct, specific, and give one next action.",
  },
  morning_briefing: {
    id: "morning_briefing",
    version: "v1",
    notes: "Baseline extraction from morning briefing prompt.",
    text: "Generate a 3-line morning briefing: win, risk, action. Context: {context}",
  },
  evening_check: {
    id: "evening_check",
    version: "v1",
    notes: "Baseline extraction from evening check prompt.",
    text: "Generate a 2-sentence evening reflection from completed work. Context: {context}",
  },
  founder_insight: {
    id: "founder_insight",
    version: "v1",
    notes: "Baseline extraction from founder memory insight prompt.",
    text: "Generate one sharp behavioral insight and one thing to change this week. Signals: {signals}",
  },
  archetype_classifier: {
    id: "archetype_classifier",
    version: "v1",
    notes: "Baseline extraction from founder archetype classifier.",
    text: "Classify this founder into one archetype from the provided signals. Signals: {signals}",
  },
  break_startup_market: {
    id: "break_startup_market",
    version: "v1",
    notes: "Baseline extraction from market research agent.",
    text: "Assess demand authenticity, market signal, and growth trajectory for: {idea}",
  },
  break_startup_competitor: {
    id: "break_startup_competitor",
    version: "v1",
    notes: "Baseline extraction from competitor agent.",
    text: "Map the competitive landscape and identify exploitable gaps for: {idea}",
  },
  break_startup_risk: {
    id: "break_startup_risk",
    version: "v1",
    notes: "Baseline extraction from risk agent.",
    text: "Find execution risks and blind spots for: {idea}",
  },
};

let overrideCache: Partial<Record<PromptId, ActivePrompt>> = {};
let cacheLoadedAt: number | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

export function getActivePrompt(id: PromptId): ActivePrompt {
  return overrideCache[id] ?? PROMPT_REGISTRY[id];
}

export function getPromptText(id: PromptId): string {
  return getActivePrompt(id).text;
}

export function getPromptForRequest(id: PromptId, userId?: string): { text: string; version: string; variant: "active" | "challenger" } {
  const prompt = getActivePrompt(id);
  if (prompt.challenger && userId) {
    const bucket = userId.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) % 100;
    if (bucket < prompt.challenger.traffic_pct) {
      return { text: prompt.challenger.text, version: prompt.challenger.version, variant: "challenger" };
    }
  }
  return { text: prompt.text, version: prompt.version, variant: "active" };
}

export async function loadActivePrompts(): Promise<void> {
  const now = Date.now();
  if (cacheLoadedAt && now - cacheLoadedAt < CACHE_TTL_MS) return;

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("prompt_versions")
      .select("prompt_id, version, text, notes, metrics, challenger_version, challenger_text, challenger_traffic_pct")
      .eq("is_active", true);
    if (error) throw error;

    const next: Partial<Record<PromptId, ActivePrompt>> = {};
    for (const row of data ?? []) {
      const id = row.prompt_id as PromptId;
      next[id] = {
        id,
        version: row.version,
        text: row.text,
        notes: row.notes ?? undefined,
        metrics: row.metrics ?? undefined,
        challenger: row.challenger_version && row.challenger_text
          ? { version: row.challenger_version, text: row.challenger_text, traffic_pct: row.challenger_traffic_pct ?? 0 }
          : undefined,
      };
    }
    overrideCache = next;
  } catch (err) {
    logError("promptRegistry/loadActivePrompts", err);
  } finally {
    cacheLoadedAt = now;
  }
}

export async function registerPromptVersion(params: {
  id: PromptId;
  version: string;
  text: string;
  author: string;
  notes?: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = createAdminClient();
    await supabase.from("prompt_versions").update({ is_active: false }).eq("prompt_id", params.id).eq("is_active", true);
    const { error } = await supabase.from("prompt_versions").insert({
      prompt_id: params.id,
      version: params.version,
      text: params.text,
      author: params.author,
      notes: params.notes ?? null,
      is_active: true,
      created_at: new Date().toISOString(),
    });
    if (error) throw error;
    cacheLoadedAt = null;
    return { ok: true };
  } catch (err) {
    logError("promptRegistry/registerPromptVersion", err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function revertPrompt(id: PromptId, targetVersion: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = createAdminClient();
    const { data: targetRow, error: fetchError } = await supabase
      .from("prompt_versions")
      .select("text, notes")
      .eq("prompt_id", id)
      .eq("version", targetVersion)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!targetRow) return { ok: false, error: `Version ${targetVersion} not found for prompt ${id}` };

    await supabase.from("prompt_versions").update({ is_active: false }).eq("prompt_id", id).eq("is_active", true);
    const { error } = await supabase.from("prompt_versions").insert({
      prompt_id: id,
      version: `${targetVersion}-revert-${Date.now()}`,
      text: targetRow.text,
      author: "system-revert",
      notes: `Reverted to ${targetVersion}: ${targetRow.notes ?? "no notes"}`,
      is_active: true,
      created_at: new Date().toISOString(),
    });
    if (error) throw error;
    cacheLoadedAt = null;
    return { ok: true };
  } catch (err) {
    logError("promptRegistry/revertPrompt", err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function listPromptVersions(id: PromptId): Promise<PromptVersion[]> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("prompt_versions")
      .select("prompt_id, version, text, author, notes, created_at, metrics")
      .eq("prompt_id", id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.prompt_id as PromptId,
      version: row.version,
      text: row.text,
      author: row.author,
      notes: row.notes ?? undefined,
      created_at: row.created_at,
      metrics: row.metrics ?? undefined,
    }));
  } catch (err) {
    logError("promptRegistry/listPromptVersions", err);
    return [];
  }
}

export async function promptDiff(id: PromptId, versionA: string, versionB: string): Promise<{ added: number; removed: number; summary: string } | null> {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("prompt_versions")
      .select("version, text")
      .eq("prompt_id", id)
      .in("version", [versionA, versionB]);
    const a = data?.find((row) => row.version === versionA);
    const b = data?.find((row) => row.version === versionB);
    if (!a || !b) return null;

    const linesA = a.text.split("\n");
    const linesB = b.text.split("\n");
    const added = linesB.filter((line: string) => !linesA.includes(line)).length;
    const removed = linesA.filter((line: string) => !linesB.includes(line)).length;
    return { added, removed, summary: `${versionA} -> ${versionB}: +${added} lines, -${removed} lines` };
  } catch (err) {
    logError("promptRegistry/promptDiff", err);
    return null;
  }
}

export async function updatePromptMetrics(id: PromptId, version: string, metrics: PromptMetrics): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase.from("prompt_versions").update({ metrics }).eq("prompt_id", id).eq("version", version);
  } catch (err) {
    logError("promptRegistry/updatePromptMetrics", err);
  }
}

export function getAllActiveVersions(): Record<PromptId, { version: string; notes?: string }> {
  const result = {} as Record<PromptId, { version: string; notes?: string }>;
  for (const id of Object.keys(PROMPT_REGISTRY) as PromptId[]) {
    const active = getActivePrompt(id);
    result[id] = { version: active.version, notes: active.notes };
  }
  return result;
}
