/**
 * lib/todayMission.ts — decides WHAT KIND of work today's task should be,
 * before any model writes a word.
 *
 * Why this exists: the old Today pipeline asked the model for a platform, a
 * head-count and a user type on every single day, and a pre-screen rejected
 * anything without all three. That made every task an outreach task. A founder
 * whose real next step was "ship the pricing page" or "decide which of my 5
 * interview answers to act on" got a generic DM template instead.
 *
 * Now a deterministic planner reads the founder's stage, recent task history
 * (and how each one ended), blockers, avoidance, energy and momentum, and
 * picks a mission kind. The model is told the kind and writes within it. The
 * quality rubric below grades the result against that kind, so a build task is
 * not failed for lacking a LinkedIn mention, and an outreach task still must
 * name a platform and a number.
 *
 * Pure, no I/O, client-safe.
 */

import { classifyTask, tokenize, stem, type Purpose, type Domain } from "@/lib/taxonomy/taskTaxonomy";

export type MissionKind =
  | "interview"   // 1:1 conversations about the problem
  | "outreach"    // tailored first-touch messages
  | "follow_up"   // chase people who already engaged
  | "build"       // ship one visible increment of the product
  | "publish"     // put one public asset on one channel
  | "pricing"     // put a price / payment ask in front of someone
  | "analyze"     // answer one decision question from data already in hand
  | "unblock"     // smallest slice of the thing being avoided
  | "reset";      // short win to rebuild momentum

export const MISSION_KINDS: MissionKind[] = ["interview", "outreach", "follow_up", "build", "publish", "pricing", "analyze", "unblock", "reset"];

export interface RecentTask {
  text: string;
  outcome: string | null; // completed | partial | learned | blocked | pending | null
}

export interface MissionSignals {
  stage: string;
  /** Newest first. */
  recentTasks: RecentTask[];
  avoidance: string[];
  blockers: string[];
  activeGoals: string[];
  cognitiveLoad?: "fresh" | "drained" | "autopilot";
  momentum?: number;           // 0-100
  isLowConfidence?: boolean;
  /** Decision-layer candidate id (lib/founderIntelligence.ts), used as a nudge, not an override. */
  candidateId?: string | null;
  excludeAction?: string;
}

export interface MissionRequires {
  platform: boolean;
  number: boolean;
  userType: boolean;
  draft: boolean;
}

export interface Mission {
  kind: MissionKind;
  runnerUp: MissionKind | null;
  minutes: number;
  reasons: string[];
  requires: MissionRequires;
  label: string;
  /** Plain-English description of what a good task of this kind looks like. */
  shape: string;
  scores: Record<MissionKind, number>;
}

const KIND_META: Record<MissionKind, { label: string; minutes: number; requires: MissionRequires; shape: (u: string) => string }> = {
  interview: {
    label: "Talk to real users",
    minutes: 40,
    requires: { platform: false, number: true, userType: true, draft: true },
    shape: (u) => `A live 1:1 conversation (call, chat or in person) with a named type of ${u}, about the last time they hit the problem. Done = a stated number of conversations held or booked, with notes captured.`,
  },
  outreach: {
    label: "Reach out",
    minutes: 30,
    requires: { platform: true, number: true, userType: true, draft: true },
    shape: (u) => `A stated number of personal first-touch messages to ${u} on one named platform. Each one mentions something specific to the recipient. Done = messages sent.`,
  },
  follow_up: {
    label: "Follow up",
    minutes: 20,
    requires: { platform: false, number: true, userType: false, draft: true },
    shape: () => `Go back to people who already replied, tried the product or said "maybe". Each gets one specific next-step ask (a call time, a trial, a yes/no). Done = every named person has a concrete next step or a closed answer.`,
  },
  build: {
    label: "Ship something",
    minutes: 60,
    requires: { platform: false, number: false, userType: false, draft: false },
    shape: () => `One small, finishable increment of the product described in the product's own terms (a named screen, flow, fix or integration), not "work on the product". Done = it is deployed, merged or usable by one real person.`,
  },
  publish: {
    label: "Publish publicly",
    minutes: 30,
    requires: { platform: true, number: false, userType: false, draft: true },
    shape: (u) => `One public asset (post, thread, demo clip, changelog, landing section) on one named channel where ${u} spend time. It states a specific claim or shows a specific result. Done = it is live and the link exists.`,
  },
  pricing: {
    label: "Ask for money",
    minutes: 30,
    requires: { platform: false, number: false, userType: false, draft: true },
    shape: () => `Put a real price or payment link in front of a real person, or write the price and the offer in one place. Done = someone has seen the price, or the payment link is live.`,
  },
  analyze: {
    label: "Decide from data",
    minutes: 30,
    requires: { platform: false, number: false, userType: false, draft: false },
    shape: () => `Answer ONE decision question using data already in hand (interview notes, replies, analytics, competitor pages). Done = a written 3-line decision: what you saw, what you'll do, what you'll stop doing.`,
  },
  unblock: {
    label: "Break the avoidance",
    minutes: 20,
    requires: { platform: false, number: false, userType: false, draft: false },
    shape: () => `The smallest honest slice (20 minutes or less) of the specific thing this founder keeps putting off. Name it exactly. Done = that slice exists, even if rough.`,
  },
  reset: {
    label: "Rebuild momentum",
    minutes: 15,
    requires: { platform: false, number: false, userType: false, draft: false },
    shape: () => `A 15-minute win with a visible result. Low judgment, clear first step. Done = one finished artifact or one sent message that did not exist this morning.`,
  },
};

