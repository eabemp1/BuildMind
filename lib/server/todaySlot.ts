/** Builds Today's slot candidates and status line from records that already exist. Read-only, no model. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchBacklog } from "@/lib/coachActions/backlog";
import { buildStressVisual } from "@/lib/visuals/stressVisual";
import { loadLatestWatch } from "@/lib/server/marketWatch";
import { buildPmfRungs } from "@/lib/pmf/ladder";
import { loadPmfInputs } from "@/lib/server/pmfLadder";
import { STAGE_ORDER } from "@/lib/stages";
import { computeStageEvidenceCompleteness, getStageEvidenceRequirement } from "@/lib/server/stageEvidence";
import { weeklyRhythm, welcomeMoment } from "@/lib/today/rhythm";
import type { SlotCandidate, StatusInputs } from "@/lib/today/slot";

export async function loadTodaySlot(admin: SupabaseClient, userId: string, projectId: string, plan: string, now: Date = new Date()): Promise<{ candidates: SlotCandidate[]; status: StatusInputs }> {
  const candidates: SlotCandidate[] = [];
  const status: StatusInputs = {};
  const [watch, backlog, pmf, project, evidence, activity] = await Promise.all([
    plan === "builder" ? loadLatestWatch(admin, userId, projectId).catch(() => null) : Promise.resolve(null),
    fetchBacklog(admin, userId, projectId).catch(() => null),
    loadPmfInputs(admin, userId, projectId).catch(() => null),
    admin.from("projects").select("startup_stage").eq("id", projectId).eq("user_id", userId).maybeSingle().then((r) => r.data as { startup_stage?: string } | null, () => null),
    admin.from("project_stage_evidence").select("evidence_type,to_stage").eq("project_id", projectId).eq("user_id", userId).limit(200).then((r) => (r.data ?? []) as Array<{ evidence_type: "metric" | "artifact" | "experiment" | "founder_judgment"; to_stage: string }>, () => []),
    admin.from("action_logs").select("created_at,outcome").eq("user_id", userId).gte("created_at", new Date(now.getTime() - 120 * 86_400_000).toISOString()).limit(2000).then((r) => (r.data ?? []) as Array<{ created_at: string; outcome: string | null }>, () => []),
  ]);

  // Rhythm and welcome-back come from real completed actions. The daily streak itself is untouched.
  const rhythm = weeklyRhythm(activity.filter((a) => a.outcome === "completed" || a.outcome === "partial").map((a) => a.created_at.slice(0, 10)), now);
  if (rhythm.weeks > 0) status.rhythmWeeks = rhythm.weeks;
  const welcome = welcomeMoment(rhythm, now);
  if (welcome) candidates.push({ id: welcome.id, kind: "back", text: welcome.text });

  // Market Watch: this week's scan or last week's, and only real changes.
  if (watch && !watch.baseline && watch.changes.length) {
    const age = now.getTime() - Date.parse(`${watch.weekStart}T00:00:00Z`);
    if (age < 8 * 86_400_000) {
      const first = watch.changes[0];
      candidates.push({ id: `market:${watch.weekStart}`, kind: "market", text: watch.changes.length > 1 ? `${first.text} ${watch.changes.length - 1} more.` : first.text, href: "/work?open=visual:market", cta: "See what changed" });
    }
  }

  // Milestones: only the straight-line pace check, with its limits.
  if (backlog && backlog.ok) {
    const { summary } = buildStressVisual({ milestones: backlog.milestones, tasks: backlog.tasks, now });
    status.pace = { dated: summary.dated, behind: summary.high + summary.medium };
    if (summary.high > 0) candidates.push({ id: `risk:${now.toISOString().slice(0, 10)}`, kind: "risk", text: `${summary.high} ${summary.high === 1 ? "milestone is" : "milestones are"} unlikely to hit ${summary.high === 1 ? "its" : "their"} date at your current pace.`, href: "/work?open=visual:stress", cta: "Look at the dates" });
  }

  if (pmf) {
    const rungs = buildPmfRungs(pmf);
    status.pmf = { observed: rungs.filter((r) => r.state === "observed").length, total: rungs.length };
  }

  // Stage evidence: next stage up, and what is filled so far.
  const cur = project?.startup_stage ?? "";
  const idx = STAGE_ORDER.indexOf(cur as (typeof STAGE_ORDER)[number]);
  const next = idx >= 0 ? STAGE_ORDER[idx + 1] : undefined;
  const req = next ? getStageEvidenceRequirement(cur, next) : null;
  if (req && next) {
    const done = computeStageEvidenceCompleteness(req, evidence.filter((e) => e.to_stage === next));
    status.stage = { filled: done.filledSlotKeys.length, total: req.slots.length, next };
    if (done.isComplete) candidates.push({ id: `stage:${next}`, kind: "stage", text: `You have the evidence for ${next}. Moving the project forward is your call.`, href: `/projects/${projectId}`, cta: "Review the move" });
  }
  return { candidates, status };
}
