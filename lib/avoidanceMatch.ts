/**
 * lib/avoidanceMatch.ts — decides whether this week's finished actions
 * show a founder facing something they had been avoiding.
 *
 * Avoidance zones are written by lib/blockerIntelligence.ts as category
 * labels ("Visibility", "Finding users", "Conversion"...), NOT as task
 * text. The old matcher compared those labels to action titles with
 * String.includes, which almost never hit, so Avoidance Resistance sat at
 * F no matter what the founder did. Two honest signals are used instead:
 *
 *  1. action_type — each zone maps to the kinds of action that confront it
 *     (Finding users → outreach / user_interview).
 *  2. keywords in the action text for that zone.
 *
 * A zone can also be marked faced by the founder (app/api/avoidance/resolve),
 * which is the only route for zones with no action mapping (Motivation).
 */

export interface CompletedAction {
  title: string;
  actionType?: string | null;
}

const ZONE_RULES: Record<string, { types: string[]; words: string[] }> = {
  visibility: { types: ["content", "outreach"], words: ["post", "publish", "share", "launch", "announce", "tweet", "linkedin", "newsletter", "audience"] },
  conversion: { types: ["user_interview"], words: ["convert", "checkout", "pricing", "signup", "sign up", "landing", "pay", "paid", "trial", "onboarding"] },
  "finding users": { types: ["outreach", "user_interview"], words: ["interview", "reach out", "dm", "email", "community", "customer", "prospect", "talk to", "call"] },
  "technical blocker": { types: ["build"], words: ["fix", "bug", "build", "ship", "deploy", "code", "integrate", "refactor"] },
  clarity: { types: ["research", "pivot"], words: ["define", "decide", "clarify", "positioning", "plan", "write down", "scope"] },
  resources: { types: ["research", "outreach"], words: ["budget", "tool", "hire", "fund", "grant", "partner", "contractor"] },
  "feedback loop": { types: ["user_interview"], words: ["feedback", "survey", "interview", "ask", "review", "test with"] },
};

const STOP = new Set(["the", "and", "for", "with", "your", "from", "that", "this", "have", "into", "about"]);

function stem(w: string): string {
  return w.replace(/(ing|ed|es|s)$/u, "");
}

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((w) => w.length > 3 && !STOP.has(w))
    .map(stem);
}

export function zoneMatchesActions(zone: string, actions: CompletedAction[]): boolean {
  const key = zone.trim().toLowerCase();
  if (!key) return false;
  const rule = ZONE_RULES[key];
  const zoneTokens = tokens(key);
  return actions.some((a) => {
    const text = (a.title ?? "").toLowerCase();
    if (rule) {
      if (a.actionType && rule.types.includes(a.actionType)) return true;
      if (rule.words.some((w) => text.includes(w))) return true;
    }
    if (zoneTokens.length === 0) return false;
    const actionTokens = new Set(tokens(text));
    return zoneTokens.every((t) => actionTokens.has(t));
  });
}

/** Zones tackled by this week's actions. Order follows the zone list. */
export function matchZones(zones: string[], actions: CompletedAction[]): string[] {
  return zones.filter((z) => zoneMatchesActions(z, actions));
}