export function missionMeta(kind: MissionKind) { return KIND_META[kind]; }

// ── Mapping a task's text back to a kind ────────────────────────────────────

const FOLLOW_UP_RE = /\b(follow[\s-]?up|follow up with|reply to|respond to|circle back|chase|nudge)\b/i;
const PRICING_RE = /\b(pric(e|es|ing)|charge|invoice|payment link|paywall|paid plan|ask .{0,20}(to pay|for money)|stripe|paystack|polar)\b/i;
const PUBLISH_RE = /\b(publish|post(ing)? (a|one|your|the)|write (a|one) (post|thread|article)|thread|changelog|demo (video|clip)|record a (demo|video)|launch (on|post))\b/i;
const INTERVIEW_RE = /\b(interview|jump on a call|call with|talk to|speak (to|with)|15[\s-]?minute call|user call)\b/i;
const UNBLOCK_RE = /\b(finally|stop avoiding|the thing you|the one you)\b/i;

export function kindOfTask(text: string): MissionKind | null {
  const t = String(text ?? "");
  if (!t.trim()) return null;
  if (FOLLOW_UP_RE.test(t)) return "follow_up";
  if (PRICING_RE.test(t)) return "pricing";
  if (INTERVIEW_RE.test(t)) return "interview";
  if (PUBLISH_RE.test(t)) return "publish";
  if (UNBLOCK_RE.test(t)) return "unblock";
  const c = classifyTask(t);
  if (!c.purpose) {
    if (/\b(ship|build|implement|deploy|refactor|integrate|fix (the|a|your)|code (the|a)|add (a|the) [\w\s-]{0,30}(screen|page|feature|flow|button|endpoint))\b/i.test(t)) return "build";
    if (/\b(analy[sz]e|review (the|your|every)|decide|compare|re-read)\b/i.test(t)) return "analyze";
  }
  switch (c.purpose) {
    case "evidence":     return /\b(survey|form|questionnaire|message|dm|email|reach out|cold)\b/i.test(t) || /outreach/i.test(c.label) ? "outreach" : "interview";
    case "distribution": return /\b(dm|message|email|reach out|cold)\b/i.test(t) ? "outreach" : "publish";
    case "revenue":      return "pricing";
    case "build":        return "build";
    case "plan":         return "analyze";
    case "people":       return "outreach";
    case "ops":          return null;
    case "capital":      return null;
    default:             return null;
  }
}

// ── Parsing the recent-tasks prompt block ──────────────────────────────────

