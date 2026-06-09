/**
 * lib/externalAnchors.ts — Layer 4: External Anchor Integration
 *
 * Grounds the behavioral model in external reality, not just internal mood.
 * The system tracks what's happening *outside* the founder's head and
 * surfaces gaps before they become silent drift.
 *
 * Anchors tracked:
 *   1. Days since last user conversation — surfaces after 7 days
 *   2. Riskiest assumption — flagged if a week passes without evidence
 *   3. Deadline countdown — recalibrates task urgency
 *   4. Revenue signal — are tasks connected to revenue or drifting to busywork?
 *   5. Busywork accumulation — "Your last 5 tasks were all technical"
 *   6. External signal log — what changed since yesterday?
 *
 * Data source:
 *   - morning_checkin (external_signal field)
 *   - reflections (today_action, created_at)
 *   - founder_context (last_user_conversation_date, riskiest_assumption, launch_date)
 */

export interface ExternalAnchorContext {
  lastUserConversationDate: string | null;    // ISO date
  riskiestAssumption: string | null;          // stored free text
  lastAssumptionEvidenceDate: string | null;  // ISO date when last tested
  launchDate: string | null;                  // ISO date
  revenueTarget: number | null;               // MRR target
  recentTaskTitles: string[];                 // last 5–7 task titles for busywork detection
  externalSignals: ExternalSignal[];          // recent "what changed?" entries
  currentMomentumScore: number;
}

export interface ExternalSignal {
  note: string;
  recorded_at: string; // ISO
}

export interface AnchorAlert {
  type:
    | "no_user_conversation"
    | "assumption_untested"
    | "deadline_approaching"
    | "busywork_accumulation"
    | "revenue_drift";
  message: string;
  urgency: "low" | "medium" | "high" | "critical";
  daysUntilDeadline?: number;
}

export interface ExternalAnchorReport {
  alerts: AnchorAlert[];
  daysSinceUserConversation: number | null;
  daysUntilLaunch: number | null;
  busyworkCategory: string | null;  // what category the last 5 tasks fall into
  latestExternalSignal: string | null;
  promptBlock: string;
}

// ── Category inference (shared with outcomeCorrelation, duplicated to avoid import cycle) ──
const TECHNICAL_PATTERN = /\b(build|code|implement|fix|debug|deploy|test|refactor|api|feature|bug|dev)\b/i;
const OUTREACH_PATTERN  = /\b(message|DM|email|reach out|contact|send|pitch|call|talk to|speak)\b/i;
const REVENUE_PATTERN   = /\b(revenue|MRR|ARR|price|pricing|payment|invoice|subscription|deal|close|charge)\b/i;
const CONTENT_PATTERN   = /\b(write|draft|blog|post|article|content|copy|tweet|thread|newsletter)\b/i;

function detectDominantCategory(titles: string[]): string | null {
  const counts = { technical: 0, outreach: 0, revenue: 0, content: 0, other: 0 };
  for (const t of titles) {
    if (TECHNICAL_PATTERN.test(t)) counts.technical++;
    else if (OUTREACH_PATTERN.test(t)) counts.outreach++;
    else if (REVENUE_PATTERN.test(t)) counts.revenue++;
    else if (CONTENT_PATTERN.test(t)) counts.content++;
    else counts.other++;
  }
  const [topCat, topCount] = Object.entries(counts).sort(([, a], [, b]) => b - a)[0];
  // Only flag if 4+ out of last 5–7 tasks are the same category
  return topCount >= Math.max(4, Math.floor(titles.length * 0.6)) ? topCat : null;
}

function daysBetween(isoA: string | null, isoB: string): number | null {
  if (!isoA) return null;
  const diff = new Date(isoB).getTime() - new Date(isoA).getTime();
  return Math.floor(diff / 86400000);
}

/**
 * computeExternalAnchorReport — evaluate all external anchors and surface gaps.
 *
 * @param ctx — anchor context loaded from DB
 * @param today — ISO date string for "now" (defaults to today UTC)
 */
