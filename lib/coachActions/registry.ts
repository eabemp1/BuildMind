/**
 * lib/coachActions/registry.ts
 *
 * The closed set of things the AI Coach can do. Anything not registered here
 * cannot be triggered — by a chip, by typed text, or (later) by a model.
 *
 * Every action follows the same contract:
 *   - params come from an UNTRUSTED source (chip payload, regex extraction,
 *     eventually a model) and are parsed by the action's own zod schema;
 *   - userId/projectId come ONLY from the authenticated session/ownership
 *     check in ctx — no action schema has a field for either, so no caller
 *     (including a future model) can point an action at someone else's data;
 *   - the result is data for the UI to render, never model-written prose;
 *   - phase 1 actions are read-only. Writes are deliberately absent until
 *     they can be built as propose → confirm → awaited-execute.
 */

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Plan } from "@/lib/plan";
import { loadFounderIntelligence } from "@/lib/founderIntelligence";
import { buildFounderMirror, type FounderMirror } from "@/lib/founderMirror";
import { getFounderIntelligenceAccuracy } from "@/lib/learningLoop";
import { getFounderScorecard, type FounderScorecard } from "@/lib/scorecard";
import type { CoachActionId, CoachActionResult } from "./types";
import { fetchBacklog, shapeBacklog, shapeMilestones, type BacklogView, type MilestoneProgress } from "./backlog";
import { fetchExecutionLog, shapeExecutionLog, type ExecutionLogView } from "./executionLog";
import { buildSignalsResult, buildDecisionResult, buildBeliefsResult, buildMomentumResult } from "./intelligenceViews";

export interface CoachActionContext {
  userId: string;
  projectId: string;
  admin: SupabaseClient;
  now?: Date;
  /** Test seam only — production always uses the real loaders below. */
  loaders?: {
    mirror?: (admin: SupabaseClient, userId: string, projectId: string) => Promise<FounderMirror>;
    scorecard?: (userId: string) => Promise<FounderScorecard>;
  };
}

/** Same pipeline /api/founder-context/mirror runs, so what the coach reports
 *  is what Founder Mirror shows — one computation, two presentations. */
async function loadMirrorForCoach(admin: SupabaseClient, userId: string, projectId: string): Promise<FounderMirror> {
  const state = await loadFounderIntelligence(admin, userId, projectId);
  const accuracy = await getFounderIntelligenceAccuracy(admin, userId);
  return buildFounderMirror(state, accuracy);
}

export type RunCoachActionOutcome =
  | { ok: true; result: CoachActionResult }
  | { ok: false; status: number; error: string };

interface RegisteredAction {
  id: CoachActionId;
  label: string;
  description: string;
  minPlan: Plan;
  execute(ctx: CoachActionContext, rawParams: unknown): Promise<RunCoachActionOutcome>;
}

function defineAction<S extends z.ZodTypeAny>(def: {
  id: CoachActionId;
  label: string;
  description: string;
  minPlan: Plan;
  paramsSchema: S;
  run(ctx: CoachActionContext, params: z.output<S>): Promise<RunCoachActionOutcome>;
}): RegisteredAction {
  return {
    id: def.id,
    label: def.label,
    description: def.description,
    minPlan: def.minPlan,
    async execute(ctx, rawParams) {
      const parsed = def.paramsSchema.safeParse(rawParams ?? {});
      if (!parsed.success) return { ok: false, status: 400, error: `Invalid options for "${def.label}".` };
      try {
        return await def.run(ctx, parsed.data);
      } catch (err) {
        return { ok: false, status: 500, error: err instanceof Error ? err.message : "Action failed." };
      }
    },
  };
}

const PLAN_ORDER: Plan[] = ["free", "builder"];
const meetsPlan = (actual: Plan, required: Plan) => PLAN_ORDER.indexOf(actual) >= PLAN_ORDER.indexOf(required);

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

async function assertOwnsProject(ctx: CoachActionContext): Promise<RunCoachActionOutcome | null> {
  const { data, error } = await ctx.admin
    .from("projects").select("id").eq("id", ctx.projectId).eq("user_id", ctx.userId).maybeSingle();
  if (error) return { ok: false, status: 500, error: `Couldn't verify project: ${error.message}` };
  if (!data) return { ok: false, status: 404, error: "Project not found." };
  return null;
}

