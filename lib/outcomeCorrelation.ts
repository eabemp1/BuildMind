/**
 * lib/outcomeCorrelation.ts — Layer 3: Outcome Correlation Engine
 *
 * What this specific founder actually finishes vs what they avoid.
 * Builds a completion signature per founder and uses it to weight future task generation.
 *
 * Tracks:
 *   - Completion rate by task category (outreach, technical, content, admin, research)
 *   - Completion rate by task duration bucket
 *   - Completion rate by task type (talk / build / write)
 *   - Override patterns — what they replace tasks with
 *   - When to lean into execution strengths vs force avoidance confrontation
 *
 * Data source: reflections table (today_action, completed, override_reason, category)
 */

export type TaskCategory =
  | "outreach"
  | "technical"
  | "content"
  | "admin"
  | "research"
  | "revenue"
  | "other";

export type TaskType = "talk" | "build" | "write" | "research" | "admin";

export type DurationBucket = "quick" | "medium" | "deep"; // <30min, 30-90min, >90min

export interface TaskRecord {
  title: string;                    // today_action text
  completed: boolean;
  created_at: string;               // ISO
  category?: TaskCategory | null;
  task_type?: TaskType | null;
  duration_minutes?: number | null;
  override_reason?: string | null;  // if task was replaced
  replaced_with?: string | null;    // what they chose instead
}

export interface CategoryStats {
  category: TaskCategory | TaskType;
  completionRate: number;           // 0–1
  totalTasks: number;
  isAvoidanceZone: boolean;         // completion rate < 0.35
  isStrength: boolean;              // completion rate > 0.70
}

export interface ExecutionSignature {
  strengths: CategoryStats[];                   // top performing categories
  avoidanceZones: CategoryStats[];              // lowest performing categories
  byDuration: Record<DurationBucket, { completionRate: number; count: number }>;
  byType: Partial<Record<TaskType, { completionRate: number; count: number }>>;
  overridePattern: OverridePattern | null;      // what they consistently replace tasks with
  recommendationMode: "lean_strengths" | "confront_avoidance";
  signatureSentence: string | null;             // shareable human-readable insight
}

export interface OverridePattern {
  mostReplacedCategory: TaskCategory | null;
  mostChosenInstead: string | null;             // most common replacement task description
  overrideRate: number;                         // fraction of tasks overridden
}

// ── Category inference from task title ───────────────────────────────────────

const CATEGORY_PATTERNS: Array<{ category: TaskCategory; pattern: RegExp }> = [
  { category: "outreach",  pattern: /\b(message|DM|email|reach out|contact|send|post|pitch|outreach|follow.?up|call|talk to|speak with|meet)\b/i },
  { category: "technical", pattern: /\b(build|code|implement|fix|debug|deploy|test|refactor|api|database|feature|bug|dev|develop)\b/i },
  { category: "content",   pattern: /\b(write|draft|blog|post|article|content|copy|tweet|thread|newsletter|doc|landing)\b/i },
  { category: "research",  pattern: /\b(research|read|review|analyze|study|explore|investigate|survey|learn|understand)\b/i },
  { category: "revenue",   pattern: /\b(revenue|MRR|ARR|price|pricing|payment|invoice|subscription|upsell|close|deal|contract|charge)\b/i },
  { category: "admin",     pattern: /\b(update|track|record|plan|schedule|organize|clean|set up|configure|admin|manage)\b/i },
];

const TYPE_PATTERNS: Array<{ type: TaskType; pattern: RegExp }> = [
  { type: "talk",     pattern: /\b(talk|message|DM|call|meet|reach out|contact|speak|email|follow.?up)\b/i },
  { type: "build",    pattern: /\b(build|code|implement|deploy|ship|launch|create|develop)\b/i },
  { type: "write",    pattern: /\b(write|draft|post|publish|article|newsletter|content|blog|thread)\b/i },
  { type: "research", pattern: /\b(research|read|review|analyze|survey|explore|investigate)\b/i },
  { type: "admin",    pattern: /\b(plan|organize|update|track|schedule|set up|manage|configure)\b/i },
];

export function inferCategory(title: string): TaskCategory {
  for (const { category, pattern } of CATEGORY_PATTERNS) {
    if (pattern.test(title)) return category;
  }
  return "other";
}

export function inferTaskType(title: string): TaskType {
  for (const { type, pattern } of TYPE_PATTERNS) {
    if (pattern.test(title)) return type;
  }
  return "admin";
}

function inferDurationBucket(minutes: number | null | undefined, title: string): DurationBucket {
  if (minutes !== null && minutes !== undefined) {
    if (minutes < 30) return "quick";
    if (minutes <= 90) return "medium";
    return "deep";
  }
  // Infer from title language
  if (/\b(quick|5 min|10 min|15 min|brief)\b/i.test(title)) return "quick";
  if (/\b(hour|2 hour|half day|morning|afternoon)\b/i.test(title)) return "deep";
  return "medium";
}