/** Parses lines like `1. 10/2/2026: "Message 3 founders" [completed]` (see lib/todayPersonalisationContext.ts). */
export function parseRecentTasks(block: string | undefined | null): RecentTask[] {
  if (!block) return [];
  const out: RecentTask[] = [];
  for (const line of block.split("\n")) {
    const m = line.trim().match(/^\d+\.\s+[^:]*:\s*"(.+?)"\s*(?:\[([a-z_]+)\])?\s*$/i);
    if (m) out.push({ text: m[1], outcome: m[2] ? m[2].toLowerCase() : null });
  }
  return out;
}

// ── Planning ────────────────────────────────────────────────────────────────

type StageBand = "idea" | "validation" | "building" | "launch" | "growth";
function stageBand(stage: string): StageBand {
  const s = stage.toLowerCase();
  if (/idea|concept|explor/.test(s)) return "idea";
  if (/valid|discover|problem/.test(s)) return "validation";
  if (/build|mvp|prototype|develop/.test(s)) return "building";
  if (/launch|beta|early/.test(s)) return "launch";
  if (/grow|revenue|scale|traction|paying/.test(s)) return "growth";
  return "validation";
}

const BASE: Record<StageBand, Record<MissionKind, number>> = {
  idea:       { interview: 6, outreach: 4, follow_up: 1, build: 0.5, publish: 1, pricing: 0.5, analyze: 2, unblock: 1, reset: 0.5 },
  validation: { interview: 5, outreach: 4, follow_up: 2.5, build: 2, publish: 1.5, pricing: 2.5, analyze: 2.5, unblock: 1, reset: 0.5 },
  building:   { interview: 2, outreach: 1.5, follow_up: 2, build: 6, publish: 2, pricing: 2, analyze: 2, unblock: 1.5, reset: 0.5 },
  launch:     { interview: 2, outreach: 3, follow_up: 3.5, build: 2.5, publish: 5, pricing: 3.5, analyze: 2, unblock: 1, reset: 0.5 },
  growth:     { interview: 2, outreach: 2.5, follow_up: 3, build: 3, publish: 3.5, pricing: 4, analyze: 4, unblock: 1, reset: 0.5 },
};

const DOMAIN_TO_KIND: Partial<Record<Domain, MissionKind[]>> = {
  "Customer discovery": ["interview", "outreach"],
  "Outreach & sales": ["outreach", "follow_up"],
  "Content & distribution": ["publish"],
  "Launch & growth": ["publish", "outreach"],
  "Product engineering": ["build"],
  "Design & UX": ["build"],
  "Pricing & revenue": ["pricing"],
  "Research & strategy": ["analyze"],
};

const PURPOSE_TO_KIND: Partial<Record<Purpose, MissionKind>> = {
  evidence: "interview", distribution: "publish", revenue: "pricing", build: "build", plan: "analyze", people: "outreach",
};

const FI_NUDGE: Record<string, Partial<Record<MissionKind, number>>> = {
  evidence_probe: { interview: 1.5, outreach: 1 },
  unstall_goal: { unblock: 2, reset: 0.5 },
  avoidance_microdose: { unblock: 2.5 },
  continue_best_next_task: { build: 1 },
};

const OUTCOME_GOOD = new Set(["completed", "learned"]);

