import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { fetchBacklog } from "@/lib/coachActions/backlog";
import { recordInteractionServer } from "@/lib/conversationContinuity";
import { DURATION_CHOICES, MAX_OPEN_LOOPS, dueAtFor } from "@/lib/today/loops";
import { parseCoachWrite, pickTask, rankTasks, type WriteRequest } from "./parse";

/** What the founder sees on the confirm card. Carries only ids and text; the server re-checks everything on apply. */
export const ProposalSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("add_task"), title: z.string().trim().min(3).max(140) }),
  z.object({ kind: z.literal("set_task"), taskId: z.string().uuid(), outcome: z.enum(["done", "blocked"]), reason: z.string().trim().max(200).optional() }),
  z.object({ kind: z.literal("remind"), text: z.string().trim().min(3).max(200), choice: z.enum(["4h", "1d", "3d", "1w"]) }),
  z.object({ kind: z.literal("log_outreach"), text: z.string().trim().min(5).max(280) }),
]);
export type Proposal = z.infer<typeof ProposalSchema>;

export interface ProposalCard {
  proposal: Proposal;
  heading: string;
  detail: string;
  confirmLabel: string;
  /** Set when several tasks matched and the founder must say which. */
  choices?: Array<{ taskId: string; title: string }>;
}

export type ProposeResult =
  | { ok: true; card: ProposalCard }
  | { ok: false; reply: string };

type Admin = SupabaseClient;

/** Where a new task goes: the first milestone that is still open, otherwise the first one. */
export function activeMilestoneId(milestones: Array<{ id: string; status?: string | null }>): string | null {
  if (!milestones.length) return null;
  const open = milestones.find((m) => String(m.status ?? "").toLowerCase() !== "completed");
  return (open ?? milestones[0]).id;
}

export async function proposeWrite(admin: Admin, userId: string, projectId: string, message: string): Promise<ProposeResult | null> {
  const req = parseCoachWrite(message);
  if (!req) return null;
  return buildProposal(admin, userId, projectId, req);
}

async function buildProposal(admin: Admin, userId: string, projectId: string, req: WriteRequest): Promise<ProposeResult> {
  if (req.kind === "remind") {
    return { ok: true, card: { proposal: { kind: "remind", text: req.text, choice: req.choice }, heading: `Remind you: ${DURATION_CHOICES[req.choice].label.toLowerCase()}`, detail: req.text, confirmLabel: "Set reminder" } };
  }
  if (req.kind === "log_outreach") {
    return { ok: true, card: { proposal: { kind: "log_outreach", text: req.text }, heading: "Log this outreach result", detail: req.text, confirmLabel: "Log it" } };
  }
  const backlog = await fetchBacklog(admin, userId, projectId);
  if (!backlog.ok) return { ok: false, reply: "I couldn't read your backlog just now, so I haven't changed anything. Try again in a moment." };

  if (req.kind === "add_task") {
    if (!activeMilestoneId(backlog.milestones)) {
      return { ok: false, reply: "This project has no milestones yet, so there is nowhere to put the task. Generate the roadmap first, then ask again." };
    }
    return { ok: true, card: { proposal: { kind: "add_task", title: req.title }, heading: "Add this task", detail: req.title, confirmLabel: "Add task" } };
  }

  const open = backlog.tasks.filter((t) => !t.is_completed).map((t) => ({ id: t.id, title: t.title }));
  const { task, ambiguous } = pickTask(rankTasks(req.query, open));
  const verb = req.outcome === "done" ? "Mark as done" : "Mark as blocked";
  if (task) {
    return { ok: true, card: { proposal: { kind: "set_task", taskId: task.id, outcome: req.outcome }, heading: verb, detail: task.title, confirmLabel: req.outcome === "done" ? "Mark done" : "Mark blocked" } };
  }
  if (ambiguous) {
    const choices = rankTasks(req.query, open).map((t) => ({ taskId: t.id, title: t.title }));
    return { ok: true, card: { proposal: { kind: "set_task", taskId: choices[0].taskId, outcome: req.outcome }, heading: `${verb}: which one?`, detail: "More than one open task fits. Pick the one you mean.", confirmLabel: "", choices } };
  }
  return { ok: false, reply: `I couldn't find an open task matching "${req.query}". Nothing was changed. Say it with a few words from the task title and I'll try again.` };
}

export type ApplyResult = { ok: true; message: string } | { ok: false; status: number; error: string };