// ── export_intelligence ──────────────────────────────────────────────────
// Wraps the export that already exists (/api/founder-context/intelligence-export
// → buildFounderIntelligenceReport). Deliberately does NOT run the report here:
// that's the full intelligence pipeline, and the download route runs it when
// (and only when) the founder actually clicks. The card is instant and the
// file is always fresh.
const exportIntelligence = defineAction({
  id: "export_intelligence",
  label: "Export intelligence data",
  description: "Download the full Founder Intelligence record (JSON, CSV trend, optional 30-day history).",
  minPlan: "builder",
  paramsSchema: z.object({
    format: z.enum(["json", "csv"]).default("json"),
    history: z.boolean().default(false),
  }),
  async run(ctx, params) {
    const denied = await assertOwnsProject(ctx);
    if (denied) return denied;

    const base = `/api/founder-context/intelligence-export?projectId=${encodeURIComponent(ctx.projectId)}`;
    const full = { label: "Full report (JSON)", href: `${base}&format=json` };
    const trend = { label: "Standing trend (CSV)", href: `${base}&format=csv` };
    const withHistory = { label: "Report + 30-day history (JSON)", href: `${base}&format=json&history=true` };

    const first = params.history ? withHistory : params.format === "csv" ? trend : full;
    const downloads = [first, ...[full, trend, withHistory].filter((d) => d.href !== first.href)];

    return {
      ok: true,
      result: {
        actionId: "export_intelligence",
        title: "Founder Intelligence export",
        summary: "Your Founder Intelligence record is ready. It's generated fresh when you download, so it's always current.",
        rows: [
          { primary: "Current standing and readiness", secondary: "Plus the 30-day standing trend" },
          { primary: "Prediction accuracy", secondary: "How often BuildMind's recommendations matched what you actually did" },
          { primary: "Full intelligence state", secondary: "Signals, decision reasoning, execution and temporal patterns" },
        ],
        downloads,
      },
    };
  },
});

// ── list_backlog ─────────────────────────────────────────────────────────
const listBacklog = defineAction({
  id: "list_backlog",
  label: "List backlog",
  description: "List open (or completed / all) tasks by milestone, with a JSON/CSV download of the full set.",
  minPlan: "free",
  paramsSchema: z.object({
    status: z.enum(["open", "completed", "all"]).default("open"),
    milestone: z.string().trim().min(1).max(80).optional(),
    limit: z.number().int().min(1).max(100).default(12),
  }),
  async run(ctx, params) {
    const fetched = await fetchBacklog(ctx.admin, ctx.userId, ctx.projectId);
    if (!fetched.ok) return { ok: false, status: fetched.status, error: fetched.error };

    const view = shapeBacklog(fetched.milestones, fetched.tasks, { status: params.status, milestone: params.milestone }, ctx.now);
    return { ok: true, result: buildBacklogResult(view, params, ctx.projectId) };
  },
});