export function planTodayMission(s: MissionSignals): Mission {
  const band = stageBand(s.stage || "");
  const w: Record<MissionKind, number> = { ...BASE[band] };
  const reasons: string[] = [];
  const bump = (k: MissionKind, n: number) => { w[k] += n; };

  const recent = s.recentTasks.slice(0, 8);
  const recentKinds = recent.map((t) => kindOfTask(t.text));

  // 1. Fatigue: the same kind several days running loses weight, most recent hardest.
  const fatigueKinds = new Set<MissionKind>();
  recentKinds.slice(0, 4).forEach((k, i) => {
    if (!k) return;
    bump(k, -(2.6 - i * 0.55));
    if (i < 2) fatigueKinds.add(k);
  });
  if (fatigueKinds.size > 0) reasons.push(`Last tasks were mostly ${[...fatigueKinds].map((k) => KIND_META[k].label.toLowerCase()).join(" / ")}, so something different is due.`);

  // 2. Evidence drought: nothing that touches real people in the last 5 tasks.
  const peopleKinds: MissionKind[] = ["interview", "outreach", "follow_up"];
  const hasPeopleRecently = recentKinds.slice(0, 5).some((k) => k && peopleKinds.includes(k));
  if (!hasPeopleRecently && (band === "idea" || band === "validation" || band === "launch")) {
    bump("interview", 2); bump("outreach", 1.5);
    reasons.push("No recent task put you in front of a real person.");
  }

  // 3. What happened last time.
  const last = recent[0];
  const lastKind = recentKinds[0];
  if (last && OUTCOME_GOOD.has(last.outcome ?? "") && lastKind && (lastKind === "outreach" || lastKind === "interview")) {
    bump("follow_up", 3);
    reasons.push("You finished a people task last time, so replies are the next thing to work.");
  }
  if (last && OUTCOME_GOOD.has(last.outcome ?? "") && lastKind === "publish") bump("analyze", 1.5);
  if (last && OUTCOME_GOOD.has(last.outcome ?? "") && lastKind === "build") { bump("publish", 1.5); bump("interview", 1); }

  const blockedRecent = recent.slice(0, 3).filter((t) => t.outcome === "blocked").length;
  if (last?.outcome === "blocked") {
    bump("unblock", 3); bump("reset", 1.5);
    reasons.push("Last task ended blocked; today targets the block, in a smaller slice.");
  }
  if (blockedRecent >= 2) {
    bump("reset", 3); bump("unblock", 1.5);
    reasons.push("Two of the last three tasks were blocked, so today is deliberately small.");
  }

  // 4. Avoidance zones point at a domain; avoid it less, but gently.
  if (s.avoidance.length > 0 && s.cognitiveLoad !== "drained") {
    bump("unblock", 2);
    const named = s.avoidance[0];
    reasons.push(`You've been avoiding ${named}.`);
    for (const a of s.avoidance.slice(0, 3)) {
      const c = classifyTask(a);
      const kinds = (c.domain && DOMAIN_TO_KIND[c.domain]) || [];
      kinds.forEach((k) => bump(k, 1.2));
    }
  }

  // 5. Energy.
  if (s.cognitiveLoad === "drained") {
    bump("reset", 2.5); bump("follow_up", 1); bump("unblock", -1.5); bump("build", -1.5); bump("interview", -1.5); bump("analyze", -0.5);
    reasons.push("Energy is low today, so the task is short and low-judgment.");
  } else if (s.cognitiveLoad === "autopilot") {
    bump("outreach", 1); bump("follow_up", 1); bump("analyze", -1);
    reasons.push("Focus is low, so a scripted task beats one that needs fresh judgment.");
  }

  // 6. Confidence and momentum.
  if (s.isLowConfidence) { bump("interview", 2); bump("analyze", 1); bump("build", -1.5); reasons.push("There isn't enough evidence yet to be confident, so the task closes an evidence gap."); }
  if (typeof s.momentum === "number") {
    if (s.momentum < 35) bump("reset", 2);
    else if (s.momentum > 75) { bump("build", 1); bump("pricing", 1); }
  }

  // 7. Decision-layer candidate (a nudge, not an override).
  if (s.candidateId && FI_NUDGE[s.candidateId]) {
    for (const [k, n] of Object.entries(FI_NUDGE[s.candidateId])) bump(k as MissionKind, n as number);
  }

  // 8. Open milestones pull toward the kind of work they are.
  for (const g of s.activeGoals.slice(0, 3)) {
    const c = classifyTask(g);
    const k = c.purpose ? PURPOSE_TO_KIND[c.purpose] : undefined;
    if (k) bump(k, 0.7);
  }

  // 9. Do not repeat what was just rejected.
  if (s.excludeAction) {
    const k = kindOfTask(s.excludeAction);
    if (k) { bump(k, -4); reasons.push("You just rejected the last suggestion, so a different kind of task."); }
  }

  const order = MISSION_KINDS;
  const ranked = [...order].sort((a, b) => (w[b] - w[a]) || (order.indexOf(a) - order.indexOf(b)));
  const kind = ranked[0];
  const meta = KIND_META[kind];

  let minutes = meta.minutes;
  if (s.cognitiveLoad === "drained") minutes = Math.min(minutes, 20);
  else if (s.cognitiveLoad === "autopilot") minutes = Math.min(minutes, 30);

  if (reasons.length === 0) reasons.push(`At ${s.stage || "this"} stage, ${meta.label.toLowerCase()} produces the most new information.`);

  return {
    kind,
    runnerUp: ranked[1] ?? null,
    minutes,
    reasons: reasons.slice(0, 4),
    requires: meta.requires,
    label: meta.label,
    shape: meta.shape("their target users"),
    scores: w,
  };
}

