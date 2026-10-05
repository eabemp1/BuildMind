/**
 * lib/executionPicture.ts — one consistent read of "how is the company doing"
 * for the Execution (/overview) page.
 *
 * The page used to show the same facts through several independent branches:
 * an attention strip, a "what needs a decision" card that always rendered some
 * message (even when nothing was wrong), a readiness badge, a stage nudge and a
 * "since yesterday" box that actually showed lifetime totals. They could and
 * did disagree. Everything the page says now comes from this one function, so
 * there is exactly one verdict, one next move, and a short list of watch items
 * with no repeats.
 */

export type ReadinessTier = "ready" | "checklist_only" | "not_ready" | undefined;
export type Tone = "good" | "steady" | "watch" | "risk";

export interface PictureInput {
  stage: string;
  readinessTier: ReadinessTier;
  tasksTotal: number;
  tasksDone: number;
  milestonesCompleted: number;
  streak: number;
  streakAtRisk?: boolean;
  lastStreak?: number;
  todayDone: boolean;
  daysSinceReflection: number | null;
  scoreDelta: number | null;
  nextMilestone?: string | null;
  nextTask?: string | null;
}

export interface Picture {
  tone: Tone;
  verdict: string;        // the single headline
  because: string;        // one sentence of evidence for the verdict
  nextMove: { label: string; why: string; href: string };
  watch: string[];        // distinct, only things that are actually true
  completionPct: number;
}

const STAGE_MOVE: Record<string, { label: string; why: string }> = {
  Idea:       { label: "Talk to one real customer", why: "At Idea stage the biggest risk is building for a problem nobody has confirmed." },
  Validation: { label: "Secure one paid, time or workflow commitment", why: "Commitments are stronger evidence than opinions." },
  MVP:        { label: "Put the working link in front of three real users", why: "Usage evidence is now worth more than product polish." },
  Launch:     { label: "Publish one launch asset and measure the response", why: "Distribution is the bottleneck at Launch." },
  Growth:     { label: "Interview one churned or inactive user", why: "Retention is the strongest signal at Growth." },
  Revenue:    { label: "Find the biggest leak between visit and payment", why: "At Revenue stage, conversion is the operating signal." },
};

export function buildExecutionPicture(i: PictureInput): Picture {
  const completionPct = i.tasksTotal > 0 ? Math.round((i.tasksDone / i.tasksTotal) * 100) : 0;
  const stale = i.daysSinceReflection != null && i.daysSinceReflection >= 3;
  const scoreDropped = i.scoreDelta != null && i.scoreDelta <= -10;
  const lowCompletion = i.tasksTotal >= 4 && completionPct < 50;

  const watch: string[] = [];
  if (i.streakAtRisk && !i.todayDone) watch.push(`Your ${i.streak}-day streak ends tonight unless you finish one action.`);
  else if (i.streak === 0 && (i.lastStreak ?? 0) > 0) watch.push(`Your ${i.lastStreak}-day streak lapsed. One finished action today starts a new one.`);
  if (stale) watch.push(`No reflection in ${i.daysSinceReflection} days, so tomorrow's task will be less accurate.`);
  if (scoreDropped) watch.push(`Score fell ${Math.abs(i.scoreDelta!)} points since the last reading.`);
  if (lowCompletion) watch.push(`${completionPct}% of tasks are done. Break the next one into a smaller step.`);

  let tone: Tone;
  let verdict: string;
  let because: string;

  if (i.readinessTier === "ready") {
    tone = "good";
    verdict = `Ready to move beyond ${i.stage}`;
    because = "Milestones are done and the evidence backs them up.";
  } else if (i.readinessTier === "checklist_only") {
    tone = watch.length ? "watch" : "steady";
    verdict = "Checklist done, evidence still thin";
    because = "The work is ticked off, but not enough proof from real people yet.";
  } else if (i.tasksDone === 0 && i.milestonesCompleted === 0) {
    tone = "steady";
    verdict = "Not started yet";
    because = "Nothing completed so far. The first finished action sets the baseline.";
  } else if (stale || scoreDropped || lowCompletion) {
    tone = scoreDropped && stale ? "risk" : "watch";
    verdict = `Slowing down in ${i.stage}`;
    because = `${i.tasksDone} of ${i.tasksTotal} tasks done, ${i.milestonesCompleted} milestone${i.milestonesCompleted === 1 ? "" : "s"} completed.`;
  } else {
    tone = "steady";
    verdict = `On track in ${i.stage}`;
    because = `${i.tasksDone} of ${i.tasksTotal} tasks done, ${i.milestonesCompleted} milestone${i.milestonesCompleted === 1 ? "" : "s"} completed.`;
  }

  // One next move. A concrete task beats the generic stage move; an unfinished
  // day beats both only when the founder hasn't done anything today.
  const stageMove = STAGE_MOVE[i.stage] ?? STAGE_MOVE.Idea;
  const nextMove = i.todayDone
    ? { label: stageMove.label, why: `Today's action is done. ${stageMove.why}`, href: "/today" }
    : i.nextTask
    ? { label: i.nextTask, why: i.nextMilestone ? `Next step on "${i.nextMilestone}".` : stageMove.why, href: "/today" }
    : { ...stageMove, href: "/today" };

  return { tone, verdict, because, nextMove, watch, completionPct };
}
