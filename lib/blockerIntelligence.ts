/**
 * lib/blockerIntelligence.ts
 *
 * The full blocker intelligence pipeline:
 *
 *   1. classifyBlocker()      — maps free text → blocker_category enum
 *   2. detectContradictions() — reads the contradiction_signals view
 *   3. generateInsight()      — produces the "cheat code" insight card text
 *   4. surfaceInsight()       — writes to blocker_insights, updates avoidance_zones
 *   5. getActiveInsight()     — returns the pending insight for the Today page
 *   6. dismissInsight()       — marks as dismissed or acted on
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ── Types ──────────────────────────────────────────────────────────────────────

export type BlockerCategory =
  | "visibility"
  | "conversion"
  | "user_access"
  | "technical"
  | "clarity"
  | "resource"
  | "motivation"
  | "feedback_loop"
  | "other";

export interface ContradictionSignal {
  user_id: string;
  blocker_category: BlockerCategory;
  occurrence_count: number;
  last_seen: string;
  expected_action_type: string;
  alternative_action_type: string;
  expected_action_completion_rate: number;
  expected_action_attempts: number;
  is_contradiction: boolean;
  contradiction_severity: "high" | "medium" | "low";
}

export interface BlockerInsight {
  id: string;
  user_id: string;
  blocker_category: BlockerCategory;
  insight_type: "contradiction" | "pattern" | "redirect" | "streak_break";
  title: string;
  body: string;
  action_redirect: string | null;
  dismissed: boolean;
  surfaced_at: string;
  acted_on: boolean;
}

// ── 1. Blocker classifier ─────────────────────────────────────────────────────
// Deterministic — no AI call. Maps free-text blocker phrases to categories.
// If the text is ambiguous, defaults to 'other' and the model pick is auditable.

const CATEGORY_KEYWORDS: Record<BlockerCategory, RegExp[]> = {
  visibility: [
    /\b(no one|nobody|can.t get|hard to reach|no traffic|no views|no impressions|invisible|unseen|distribution|discoverability|reach|awareness|traction)\b/i,
    /\b(visibility|getting seen|getting noticed|find me|find us|find the product)\b/i,
  ],
  conversion: [
    /\b(sign.?up|paid|convert|payment|checkout|pricing|too expensive|won.t pay|not paying|churn|drop.?off|bounce)\b/i,
    /\b(conversion|interested but|sees it but|demo but)\b/i,
  ],
  user_access: [
    /\b(can.t find|where to find|who to talk|finding users|finding customers|can.t reach|no access to|no connections)\b/i,
    /\b(user access|finding people|target users)\b/i,
  ],
  technical: [
    /\b(bug|error|crash|broken|deploy|build fail|auth|infrastructure|database|slow|performance|integration|api|ssl|domain)\b/i,
    /\b(technical|stack|framework|code|fix|debug|infra)\b/i,
  ],
  clarity: [
    /\b(not sure what|don.t know what|unclear|which direction|pivot|confused|lost|what to build|who for|target|niche|focus)\b/i,
    /\b(clarity|direction|strategy|positioning|what problem)\b/i,
  ],
  resource: [
    /\b(no time|not enough time|money|budget|team|hiring|solo|burn|runway|funding|can.t afford)\b/i,
    /\b(resource|bandwidth|capacity|can.t hire)\b/i,
  ],
  motivation: [
    /\b(motivation|energy|tired|burnt|burnout|discouraged|giving up|why bother|point|depressed|anxious|scared|fear|procrastinat)\b/i,
    /\b(consistency|showing up|accountability|momentum|streak)\b/i,
  ],
  feedback_loop: [
    /\b(no feedback|no response|no signal|silence|crickets|launched but|shipped but|nobody replied|nobody responded)\b/i,
    /\b(feedback loop|validation signal|market signal|response rate)\b/i,
  ],
  other: [],
};

export function classifyBlocker(text: string): BlockerCategory {
  if (!text?.trim()) return "other";
  const normalized = text.toLowerCase();
  for (const [category, patterns] of Object.entries(CATEGORY_KEYWORDS) as [BlockerCategory, RegExp[]][]) {
    if (category === "other") continue;
    if (patterns.some(p => p.test(normalized))) return category;
  }
  return "other";
}

// ── 2. Contradiction detector ─────────────────────────────────────────────────

export async function detectContradictions(
  supabase: SupabaseClient,
  userId: string,
): Promise<ContradictionSignal[]> {
  const { data, error } = await supabase
    .from("blocker_contradiction_signals")
    .select("*")
    .eq("user_id", userId)
    .eq("is_contradiction", true)
    .order("contradiction_severity", { ascending: false })
    .order("occurrence_count", { ascending: false });

  if (error) throw error;
  return (data ?? []) as ContradictionSignal[];
}

// ── 3. Insight generator ─────────────────────────────────────────────────────
// Produces the named "cheat code" insight — specific, founder-voice, data-backed.
// No AI call here — deterministic based on the contradiction signal.
// The AI coach uses this as context, but the insight itself is rule-based
// so it's reliable and fast regardless of model quality.

interface InsightContent {
  title: string;
  body: string;
  action_redirect: string;
}

const CATEGORY_LABELS: Record<BlockerCategory, string> = {
  visibility:    "Visibility",
  conversion:    "Conversion",
  user_access:   "Finding users",
  technical:     "Technical blocker",
  clarity:       "Clarity",
  resource:      "Resources",
  motivation:    "Motivation",
  feedback_loop: "Feedback loop",
  other:         "Blocker",
};

const ACTION_TYPE_LABELS: Record<string, string> = {
  content:        "content creation",
  outreach:       "direct outreach",
  user_interview: "user interviews",
  build:          "building",
  other:          "general tasks",
};

function formatRate(rate: number): string {
  return `${Math.round(rate)}%`;
}

export function generateInsightContent(signal: ContradictionSignal): InsightContent {
  const blockerLabel = CATEGORY_LABELS[signal.blocker_category];
  const expectedLabel = ACTION_TYPE_LABELS[signal.expected_action_type] ?? signal.expected_action_type;
  const alternativeLabel = ACTION_TYPE_LABELS[signal.alternative_action_type] ?? signal.alternative_action_type;
  const rate = formatRate(signal.expected_action_completion_rate);
  const count = signal.occurrence_count;
  const attempts = signal.expected_action_attempts;

  // Build the specific body text per blocker category
  const categoryInsights: Record<BlockerCategory, string> = {
    visibility: `You've logged "${blockerLabel}" as a blocker ${count} time${count > 1 ? "s" : ""}. BuildMind recommended ${expectedLabel} ${attempts} time${attempts > 1 ? "s" : ""} in response — you completed ${rate} of those. The approach isn't working. Founders who broke visibility at your stage didn't do it through more content. They did it through direct ${alternativeLabel} — finding 3 people who should know about this and telling them directly, not broadcasting and hoping. Tomorrow: no content task. One direct message.`,

    conversion: `You've flagged "${blockerLabel}" ${count} time${count > 1 ? "s" : ""}. BuildMind kept recommending ${expectedLabel}, which you completed ${rate} of the time. Low completion on the recommended fix usually means the approach doesn't match the actual friction. Conversion problems are almost always a messaging or targeting problem, not a funnel problem. The redirect: talk to 3 people who saw the product and didn't convert. Not a survey — a conversation. That data is worth more than any funnel tweak.`,

    user_access: `"${blockerLabel}" has appeared ${count} time${count > 1 ? "s" : ""} in your reflections. BuildMind recommended ${expectedLabel} — you completed ${rate}. Finding the right users is the bottleneck, not doing more work once you find them. The move that works: go where your users already are. One specific community, one specific subreddit, one specific Slack group. Show up there with something genuinely useful. That beats a cold funnel every time.`,

    technical: `You've logged "${blockerLabel}" ${count} time${count > 1 ? "s" : ""}. BuildMind recommended ${expectedLabel} — completed ${rate}. Technical blockers compound: every day the bug isn't fixed, everything else slows. The pattern that breaks this: timeboxed debugging. Give it 90 minutes max. If it's not fixed, post the error message somewhere public (Discord, Stack Overflow, a founder Slack). Someone will know. Don't let a technical wall stop user-facing work for more than a day.`,

    clarity: `"${blockerLabel}" has come up ${count} time${count > 1 ? "s" : ""}. ${attempts} ${expectedLabel} recommendations, ${rate} completion. Clarity problems are almost never solved by thinking harder. They're solved by getting specific feedback from one real person. The question isn't "what should I build" — it's "does this specific person have this specific problem badly enough to change how they do things?" One conversation answers that. Tomorrow: one call, not a planning session.`,

    resource: `"${blockerLabel}" appeared ${count} time${count > 1 ? "s" : ""}. Resource constraints are real, but they're also the most common reason founders avoid the work that would actually change the constraint. The question is: what's the one thing that, if done this week, would change the resource picture? Usually it's either revenue or a specific ask to a specific person. Tomorrow's action is that thing — not managing the constraint.`,

    motivation: `"${blockerLabel}" has shown up ${count} time${count > 1 ? "s" : ""}. BuildMind recommended ${expectedLabel} — you completed ${rate}. Motivation problems usually aren't about belief in the idea. They're about the gap between where you are and where you expected to be. The fastest way out is a tiny win — something small enough to complete in 30 minutes and feel real. Tomorrow is that task, not the strategic question.`,

    feedback_loop: `You've logged "${blockerLabel}" ${count} time${count > 1 ? "s" : ""}. ${attempts} ${expectedLabel} tasks recommended, ${rate} completed. No signal back usually means the distribution method isn't right, not that the product is wrong. Direct ${alternativeLabel} always gets faster signal than broadcast. Tomorrow: reach out to 3 specific people and ask them one question. No form. No survey. A direct message with a question they can answer in two sentences.`,

    other: `"${blockerLabel}" has appeared ${count} time${count > 1 ? "s" : ""}. The recommended approach (${expectedLabel}) had a ${rate} completion rate — lower than it should be. When the recommended action isn't getting done, the issue is usually specificity: the task isn't concrete enough to start. Tomorrow's action will be a direct, 30-minute task. If it still doesn't happen, the question is what's actually in the way.`,
  };

  return {
    title: `${blockerLabel} loop detected`,
    body: categoryInsights[signal.blocker_category],
    action_redirect: signal.alternative_action_type,
  };
}

// ── 4. Surface insight — write to DB, update avoidance_zones ─────────────────

export async function surfaceInsight(
  supabase: SupabaseClient,
  userId: string,
  signal: ContradictionSignal,
): Promise<BlockerInsight | null> {
  // Deduplicate: don't re-surface same blocker within 7 days
  const { data: existing } = await supabase
    .from("blocker_insights")
    .select("id, surfaced_at")
    .eq("user_id", userId)
    .eq("blocker_category", signal.blocker_category)
    .eq("dismissed", false)
    .gte("surfaced_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .maybeSingle();

  if (existing) return null; // already active insight for this blocker

  const content = generateInsightContent(signal);

  const { data: insight, error } = await supabase
    .from("blocker_insights")
    .insert({
      user_id:          userId,
      blocker_category: signal.blocker_category,
      insight_type:     "contradiction",
      title:            content.title,
      body:             content.body,
      action_redirect:  content.action_redirect,
    })
    .select()
    .single();

  if (error) throw error;

  // Step 4: wire blocker → founder_memory.avoidance_zones
  // This is the missing pipeline from the original audit
  await writeBlockerToMemory(supabase, userId, signal.blocker_category);

  return insight as BlockerInsight;
}

async function writeBlockerToMemory(
  supabase: SupabaseClient,
  userId: string,
  category: BlockerCategory,
): Promise<void> {
  try {
    const { data: memory } = await supabase
      .from("founder_memory")
      .select("avoidance_zones")
      .eq("user_id", userId)
      .maybeSingle();

    const existing: string[] = (memory?.avoidance_zones as string[] | null) ?? [];

    // Normalise the category label for human-readable avoidance_zones
    const label = CATEGORY_LABELS[category];
    if (existing.includes(label)) return; // already there

    const updated = [...existing, label].slice(-5); // keep latest 5

    await supabase
      .from("founder_memory")
      .upsert(
        { user_id: userId, avoidance_zones: updated, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
  } catch {
    // non-fatal
  }
}

// ── 5. Get active insight for the Today page ──────────────────────────────────

export async function getActiveInsight(
  supabase: SupabaseClient,
  userId: string,
): Promise<BlockerInsight | null> {
  const { data } = await supabase
    .from("blocker_insights")
    .select("*")
    .eq("user_id", userId)
    .eq("dismissed", false)
    .order("surfaced_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as BlockerInsight | null) ?? null;
}

// ── 6. Dismiss / act on insight ───────────────────────────────────────────────

export async function dismissInsight(
  supabase: SupabaseClient,
  insightId: string,
  actedOn = false,
): Promise<void> {
  await supabase
    .from("blocker_insights")
    .update({
      dismissed:     true,
      dismissed_at:  new Date().toISOString(),
      acted_on:      actedOn,
      acted_on_at:   actedOn ? new Date().toISOString() : null,
    })
    .eq("id", insightId);
}

// ── 7. Run full pipeline — called from reflect-action route ───────────────────
// After a reflection is saved, run this to detect contradictions and surface
// insights. Fire-and-forget from the route — never blocks the response.

export async function runBlockerIntelligencePipeline(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  try {
    const contradictions = await detectContradictions(supabase, userId);
    if (!contradictions.length) return;

    // Take the highest-severity contradiction only (one insight at a time)
    const top = contradictions[0];
    if (top.contradiction_severity === "low") return;

    await surfaceInsight(supabase, userId, top);
  } catch {
    // non-fatal — never block the reflection save
  }
}