/** Prompt block that tells the model what kind of task it is writing and why. */
export function missionPromptBlock(m: Mission, ctx: { targetUsers?: string; avoidance?: string[]; blockers?: string[] }): string {
  const u = ctx.targetUsers?.trim() || "their target users";
  const lines = [
    `TODAY'S MISSION (chosen from this founder's stage, history and energy, not random): ${m.label.toUpperCase()}`,
    `Why this kind: ${m.reasons.join(" ")}`,
    `Shape of a good task: ${KIND_META[m.kind].shape(u)}`,
    `Time box: ${m.minutes} minutes.`,
  ];
  if (m.kind === "unblock" && (ctx.avoidance?.length || ctx.blockers?.length)) {
    lines.push(`Name this exactly: ${[...(ctx.avoidance ?? []), ...(ctx.blockers ?? [])].slice(0, 2).join("; ")}`);
  }
  lines.push(
    "The task must NOT drift into another kind of work. Do not turn it into outreach unless the mission is outreach, interview, follow_up or publish.",
  );
  return lines.join("\n");
}

// ── Quality rubric ──────────────────────────────────────────────────────────

export interface CandidateTask {
  task: string;
  done_when?: string;
  first_step?: string;
  minutes?: number;
  platform?: string;
  count?: number;
  user_type?: string;
  draft?: string;
}

export interface QualityContext {
  title?: string;
  targetUsers?: string;
  problem?: string;
  blockers?: string[];
  avoidance?: string[];
  activeGoals?: string[];
  recentTasks: RecentTask[];
}

export interface QualityResult {
  score: number;
  pass: boolean;
  hardFails: string[];
  softFails: string[];
  reasons: string[];
}

const GENERIC_RE = /\b(research (your|the) (market|competitors?|industry)|think about|brainstorm|come up with ideas|explore (options|ideas|ways)|look into|consider (how|whether|what)|plan (your|out|the)|get (some )?feedback|network(ing)?\b|build (an? )?audience|improve (your )?(product|marketing|business)|work on (your )?(product|marketing|business|startup|idea)|some (users|people|customers)|potential (users|customers)|relevant communities|reach out to people|grow your)\b/i;
const PLACEHOLDER_RE = /\[[A-Za-z][^\]]{0,40}\]|\{\{?[a-z_ ]+\}?\}/;
const PLATFORM_RE = /(linkedin|whatsapp|email|twitter|x\.com|phone|in person|slack|telegram|instagram|reddit|product hunt|indie hackers|discord|facebook|youtube|tiktok|hacker news|zoom|google meet|call)/i;

function stemSet(text: string): Set<string> {
  const STOP = new Set(["the", "a", "an", "of", "to", "in", "on", "for", "and", "or", "with", "your", "my", "our", "is", "it", "that", "this", "at", "by", "as", "be", "you", "i", "today", "one", "two", "three"]);
  return new Set(tokenize(text).filter((t) => t.length > 2 && !STOP.has(t)).map(stem));
}

