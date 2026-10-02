/**
 * lib/coachNavigation.ts
 *
 * Makes the AI Coach DO things instead of describing them.
 *
 * Before: asked "where do I see my progress?", the Coach answered with
 * instructions ("go to Progress", "type 'show my open tasks'") that the
 * founder then had to carry out by hand.
 *
 * Now, two safe mechanisms — both closed allow-lists, both client-side, neither
 * writes data and neither spends an AI message:
 *
 *   1. matchNavigation(text)   — "take me to progress", "open settings" →
 *                                 the Coach opens the page directly.
 *   2. parseReplyLinks(reply)  — the model may end a reply with tags like
 *                                 [[open:/progress|Open Progress]] or
 *                                 [[run:list_backlog|Show my open tasks]];
 *                                 the UI strips them and renders real buttons.
 *
 * Only paths in NAV_TARGETS and chip ids in COACH_ACTION_CHIPS are honoured,
 * so a model (or a pasted prompt injection) cannot link anywhere else.
 */

import { COACH_ACTION_CHIPS, type CoachActionChip } from "@/lib/coachActions/chips";

export interface NavTarget { href: string; label: string; aliases: string[] }

export const NAV_TARGETS: NavTarget[] = [
  { href: "/today", label: "Today", aliases: ["today", "daily action", "today's task", "todays task", "my task for today"] },
  { href: "/progress", label: "Progress", aliases: ["progress", "this week", "weekly pulse", "weekly progress", "heatmap"] },
  { href: "/overview", label: "Execution", aliases: ["execution", "overview", "dashboard"] },
  { href: "/projects", label: "Projects", aliases: ["projects", "my projects", "milestones page", "backlog page"] },
  { href: "/founder-mirror", label: "Founder Mirror", aliases: ["founder mirror", "mirror", "what you believe", "beliefs page"] },
  { href: "/break-my-startup", label: "Break My Startup", aliases: ["break my startup", "stress test"] },
  { href: "/agents", label: "Agent Workforce", aliases: ["agent workforce", "agents"] },
  { href: "/achievements", label: "Achievements", aliases: ["achievements", "badges"] },
  { href: "/reports", label: "Weekly Report", aliases: ["weekly report", "reports", "export report"] },
  { href: "/reflect", label: "Reflect", aliases: ["reflect", "reflection", "check-in", "check in"] },
  { href: "/notifications", label: "Notifications", aliases: ["notifications", "notification center"] },
  { href: "/settings", label: "Settings", aliases: ["settings", "preferences", "notification settings", "notification toggles", "toggles", "ai personality", "billing", "integrations", "public profile"] },
  { href: "/upgrade", label: "Upgrade", aliases: ["upgrade", "pricing", "builder plan"] },
  { href: "/ventures", label: "Ventures", aliases: ["ventures", "blueprint"] },
  { href: "/journey", label: "Journey", aliases: ["journey", "lessons", "curriculum"] },
  { href: "/invite", label: "Invite", aliases: ["invite", "referral"] },
];

const GO_VERB = /\b(take me to|bring me to|go to|open|navigate to|show me the|pull up|jump to|switch to|head to)\b/i;

/** "take me to my progress page" → Progress. Null unless there is a clear go-verb AND a known target. */
export function matchNavigation(text: string): NavTarget | null {
  const t = text.toLowerCase().trim();
  if (t.length > 80 || !GO_VERB.test(t)) return null;
  // Longest alias wins so "notification settings" beats "settings".
  let best: { target: NavTarget; len: number } | null = null;
  for (const target of NAV_TARGETS) {
    for (const alias of target.aliases) {
      if (t.includes(alias) && (!best || alias.length > best.len)) best = { target, len: alias.length };
    }
  }
  // "open tasks"/"show my open tasks" is a data chip, not navigation.
  if (/\bopen (my )?tasks?\b/.test(t)) return null;
  return best?.target ?? null;
}

export type ReplyLink =
  | { kind: "open"; href: string; label: string }
  | { kind: "run"; chip: CoachActionChip; label: string };

const TAG = /\[\[(open|run):([^\]|]+)(?:\|([^\]]{1,40}))?\]\]/g;

/** Strips [[open:…]] / [[run:…]] tags from a reply and returns validated links (max 3). */
export function parseReplyLinks(reply: string): { text: string; links: ReplyLink[] } {
  const links: ReplyLink[] = [];
  const text = reply.replace(TAG, (_m, kind: string, target: string, label?: string) => {
    if (links.length < 3) {
      if (kind === "open") {
        const t = NAV_TARGETS.find((n) => n.href === target.trim());
        if (t) links.push({ kind: "open", href: t.href, label: (label ?? `Open ${t.label}`).trim() });
      } else {
        const chip = COACH_ACTION_CHIPS.find((c) => c.id === target.trim());
        if (chip) links.push({ kind: "run", chip, label: (label ?? chip.label).trim() });
      }
    }
    return "";
  }).replace(/[ \t]+\n/g, "\n").trim();
  return { text, links };
}

/** The instruction block that teaches the model to emit the tags. Kept next to the parser so they cannot drift. */
export function buildLinkTagInstruction(): string {
  const paths = NAV_TARGETS.map((n) => `${n.href} (${n.label})`).join(", ");
  const chips = COACH_ACTION_CHIPS.map((c) => `${c.id} (${c.label})`).join(", ");
  return `\nMAKE ANSWERS ACTIONABLE: whenever you tell the founder to go somewhere in the app or to run one of the instant actions, do NOT tell them to type or find it themselves. End your reply with up to 3 tags the UI turns into real buttons: [[open:/path|Short label]] or [[run:chip_id|Short label]]. Allowed paths: ${paths}. Allowed chip ids: ${chips}. Use only these exactly; never invent others. Do not claim you changed a setting — you can only open pages and run the instant actions; say where the toggle is and offer the button.`;
}