export function computeExternalAnchorReport(
  ctx: ExternalAnchorContext,
  today = new Date().toISOString().slice(0, 10),
): ExternalAnchorReport {
  const alerts: AnchorAlert[] = [];

  // ── 1. User conversation gap ────────────────────────────────────────────
  const daysSinceUserConversation = daysBetween(ctx.lastUserConversationDate, today);
  if (daysSinceUserConversation !== null && daysSinceUserConversation >= 7) {
    alerts.push({
      type: "no_user_conversation",
      message:
        daysSinceUserConversation >= 14
          ? `You haven't spoken to a real user in ${daysSinceUserConversation} days. At this stage, that is the single most dangerous gap you have. Schedule a user conversation today — not tomorrow.`
          : `It's been ${daysSinceUserConversation} days since your last user conversation. Everything you're building right now is based on assumptions that are going stale.`,
      urgency: daysSinceUserConversation >= 14 ? "critical" : "high",
    });
  }

  // ── 2. Assumption untested ──────────────────────────────────────────────
  if (ctx.riskiestAssumption) {
    const daysSinceEvidence = daysBetween(ctx.lastAssumptionEvidenceDate, today);
    if (daysSinceEvidence === null || daysSinceEvidence >= 7) {
      const daysText =
        daysSinceEvidence === null
          ? "and you've never logged evidence for it"
          : `— it's been ${daysSinceEvidence} days without evidence either way`;
      alerts.push({
        type: "assumption_untested",
        message: `Your riskiest assumption is: "${ctx.riskiestAssumption}" ${daysText}. An untested assumption for 7+ days is a business risk you're choosing to ignore.`,
        urgency: daysSinceEvidence === null || daysSinceEvidence >= 14 ? "high" : "medium",
      });
    }
  }

  // ── 3. Deadline countdown ───────────────────────────────────────────────
  let daysUntilLaunch: number | null = null;
  if (ctx.launchDate) {
    daysUntilLaunch = daysBetween(today, ctx.launchDate);
    if (daysUntilLaunch !== null) {
      if (daysUntilLaunch <= 0) {
        // Past deadline
        alerts.push({
          type: "deadline_approaching",
          message: `Your launch date was ${Math.abs(daysUntilLaunch)} days ago. Either you shipped, you moved the date, or you're avoiding the decision. Which is it?`,
          urgency: "high",
          daysUntilDeadline: daysUntilLaunch,
        });
      } else if (daysUntilLaunch <= 7) {
        alerts.push({
          type: "deadline_approaching",
          message: `${daysUntilLaunch} days to your launch date. Every task this week should be evaluable by the question: "Does this get me to launch?" If it doesn't, cut it.`,
          urgency: "critical",
          daysUntilDeadline: daysUntilLaunch,
        });
      } else if (daysUntilLaunch <= 14) {
        alerts.push({
          type: "deadline_approaching",
          message: `${daysUntilLaunch} days to launch. Start cutting scope now — not in a week. The tasks that feel important but aren't launch-critical are the ones that will slip your date.`,
          urgency: "high",
          daysUntilDeadline: daysUntilLaunch,
        });
      }
    }
  }

  // ── 4. Busywork accumulation ────────────────────────────────────────────
  const busyworkCategory =
    ctx.recentTaskTitles.length >= 5
      ? detectDominantCategory(ctx.recentTaskTitles)
      : null;

  if (busyworkCategory === "technical" && (daysSinceUserConversation ?? 0) >= 5) {
    alerts.push({
      type: "busywork_accumulation",
      message: `Your last ${ctx.recentTaskTitles.length} tasks have all been technical. Your riskiest assumption is still unvalidated. Building without talking to users is the most expensive form of procrastination.`,
      urgency: "high",
    });
  } else if (busyworkCategory && busyworkCategory !== "revenue" && busyworkCategory !== "outreach") {
    alerts.push({
      type: "busywork_accumulation",
      message: `Your last ${ctx.recentTaskTitles.length} tasks have all been ${busyworkCategory} work. Depth in one area is valuable — but are you avoiding something else? The next task should break this pattern.`,
      urgency: "medium",
    });
  }

  // ── 5. Revenue drift ────────────────────────────────────────────────────
  if (ctx.revenueTarget && ctx.revenueTarget > 0 && ctx.recentTaskTitles.length >= 5) {
    const revenueTaskCount = ctx.recentTaskTitles.filter((t) => REVENUE_PATTERN.test(t) || OUTREACH_PATTERN.test(t)).length;
    const revenueFraction = revenueTaskCount / ctx.recentTaskTitles.length;
    if (revenueFraction < 0.2) {
      alerts.push({
        type: "revenue_drift",
        message: `You have a revenue target of ${ctx.revenueTarget} MRR, but your recent tasks have almost no revenue-connected work. The gap between what you're building and what generates money is growing.`,
        urgency: "medium",
      });
    }
  }

  // ── Latest external signal ──────────────────────────────────────────────
  const latestExternalSignal =
    ctx.externalSignals.length > 0 ? ctx.externalSignals[0].note : null;

  return {
    alerts: alerts.sort((a, b) => urgencyRank(b.urgency) - urgencyRank(a.urgency)),
    daysSinceUserConversation,
    daysUntilLaunch,
    busyworkCategory,
    latestExternalSignal,
    promptBlock: buildAnchorPromptBlock(alerts, latestExternalSignal),
  };
}

function urgencyRank(u: AnchorAlert["urgency"]): number {
  return { critical: 4, high: 3, medium: 2, low: 1 }[u];
}

function buildAnchorPromptBlock(alerts: AnchorAlert[], latestSignal: string | null): string {
  if (alerts.length === 0 && !latestSignal) return "";

  const lines: string[] = ["EXTERNAL ANCHOR ALERTS:"];

  for (const alert of alerts.slice(0, 2)) {
    lines.push(`[${alert.urgency.toUpperCase()}] ${alert.message}`);
  }

  if (latestSignal) {
    lines.push(`EXTERNAL SIGNAL (founder reported): "${latestSignal}"`);
  }

  lines.push(
    "Use these anchors to ground your task recommendation in external reality. " +
      "If there is a critical or high-urgency alert, the task you suggest should directly address it.",
  );

  return lines.join("\n");
}

/**
 * buildExternalAnchorCheckinQuestion — returns the single daily check-in question
 * from Layer 4: "What external signal changed since yesterday?"
 */
export function buildExternalAnchorCheckinQuestion(ctx: ExternalAnchorContext): string {
  // Rotate question based on what anchor is most at risk
  const daysSince = ctx.lastUserConversationDate
    ? Math.floor((Date.now() - new Date(ctx.lastUserConversationDate).getTime()) / 86400000)
    : null;

  if (daysSince !== null && daysSince >= 7) {
    return "When did you last speak to a real user? What did you hear?";
  }
  if (ctx.riskiestAssumption) {
    return `Has anything tested or validated your assumption that "${ctx.riskiestAssumption}"?`;
  }
  if (ctx.launchDate) {
    const daysUntil = Math.floor(
      (new Date(ctx.launchDate).getTime() - Date.now()) / 86400000,
    );
    if (daysUntil > 0 && daysUntil <= 14) {
      return `With ${daysUntil} days to launch, what's the one thing that could still break it?`;
    }
  }
  return "What external signal changed since yesterday — a user conversation, revenue move, deadline shift, or assumption tested?";
}