export function buildBacklogResult(
  view: BacklogView,
  params: { status: "open" | "completed" | "all"; milestone?: string; limit: number },
  projectId: string,
): CoachActionResult {
  const scopeLabel = params.status === "open" ? "Open tasks" : params.status === "completed" ? "Completed tasks" : "All tasks";
  const title = params.milestone ? `${scopeLabel} · ${params.milestone}` : scopeLabel;

  if (view.milestoneNotFound) {
    const shown = view.availableMilestones.slice(0, 8).join(", ");
    const more = view.availableMilestones.length > 8 ? ` (+${view.availableMilestones.length - 8} more)` : "";
    return {
      actionId: "list_backlog",
      title: "Backlog",
      summary: `I couldn't find a milestone matching "${view.milestoneNotFound}".`,
      note: view.availableMilestones.length ? `Your milestones: ${shown}${more}` : "This project has no milestones yet.",
    };
  }

  if (view.totalTasks === 0) {
    return { actionId: "list_backlog", title, summary: "There are no tasks on this project yet." };
  }

  const openInScope = view.items.filter((i) => !i.isCompleted).length;
  const doneInScope = view.items.length - openInScope;

  if (view.totalMatching === 0) {
    const where = params.milestone ? ` under "${params.milestone}"` : "";
    const kind = params.status === "all" ? "" : `${params.status} `;
    const summary =
      params.status === "open" && !params.milestone
        ? "No open tasks — everything on this project is done."
        : `No ${kind}tasks${where}.`;
    return { actionId: "list_backlog", title, summary };
  }

  let summary: string;
  if (params.status === "open") {
    summary = `${plural(view.totalMatching, "open task")} across ${plural(view.milestonesWithMatches, "milestone")}.`;
    if (view.oldestOpenAgeDays !== null && view.oldestOpenAgeDays >= 1) {
      summary += ` The oldest has been waiting ${plural(view.oldestOpenAgeDays, "day")}.`;
    }
  } else if (params.status === "completed") {
    summary = `${plural(view.totalMatching, "completed task")} across ${plural(view.milestonesWithMatches, "milestone")}.`;
  } else {
    summary = `${plural(view.totalMatching, "task")}: ${openInScope} open, ${doneInScope} completed.`;
  }

  const stats: Array<{ label: string; value: string }> = [
    { label: "Open", value: String(openInScope) },
    { label: "Completed", value: String(doneInScope) },
    { label: "Milestones", value: String(view.milestonesWithMatches) },
  ];
  if (view.oldestOpenAgeDays !== null) stats.push({ label: "Oldest open", value: `${view.oldestOpenAgeDays}d` });

  const rows = view.items.slice(0, params.limit).map((i) => ({
    primary: i.title,
    secondary: i.milestone,
    badge: i.isCompleted ? "done" : `${i.ageDays}d`,
  }));

  const q = new URLSearchParams({ projectId, status: params.status });
  if (params.milestone) q.set("milestone", params.milestone);
  const base = `/api/founder-context/backlog-export?${q.toString()}`;

  return {
    actionId: "list_backlog",
    title,
    summary,
    stats,
    rows,
    downloads: [
      { label: `All ${view.totalMatching} (JSON)`, href: `${base}&format=json` },
      { label: "Spreadsheet (CSV)", href: `${base}&format=csv` },
    ],
    note: view.totalMatching > params.limit
      ? `Showing ${params.limit} of ${view.totalMatching} — the downloads include all of them.`
      : undefined,
  };
}

// ── list_milestones ──────────────────────────────────────────────────────
const listMilestones = defineAction({
  id: "list_milestones",
  label: "List milestones",
  description: "Milestones in roadmap order with real task progress and target dates.",
  minPlan: "free",
  paramsSchema: z.object({ limit: z.number().int().min(1).max(30).default(12) }),
  async run(ctx, params) {
    const fetched = await fetchBacklog(ctx.admin, ctx.userId, ctx.projectId);
    if (!fetched.ok) return { ok: false, status: fetched.status, error: fetched.error };
    const progress = shapeMilestones(fetched.milestones, fetched.tasks, ctx.now);
    return { ok: true, result: buildMilestonesResult(progress, params.limit) };
  },
});

export function buildMilestonesResult(list: MilestoneProgress[], limit: number): CoachActionResult {
  if (list.length === 0) {
    return { actionId: "list_milestones", title: "Milestones", summary: "This project has no milestones yet." };
  }
  const targetText = (m: MilestoneProgress) =>
    m.daysToTarget === null ? "no target date"
    : m.daysToTarget < 0 ? `overdue by ${plural(-m.daysToTarget, "day")}`
    : m.daysToTarget === 0 ? "due today"
    : `${plural(m.daysToTarget, "day")} left`;
  const isLive = (m: MilestoneProgress) => m.status !== "completed" && m.status !== "abandoned";
  const overdue = list.filter((m) => isLive(m) && m.daysToTarget !== null && m.daysToTarget < 0).length;
  const totalTasks = list.reduce((n, m) => n + m.total, 0);
  const doneTasks = list.reduce((n, m) => n + m.done, 0);
  const completed = list.filter((m) => m.status === "completed").length;

  return {
    actionId: "list_milestones",
    title: "Milestones",
    summary:
      `${plural(list.length, "milestone")}, ${completed} completed.` +
      (overdue ? ` ${plural(overdue, "milestone")} past target date.` : "") +
      (totalTasks ? ` ${doneTasks} of ${plural(totalTasks, "task")} done overall.` : ""),
    stats: [
      { label: "Milestones", value: String(list.length) },
      { label: "Completed", value: String(completed) },
      { label: "Past target", value: String(overdue) },
      { label: "Tasks done", value: totalTasks ? `${doneTasks}/${totalTasks}` : "—" },
    ],
    rows: list.slice(0, limit).map((m) => ({
      primary: m.title,
      secondary: `${m.total ? `${m.done} of ${m.total} tasks done` : "no tasks yet"} · ${targetText(m)}`,
      badge: m.status.replace("_", " "),
    })),
    note: list.length > limit ? `Showing ${limit} of ${list.length}.` : undefined,
  };
}