export async function applyWrite(admin: Admin, userId: string, projectId: string, input: unknown): Promise<ApplyResult> {
  const parsed = ProposalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, status: 400, error: "That request isn't valid." };
  const p = parsed.data;

  if (p.kind === "remind") {
    // Project ownership is verified below by fetchBacklog; a reminder needs no backlog, so check it directly.
    const { data: own } = await admin.from("projects").select("id").eq("id", projectId).eq("user_id", userId).maybeSingle();
    if (!own) return { ok: false, status: 404, error: "Project not found." };
    const { count } = await admin.from("today_loops").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "open");
    if ((count ?? 0) >= MAX_OPEN_LOOPS) return { ok: false, status: 409, error: `You already have ${MAX_OPEN_LOOPS} open reminders. Record one on Today first.` };
    const { data: dup } = await admin.from("today_loops").select("id").eq("user_id", userId).eq("status", "open").eq("task_text", p.text).maybeSingle();
    if (dup?.id) return { ok: true, message: "That reminder is already set." };
    const { error } = await admin.from("today_loops").insert({ user_id: userId, project_id: projectId, task_text: p.text, measure: "Did you get to it?", due_at: dueAtFor(p.choice) });
    if (error) return { ok: false, status: 500, error: "Couldn't set the reminder." };
    return { ok: true, message: `Reminder set for ${DURATION_CHOICES[p.choice].label.toLowerCase()}. It will show at the top of Today when it's due.` };
  }

  // Ownership: fetchBacklog verifies the project belongs to userId and only returns that user's rows.
  const backlog = await fetchBacklog(admin, userId, projectId);
  if (!backlog.ok) return { ok: false, status: backlog.status, error: backlog.error };

  if (p.kind === "add_task") {
    const milestoneId = activeMilestoneId(backlog.milestones);
    if (!milestoneId) return { ok: false, status: 409, error: "No milestone to add the task to." };
    const base = { milestone_id: milestoneId, user_id: userId, title: p.title, status: "pending", is_completed: false, priority: 2 };
    let { error } = await admin.from("tasks").insert(base);
    if (error && /column|schema cache/i.test(error.message)) {
      ({ error } = await admin.from("tasks").insert({ milestone_id: milestoneId, user_id: userId, title: p.title, status: "pending", priority: 2 }));
    }
    if (error) return { ok: false, status: 500, error: "Couldn't add the task." };
    await note(admin, userId, `Added task via coach: ${p.title}`);
    return { ok: true, message: `Added "${p.title}" to your backlog.` };
  }

  if (p.kind === "set_task") {
    const task = backlog.tasks.find((t) => t.id === p.taskId);
    if (!task) return { ok: false, status: 404, error: "Task not found." };
    if (task.is_completed) return { ok: true, message: `"${task.title}" is already done.` };
    const now = new Date().toISOString();
    const patch = p.outcome === "done"
      ? { is_completed: true, status: "completed", completed_at: now, updated_at: now }
      : { is_completed: false, status: "blocked", updated_at: now };
    const { error } = await admin.from("tasks").update(patch).eq("id", task.id).eq("user_id", userId);
    if (error) return { ok: false, status: 500, error: "Couldn't update the task." };
    await note(admin, userId, `${p.outcome === "done" ? "Completed" : "Blocked"} task via coach: ${task.title}`);
    return { ok: true, message: p.outcome === "done" ? `Marked "${task.title}" as done.` : `Marked "${task.title}" as blocked.` };
  }

  // log_outreach: attach to the open task it most plausibly belongs to (if one clearly does) and save to coach memory.
  const open = backlog.tasks.filter((t) => !t.is_completed).map((t) => ({ id: t.id, title: t.title }));
  const { task } = pickTask(rankTasks(p.text, open));
  let attached = "";
  if (task) {
    const full = backlog.tasks.find((t) => t.id === task.id);
    const line = `${new Date().toISOString().slice(0, 10)} outreach (self-reported): ${p.text}`;
    const notes = [full?.notes, line].filter(Boolean).join("\n").slice(0, 2000);
    const { error } = await admin.from("tasks").update({ notes }).eq("id", task.id).eq("user_id", userId);
    if (!error) attached = ` and added it to the notes of "${task.title}"`;
  }
  await note(admin, userId, `Outreach result: ${p.text}`);
  return { ok: true, message: `Logged${attached}. It is marked self-reported, so it won't count as verified proof.` };
}

async function note(admin: Admin, userId: string, text: string) {
  try {
    await recordInteractionServer(admin as Parameters<typeof recordInteractionServer>[0], userId, "ai_coach", text);
  } catch { /* memory is best-effort */ }
}
