/**
 * lib/proactiveDelivery.ts — Layer 5: Proactive Delivery System
 *
 * The day-one hook. Removes the decision to open the app.
 *
 * The morning notification contains the task already drafted — not a reminder,
 * the actual draft. Founder opens to one screen: draft, send, dismiss. Nothing else.
 *
 * This layer:
 *   1. Determines the optimal delivery time (founder's detected peak hour or 7am fallback)
 *   2. Generates the notification payload from the pre-drafted morning briefing
 *   3. Formats a minimal "one action" screen payload for the /today page
 *   4. Logs dismissals as behavioral signals (not just missed opens)
 *   5. Generates the weekly briefing summary that delivers without opening the app
 *
 * Works on day one — before behavioral patterns are established — because
 * a stage-based default task draft is always available from the reflexion pipeline.
 */

import type { MorningBriefing } from "@/lib/founderContext";
import type { TemporalProfile } from "@/lib/temporalPatterns";

export interface ProactiveNotificationPayload {
  title: string;
  body: string;           // "Today: [task]. Tap to review."
  url: string;            // always /today
  tag: string;            // "morning-briefing" — deduplication
  icon: string;
  badge: string;
  data: {
    taskDraft: string;
    taskAction: string;   // the one thing to do
    briefingId: string;
    deliveredAt: string;
  };
}

export interface TodayScreenPayload {
  /** The complete drafted message or action to send/do — ready to copy-paste */
  draft: string;
  /** One-line description of the action */
  action: string;
  /** "Why this matters now" — 1–2 sentences max */
  why: string;
  /** Time estimate */
  estimatedTime: string;
  /** The send/dismiss actions the UI should offer */
  primaryCta: string;  // e.g. "Send this message" or "Do this now"
  dismissLabel: string; // always "Not today"
}

export interface WeeklyBriefingPayload {
  subject: string;
  summary: string;
  completedCount: number;
  totalCount: number;
  avoidanceZoneThisWeek: string | null;
  nextMondayTaskDraft: string;
  streakCount: number;
}

// ── Delivery time logic ────────────────────────────────────────────────────────

/**
 * computeOptimalDeliveryHour — returns the best UTC hour to deliver the morning task.
 * Uses the founder's detected peak productivity hour if available,
 * otherwise falls back to a default.
 */
export function computeOptimalDeliveryHour(
  profile: TemporalProfile,
  timezoneOffsetHours: number,
  defaultLocalHour = 7,
): number {
  const localHour = profile.peakProductivityHour ?? defaultLocalHour;
  // Convert to UTC: localHour - timezoneOffset
  const utcHour = ((localHour - timezoneOffsetHours) % 24 + 24) % 24;
  return utcHour;
}

// ── Notification payload ───────────────────────────────────────────────────────

/**
 * buildProactiveNotification — construct the push notification payload
 * for a founder's morning delivery.
 *
 * The notification body IS the task — not a prompt to open the app.
 * "Today: Message 3 SaaS founders about their execution habits. Draft ready. Tap to review."
 */
export function buildProactiveNotification(
  briefing: MorningBriefing,
  founderName: string | null,
): ProactiveNotificationPayload {
  const firstName = founderName?.split(" ")[0] ?? null;
  const greeting = firstName ? `${firstName} — ` : "";

  // Trim the action to notification-friendly length
  const shortAction = briefing.action.length > 80
    ? briefing.action.slice(0, 77) + "…"
    : briefing.action;

  return {
    title: `${greeting}Your task is ready`,
    body: `Today: ${shortAction}. Draft ready — tap to review.`,
    url: "/today",
    tag: "morning-briefing",
    icon: "/logo/icon-192.png",
    badge: "/logo/badge-72.png",
    data: {
      taskDraft: briefing.action,
      taskAction: briefing.action,
      briefingId: briefing.id,
      deliveredAt: new Date().toISOString(),
    },
  };
}

// ── Today screen payload ───────────────────────────────────────────────────────

/**
 * buildTodayScreenPayload — generate the minimal one-action screen shown
 * when the founder taps the morning notification.
 *
 * Design principle: one screen, one decision. No dashboard.
 * Founder sees: draft → send or dismiss.
 */
export function buildTodayScreenPayload(
  briefing: MorningBriefing,
  taskMessage: string,   // ready-to-send message from today-action route
  timeEstimate: string,
): TodayScreenPayload {
  return {
    draft: taskMessage,
    action: briefing.action,
    why: briefing.risk   // briefing.risk explains why this matters today
      ? `If you skip this: ${briefing.risk}`
      : `This is the highest-leverage thing you can do today.`,
    estimatedTime: timeEstimate || "30–45 minutes",
    primaryCta: inferCTA(briefing.action),
    dismissLabel: "Not today — remind me tomorrow",
  };
}

