/**
 * lib/executionScorecard.ts — Shareable Execution Scorecard (Playbook §4.3)
 *
 * NEW IN V4. Your early viral loop before Month 6.
 *
 * After the Reflexion Strike onboarding, and again after the Day 7 check-in,
 * generate a one-card summary the founder can post on X immediately.
 * Cost to build: two days. This is the first distribution lever that doesn't
 * require the founder to personally be active on X every day.
 *
 * One founder sharing their scorecard reaches their entire network of founders.
 * CTA on card: "Run yours at buildmind.co"
 */

export interface ExecutionScorecard {
  startupCategory: string;     // e.g. "B2B Fintech — African SME Compliance"
  marketGap: string;           // The gap the Reflexion Strike surfaced
  momentumScore: number;       // Their Day 7 Momentum Score
  stage: string;               // Current startup stage
  daysActive: number;          // Days since onboarding
  tasksCompleted: number;      // Total tasks completed in period
  shareUrl: string;            // e.g. "https://buildmind.co"
  generatedAt: string;         // ISO timestamp
}

/**
 * ScorecardDelta — the change between two consecutive scorecards.
 * Tells the founder what moved and by how much.
 */
export interface ScorecardDelta {
  momentumScoreDelta: number;        // positive = improved
  tasksCompletedDelta: number;       // tasks added since last card
  daysActiveDelta: number;           // days elapsed between cards
  stageChanged: boolean;             // did the stage advance?
  previousStage: string | null;
  previousMomentumScore: number | null;
  previousTasksCompleted: number | null;
  previousGeneratedAt: string | null;
  summary: string;                   // human-readable delta sentence
}

export interface ScorecardSharePayload {
  text: string;                // Pre-composed X/Twitter text
  url: string;                 // Link to buildmind.co
  card: ExecutionScorecard;
}

// ── Generation ───────────────────────────────────────────────────────────────

/**
 * Generate the scorecard data from founder context.
 * Called after the Day 7 check-in (and optionally after onboarding Reflexion Strike).
 */