export function similarity(a: string, b: string): number {
  const A = stemSet(a), B = stemSet(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  A.forEach((x) => { if (B.has(x)) inter++; });
  return inter / (A.size + B.size - inter);
}

export function assessTaskQuality(c: CandidateTask, mission: Mission, ctx: QualityContext): QualityResult {
  const hard: string[] = [];
  const soft: string[] = [];
  const task = (c.task ?? "").trim();

  if (task.length < 25) hard.push("too_short");
  if (task.length > 320) hard.push("too_long");
  if (GENERIC_RE.test(task)) hard.push("generic");
  if (PLACEHOLDER_RE.test(task) || PLACEHOLDER_RE.test(c.draft ?? "")) hard.push("placeholder");
  if (!c.done_when || c.done_when.trim().length < 8) hard.push("no_done_when");

  for (const r of ctx.recentTasks.slice(0, 8)) {
    if (similarity(task, r.text) >= 0.55) { hard.push("repeat"); break; }
  }

  const req = mission.requires;
  if (req.number && !/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i.test(task)) hard.push("missing_number");
  if (req.platform && !PLATFORM_RE.test(`${task} ${c.platform ?? ""}`)) hard.push("missing_platform");
  if (req.userType) {
    const first = ctx.targetUsers?.trim().split(/\s+/)[0]?.toLowerCase();
    if (first && first.length > 2 && !task.toLowerCase().includes(first.replace(/s$/, ""))) hard.push("missing_user_type");
  }

  // Grounded in this founder's own words?
  const own = [ctx.title, ctx.targetUsers, ctx.problem, ...(ctx.blockers ?? []), ...(ctx.avoidance ?? []), ...(ctx.activeGoals ?? [])].filter(Boolean).join(" ");
  const ownStems = stemSet(own);
  const taskStems = stemSet(task);
  let overlap = 0;
  taskStems.forEach((x) => { if (ownStems.has(x)) overlap++; });
  if (ownStems.size > 0 && overlap < 1) soft.push("not_grounded");

  if (!c.first_step || c.first_step.trim().length < 8) soft.push("no_first_step");
  if (typeof c.minutes === "number" && (c.minutes < 5 || c.minutes > 90)) soft.push("bad_time_box");
  if (mission.kind === "unblock" || mission.kind === "reset") {
    if (typeof c.minutes === "number" && c.minutes > 30) soft.push("too_big_for_mission");
  }
  const k = kindOfTask(task);
  if (k && k !== mission.kind && !(mission.kind === "interview" && k === "outreach") && !(mission.kind === "reset")) soft.push("kind_drift");
  if (mission.requires.draft && (!c.draft || c.draft.trim().length < 25)) soft.push("no_draft");

  const score = Math.max(0, 100 - hard.length * 35 - soft.length * 10);
  const reasons = [...hard, ...soft].map((f) => REASON_TEXT[f] ?? f);
  return { score, pass: hard.length === 0 && score >= 70, hardFails: hard, softFails: soft, reasons };
}

const REASON_TEXT: Record<string, string> = {
  too_short: "Task is too short to be specific.",
  too_long: "Task is longer than one sentence of work.",
  generic: "Task uses a generic phrase (research / brainstorm / explore) instead of a concrete action.",
  placeholder: "Contains a [placeholder] that the founder would have to fill in.",
  no_done_when: "Missing a clear 'done when' condition.",
  repeat: "Too similar to a recent task.",
  missing_number: "Needs a specific number for this kind of task.",
  missing_platform: "Needs a named platform or channel for this kind of task.",
  missing_user_type: "Needs to name the target user type.",
  not_grounded: "Does not use any of the founder's own product, user or blocker language.",
  no_first_step: "Missing a literal first step to start in the next 2 minutes.",
  bad_time_box: "Time box is outside 5-90 minutes.",
  too_big_for_mission: "Too big for an unblock/reset mission (max 30 minutes).",
  kind_drift: "Drifts away from today's mission kind.",
  no_draft: "This kind of task needs a paste-ready draft.",
};

/**
 * Lighter, kind-aware gate for routes that only have the final task sentence
 * (no done_when / first_step fields): generic phrasing, placeholders, repeats,
 * and the platform/number/user-type requirements of THIS mission kind only.
 */
export function failsMissionPreScreen(task: string, mission: Mission, ctx: QualityContext): { fails: boolean; failed_checks: string[] } {
  const q = assessTaskQuality({ task, done_when: "placeholder-ok", first_step: "placeholder-ok", draft: "x".repeat(30) }, mission, ctx);
  const failed = q.hardFails.filter((f) => f !== "no_done_when");
  return { fails: failed.length > 0, failed_checks: failed };
}
