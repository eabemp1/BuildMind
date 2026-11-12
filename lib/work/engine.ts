/**
 * lib/work/engine.ts — the server half of the work engine: load the founder's project, ask the writer,
 * check the result. Pure logic lives in lib/work/shape.ts.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { callModelJSON } from "@/lib/ai-providers";
import { unsupportedNumbers } from "@/lib/distribution/engine";
import { loadProject } from "@/lib/prep/engine";
import type { WorkSpec } from "@/lib/work/registry";
import { buildPrompt, draftProblems, normalizeWork, readRefined, refinePrompt, revisePrompt, type WorkResult } from "@/lib/work/shape";
import { loadWorkContext } from "@/lib/work/context";

export async function generateWork(
  admin: SupabaseClient,
  userId: string,
  input: { spec: WorkSpec; values: Record<string, string>; projectId?: string | null; voice?: string; founderName?: string },
): Promise<WorkResult | null> {
  const [project, context] = await Promise.all([loadProject(admin, userId, input.projectId), loadWorkContext(admin, userId, input.projectId)]);
  const prompt = buildPrompt(input.spec, input.values, project, input.voice ?? "", input.founderName ?? "", context);
  const deadlineMs = Date.now() + 45_000;
  const opts = { maxTokens: input.spec.shape === "sections" ? 2600 : 1800, role: "reasoning" as const, deadlineMs, feature: "work" };
  let raw: unknown;
  try {
    raw = await callModelJSON<unknown>([{ role: "user", content: prompt }], opts);
  } catch { return null; }
  const allowed = [...Object.values(input.values), project.name, project.description, project.problem, project.targetUsers].join(" ");
  const first = normalizeWork(raw, input.spec, allowed, unsupportedNumbers);
  if (!first) return null;

  // One fix-up pass when the draft has problems a second look can fix. If it fails, the first draft stands.
  const problems = draftProblems(first, input.spec, allowed, project.stage);
  if (problems.length > 0 && Date.now() < deadlineMs - 12_000) {
    try {
      const fixedRaw = await callModelJSON<unknown>([{ role: "user", content: revisePrompt(JSON.stringify(raw), input.spec, problems) }], { ...opts, feature: "work_revise" });
      const fixed = normalizeWork(fixedRaw, input.spec, allowed, unsupportedNumbers);
      if (fixed && draftProblems(fixed, input.spec, allowed, project.stage).length < problems.length) return fixed;
    } catch { /* keep the first draft */ }
  }
  return first;
}

export async function refineText(text: string, instruction: string): Promise<string | null> {
  try {
    const raw = await callModelJSON<unknown>([{ role: "user", content: refinePrompt(text, instruction) }], { maxTokens: 1800, prefer: "gemini", geminiTimeoutMs: 14_000, feature: "work_refine" });
    return readRefined(raw);
  } catch { return null; }
}
