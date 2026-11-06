/**
 * lib/work/engine.ts — the server half of the work engine: load the founder's project, ask the writer,
 * check the result. Pure logic lives in lib/work/shape.ts.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { callModelJSON } from "@/lib/ai-providers";
import { unsupportedNumbers } from "@/lib/distribution/engine";
import { loadProject } from "@/lib/prep/engine";
import type { WorkSpec } from "@/lib/work/registry";
import { buildPrompt, normalizeWork, readRefined, refinePrompt, type WorkResult } from "@/lib/work/shape";

export async function generateWork(
  admin: SupabaseClient,
  userId: string,
  input: { spec: WorkSpec; values: Record<string, string>; projectId?: string | null },
): Promise<WorkResult | null> {
  const project = await loadProject(admin, userId, input.projectId);
  const prompt = buildPrompt(input.spec, input.values, project);
  let raw: unknown;
  try {
    raw = await callModelJSON<unknown>([{ role: "user", content: prompt }], { maxTokens: input.spec.shape === "sections" ? 2600 : 1800, prefer: "gemini", geminiTimeoutMs: 14_000, feature: "work" });
  } catch { return null; }
  const allowed = [...Object.values(input.values), project.name, project.description, project.problem, project.targetUsers].join(" ");
  return normalizeWork(raw, input.spec, allowed, unsupportedNumbers);
}

export async function refineText(text: string, instruction: string): Promise<string | null> {
  try {
    const raw = await callModelJSON<unknown>([{ role: "user", content: refinePrompt(text, instruction) }], { maxTokens: 1800, prefer: "gemini", geminiTimeoutMs: 14_000, feature: "work_refine" });
    return readRefined(raw);
  } catch { return null; }
}