// ── get_signals / get_decision_reasoning / get_beliefs ───────────────────
// All three read the same FounderMirror Founder Mirror renders.
const getSignals = defineAction({
  id: "get_signals",
  label: "Active signals",
  description: "The behavioral signals BuildMind is currently detecting, most severe first.",
  minPlan: "free",
  paramsSchema: z.object({ limit: z.number().int().min(1).max(20).default(6) }),
  async run(ctx, params) {
    const denied = await assertOwnsProject(ctx);
    if (denied) return denied;
    const mirror = await (ctx.loaders?.mirror ?? loadMirrorForCoach)(ctx.admin, ctx.userId, ctx.projectId);
    return { ok: true, result: buildSignalsResult(mirror.signals, params.limit) };
  },
});

const getDecisionReasoning = defineAction({
  id: "get_decision_reasoning",
  label: "Decision reasoning",
  description: "Today's recommendation, what else was scored, and why this one won.",
  minPlan: "free",
  paramsSchema: z.object({}),
  async run(ctx) {
    const denied = await assertOwnsProject(ctx);
    if (denied) return denied;
    const mirror = await (ctx.loaders?.mirror ?? loadMirrorForCoach)(ctx.admin, ctx.userId, ctx.projectId);
    return { ok: true, result: buildDecisionResult(mirror.decision) };
  },
});

const getBeliefs = defineAction({
  id: "get_beliefs",
  label: "What BuildMind believes about you",
  description: "Confidence-scored beliefs about your strengths and avoidance patterns, with evidence counts.",
  minPlan: "free",
  paramsSchema: z.object({ limit: z.number().int().min(1).max(20).default(8) }),
  async run(ctx, params) {
    const denied = await assertOwnsProject(ctx);
    if (denied) return denied;
    const mirror = await (ctx.loaders?.mirror ?? loadMirrorForCoach)(ctx.admin, ctx.userId, ctx.projectId);
    return { ok: true, result: buildBeliefsResult(mirror.beliefs, mirror.suppressed_beliefs, params.limit) };
  },
});

// ── get_momentum ─────────────────────────────────────────────────────────
// Reads the scorecard (lib/scorecard.ts) — the documented single source of
// truth for momentum/streak/XP — and deliberately nothing else. It does NOT
// report tasks-completed counters: several different ones exist in this app
// and one of them is under investigation, so the coach shouldn't add a voice.
const getMomentum = defineAction({
  id: "get_momentum",
  label: "Momentum",
  description: "Momentum, change vs. last week, streak, and XP from the scorecard.",
  minPlan: "free",
  paramsSchema: z.object({}),
  async run(ctx) {
    const scorecard = await (ctx.loaders?.scorecard ?? ((id: string) => getFounderScorecard(id)))(ctx.userId);
    return { ok: true, result: buildMomentumResult(scorecard) };
  },
});

// ── get_execution_log ────────────────────────────────────────────────────
const getExecutionLog = defineAction({
  id: "get_execution_log",
  label: "Execution log",
  description: "Every Today action logged in a time window, with its outcome, as a JSON/CSV record.",
  minPlan: "free",
  paramsSchema: z.object({
    days: z.number().int().min(1).max(90).default(14),
    limit: z.number().int().min(1).max(100).default(12),
    format: z.enum(["json", "csv"]).default("json"),
  }),
  async run(ctx, params) {
    // User-scoped (this table's rows aren't reliably project-scoped), so no
    // project ownership check — fetchExecutionLog filters by user_id.
    const fetched = await fetchExecutionLog(ctx.admin, ctx.userId, params.days, ctx.now);
    if (!fetched.ok) return { ok: false, status: fetched.status, error: fetched.error };
    const view = shapeExecutionLog(fetched.rows, params.days, ctx.now, fetched.truncated);
    return { ok: true, result: buildExecutionLogResult(view, params) };
  },
});

