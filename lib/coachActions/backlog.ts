/**
 * lib/coachActions/backlog.ts
 *
 * The backlog, as data: one query layer (fetchBacklog), one pure shaping
 * function (shapeBacklog), one CSV serializer. Both the coach's list_backlog
 * action and the /api/founder-context/backlog-export download route call
 * these — so the card the founder sees and the file they download can never
 * disagree about what "open tasks" means.
 *
 * "Backlog" here = tasks (is_completed = false) under this project's
 * milestones. Columns selected are exactly the ones lib/buildmind.types.ts
 * declares — and every query's `error` is checked rather than assumed empty:
 * a select naming a nonexistent column makes PostgREST fail the whole query
 * while supabase-js still resolves (it doesn't throw), and treating that as
 * "no rows" is precisely how other pages in this app silently showed zeros.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type BacklogStatus = "open" | "completed" | "all";

export interface BacklogMilestone { id: string; title: string; status: string; created_at: string; }
export interface BacklogTaskRow {
  id: string; milestone_id: string; title: string; notes: string | null; is_completed: boolean; created_at: string;
}

export interface BacklogItem {
  id: string;
  title: string;
  notes: string | null;
  milestone: string;
  milestoneStatus: string;
  isCompleted: boolean;
  createdAt: string;
  ageDays: number;
}

export interface BacklogView {
  items: BacklogItem[];          // everything matching the filters, sorted
  totalMatching: number;
  totalTasks: number;            // all tasks in scope of the project, ignoring filters
  openCount: number;             // project-wide, ignoring filters
  completedCount: number;        // project-wide, ignoring filters
  milestonesWithMatches: number;
  oldestOpenAgeDays: number | null;
  milestoneNotFound: string | null;   // the requested milestone text, if nothing matched
  availableMilestones: string[];      // titles, for the "did you mean" note
}

export interface BacklogFilters { status: BacklogStatus; milestone?: string; }

export type FetchBacklogResult =
  | { ok: true; milestones: BacklogMilestone[]; tasks: BacklogTaskRow[] }
  | { ok: false; status: number; error: string };

const CHUNK = 20;      // same batch size the coach route already uses for .in()
const ROW_CAP = 1000;  // per chunk; also the hard ceiling on a download

export async function fetchBacklog(admin: SupabaseClient, userId: string, projectId: string): Promise<FetchBacklogResult> {
  // Ownership first — never trust a projectId from the request body/query.
  const { data: project, error: projectErr } = await admin
    .from("projects").select("id").eq("id", projectId).eq("user_id", userId).maybeSingle();
  if (projectErr) return { ok: false, status: 500, error: `Couldn't verify project: ${projectErr.message}` };
  if (!project) return { ok: false, status: 404, error: "Project not found." };

  const { data: milestoneRows, error: milestoneErr } = await admin
    .from("milestones").select("id, title, status, created_at")
    .eq("project_id", projectId).eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (milestoneErr) return { ok: false, status: 500, error: `Couldn't load milestones: ${milestoneErr.message}` };

  const milestones = (milestoneRows ?? []) as BacklogMilestone[];
  if (milestones.length === 0) return { ok: true, milestones, tasks: [] };

  const ids = milestones.map((m) => m.id);
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));

  const results = await Promise.all(
    chunks.map((chunk) =>
      admin.from("tasks").select("id, milestone_id, title, notes, is_completed, created_at")
        .eq("user_id", userId).in("milestone_id", chunk).limit(ROW_CAP),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return { ok: false, status: 500, error: `Couldn't load tasks: ${failed.error.message}` };

  const tasks = results.flatMap((r) => (r.data ?? []) as BacklogTaskRow[]);
  return { ok: true, milestones, tasks };
}

/** Pure — no I/O, `now` injected so age math is testable. */
export function shapeBacklog(
  milestones: BacklogMilestone[],
  tasks: BacklogTaskRow[],
  filters: BacklogFilters,
  now: Date = new Date(),
): BacklogView {
  const milestoneById = new Map(milestones.map((m, order) => [m.id, { ...m, order }]));
  const dayMs = 86_400_000;
  const ageOf = (iso: string) => {
    const t = new Date(iso).getTime();
    return Number.isFinite(t) ? Math.max(0, Math.floor((now.getTime() - t) / dayMs)) : 0;
  };

  const known = tasks.filter((t) => milestoneById.has(t.milestone_id));
  const openCount = known.filter((t) => !t.is_completed).length;
  const completedCount = known.length - openCount;

  const wanted = filters.milestone?.trim().toLowerCase();
  const matchedMilestoneIds = wanted
    ? new Set(milestones.filter((m) => m.title.toLowerCase().includes(wanted)).map((m) => m.id))
    : null;
  const milestoneNotFound = wanted && matchedMilestoneIds && matchedMilestoneIds.size === 0 ? (filters.milestone ?? null) : null;

  const scoped = known.filter((t) => {
    if (matchedMilestoneIds && !matchedMilestoneIds.has(t.milestone_id)) return false;
    if (filters.status === "open") return !t.is_completed;
    if (filters.status === "completed") return t.is_completed;
    return true;
  });

  const items: BacklogItem[] = scoped
    .map((t) => {
      const m = milestoneById.get(t.milestone_id)!;
      return {
        order: m.order,
        item: {
          id: t.id, title: t.title, notes: t.notes ?? null, milestone: m.title, milestoneStatus: m.status,
          isCompleted: Boolean(t.is_completed), createdAt: t.created_at, ageDays: ageOf(t.created_at),
        } satisfies BacklogItem,
      };
    })
    // milestone order first (roadmap order), then oldest task first within it
    .sort((a, b) => a.order - b.order || new Date(a.item.createdAt).getTime() - new Date(b.item.createdAt).getTime())
    .map((x) => x.item);

  const openAges = items.filter((i) => !i.isCompleted).map((i) => i.ageDays);
  return {
    items,
    totalMatching: items.length,
    totalTasks: known.length,
    openCount,
    completedCount,
    milestonesWithMatches: new Set(items.map((i) => i.milestone)).size,
    oldestOpenAgeDays: openAges.length ? Math.max(...openAges) : null,
    milestoneNotFound,
    availableMilestones: milestones.map((m) => m.title),
  };
}

// CSV cells beginning with = + - @ are executed as formulas by spreadsheet
// apps. Task titles are founder- or AI-authored text, so neutralize them.
function csvCell(value: unknown): string {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function backlogToCSV(items: BacklogItem[]): string {
  const header = ["milestone", "milestone_status", "task", "notes", "completed", "created_at", "age_days"];
  const lines = items.map((i) =>
    [i.milestone, i.milestoneStatus, i.title, i.notes ?? "", i.isCompleted ? "yes" : "no", i.createdAt, i.ageDays].map(csvCell).join(","),
  );
  return [header.join(","), ...lines].join("\n");
}