export function generateScorecard(params: {
  startupSummary: string;
  marketGap: string;
  momentumScore: number;
  stage: string;
  daysActive: number;
  tasksCompleted: number;
}): ExecutionScorecard {
  return {
    startupCategory: inferCategory(params.startupSummary),
    marketGap: params.marketGap,
    momentumScore: params.momentumScore,
    stage: params.stage,
    daysActive: params.daysActive,
    tasksCompleted: params.tasksCompleted,
    shareUrl: "https://buildmind.co",
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Build the pre-composed share text for X/Twitter.
 * Designed to feel like a founder achievement post, not a product ad.
 */
export function buildShareText(scorecard: ExecutionScorecard): ScorecardSharePayload {
  const text = [
    `7 days of building with @BuildMind.`,
    ``,
    `📍 Stage: ${scorecard.stage}`,
    `⚡ Momentum Score: ${scorecard.momentumScore}/100`,
    `✅ Tasks completed: ${scorecard.tasksCompleted}`,
    ``,
    `Market gap I'm going after:`,
    `"${scorecard.marketGap}"`,
    ``,
    `Run yours → buildmind.co`,
  ].join("\n");

  return {
    text,
    url: scorecard.shareUrl,
    card: scorecard,
  };
}

/**
 * Determines whether a scorecard should be offered to this founder.
 * Trigger: Day 7 check-in with at least 3 tasks completed.
 */
export function shouldOfferScorecard(
  daysActive: number,
  tasksCompleted: number,
  alreadyShared: boolean
): boolean {
  return daysActive >= 7 && tasksCompleted >= 3 && !alreadyShared;
}

// ── Category inference ───────────────────────────────────────────────────────

/**
 * Infer a clean startup category label from the one-sentence description.
 * Used for the card display — keeps it concise and shareable.
 */
function inferCategory(summary: string): string {
  const lower = summary.toLowerCase();

  const categoryMap: [RegExp, string][] = [
    [/fintech|payment|bank|finance|lending|loan|credit|wallet/i, "B2B Fintech"],
    [/health|medical|hospital|clinic|pharma|wellness/i, "HealthTech"],
    [/educat|school|learn|tutor|student|course/i, "EdTech"],
    [/logistic|delivery|supply chain|freight|shipping/i, "Logistics"],
    [/agri|farm|crop|harvest|food.*produc/i, "AgriTech"],
    [/ecommerc|marketplace|shop|retail|b2c/i, "E-Commerce"],
    [/saas|b2b|software|platform|tool for/i, "B2B SaaS"],
    [/ai|machine learning|ml |nlp|llm|gpt/i, "AI / ML"],
    [/real estate|property|rent|mortgage/i, "PropTech"],
    [/hr|recruit|talent|hiring|workforce/i, "HRTech"],
    [/legal|compliance|regtech|contract/i, "LegalTech"],
    [/energy|solar|clean|climate|carbon/i, "CleanTech"],
    [/security|cyber|fraud|identity/i, "CyberSecurity"],
    [/social|community|network|creator/i, "Social / Creator"],
  ];

  for (const [pattern, label] of categoryMap) {
    if (pattern.test(lower)) return label;
  }

  return "Startup"; // Fallback — generic but honest
}

// ── Delta tracking ───────────────────────────────────────────────────────────

/**
 * computeScorecardDelta — compares a new scorecard against the most recently
 * persisted one to produce a human-readable progress summary.
 *
 * Pass the previous scorecard row from `execution_scorecards` (select
 * momentum_score, tasks_completed, stage, created_at). Pass null if this
 * is the founder's first scorecard.
 */
export function computeScorecardDelta(
  current: ExecutionScorecard,
  previous: {
    momentum_score: number;
    tasks_completed: number;
    stage: string;
    created_at: string;
  } | null
): ScorecardDelta {
  if (!previous) {
    return {
      momentumScoreDelta: 0,
      tasksCompletedDelta: 0,
      daysActiveDelta: 0,
      stageChanged: false,
      previousStage: null,
      previousMomentumScore: null,
      previousTasksCompleted: null,
      previousGeneratedAt: null,
      summary: "First scorecard — nothing to compare yet. Come back after your next milestone.",
    };
  }

  const momentumScoreDelta = current.momentumScore - previous.momentum_score;
  const tasksCompletedDelta = current.tasksCompleted - previous.tasks_completed;
  const daysActiveDelta = Math.round(
    (new Date(current.generatedAt).getTime() - new Date(previous.created_at).getTime()) /
    (1000 * 60 * 60 * 24)
  );
  const stageChanged = current.stage !== previous.stage;

  // Build a plain-English summary the UI can display directly
  const parts: string[] = [];

  if (stageChanged) {
    parts.push(`Advanced from ${previous.stage} → ${current.stage}.`);
  }

  if (momentumScoreDelta > 0) {
    parts.push(`Momentum up ${momentumScoreDelta} points (${previous.momentum_score} → ${current.momentumScore}).`);
  } else if (momentumScoreDelta < 0) {
    parts.push(`Momentum dropped ${Math.abs(momentumScoreDelta)} points (${previous.momentum_score} → ${current.momentumScore}).`);
  } else {
    parts.push(`Momentum held steady at ${current.momentumScore}.`);
  }

  if (tasksCompletedDelta > 0) {
    parts.push(`${tasksCompletedDelta} more task${tasksCompletedDelta === 1 ? "" : "s"} completed in ${daysActiveDelta} day${daysActiveDelta === 1 ? "" : "s"}.`);
  }

  const summary = parts.join(" ") || "No change since last scorecard.";

  return {
    momentumScoreDelta,
    tasksCompletedDelta,
    daysActiveDelta,
    stageChanged,
    previousStage: previous.stage,
    previousMomentumScore: previous.momentum_score,
    previousTasksCompleted: previous.tasks_completed,
    previousGeneratedAt: previous.created_at,
    summary,
  };
}

// ── API helpers ───────────────────────────────────────────────────────────────

/**
 * POST to /api/scorecard/generate to create and persist the scorecard.
 * Returns the share payload.
 */
export async function requestScorecard(params: {
  marketGap: string;
  daysActive?: number;
}): Promise<ScorecardSharePayload | null> {
  try {
    const res = await fetch("/api/scorecard/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!res.ok) return null;
    const { data } = await res.json();
    return data as ScorecardSharePayload;
  } catch {
    return null;
  }
}

/**
 * Open the native X/Twitter share dialog with pre-composed text.
 * Falls back to copying to clipboard if navigator.share is unavailable.
 */
export function shareToX(payload: ScorecardSharePayload): void {
  const encoded = encodeURIComponent(payload.text);
  const twitterUrl = `https://twitter.com/intent/tweet?text=${encoded}`;
  window.open(twitterUrl, "_blank", "noopener,noreferrer");
}