function inferCTA(action: string): string {
  if (/\b(message|DM|email|send|reach out|contact|post)\b/i.test(action)) {
    return "Send this message";
  }
  if (/\b(call|talk|speak|meet)\b/i.test(action)) {
    return "Make this call";
  }
  if (/\b(publish|post|share|submit)\b/i.test(action)) {
    return "Publish this now";
  }
  if (/\b(build|code|implement|ship|deploy)\b/i.test(action)) {
    return "Start building";
  }
  return "Do this now";
}

// ── Weekly briefing ────────────────────────────────────────────────────────────

/**
 * buildWeeklyBriefingPayload — the Sunday/Monday summary delivered without
 * the founder having to open the app.
 *
 * Contains:
 *  - Completion summary
 *  - Named avoidance zone for the week
 *  - Next Monday's task already drafted
 */
export function buildWeeklyBriefingPayload(params: {
  completedCount: number;
  totalCount: number;
  avoidanceZoneThisWeek: string | null;
  nextTaskDraft: string;
  streakCount: number;
  founderName: string | null;
}): WeeklyBriefingPayload {
  const { completedCount, totalCount, avoidanceZoneThisWeek, nextTaskDraft, streakCount, founderName } = params;
  const completionRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const firstName = founderName?.split(" ")[0] ?? "Founder";

  const completionLine =
    completedCount === totalCount
      ? `You completed all ${totalCount} tasks this week. That's rare — protect that streak.`
      : `You completed ${completedCount}/${totalCount} tasks this week (${completionRate}%).`;

  const avoidanceLine = avoidanceZoneThisWeek
    ? `Your avoidance zone this week: ${avoidanceZoneThisWeek}.`
    : "";

  const streakLine =
    streakCount >= 7
      ? `${streakCount}-day streak. You're in a rare execution window — don't break it.`
      : streakCount >= 3
        ? `${streakCount}-day streak. Keep the momentum.`
        : "";

  const summary = [completionLine, avoidanceLine, streakLine]
    .filter(Boolean)
    .join(" ");

  return {
    subject: `${firstName}: your week in execution`,
    summary,
    completedCount,
    totalCount,
    avoidanceZoneThisWeek,
    nextMondayTaskDraft: nextTaskDraft,
    streakCount,
  };
}

// ── Dismissal signal logging ───────────────────────────────────────────────────

export interface DismissalSignal {
  taskTitle: string;
  dismissedAt: string;   // ISO
  reason?: string | null;
}

/**
 * buildDismissalInsight — given a history of dismissed tasks, identify
 * what the founder is consistently not doing when given a direct draft.
 *
 * This is different from "override" — a dismissal means the draft was delivered,
 * the founder saw it, and still chose not to act.
 */
export function buildDismissalInsight(dismissals: DismissalSignal[]): string | null {
  if (dismissals.length < 3) return null;

  // Detect category pattern in dismissed tasks
  const PATTERNS: Array<{ label: string; re: RegExp }> = [
    { label: "outreach tasks", re: /message|DM|email|reach out|contact|call|talk to/i },
    { label: "content tasks",  re: /write|post|publish|newsletter|blog/i },
    { label: "technical work", re: /build|code|implement|fix|deploy/i },
    { label: "user conversations", re: /user|customer|interview|feedback/i },
  ];

  const counts: Record<string, number> = {};
  for (const d of dismissals) {
    for (const { label, re } of PATTERNS) {
      if (re.test(d.taskTitle)) {
        counts[label] = (counts[label] ?? 0) + 1;
      }
    }
  }

  const topCategory = Object.entries(counts).sort(([, a], [, b]) => b - a)[0];
  if (!topCategory || topCategory[1] < 2) return null;

  return (
    `You've been given a ready-to-send draft for ${topCategory[0]} ${topCategory[1]} times and dismissed it each time. ` +
    `That's not a scheduling problem. That's a decision. Name what's actually stopping you.`
  );
}

// ── Format helpers for the /api/cron/morning-briefing/worker ─────────────────

/**
 * formatNotificationBody — the exact string that appears in the push notification.
 * Kept under 100 chars for mobile display.
 */
export function formatNotificationBody(action: string): string {
  const trimmed = action.replace(/\s+/g, " ").trim();
  if (trimmed.length <= 90) return `Today: ${trimmed}`;
  return `Today: ${trimmed.slice(0, 87)}…`;
}

/**
 * shouldDeliverMorningBriefing — returns true if the briefing has not been
 * delivered in the last 20 hours (prevents duplicates from cron retries).
 */
export function shouldDeliverMorningBriefing(lastDeliveredAt: string | null): boolean {
  if (!lastDeliveredAt) return true;
  const hoursSince = (Date.now() - new Date(lastDeliveredAt).getTime()) / 3600000;
  return hoursSince >= 20;
}
