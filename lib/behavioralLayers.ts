/**
 * lib/behavioralLayers.ts — Seven-Layer Orchestrator
 *
 * Single entry point that:
 *   1. Loads raw data for all 7 layers from Supabase
 *   2. Runs each layer's analysis
 *   3. Returns a unified BehavioralContext with:
 *      - Per-layer results
 *      - A single `promptBlock` ready to inject into the today-action AI system prompt
 *      - A `mirrorMilestone` if the founder has hit a new milestone (first insight / card / report)
 *
 * Designed to run in parallel with the existing today-action data fetches — adds
 * one extra parallel query group but no sequential round-trips.
 *
 * Import and call `loadBehavioralContext(supabase, userId, momentumScore)` inside
 * the today-action route AFTER authentication, BEFORE the reflexion prompt build.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;
import {
  buildTemporalProfile,
  buildTemporalPromptBlock,
  type TemporalProfile,
} from "@/lib/temporalPatterns";
import {
  analyzeLinguisticSignals,
  buildLinguisticPromptBlock,
  type LinguisticProfile,
  type ReflectionEntry,
} from "@/lib/linguisticSignals";
import {
  buildExecutionSignature,
  buildOutcomePromptBlock,
  type ExecutionSignature,
  type TaskRecord,
} from "@/lib/outcomeCorrelation";
import {
  computeExternalAnchorReport,
  type ExternalAnchorContext,
  type ExternalAnchorReport,
} from "@/lib/externalAnchors";
import {
  buildProactiveNotification,
  buildWeeklyBriefingPayload,
  shouldDeliverMorningBriefing,
  type ProactiveNotificationPayload,
} from "@/lib/proactiveDelivery";
import {
  getMirrorMomentMilestone,
  generateFirstInsight,
  generateSignatureCard,
  buildMirrorPromptBlock,
  selectArchetype,
  type FirstInsight,
  type SignatureCard,
  type PatternReport,
  generatePatternReport,
  type FounderArchetype,
} from "@/lib/mirrorMoment";
import {
  buildBehavioralShareCard,
  type BehavioralShareCard,
} from "@/lib/socialAccountability";
import type { MorningBriefing } from "@/lib/founderContext";

// ── Public types ──────────────────────────────────────────────────────────────

export interface BehavioralContext {
  // Per-layer results
  temporal: TemporalProfile;
  linguistic: LinguisticProfile;
  execution: ExecutionSignature;
  anchors: ExternalAnchorReport;

  // Mirror moment
  milestone: ReturnType<typeof getMirrorMomentMilestone>;
  archetype: FounderArchetype | null;
  firstInsight: FirstInsight | null;
  signatureCard: SignatureCard | null;
  patternReport: PatternReport | null;

  // Social layer
  shareCard: BehavioralShareCard | null;

  // Proactive delivery
  shouldDeliverNotification: boolean;
  notificationPayload: ProactiveNotificationPayload | null;

  // The single prompt block to inject — concatenation of all non-empty layer blocks
  promptBlock: string;

  // Founder metadata
  checkinsTotal: number;
  daysSinceStart: number;
}

// ── Data loader ───────────────────────────────────────────────────────────────

/**
 * loadBehavioralContext — fetch all layer inputs from Supabase and run the analysis.
 *
 * Fires 5 parallel Supabase queries:
 *   A) activity_log   — Layer 1 (temporal patterns)
 *   B) reflections    — Layers 2, 3, 6 (linguistic, outcome, mirror)
 *   C) founder_context — Layer 4 (external anchors + metadata)
 *   D) founder_memory  — Layer 4 (avoidance for archetype)
 *   E) morning_briefing_cache — Layer 5 (proactive delivery check)
 *
 * @param supabase      — admin client (already constructed in today-action)
 * @param userId        — authenticated user ID
 * @param momentumScore — current momentum score from cognition layer (default 50)
 * @param founderName   — display name for share cards
 * @param briefing      — today's MorningBriefing if already constructed
 */
