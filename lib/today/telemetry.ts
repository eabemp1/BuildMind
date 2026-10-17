/**
 * lib/today/telemetry.ts — best-effort quality event log.
 *
 * Every guard rejection, template fallback, outcome correction and "doesn't
 * fit me" tap is written here so the admin "Today quality" card can show what
 * is really failing in production. Never throws and never blocks a response:
 * telemetry must not be able to break Today.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type QualityEventKind = "rejected" | "fallback" | "outcome_adjusted" | "feedback" | "loop_recorded";

export interface QualityEvent {
  userId?: string | null;
  projectId?: string | null;
  kind: QualityEventKind;
  rules?: string[];
  task?: string | null;
  detail?: string | null;
  missionKind?: string | null;
  stage?: string | null;
}

export function toRow(e: QualityEvent) {
  return {
    user_id: e.userId ?? null,
    project_id: e.projectId && /^[0-9a-f-]{36}$/i.test(e.projectId) ? e.projectId : null,
    kind: e.kind,
    rules: (e.rules ?? []).slice(0, 12),
    task: e.task ? e.task.slice(0, 400) : null,
    detail: e.detail ? e.detail.slice(0, 400) : null,
    mission_kind: e.missionKind ?? null,
    stage: e.stage ?? null,
  };
}

export async function logQualityEvent(supabase: SupabaseClient | null | undefined, e: QualityEvent): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from("today_quality_events").insert(toRow(e));
  } catch {
    /* telemetry is best-effort */
  }
}
