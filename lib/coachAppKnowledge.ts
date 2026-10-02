/**
 * lib/coachAppKnowledge.ts
 *
 * What the AI Coach knows about BuildMind ITSELF — every page, card, toggle,
 * feature and plan limit — so a founder can ask "what does this card mean?",
 * "where do I change X?", "why is this locked?" and get a correct answer
 * instead of a guess.
 *
 * Two layers, to protect the shared free-tier token ceiling (see the coach
 * route's TPM note):
 *   1. APP_OVERVIEW      — always injected, ~350 tokens: the map of the app.
 *   2. APP_SECTIONS      — injected only when the founder's message matches a
 *                          section's keywords (max 3), each ~100-200 tokens.
 *
 * Plan numbers are READ from lib/plan.ts / app/api/ai/_utils.ts constants,
 * never retyped, so this file cannot drift from the real limits.
 *
 * MAINTENANCE RULE (add to docs/03-core-invariants.md): when a page, card,
 * toggle or plan limit changes, update the matching section here in the same
 * change. The unit test in __tests__/lib/coachAppKnowledge.test.ts fails if
 * a nav route is missing from the overview.
 */

import { PLAN_LIMITS, TRIAL_DURATION_DAYS } from "@/lib/plan";
import { PLAN_DAILY_LIMITS, CORE_DAILY_LIMITS } from "@/lib/aiLimits";
import { buildLinkTagInstruction } from "@/lib/coachNavigation";

export interface AppKnowledgeSection {
  id: string;
  title: string;
  /** Lowercase words/phrases; a section is injected when the message contains any. */
  keywords: string[];
  body: string;
}

const free = PLAN_LIMITS.free;

export const APP_OVERVIEW = `BUILDMIND APP MAP (you know this product completely — answer questions about it directly and accurately; if something is not listed here, say you're not sure rather than inventing it):
- Today (/today): the daily home. ONE action per day with a rationale, expected evidence and a check-in (Completed / Blocked / Partial / Learned). Also: morning briefing, risks & gaps, what changed, ghost-goal chip, momentum, evening check-in, recovery mode.
- Execution (/overview): overall execution dashboard across projects.
- Progress (/progress): two tabs — "This Week" (weekly pulse: story, insights, sparkline vs ghost goal, tasks/active days, grades, share) and "Patterns" (behavioral insights).
- Projects (/projects, /projects/[id]): project cards with health badges; detail has tabs Milestones, Tasks, Roadmap, Validation; stage progress and "Check stage readiness".
- Settings (/settings): tabs Profile, Account, Notifications, Billing, Integrations, AI Usage, Public Profile. AI personality: Direct & Honest, Supportive, Challenger.
- AI Coach (/ai-coach): this chat. Instant one-tap actions that cost no AI message: open tasks, signals, decision reasoning, beliefs about the founder, momentum, milestones, execution log, export of Founder Intelligence data.
- Founder Mirror (/founder-mirror): what BuildMind believes about the founder (with "Correct this"), behavioral archetype, signals, decision reasoning, relationship graph.
- Break My Startup (/break-my-startup): adversarial stress test of the idea (survival reasons, competitor table, pivot suggestion).
- Agent Workforce (/agents): Builder-only AI agents that run tasks and return findings.
- Achievements (/achievements): tracks, levels and unlock badges. Weekly Report (/reports): export (PDF/CSV/image) and 4-week heatmap, reachable from Progress.
- Also routable: Ventures (/ventures), Startup Kit (/startup-kit), Journey (/journey), Invite (/invite), Notifications (/notifications), Upgrade (/upgrade), Pricing (/pricing). The bell icon in the top bar opens notifications.
- Sidebar items unlock as the founder completes tasks (Execution at 3, AI Coach 3, Break My Startup 3, Agents 5, Founder Mirror 7).`;