// ── Core computation ──────────────────────────────────────────────────────────

function computeRates<T extends string>(
  records: TaskRecord[],
  keyFn: (r: TaskRecord) => T,
): Map<T, { completed: number; total: number }> {
  const map = new Map<T, { completed: number; total: number }>();
  for (const r of records) {
    const key = keyFn(r);
    if (!map.has(key)) map.set(key, { completed: 0, total: 0 });
    const entry = map.get(key)!;
    entry.total++;
    if (r.completed) entry.completed++;
  }
  return map;
}

/**
 * buildExecutionSignature — compute this founder's execution DNA from task history.
 *
 * @param records  — rows from reflections table, covering last 30–60 days
 * @param momentumScore — current momentum score (used to pick recommendation mode)
 */
export function buildExecutionSignature(
  records: TaskRecord[],
  momentumScore = 50,
): ExecutionSignature {
  if (records.length < 5) {
    return emptySignature();
  }

  // Enrich records with inferred fields
  type EnrichedRecord = TaskRecord & {
    category: TaskCategory;
    task_type: TaskType;
    duration_bucket: DurationBucket;
  };
  const enriched: EnrichedRecord[] = records.map((r) => ({
    ...r,
    category: r.category ?? inferCategory(r.title),
    task_type: r.task_type ?? inferTaskType(r.title),
    duration_bucket: inferDurationBucket(r.duration_minutes, r.title),
  }));

  // ── By category ──────────────────────────────────────────────────────────
  const categoryRates = computeRates(enriched, (r) => r.category as TaskCategory);
  const allCategoryStats: CategoryStats[] = [];
  for (const [category, { completed, total }] of categoryRates.entries()) {
    if (total < 2) continue;
    const rate = completed / total;
    allCategoryStats.push({
      category,
      completionRate: rate,
      totalTasks: total,
      isAvoidanceZone: rate < 0.35,
      isStrength: rate > 0.70,
    });
  }
  allCategoryStats.sort((a, b) => a.completionRate - b.completionRate);

  const strengths = allCategoryStats.filter((s) => s.isStrength);
  const avoidanceZones = allCategoryStats.filter((s) => s.isAvoidanceZone);

  // ── By duration ──────────────────────────────────────────────────────────
  const byDuration: ExecutionSignature["byDuration"] = {
    quick: { completionRate: 0, count: 0 },
    medium: { completionRate: 0, count: 0 },
    deep: { completionRate: 0, count: 0 },
  };
  const durationRates = computeRates<DurationBucket>(enriched as TaskRecord[], (r) => ((r as unknown as EnrichedRecord).duration_bucket) as DurationBucket);
  for (const [bucket, { completed, total }] of durationRates.entries()) {
    byDuration[bucket] = {
      completionRate: total > 0 ? completed / total : 0,
      count: total,
    };
  }

  // ── By task type ──────────────────────────────────────────────────────────
  const byType: ExecutionSignature["byType"] = {};
  const typeRates = computeRates(enriched, (r) => r.task_type as TaskType);
  for (const [type, { completed, total }] of typeRates.entries()) {
    if (total < 2) continue;
    byType[type] = { completionRate: total > 0 ? completed / total : 0, count: total };
  }

  // ── Override pattern ──────────────────────────────────────────────────────
  const overridden = enriched.filter((r) => r.override_reason || r.replaced_with);
  const overrideRate = overridden.length / Math.max(1, enriched.length);
  let overridePattern: OverridePattern | null = null;

  if (overrideRate > 0.2) {
    const replacedCategories = overridden.map((r) => inferCategory(r.title));
    const catCounts: Record<string, number> = {};
    for (const c of replacedCategories) catCounts[c] = (catCounts[c] ?? 0) + 1;
    const mostReplacedCategory =
      (Object.entries(catCounts).sort(([, a], [, b]) => b - a)[0]?.[0] as TaskCategory) ?? null;

    const replacements = overridden
      .map((r) => r.replaced_with)
      .filter(Boolean) as string[];
    const replacedWith: Record<string, number> = {};
    for (const r of replacements) {
      const cat = inferCategory(r);
      replacedWith[cat] = (replacedWith[cat] ?? 0) + 1;
    }
    const mostChosenInstead =
      Object.entries(replacedWith).sort(([, a], [, b]) => b - a)[0]?.[0] ?? null;

    overridePattern = { mostReplacedCategory, mostChosenInstead, overrideRate };
  }

  // ── Recommendation mode ───────────────────────────────────────────────────
  // High momentum: confront avoidance zones — founder most likely to push through discomfort
  // Low momentum: lean into strengths to rebuild execution confidence
  const recommendationMode: ExecutionSignature["recommendationMode"] =
    momentumScore >= 60 && avoidanceZones.length > 0
      ? "confront_avoidance"
      : "lean_strengths";

  // ── Signature sentence ────────────────────────────────────────────────────
  const signatureSentence = buildSignatureSentence(strengths, avoidanceZones, byType, overridePattern);

  return {
    strengths,
    avoidanceZones,
    byDuration,
    byType,
    overridePattern,
    recommendationMode,
    signatureSentence,
  };
}

