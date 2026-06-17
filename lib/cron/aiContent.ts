/**
 * lib/cron/aiContent.ts
 *
 * AI-written content for all cron jobs.
 * Each function takes founder context and returns a personalised string.
 * Every function has a deterministic fallback so a failed AI call
 * never blocks the cron from sending.
 *
 * Uses callModel (fast chain) with tight token budgets — crons run
 * across many users so we need fast, cheap calls.
 */

import { callModel } from "@/lib/ai-providers";

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface CronFounderContext {
  name?: string;                        // First name if known
  startupName?: string;                 // Project name
  stage?: string;                       // Current startup stage
  daysInactive?: number;                // Days since last check-in
  tasksCompleted?: number;              // Tasks done this week
  momentumStart?: number;               // Momentum score at start of week
  momentumEnd?: number;                 // Momentum score now
  streak?: number;                      // Current streak days
  avoidanceZone?: string;               // Primary avoidance pattern
  lastInsight?: string;                 // Last AI insight from founder memory
  lastReflectionNote?: string;          // What they wrote in their last reflection
  lastActionTried?: string;             // What they attempted last
  patternSignal?: string;               // Active pattern signal e.g. "avoidance_cluster"
}

// ─── Evening push notification ────────────────────────────────────────────────

/**
 * generateEveningNudge
 * Written for the specific founder — not a generic "did you check in?" message.
 * Max 120 chars so it fits in a push notification without truncation.
 */
export async function generateEveningNudge(ctx: CronFounderContext): Promise<string> {
  const { name, startupName, stage, daysInactive = 0, avoidanceZone, lastActionTried, patternSignal } = ctx;

  const fallbacks = [
    daysInactive >= 3
      ? `${name ?? "Hey"} — ${daysInactive} days quiet. One honest log resets everything.`
      : daysInactive >= 1
      ? `${name ?? "Hey"} — log what happened today. Tomorrow's task gets sharper when you do.`
      : `${name ?? "Hey"} — did you make progress today? Log it before the day closes.`,
  ];

  try {
    const context = [
      name        && `Founder: ${name}`,
      startupName && `Startup: ${startupName}`,
      stage       && `Stage: ${stage}`,
      daysInactive > 0 && `Days since last check-in: ${daysInactive}`,
      avoidanceZone    && `Known avoidance pattern: ${avoidanceZone}`,
      lastActionTried  && `Last thing they tried: ${lastActionTried}`,
      patternSignal    && `Behavioural signal: ${patternSignal}`,
    ].filter(Boolean).join("\n");

    const prompt = `You are BuildMind, an AI operating system for founders. Write a single push notification message for this founder's evening check-in reminder.

FOUNDER CONTEXT:
${context}

RULES:
- Maximum 120 characters total (it must fit in a phone notification)
- Reference something specific about their situation — do NOT write a generic reminder
- If they've been inactive 3+ days, be empathetic but direct — no guilt-tripping
- If they have an avoidance pattern, gently name it
- If they tried something recently, reference it
- Tone: like a trusted co-founder, not a productivity app
- No emojis unless it adds meaning
- No preamble — just the message

Write only the notification text. Nothing else.`;

    const result = await callModel(
      [{ role: "user", content: prompt }],
      { role: "fast", maxTokens: 60, temperature: 0.7 },
    );

    const cleaned = result.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    // Hard cap at 140 chars for push safety
    return cleaned.length > 0 && cleaned.length <= 140 ? cleaned : fallbacks[0];
  } catch {
    return fallbacks[0];
  }
}

// ─── Re-engagement email ──────────────────────────────────────────────────────

/**
 * generateReEngagementEmail
 * Returns { subject, body } — both AI-written.
 * Body is plain-text paragraphs (2–3 sentences each); caller wraps in HTML shell.
 */