export async function loadBehavioralContext(
  supabase: SupabaseClient,
  userId: string,
  momentumScore = 50,
  founderName: string | null = null,
  briefing: MorningBriefing | null = null,
): Promise<BehavioralContext> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // ── Parallel data fetch ──────────────────────────────────────────────────
  const [activityRes, reflectionsRes, contextRes, memoryRes, briefingCacheRes] =
    await Promise.allSettled([
      // A) Activity log for temporal analysis
      supabase
        .from("activity_log")
        .select("event_type, created_at, metadata")
        .eq("user_id", userId)
        .gte("created_at", thirtyDaysAgo)
        .order("created_at", { ascending: false })
        .limit(500),

      // B) Reflections for linguistic + outcome + mirror
      supabase
        .from("reflections")
        .select(
          "today_action, note, blocker, confidence, outcome, created_at, what_tried, what_happened, what_learned",
        )
        .eq("user_id", userId)
        .gte("created_at", thirtyDaysAgo)
        .order("created_at", { ascending: false })
        .limit(60),

      // C) Founder context for external anchors
      supabase
        .from("founder_context")
        .select(
          "timezone_offset, morning_briefing_hour, last_active, days_inactive, " +
            "momentum_score, streak, tasks_overridden_this_week",
        )
        .eq("user_id", userId)
        .maybeSingle(),

      // D) Founder memory for avoidance zones + archetype
      supabase
        .from("founder_memory")
        .select("avoidance_zones, strengths, personality_tags, last_insight, execution_score")
        .eq("user_id", userId)
        .maybeSingle(),

      // E) Briefing delivery cache
      supabase
        .from("morning_briefing_cache")
        .select("generated_at, delivered_at")
        .eq("user_id", userId)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  // ── Unpack results ────────────────────────────────────────────────────────
  const activityEvents =
    activityRes.status === "fulfilled" ? (activityRes.value.data ?? []) : [];
  const reflectionRows =
    reflectionsRes.status === "fulfilled" ? (reflectionsRes.value.data ?? []) : [];
  const contextRow =
    contextRes.status === "fulfilled" ? contextRes.value.data : null;
  const memoryRow =
    memoryRes.status === "fulfilled" ? memoryRes.value.data : null;
  const latestBriefing =
    briefingCacheRes.status === "fulfilled" ? briefingCacheRes.value.data : null;

  const tzOffset: number = (contextRow as { timezone_offset?: number } | null)?.timezone_offset ?? 0;

  // ── Layer 1: Temporal patterns ────────────────────────────────────────────
  const temporal = buildTemporalProfile(activityEvents, tzOffset);

  // ── Layer 2: Linguistic signals ───────────────────────────────────────────
  const reflectionEntries: ReflectionEntry[] = reflectionRows.map((r: Record<string, unknown>) => ({
    content: [r["note"], r["what_tried"], r["what_happened"], r["what_learned"]]
      .filter(Boolean)
      .join(" "),
    created_at: r["created_at"] as string,
    confidence: r["confidence"] as number | null,
    completed: r["outcome"] === "completed" || r["outcome"] === "done",
    blockers: r["blocker"] as string | null,
  }));
  const linguistic = analyzeLinguisticSignals(reflectionEntries);

  // ── Layer 3: Outcome correlation ──────────────────────────────────────────
  const taskRecords: TaskRecord[] = reflectionRows.map((r: Record<string, unknown>) => ({
    title: (r["today_action"] ?? r["note"] ?? "") as string,
    completed: r["outcome"] === "completed" || r["outcome"] === "done",
    created_at: r["created_at"] as string,
    override_reason: null,
  }));
  const execution = buildExecutionSignature(taskRecords, momentumScore);

  // ── Layer 4: External anchors ─────────────────────────────────────────────
  // Derive what we can from available DB rows — remaining fields require schema additions
  const recentTaskTitles = taskRecords
    .slice(0, 7)
    .map((r) => r.title)
    .filter(Boolean);

  const anchorCtx: ExternalAnchorContext = {
    lastUserConversationDate: null, // TODO: add last_user_conversation_date to founder_context
    riskiestAssumption: null,       // TODO: add riskiest_assumption to founder_context
    lastAssumptionEvidenceDate: null,
    launchDate: null,               // TODO: add launch_date to projects table
    revenueTarget: null,
    recentTaskTitles,
    externalSignals: [],
    currentMomentumScore: momentumScore,
  };
  const anchors = computeExternalAnchorReport(anchorCtx);

  // ── Founder metadata ──────────────────────────────────────────────────────
  const checkinsTotal = reflectionRows.length;
  const firstReflection = reflectionRows[reflectionRows.length - 1];
  const daysSinceStart = firstReflection
    ? Math.floor(
        (Date.now() - new Date(firstReflection.created_at).getTime()) / 86400000,
      )
    : 0;

  // ── Layer 6: Mirror moment ────────────────────────────────────────────────
  const mirrorInputs = {
    temporal,
    linguistic,
    execution,
    anchors,
    checkinsTotal,
    daysSinceStart,
  };

  const milestone = getMirrorMomentMilestone(checkinsTotal, daysSinceStart);
  const archetype = checkinsTotal >= 3 ? selectArchetype(mirrorInputs) : null;

  const firstInsight =
    milestone === "first_insight" || milestone === "signature_card" || milestone === "pattern_report"
      ? generateFirstInsight(mirrorInputs)
      : null;

  const signatureCard =
    milestone === "signature_card" || milestone === "pattern_report"
      ? generateSignatureCard({ founderName, dayCount: daysSinceStart, inputs: mirrorInputs })
      : null;

  const patternReport =
    milestone === "pattern_report"
      ? generatePatternReport({ founderName, dayCount: daysSinceStart, inputs: mirrorInputs })
      : null;

  // ── Layer 7: Social share card ────────────────────────────────────────────
  const executionScore = (memoryRow as { execution_score?: number } | null)?.execution_score ?? 50;
  const streakCount = (contextRow as { streak?: number } | null)?.streak ?? 0;
  const completedThisWeek = taskRecords.filter((r) => {
    const age = Date.now() - new Date(r.created_at).getTime();
    return r.completed && age < 7 * 86400000;
  }).length;
  const totalThisWeek = taskRecords.filter((r) => {
    const age = Date.now() - new Date(r.created_at).getTime();
    return age < 7 * 86400000;
  }).length;

  const shareCard =
    daysSinceStart >= 7 && totalThisWeek >= 3
      ? buildBehavioralShareCard({
          founderName,
          weekNumber: Math.ceil(daysSinceStart / 7),
          tasksCompleted: completedThisWeek,
          totalTasks: totalThisWeek,
          userConversationsThisWeek: 0, // TODO: wire from external anchors when schema updated
          avoidanceZone: execution.avoidanceZones[0]?.category ?? null,
          executionScore,
          streakCount,
          userId,
        })
      : null;

  // ── Layer 5: Proactive delivery ───────────────────────────────────────────
  const lastDeliveredAt =
    (latestBriefing as { delivered_at?: string | null } | null)?.delivered_at ?? null;
  const shouldDeliverNotification = shouldDeliverMorningBriefing(lastDeliveredAt);

  let notificationPayload: ProactiveNotificationPayload | null = null;
  if (shouldDeliverNotification && briefing) {
    notificationPayload = buildProactiveNotification(briefing, founderName);
  }

  // ── Prompt block assembly ─────────────────────────────────────────────────
  // Order: mirror context (most personal) → execution signature → external anchors
  // → temporal patterns → linguistic signals
  const mirrorBlock = buildMirrorPromptBlock(firstInsight, signatureCard);
  const outcomeBlock = buildOutcomePromptBlock(execution);
  const anchorBlock = anchors.promptBlock;
  const temporalBlock = buildTemporalPromptBlock(temporal);
  const linguisticBlock = buildLinguisticPromptBlock(linguistic);

  const promptBlock = [mirrorBlock, outcomeBlock, anchorBlock, temporalBlock, linguisticBlock]
    .filter(Boolean)
    .join("\n\n");

  return {
    temporal,
    linguistic,
    execution,
    anchors,
    milestone,
    archetype,
    firstInsight,
    signatureCard,
    patternReport,
    shareCard,
    shouldDeliverNotification,
    notificationPayload,
    promptBlock,
    checkinsTotal,
    daysSinceStart,
  };
}

/**
 * buildWeeklyBriefing — convenience wrapper for the weekly cron job.
 * Call from /api/cron/morning-briefing/worker after the standard briefing is built.
 */
export async function buildWeeklyBriefing(
  supabase: SupabaseClient,
  userId: string,
  founderName: string | null,
  nextTaskDraft: string,
) {
  const [contextRes, reflectionsRes] = await Promise.allSettled([
    supabase
      .from("founder_context")
      .select("streak")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("reflections")
      .select("outcome, today_action, created_at")
      .eq("user_id", userId)
      .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString())
      .order("created_at", { ascending: false }),
  ]);

  const streak =
    contextRes.status === "fulfilled"
      ? ((contextRes.value.data as { streak?: number } | null)?.streak ?? 0)
      : 0;

  const weekRows =
    reflectionsRes.status === "fulfilled" ? (reflectionsRes.value.data ?? []) : [];

  const completed = weekRows.filter(
    (r: Record<string, unknown>) => r["outcome"] === "completed" || r["outcome"] === "done",
  ).length;

  // Infer avoidance zone from this week's incomplete tasks
  const incompleteTitles = weekRows
    .filter((r: Record<string, unknown>) => r["outcome"] !== "completed" && r["outcome"] !== "done")
    .map((r: Record<string, unknown>) => (r["today_action"] ?? "") as string)
    .filter(Boolean);

  const avoidanceThemes: Record<string, number> = {};
  const avoidancePatterns: Array<{ label: string; re: RegExp }> = [
    { label: "outreach", re: /message|DM|email|reach out|contact/i },
    { label: "content",  re: /write|post|publish|blog/i },
    { label: "technical", re: /build|code|implement|fix/i },
  ];
  for (const title of incompleteTitles) {
    for (const { label, re } of avoidancePatterns) {
      if (re.test(title)) avoidanceThemes[label] = (avoidanceThemes[label] ?? 0) + 1;
    }
  }
  const avoidanceZoneThisWeek =
    Object.entries(avoidanceThemes).sort(([, a], [, b]) => b - a)[0]?.[0] ?? null;

  return buildWeeklyBriefingPayload({
    completedCount: completed,
    totalCount: weekRows.length,
    avoidanceZoneThisWeek,
    nextTaskDraft,
    streakCount: streak,
    founderName,
  });
}
