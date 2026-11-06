/**
 * lib/visuals/stressVisual.ts — the milestone stress test, drawn.
 *
 * Pure. Every number comes from real milestone and task rows through lib/milestonePacing.ts
 * (a straight-line pace since each milestone was created). No model writes any of it.
 * What it cannot know is said on the page: task difficulty and dependencies are not tracked.
 */
import { computeMilestonePacing, type MilestonePacingResult } from "@/lib/milestonePacing";
import type { BacklogMilestone, BacklogTaskRow } from "@/lib/coachActions/backlog";
import type { VisualPanel, VisualSpec, VisualTone } from "@/lib/visuals/spec";

const DAY = 86_400_000;
const TONE: Record<MilestonePacingResult["risk"], VisualTone> = { high: "bad", medium: "warn", low: "good", unknown: "neutral" };
const days = (a: number, b: number) => Math.round((b - a) / DAY);

export interface StressSummary { dated: number; high: number; medium: number; low: number; unknown: number }

export function buildStressVisual(input: { milestones: BacklogMilestone[]; tasks: BacklogTaskRow[]; now?: Date }): { visual: VisualSpec; summary: StressSummary } {
  const now = input.now ?? new Date();
  const open = input.milestones.filter((m) => m.status !== "completed" && m.target_date);
  const rows = open.map((m) => {
    const mine = input.tasks.filter((t) => t.milestone_id === m.id);
    const done = mine.filter((t) => t.is_completed).length;
    const pacing = computeMilestonePacing({ id: m.id, title: m.title, targetDate: m.target_date ?? null, createdAt: m.created_at, status: m.status, tasksTotal: mine.length, tasksCompleted: done }, now);
    const target = new Date(`${String(m.target_date).slice(0, 10)}T00:00:00Z`).getTime();
    const today = new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`).getTime();
    const daysLeft = Number.isFinite(target) ? days(today, target) : null;
    const elapsed = Math.max(1, days(new Date(m.created_at).getTime(), now.getTime()));
    const left = mine.length - done;
    return { m, mine, done, left, pacing, daysLeft, soFarPerWeek: done > 0 ? (done / elapsed) * 7 : null, needPerWeek: daysLeft && daysLeft > 0 && left > 0 ? (left / daysLeft) * 7 : null };
  });

  const summary: StressSummary = { dated: rows.length, high: 0, medium: 0, low: 0, unknown: 0 };
  for (const r of rows) summary[r.pacing.risk]++;

  const panels: VisualPanel[] = [];
  if (!rows.length) {
    panels.push({ type: "callout", tone: "neutral", title: "Nothing to stress-test yet", text: "No unfinished milestone has a target date. Give a milestone a date and its tasks will be checked against your real pace." });
    return { visual: { title: "Milestone stress test", subtitle: "Your target dates against your real pace", generatedAt: now.toISOString(), panels }, summary };
  }

  panels.push({ type: "stats", title: "Where your dates stand", items: [
    { label: "Dated milestones", value: String(summary.dated), tone: "accent" },
    { label: "Unlikely at this pace", value: String(summary.high), tone: summary.high ? "bad" : "good" },
    { label: "Slightly behind", value: String(summary.medium), tone: summary.medium ? "warn" : "good" },
    { label: "Not enough data", value: String(summary.unknown), sub: "no tasks done yet", tone: "neutral" },
  ] });

  const late = rows.filter((r) => r.pacing.risk === "high" || r.pacing.risk === "medium");
  if (late.length) {
    const max = Math.max(5, ...late.map((r) => r.pacing.deltaDays ?? 0));
    panels.push({
      type: "bars", title: "Days behind target", unit: "d", caption: "Where each milestone lands if you keep today's pace.",
      items: late.slice(0, 8).map((r) => ({ label: r.m.title, value: Math.max(0, r.pacing.deltaDays ?? 0), max, tone: TONE[r.pacing.risk], note: r.pacing.reason })),
    });
  } else if (summary.low) {
    panels.push({ type: "callout", tone: "good", title: "On pace", text: "Every milestone with enough data is on pace for its target date." });
  }

  const band = rows.filter((r) => r.needPerWeek !== null && r.soFarPerWeek !== null);
  if (band.length) {
    const top = Math.max(1, ...band.flatMap((r) => [r.needPerWeek as number, r.soFarPerWeek as number]));
    const r1 = (n: number) => Math.round(n * 10) / 10;
    panels.push({
      type: "bars", title: "Pace needed against pace so far", unit: "tasks/week", caption: "Tasks per week still needed to finish on time, next to the weekly pace since each milestone started.",
      items: band.slice(0, 5).flatMap((r) => [
        { label: `${r.m.title}: needed`, value: r1(r.needPerWeek as number), max: top, tone: (r.needPerWeek as number) > (r.soFarPerWeek as number) ? ("bad" as const) : ("good" as const), note: `${r.left} open, ${r.daysLeft} days left` },
        { label: `${r.m.title}: so far`, value: r1(r.soFarPerWeek as number), max: top, tone: "neutral" as const },
      ]),
    });
  }

  if (late.length) {
    panels.push({
      type: "tree", title: "What is holding them up", root: "Behind or at risk",
      caption: "BuildMind does not track dependencies between tasks, so this lists the oldest unfinished tasks in each milestone.",
      branches: late.slice(0, 4).map((r) => ({
        label: r.m.title, tone: TONE[r.pacing.risk], note: `${r.left} unfinished`,
        children: r.mine.filter((t) => !t.is_completed).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()).slice(0, 3)
          .map((t) => ({ label: t.title, note: `${Math.max(0, days(new Date(t.created_at).getTime(), now.getTime()))} days old` })),
      })),
    });
  }

  panels.push({ type: "callout", tone: "neutral", title: "How to read this", text: "This assumes you keep the same pace you have had since each milestone was created. Task size and dependencies are not tracked, so a few big tasks can change the answer. Treat it as a warning to look, not a verdict." });
  return { visual: { title: "Milestone stress test", subtitle: "Your target dates against your real pace", generatedAt: now.toISOString(), panels }, summary };
}