export async function generateReEngagementEmail(ctx: CronFounderContext): Promise<{
  subject: string;
  body: string;
}> {
  const { name, startupName, stage, daysInactive = 7, avoidanceZone, lastReflectionNote } = ctx;

  const firstName = name?.split(" ")[0] ?? "Founder";
  const startup = startupName ?? "your startup";

  const fallback = {
    subject: `${daysInactive} days quiet — your next move is ready`,
    body: `${firstName}, it's been ${daysInactive} days since your last BuildMind session on ${startup}.\n\nMost founders who go quiet for a week never come back — not because they failed, but because they got comfortable with not shipping.\n\nYou don't need to catch up. You just need one move today. BuildMind already knows where you were.`,
  };

  try {
    const context = [
      `Founder name: ${firstName}`,
      `Startup: ${startup}`,
      stage               && `Stage: ${stage}`,
      `Days since last session: ${daysInactive}`,
      avoidanceZone       && `Known avoidance pattern: ${avoidanceZone}`,
      lastReflectionNote  && `What they wrote last time: "${lastReflectionNote}"`,
    ].filter(Boolean).join("\n");

    const prompt = `You are BuildMind. Write a re-engagement email for a founder who has been inactive.

FOUNDER CONTEXT:
${context}

OUTPUT FORMAT — respond with JSON only, no markdown, no preamble:
{
  "subject": "email subject line (max 60 chars, no emojis)",
  "body": "email body — 2 to 3 short paragraphs, plain text, no HTML. First paragraph names something specific about their situation. Second paragraph is a direct, honest push to come back. Third paragraph (optional) is a softer line about what's waiting for them."
}

RULES:
- Subject line must feel personal — reference the startup name or stage
- Do not use the word "journey", "growth mindset", or "hustle"
- Do not guilt-trip — be direct but not harsh
- Reference their avoidance pattern if present
- Reference what they wrote last if present
- Tone: trusted co-founder who's been watching, not a marketing email
- Body paragraphs max 2 sentences each`;

    const result = await callModel(
      [{ role: "user", content: prompt }],
      { role: "fast", maxTokens: 200, temperature: 0.6 },
    );

    const cleaned = result
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(/```json|```/g, "")
      .trim();

    const parsed = JSON.parse(cleaned) as { subject?: string; body?: string };
    if (parsed.subject && parsed.body) {
      return { subject: parsed.subject, body: parsed.body };
    }
    return fallback;
  } catch {
    return fallback;
  }
}

// ─── Sunday behavioral email ──────────────────────────────────────────────────

/**
 * generateSundayEmailNarrative
 * Returns the two narrative paragraphs:
 *   - diagnosis: what the week looked like behaviourally
 *   - nextWeek:  one specific directive for the coming week
 * The caller inserts these into the existing HTML shell around the data cards.
 */