function buildSignatureSentence(
  strengths: CategoryStats[],
  avoidanceZones: CategoryStats[],
  byType: ExecutionSignature["byType"],
  overridePattern: OverridePattern | null,
): string | null {
  const parts: string[] = [];

  if (strengths.length > 0) {
    const s = strengths[0];
    parts.push(`You finish ${s.category} tasks ${Math.round(s.completionRate * 100)}% of the time.`);
  }

  if (avoidanceZones.length > 0) {
    const a = avoidanceZones[0];
    parts.push(`You finish ${a.category} tasks ${Math.round(a.completionRate * 100)}% of the time.`);
  }

  if (overridePattern && overridePattern.overrideRate > 0.3 && overridePattern.mostChosenInstead) {
    parts.push(
      `When you override a task, you tend to replace it with ${overridePattern.mostChosenInstead} work — ` +
        `a pattern that reveals what you're choosing to hide from.`,
    );
  }

  const talkStats = byType["talk"];
  if (talkStats && talkStats.count >= 3) {
    const verdict =
      talkStats.completionRate < 0.4
        ? "avoid"
        : talkStats.completionRate > 0.7
          ? "excel at"
          : "complete roughly half of";
    parts.push(`You ${verdict} user conversation tasks.`);
  }

  return parts.length > 0 ? parts.join(" ") : null;
}

function emptySignature(): ExecutionSignature {
  return {
    strengths: [],
    avoidanceZones: [],
    byDuration: {
      quick: { completionRate: 0, count: 0 },
      medium: { completionRate: 0, count: 0 },
      deep: { completionRate: 0, count: 0 },
    },
    byType: {},
    overridePattern: null,
    recommendationMode: "lean_strengths",
    signatureSentence: null,
  };
}

/**
 * buildOutcomePromptBlock — inject execution signature into today-action AI prompt.
 * This shapes whether the system leans into the founder's strengths or
 * confronts their avoidance zones.
 */
export function buildOutcomePromptBlock(sig: ExecutionSignature): string {
  if (sig.strengths.length === 0 && sig.avoidanceZones.length === 0) return "";

  const lines: string[] = ["EXECUTION SIGNATURE (this founder's completion pattern):"];

  if (sig.signatureSentence) {
    lines.push(sig.signatureSentence);
  }

  if (sig.recommendationMode === "confront_avoidance" && sig.avoidanceZones.length > 0) {
    const zone = sig.avoidanceZones[0].category;
    lines.push(
      `MODE: Confront avoidance — momentum is high. Today's task should involve ${zone} work, ` +
        `which this founder avoids. They are most likely to push through it now.`,
    );
  } else if (sig.recommendationMode === "lean_strengths" && sig.strengths.length > 0) {
    const strength = sig.strengths[0].category;
    lines.push(
      `MODE: Rebuild confidence — lean into ${strength} tasks where this founder executes well.`,
    );
  }

  // Best task duration
  const durationEntries = Object.entries(sig.byDuration) as Array<[DurationBucket, { completionRate: number; count: number }]>;
  const bestDuration = durationEntries
    .filter(([, v]) => v.count >= 3)
    .sort(([, a], [, b]) => b.completionRate - a.completionRate)[0];
  if (bestDuration) {
    const labels: Record<DurationBucket, string> = {
      quick: "under 30 minutes",
      medium: "30–90 minutes",
      deep: "over 90 minutes",
    };
    lines.push(
      `Best task duration for this founder: ${labels[bestDuration[0]]} ` +
        `(${Math.round(bestDuration[1].completionRate * 100)}% completion rate).`,
    );
  }

  return lines.join("\n");
}

/**
 * getCategoryTaskPromptHint — returns a short modifier for task generation
 * based on whether today should lean strength or confront avoidance.
 */
export function getCategoryTaskPromptHint(sig: ExecutionSignature): string {
  if (sig.recommendationMode === "confront_avoidance" && sig.avoidanceZones.length > 0) {
    return `Focus on ${sig.avoidanceZones[0].category} — it is this founder's documented avoidance zone and now is the right moment to push.`;
  }
  if (sig.strengths.length > 0) {
    return `Lean into ${sig.strengths[0].category} — this founder executes these tasks reliably.`;
  }
  return "";
}