const OUTCOME_LABEL = { completed: "completed", partial: "partial", skipped: "skipped", ignored: "ignored", pending: "no outcome" } as const;
const SOURCE_LABEL = { today: "from Today", fallback: "logged on completion" } as const;
const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function buildExecutionLogResult(
  view: ExecutionLogView, params: { days: number; limit: number; format: "json" | "csv" },
): CoachActionResult {
  const windowText = params.days === 1 ? "the last day" : `the last ${params.days} days`;
  const base = `/api/founder-context/execution-log-export?days=${params.days}`;
  const json = { label: "Execution record (JSON)", href: `${base}&format=json` };
  const csv = { label: "Spreadsheet (CSV)", href: `${base}&format=csv` };
  const downloads = params.format === "csv" ? [csv, json] : [json, csv];

  if (view.entries.length === 0) {
    return {
      actionId: "get_execution_log",
      title: "Execution log",
      summary: `No Today actions were logged in ${windowText}.`,
      note: "Actions appear here when Today recommends one or you complete one. If you completed something and it's missing, it wasn't recorded — worth knowing.",
    };
  }

  const c = view.counts;
  const parts = [
    c.completed && `${c.completed} completed`,
    c.partial && `${c.partial} partial`,
    c.skipped && `${c.skipped} skipped`,
    c.ignored && `${c.ignored} ignored`,
    c.pending && `${c.pending} with no outcome`,
  ].filter(Boolean) as string[];

  return {
    actionId: "get_execution_log",
    title: "Execution log",
    summary:
      `In ${windowText}: ${parts.join(", ")}.` +
      (c.completed ? ` Completions landed on ${plural(view.daysWithCompletion, "different day")}.` : ""),
    stats: [
      { label: "Completed", value: String(c.completed) },
      { label: "Partial", value: String(c.partial) },
      { label: "Skipped", value: String(c.skipped) },
      { label: "No outcome", value: String(c.pending) },
      { label: "Days with a completion", value: String(view.daysWithCompletion) },
    ],
    rows: view.entries.slice(0, params.limit).map((e) => ({
      primary: e.action.length > 140 ? `${e.action.slice(0, 139).trimEnd()}…` : e.action,
      secondary: `${dayLabel(e.effectiveAt)} · ${SOURCE_LABEL[e.source]}`,
      badge: OUTCOME_LABEL[e.outcome],
    })),
    downloads,
    note: [
      view.entries.length > params.limit ? `Showing ${params.limit} of ${view.entries.length} — the downloads include all of them.` : null,
      view.truncated ? "Very large log: only the most recent rows were read." : null,
      "Dates are UTC.",
    ].filter(Boolean).join(" "),
  };
}

export const COACH_ACTIONS: Record<CoachActionId, RegisteredAction> = {
  export_intelligence: exportIntelligence,
  list_backlog: listBacklog,
  list_milestones: listMilestones,
  get_signals: getSignals,
  get_decision_reasoning: getDecisionReasoning,
  get_beliefs: getBeliefs,
  get_momentum: getMomentum,
  get_execution_log: getExecutionLog,
};

const isActionId = (id: unknown): id is CoachActionId =>
  typeof id === "string" && Object.prototype.hasOwnProperty.call(COACH_ACTIONS, id);

/** The kill switch: set COACH_ACTIONS_DISABLED=true to turn all of this off. */
export function isCoachActionsEnabled(): boolean {
  return process.env.COACH_ACTIONS_DISABLED !== "true";
}

const ActionRequestSchema = z.object({
  id: z.string().max(64),
  params: z.record(z.string(), z.unknown()).optional(),
});

/** For the chip path: body.action is untrusted JSON. */
export function parseActionRequest(raw: unknown): { id: string; params: Record<string, unknown> } | null {
  const parsed = ActionRequestSchema.safeParse(raw);
  return parsed.success ? { id: parsed.data.id, params: parsed.data.params ?? {} } : null;
}

export async function runCoachAction(
  request: { id: unknown; params: unknown },
  ctx: CoachActionContext,
  plan: Plan,
): Promise<RunCoachActionOutcome> {
  if (!isActionId(request.id)) return { ok: false, status: 400, error: "Unknown action." };
  const action = COACH_ACTIONS[request.id];
  if (!meetsPlan(plan, action.minPlan)) {
    return { ok: false, status: 403, error: `"${action.label}" needs the ${action.minPlan} plan.` };
  }
  return action.execute(ctx, request.params);
  }
