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
import type { CoachActionId, CoachActionResult } from "./types";
import { fetchBacklog, shapeBacklog, type BacklogView } from "./backlog";

export interface CoachActionContext {
  userId: string;
  projectId: string;
  admin: SupabaseClient;
  now?: Date;
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
  minPlan: "free",
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

export const COACH_ACTIONS: Record<CoachActionId, RegisteredAction> = {
  export_intelligence: exportIntelligence,
  list_backlog: listBacklog,
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