export async function generateSundayEmailNarrative(ctx: CronFounderContext): Promise<{
  diagnosis: string;
  nextWeekDirective: string;
}> {
  const {
    name, startupName, stage,
    tasksCompleted = 0, momentumStart = 50, momentumEnd = 50,
    streak = 0, avoidanceZone, lastInsight,
  } = ctx;

  const firstName   = name?.split(" ")[0] ?? "Founder";
  const startup     = startupName ?? "your startup";
  const momentumDir = momentumEnd >= momentumStart ? "up" : "down";
  const momentumDelta = Math.abs(momentumEnd - momentumStart);

  const fallback = {
    diagnosis: tasksCompleted === 0
      ? `Nothing logged this week on ${startup}. That's the data.`
      : `${firstName} completed ${tasksCompleted} task${tasksCompleted !== 1 ? "s" : ""} this week. Momentum moved ${momentumDir} ${momentumDelta} points.`,
    nextWeekDirective: avoidanceZone
      ? `Next week: address ${avoidanceZone} directly. It keeps showing up.`
      : lastInsight ?? `Next week: complete the next task before planning the one after.`,
  };

  try {
    const context = [
      `Founder: ${firstName}`,
      `Startup: ${startup}`,
      stage              && `Stage: ${stage}`,
      `Tasks completed this week: ${tasksCompleted}`,
      `Momentum: ${momentumStart} → ${momentumEnd} (${momentumDir} ${momentumDelta} pts)`,
      streak > 0         && `Current streak: ${streak} days`,
      avoidanceZone      && `Avoidance pattern: ${avoidanceZone}`,
      lastInsight        && `Last AI insight about them: "${lastInsight}"`,
    ].filter(Boolean).join("\n");

    const prompt = `You are BuildMind. Write the narrative section of a weekly behavioral review email.

FOUNDER DATA:
${context}

OUTPUT FORMAT — JSON only, no markdown, no preamble:
{
  "diagnosis": "1-2 sentences diagnosing what actually happened this week based on the data. Be honest and specific. Don't soften bad weeks with platitudes.",
  "nextWeekDirective": "1 sentence telling them the single most important thing to do next week. Make it specific to their stage and avoidance pattern. Not a question — a directive."
}

RULES:
- Diagnosis must reference real numbers from the data
- If they had a good week, say so clearly
- If they had a bad week, say so clearly — do not soften it
- nextWeekDirective must be actionable in under 30 minutes
- Tone: honest co-founder, not a newsletter
- No motivational language, no "keep it up", no "you've got this"`;

    const result = await callModel(
      [{ role: "user", content: prompt }],
      { role: "fast", maxTokens: 150, temperature: 0.5 },
    );

    const cleaned = result
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(/```json|```/g, "")
      .trim();

    const parsed = JSON.parse(cleaned) as { diagnosis?: string; nextWeekDirective?: string };
    if (parsed.diagnosis && parsed.nextWeekDirective) {
      return { diagnosis: parsed.diagnosis, nextWeekDirective: parsed.nextWeekDirective };
    }
    return fallback;
  } catch {
    return fallback;
  }
}

// ─── Weekly report push notification ─────────────────────────────────────────

/**
 * generateWeeklyReportPush
 * Returns the push notification body for the Friday weekly report ping.
 * References actual data so it doesn't feel like a generic reminder.
 */
export async function generateWeeklyReportPush(ctx: CronFounderContext): Promise<string> {
  const {
    name, startupName, stage,
    tasksCompleted = 0, momentumEnd = 50,
    streak = 0, avoidanceZone,
  } = ctx;

  const firstName = name?.split(" ")[0] ?? "Hey";

  const fallback = tasksCompleted > 0
    ? `${firstName} — ${tasksCompleted} tasks logged this week. Your report + next move are ready.`
    : `${firstName} — your weekly report is ready. See what the data says and get Monday's move.`;

  try {
    const context = [
      `Founder: ${firstName}`,
      startupName     && `Startup: ${startupName}`,
      stage           && `Stage: ${stage}`,
      `Tasks this week: ${tasksCompleted}`,
      `Momentum score: ${momentumEnd}`,
      streak > 0      && `Streak: ${streak} days`,
      avoidanceZone   && `Pattern: ${avoidanceZone}`,
    ].filter(Boolean).join("\n");

    const prompt = `You are BuildMind. Write a push notification telling a founder their weekly report is ready.

FOUNDER CONTEXT:
${context}

RULES:
- Maximum 120 characters
- Reference at least one real data point (tasks, momentum, or streak)
- Sound like the data is speaking to them, not a marketing ping
- End with a reason to open: something they'll learn or get from the report
- No generic "your report is ready" — make it specific

Write only the notification text. Nothing else.`;

    const result = await callModel(
      [{ role: "user", content: prompt }],
      { role: "fast", maxTokens: 50, temperature: 0.65 },
    );

    const cleaned = result.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    return cleaned.length > 0 && cleaned.length <= 140 ? cleaned : fallback;
  } catch {
    return fallback;
  }
}