export const APP_SECTIONS: AppKnowledgeSection[] = [
  {
    id: "plans",
    title: "Plans, limits and what is locked",
    keywords: ["plan", "free", "builder", "upgrade", "limit", "locked", "paywall", "trial", "price", "pricing", "$39", "pay", "billing", "subscription", "why can't i", "unlock"],
    body: `Two plans: Free ($0) and Builder ($39/mo). New accounts get a ${TRIAL_DURATION_DAYS}-day trial with Builder-level access, no card needed; after day ${TRIAL_DURATION_DAYS} they fall back to Free until they pay.
Free: ${free.maxProjects} project, ${PLAN_DAILY_LIMITS.free} general AI calls/day (AI Coach is capped at 3 messages/day), ${CORE_DAILY_LIMITS.free} daily-action generations/day, morning briefing ${free.morningBriefingDaysPerWeek} days/week, ${free.historyDays}-day history, one Break My Startup preview, first Ventures blueprint free, momentum score at level 1.
Builder: unlimited projects, history and Coach messages (fair-use daily ceiling), daily briefing, full momentum with decay warnings, explainable rationale, cognitive-load check-in, HITL overrides, evening nudges, recovery mode, founder memory, weekly report, Agent Workforce, full Ventures/CoFounder blueprints, full Break My Startup analysis.
Every Coach interaction counts toward the daily allowance — coached replies AND one-tap actions (open tasks, signals, momentum, etc.). Opening a page ("take me to Progress") is navigation and is free. The Founder Execution Intelligence report/export in Founder Mirror is Builder-only.`,
  },
  {
    id: "today",
    title: "Today page and its cards",
    keywords: ["today", "daily action", "check-in", "check in", "briefing", "ghost", "risk", "gap", "what changed", "decision brief", "confidence", "calibrat", "lite", "pro mode", "ui mode", "swap", "alternative", "evidence", "signal", "card", "reckoning", "urgency", "cognitive load", "fresh", "drained", "auto-pilot", "recovery"],
    body: `Today shows ONE action. Decision Brief = the action, why it was chosen, time estimate, and the expected evidence that would show it worked. Alternatives can be swapped in (the swap is logged so learning stays honest).
Check-in outcomes: Completed, Blocked, Partial, Learned — Completed counts toward Progress and streak/momentum; the others still teach the system.
Cards: Intelligence Panel (top signal), Risks & Gaps (up to 4 signals), What Changed (up to 3 changes this week), Context Alignment (only while BuildMind is still calibrating: what it knows, what is unknown, smallest next step), Blocker Insight (when what blocks you contradicts what you skip), Ghost Goal chip e.g. "Vigil 3/5" (weekly goal pace; tap for detail/recalibrate), Reckoning pill (appears only when a milestone has gone ~21 days stale), Urgency banner (days missed / streak risk), Recovery Mode card (after 3+ days of momentum decay: a small reset mission), Morning Briefing (win / risk / action; Free gets 3 days a week), Cognitive Load check-in (Fresh / Drained / Auto-pilot — steers which kind of task you get; Builder).
Lite vs Pro toggle (top of Today): Lite = focused default; Pro = deeper signals, evidence and the full metric row. Remembered per device.
Low confidence means BuildMind has too little history yet; it gets sharper after ~7 reflections.`,
  },
  {
    id: "progress",
    title: "Progress page and how tasks are counted",
    keywords: ["progress", "this week", "tasks done", "active days", "completion", "pulse", "sparkline", "grade", "patterns", "heatmap", "weekly", "week", "report", "export", "0/"],
    body: `Progress > This Week: "Tasks" = distinct active days this week that had a completed daily action, out of calendar days elapsed this week (it is a consistency measure, not a raw count of generated tasks). Completions are credited to the day they were finished. It also shows momentum, streak, a sparkline versus the ghost-goal pace, a per-day activity canvas (bar intensity = how consequential the action type was), and four grades (Execution Consistency, Backlog Clearance, Deadline Recovery, Avoidance Resistance). Both tabs show a "calibrating" state until ~7 reflections exist. Full export (PDF/CSV/image) lives in the Weekly Report page, linked at the bottom of This Week.
Project backlog tasks (Projects > Tasks tab) are separate from the one daily action on Today.`,
  },
  {
    id: "projects",
    title: "Projects, milestones, tasks, stages",
    keywords: ["project", "milestone", "task", "backlog", "stage", "idea", "validation", "mvp", "launch", "growth", "scale", "advance", "readiness", "roadmap", "waive", "health", "evidence"],
    body: `Stages in order: Idea → Validation → MVP → Launch → Growth. Milestones belong to a stage; a stage is "complete" when its milestones are done, but advancing also needs real evidence. "Check stage readiness" gives three tiers: not ready, checklist done but evidence thin, ready (needs at least 2 of 4 evidence slots: metric, artifact, experiment, founder judgment). Only the founder advances the stage, from the project detail page — nothing advances automatically.
Project detail tabs: Milestones (expandable cards with tasks, difficulty/estimate), Tasks (flat list), Roadmap, Validation (strengths/gaps). Milestone estimates can be provisional until tasks are detailed. Free plan allows ${free.maxProjects} project.`,
  },
  {
    id: "mirror",
    title: "Founder Mirror, intelligence and corrections",
    keywords: ["mirror", "belief", "believe", "correct", "archetype", "intelligence", "signal", "confidence", "why am i seeing", "decay", "graph", "relationship", "pattern", "memory"],
    body: `Founder Mirror lists what BuildMind believes about the founder, each with evidence and a confidence. "Correct this" lowers that belief's weight (it uses a Bayesian update, so repeated corrections matter more than one) and the shift is shown. Signals are observations with evidence rows, coverage and a limitations note; they fade with a ~10-day half-life if not refreshed. The confidence figures are model scores, not measured accuracy. The behavioral archetype is a hypothesis about working style, not a diagnosis.`,
  },
  {
    id: "bms",
    title: "Break My Startup",
    keywords: ["break my startup", "stress test", "survive", "competitor", "pivot", "attack", "kill my idea"],
    body: `Break My Startup attacks the idea like a skeptical investor: why it might die, what would let it survive, a competitor table, and a pivot suggestion when warranted. Free gets one preview; Builder gets the full analysis and competitor scan. Milestone challenges can also fire when the last task of a milestone is completed.`,
  },
  {
    id: "notifications",
    title: "Notifications and settings toggles",
    keywords: ["notification", "notify", "push", "bell", "reminder", "toggle", "setting", "email", "alert", "turn off", "mute"],
    body: `Bell (top bar) and /notifications show in-app notifications; they carry real numbers: today's task, active days vs last week, momentum change, overdue milestones, stage readiness, avoidance pattern, streak at risk. Settings > Notifications toggles: Streak Reminder (daily nudge to complete the action), Weekly Report (Sunday AI summary), AI Coach Tips (occasional insights, off by default). A separate Push toggle enables browser/phone push. Settings > AI Usage shows consumption; Integrations connects tools like Notion and Linear; Public Profile has a visibility toggle.`,
  },
  {
    id: "agents",
    title: "Agent Workforce, Ventures, Startup Kit, Journey",
    keywords: ["agent", "workforce", "venture", "blueprint", "startup kit", "journey", "lesson", "exercise", "mentor", "cofounder"],
    body: `Agent Workforce (Builder): deploy AI agents on a defined task; you confirm, they run, and findings come back for review. Ventures generates blueprints and execution systems (first blueprint free). Startup Kit is a resource page that is not in the sidebar yet. Journey is a structured curriculum with lessons, exercises, projects and mentor grading.`,
  },
  {
    id: "achievements",
    title: "Achievements, streak and momentum",
    keywords: ["achievement", "badge", "xp", "level", "streak", "momentum", "score", "unlock"],
    body: `Momentum (0-100) rises with completed actions and decays slowly when you stop; Builder sees decay warnings. Streak counts consecutive days with a completed action. Achievements are server-verified unlocks grouped in tracks and levels, with a toast on unlock.`,
  },
  {
    id: "coach",
    title: "What the AI Coach itself can do",
    keywords: ["coach", "what can you do", "export", "download", "json", "execution log", "backlog", "open tasks", "help", "how do i use"],
    body: `Typed phrases or the chips run instantly: "show my open tasks" (optionally "on the X milestone"), signals, decision reasoning, beliefs, momentum, milestones, execution log, and "export my intelligence data" (downloadable JSON, Builder only). Free plan: 3 Coach interactions/day in total (replies and actions share it). Never invent task lists, counts or file contents — offer the matching button instead of telling them to type a phrase.`,
  },
];

/** Pure + deterministic so it is trivially testable. Max 3 sections, best match first. */
export function selectAppSections(message: string, max = 3): AppKnowledgeSection[] {
  const m = message.toLowerCase();
  if (!m.trim()) return [];
  return APP_SECTIONS
    .map((s) => ({ s, score: s.keywords.reduce((n, k) => (m.includes(k) ? n + (k.length > 5 ? 2 : 1) : n), 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((x) => x.s);
}

export function buildAppKnowledgeBlock(message: string, plan: "free" | "builder"): string {
  const sections = selectAppSections(message);
  const detail = sections.length
    ? "\n\nRELEVANT APP DETAIL:\n" + sections.map((s) => `[${s.title}]\n${s.body}`).join("\n\n")
    : "";
  return `\n\n${APP_OVERVIEW}\nThis founder is currently on the ${plan === "builder" ? "Builder (or trial)" : "Free"} plan.${detail}${buildLinkTagInstruction()}`;
}
