/**
 * lib/reflexion.ts — The Reflexion Loop (Playbook §3.2 + §4.2)
 *
 * Three chained Groq calls: Generator → Critic → Refiner
 * Total latency on Groq: under 2 seconds.
 * The founder sees one response that feels like it came from someone
 * very smart who actually knows them.
 *
 * This is SERVER-SIDE only. Import only from API routes.
 */

const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const GROQ_API_KEY = process.env.GROQ_API_KEY;

interface GroqMessage { role: "system" | "user" | "assistant"; content: string; }

export async function groqCall(messages: GroqMessage[], temperature = 0.5, maxTokens = 600): Promise<string> {
  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY not set");
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({ model: GROQ_MODEL, temperature, max_tokens: maxTokens, messages }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text().then(t => t.slice(0, 200))}`);
  const body = await res.json();
  const text = body?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Groq returned empty response");
  return text as string;
}

/**
 * groqJSONCall — same as groqCall but forces response_format: json_object.
 * Use for Agent B (Critic) to guarantee parseable JSON output and prevent
 * silent pass-through when the model returns prose instead of a verdict.
 */
async function groqJSONCall<T>(messages: GroqMessage[], temperature = 0.3, maxTokens = 400): Promise<T> {
  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY not set");
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      messages,
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text().then(t => t.slice(0, 200))}`);
  const body = await res.json();
  const content = body?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Groq returned empty response");
  return JSON.parse(content) as T;
}

export interface ReflexionContext {
  startupSummary: string;
  stage: string;
  problem?: string;
  targetUsers?: string;
  momentumScore: number;
  avoidanceSignals?: string[];
  overrideReasons?: string[];
  topicsRepeated?: string[];
  lastReflection?: { outcome: string; note: string; confidence: number };
  cognitiveLoad?: "fresh" | "drained" | "autopilot";
  // v4 additions
  consecutiveTasksCompleted?: number;  // for Emotional Language Layer
  daysInactive?: number;               // for Recovery Mode detection
  weekNumber?: number;                 // for Agent Persona Rotation
  domainDataPoints?: number;           // for Confidence Gate
}

// ── NEW IN V4: Agent Persona Rotation (Playbook §4.4) ─────────────────────
// Agent B rotates weekly to prevent Llama drift / same-flavour advice.
const CRITIC_PERSONAS: Record<number, { name: string; prompt: string }> = {
  0: {
    name: "Skeptical YC Partner",
    prompt: "You are a skeptical YC partner reviewing startup advice. Find logical flaws, challenge assumptions, demand evidence.",
  },
  1: {
    name: "Aggressive Growth Hacker",
    prompt: "You are an aggressive growth hacker. Find the 10x lever. Cut everything slow. Where's the compounding loop? Be ruthless about speed.",
  },
  2: {
    name: "Frugal Accountant",
    prompt: "You are a frugal accountant reviewing startup advice. What is this actually costing? Where's the ROI? Is there a cheaper way? Demand numbers.",
  },
  3: {
    name: "Customer Empathy Advocate",
    prompt: "You are a customer empathy advocate. Would a real user actually care? Is this solving their problem or the founder's problem? Challenge assumptions about demand.",
  },
};

/**
 * getWeeklyCriticPersona — returns the rotating Agent B persona for this week.
 * Week derived from weekNumber (0-indexed ISO week mod 4) or current date if not provided.
 */
export function getWeeklyCriticPersona(weekNumber?: number): { name: string; prompt: string } {
  const week = weekNumber ?? getISOWeekNumber(new Date());
  return CRITIC_PERSONAS[week % 4];
}

export function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

// ── NEW IN V4: Emotional Language Layer (Playbook §4.1) ───────────────────
// Warmth injected at specific trigger moments via Agent C's prompt.
export type EmotionalTrigger =
  | "inactive_3plus_days"
  | "two_tasks_in_row"
  | "override_submitted"
  | "first_week_completed"
  | "momentum_low_stable";

export function getEmotionalLanguageInstruction(trigger?: EmotionalTrigger): string {
  if (!trigger) return "";
  const messages: Record<EmotionalTrigger, string> = {
    inactive_3plus_days:
      "EMOTIONAL TONE: This founder has been inactive 3+ days. Open with: \"I know last week was rough. Let's restart clean today — one small thing.\" Then give the task.",
    two_tasks_in_row:
      "EMOTIONAL TONE: This founder just completed two tasks in a row. Acknowledge it: \"That's two in a row. You're building momentum that most founders never find.\" Then move forward.",
    override_submitted:
      "EMOTIONAL TONE: This founder just overrode a task. Open with: \"No problem. What's actually in the way? Let's name it.\" Do not judge. Surface the block.",
    first_week_completed:
      "EMOTIONAL TONE: This founder just completed their first full week. Acknowledge it: \"One week of execution. Most founders don't make it here. Keep going.\"",
    momentum_low_stable:
      "EMOTIONAL TONE: Momentum is low but not falling further. Acknowledge it: \"You're not falling — you're holding. That's enough for today.\" Give one micro-win task.",
  };
  return `\n\n${messages[trigger]}`;
}

/** Infer the correct emotional trigger from context */
export function inferEmotionalTrigger(ctx: ReflexionContext): EmotionalTrigger | undefined {
  if ((ctx.daysInactive ?? 0) >= 3) return "inactive_3plus_days";
  if ((ctx.consecutiveTasksCompleted ?? 0) >= 2) return "two_tasks_in_row";
  if (ctx.momentumScore < 40 && (ctx.daysInactive ?? 0) <= 1) return "momentum_low_stable";
  return undefined;
}

// ── NEW IN V4: Confidence Gate (Playbook §4.5) ────────────────────────────
// When context is thin, the AI surfaces its uncertainty instead of guessing.
export function shouldTriggerConfidenceGate(ctx: ReflexionContext): boolean {
  return (ctx.domainDataPoints ?? 10) < 5;
}

export function getConfidenceGateResponse(): string {
  return "I don't have enough context on your local market to give a firm answer here. Should we research competitors together, or do you want to talk to a human mentor?";
}

export interface ReflexionResult {
  output: string;          // The final refined response shown to the founder
  critique: string;        // Internal critic output (stored, not shown)
  rationale: string;       // "Why this, why now" tooltip — one sentence
  nextAction?: string;     // Suggested next concrete action
  verdict: "pass" | "fail"; // Gatekeeper verdict from Agent B
  reject_reason: string | null; // Reason if verdict is "fail", otherwise null
}

/**
 * runReflexionLoop — the 3-agent chain
 *
 * Agent A generates. Agent B critiques harshly. Agent C refines.
 * Each call is fast on Groq (~400ms). Total: ~1.2–1.8s.
 */
export async function runReflexionLoop(
  task: string,
  context: ReflexionContext,
  additionalInstruction = ""
): Promise<ReflexionResult> {
  const contextBlock = buildContextBlock(context);

  // ── NEW IN V4: Confidence Gate — thin context check ──────────────────────
  if (shouldTriggerConfidenceGate(context)) {
    const gateMsg = getConfidenceGateResponse();
    return {
      output: gateMsg,
      critique: "Confidence gate triggered — insufficient domain context.",
      rationale: "Because I need more context to give you a firm answer right now.",
      nextAction: "Decide: should we research together, or connect you with a human mentor?",
      verdict: "fail",
      reject_reason: "Confidence gate triggered — insufficient domain context.",
    };
  }

  // ── NEW IN V4: Emotional Language Layer — infer trigger ──────────────────
  const emotionalTrigger = inferEmotionalTrigger(context);
  const emotionalInstruction = getEmotionalLanguageInstruction(emotionalTrigger);

  // ── Agent A — The Generator ──────────────────────────────────────────────
  const generatorPrompt = `You are a world-class startup consultant specialising in early-stage African founders.
${contextBlock}
${additionalInstruction}
TASK: ${task}
Be specific to this founder's situation. No generic advice.`;

  const generated = await groqCall([
    { role: "system", content: generatorPrompt },
    { role: "user", content: "Generate your best response to the task." },
  ], 0.6, 500);

  // ── NEW IN V4: Agent B — The Critic/Gatekeeper (Persona Rotation) ───────────
  // Agent B is a GATEKEEPER, not a reviewer. It rejects weak outputs and forces
  // Agent C to rebuild from scratch — not just polish. Max 2 loops.
  const criticPersona = getWeeklyCriticPersona(context.weekNumber);

  // REJECT criteria — any of these triggers a FAIL verdict
  const criticPrompt = `${criticPersona.prompt}

You are a GATEKEEPER, not a reviewer. Your job is to REJECT weak advice and force a rebuild.

REJECT this task if ANY of the following are true:
1. The action does not name a specific platform (e.g. "social media" instead of "LinkedIn" or "WhatsApp")
2. The action does not name the specific user type from the founder's context
3. The action has no number (e.g. "message some people" instead of "message 3 people")
4. The action cannot be completed in under 30 minutes
5. The advice could apply to any founder at any stage (generic)
6. The advice does not address the founder's current stage or last reflection outcome

Respond in JSON ONLY:
{
  "verdict": "pass" | "fail",
  "reason": "one sentence explaining the verdict",
  "improved_version": "a better version of the task if verdict is fail (otherwise null)"
}

FOUNDER CONTEXT:
Stage: ${context.stage} | Target users: ${context.targetUsers ?? "not set"} | Momentum: ${context.momentumScore}/100

ADVICE TO EVALUATE:
${generated}`;

  let critiqueData: { verdict: string; reason: string; improved_version?: string | null } = {
    verdict: "pass",
    reason: "Verdict parsing failed — defaulting to pass",
    improved_version: null,
  };
  try {
    // Agent B uses groqJSONCall (response_format: json_object) to guarantee
    // a parseable verdict. A prose response used to silently default to "pass",
    // undermining the gatekeeper design.
    critiqueData = await groqJSONCall<typeof critiqueData>([
      { role: "system", content: criticPrompt },
      { role: "user", content: "Evaluate and give your verdict." },
    ], 0.3, 300);
  } catch {
    // groqJSONCall failed (network / model error) — default to pass so the
    // loop is non-fatal, but log it so patterns can be monitored.
  }

  const critique = `VERDICT: ${critiqueData.verdict.toUpperCase()} — ${critiqueData.reason}`;

  // If FAIL: Agent C rebuilds from scratch using the improved version as seed.
  // If PASS: Agent C tightens wording and clarity only.
  const baseForRefinement = critiqueData.verdict === "fail" && critiqueData.improved_version
    ? critiqueData.improved_version
    : generated;

  // ── Agent C — The Refiner / Rebuilder (with Emotional Language Layer) ──────
  // If verdict was FAIL, Agent C rebuilds from the improved_version seed.
  // If verdict was PASS, Agent C tightens wording and clarity only.
  const refinerMode = critiqueData.verdict === "fail"
    ? "REBUILD: The original was rejected. Use the improved version as a starting point and make it sharper."
    : "POLISH: The task passed gating. Tighten wording and clarity only — do not change the substance.";

  const refinerPrompt = `You are BuildMind's execution engine. ${refinerMode}
Rules:
- Every claim must be backed by logic specific to THIS founder
- Must name the exact platform, the exact user type, and include a number
- Must be harder-hitting than the input
- End with a single concrete action they can start in the next 30 minutes
- No preamble, no "here's the refined version"
- 3–5 sentences maximum
${emotionalInstruction}

INPUT:
${baseForRefinement}

CRITIQUE:
${critique}

FOUNDER CONTEXT:
Stage: ${context.stage} | Momentum: ${context.momentumScore}/100 | Cognitive: ${context.cognitiveLoad ?? "fresh"} | Target users: ${context.targetUsers ?? "not set"}`;

  const refined = await groqCall([
    { role: "system", content: refinerPrompt },
    { role: "user", content: "Write the refined response." },
  ], 0.3, 400);

  // Extract "Why this, why now" rationale — one sentence
  const rationalePrompt = `Extract a single sentence (max 15 words) explaining WHY this advice is right for this founder RIGHT NOW.
Format: "Because [specific reason tied to their stage/situation]."
Advice: ${refined}`;

  const rationale = await groqCall([
    { role: "system", content: rationalePrompt },
    { role: "user", content: "One sentence rationale only." },
  ], 0.2, 60).catch(() => `Because you're at ${context.stage} stage and this is the highest-leverage move.`);

  return {
    output: refined,
    critique,
    rationale: rationale.trim(),
    nextAction: extractAction(refined),
    // Gatekeeper verdict — callers log this to reflexion_quality_log
    verdict: (critiqueData.verdict ?? "pass") as "pass" | "fail",
    reject_reason: critiqueData.verdict === "fail" ? (critiqueData.reason ?? null) : null,
  };
}

/**
 * runReflexionStrike — the onboarding Reflexion Strike (Playbook §2.1)
 * One-sentence startup description → market gap + first task in ~15 seconds
 */
export async function runReflexionStrike(
  startupDescription: string,
  stage = "Idea",
  domain = ""
): Promise<{ marketGap: string; firstTask: string; rationale: string }> {
  const prompt = `You are BuildMind, an agentic execution partner for solo founders.
A founder just described their startup in one sentence. Respond with:
1. marketGap: The crowded part of this market + the gap nobody has claimed yet (2 sentences, specific)
2. firstTask: One concrete action they can complete in the next 30 minutes that validates whether this gap is real
3. rationale: Why this task, why now (1 sentence)

Be brutally specific. No generic startup advice.
Stage: ${stage}
Domain: ${domain || "not specified"}`;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.5,
      max_tokens: 400,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: `Startup: "${startupDescription}"` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}`);
  const body = await res.json();
  const parsed = JSON.parse(body?.choices?.[0]?.message?.content ?? "{}");
  return {
    marketGap: parsed.marketGap ?? "The market has a real gap here — let's validate it.",
    firstTask: parsed.firstTask ?? "Find one person who has this problem and send them a message in the next 30 minutes.",
    rationale: parsed.rationale ?? "Because talking to one real person beats a week of planning.",
  };
}

/**
 * generateMorningBriefing — for the 7am scheduled job (Playbook §3.2 Stage 1)
 * Returns: win (yesterday), risk (today), action (right now)
 */
export async function generateMorningBriefing(
  context: ReflexionContext & { yesterdayTask?: string; completedYesterday?: boolean }
): Promise<{ win: string; risk: string; action: string }> {
  const prompt = `You are BuildMind's morning briefing engine. Generate a 3-line morning briefing for a solo founder.
Rules:
- win: One specific win from their recent work (look at momentum and stage — make it feel real)
- risk: The single biggest risk they face TODAY at their current stage
- action: One concrete action they must do in the next 2 hours
Each line: max 20 words. No emojis. No fluff. Brutally specific to this founder.
${buildContextBlock(context)}
${context.yesterdayTask ? `Yesterday's task: "${context.yesterdayTask}"` : ""}
${context.completedYesterday !== undefined ? `Completed: ${context.completedYesterday}` : ""}`;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.4,
      max_tokens: 200,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: "Generate the morning briefing." },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}`);
  const body = await res.json();
  const parsed = JSON.parse(body?.choices?.[0]?.message?.content ?? "{}");
  return {
    win: parsed.win ?? "You're still here — that already puts you ahead of 90% of founders.",
    risk: parsed.risk ?? "Inertia: every hour without action makes the next action harder.",
    action: parsed.action ?? "Open your task list and do the first thing before checking anything else.",
  };
}

/**
 * generateEveningNudge — context-specific nudge if task not completed (Playbook §3.2 Stage 1)
 * NEVER generic. Always references something specific from their context.
 */
export async function generateEveningNudge(
  context: ReflexionContext & { todayTask?: string }
): Promise<string> {
  const avoidance = context.avoidanceSignals?.length
    ? `This founder avoids: ${context.avoidanceSignals.join(", ")}.`
    : "";
  const topicRepeat = context.topicsRepeated?.length
    ? `They keep mentioning: ${context.topicsRepeated.join(", ")}.`
    : "";

  const prompt = `You are BuildMind's evening check engine.
A founder did NOT complete their task today. Generate ONE specific nudge.
Rules:
- Reference their actual situation (stage, avoidance, repeated topics)
- Never generic ("Don't forget your task!")
- Ask one pointed question OR state one uncomfortable truth
- Max 30 words
- No emojis
${avoidance} ${topicRepeat}
Stage: ${context.stage} | Today's task: "${context.todayTask ?? "not set"}"`;

  return groqCall([
    { role: "system", content: prompt },
    { role: "user", content: "Generate the evening nudge." },
  ], 0.5, 60).catch(() =>
    `You haven't completed today's task yet. What specifically is blocking you?`
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function buildContextBlock(ctx: ReflexionContext): string {
  const lines: string[] = [
    `FOUNDER CONTEXT:`,
    `Startup: ${ctx.startupSummary || "Not yet set"}`,
    `Stage: ${ctx.stage}`,
    `Momentum score: ${ctx.momentumScore}/100`,
  ];
  if (ctx.problem) lines.push(`Problem: ${ctx.problem}`);
  if (ctx.targetUsers) lines.push(`Target users: ${ctx.targetUsers}`);
  if (ctx.cognitiveLoad) lines.push(`Cognitive state today: ${ctx.cognitiveLoad}`);
  if (ctx.avoidanceSignals?.length) lines.push(`Avoidance signals: ${ctx.avoidanceSignals.join(", ")}`);
  if (ctx.overrideReasons?.length) lines.push(`Recent override reasons: ${ctx.overrideReasons.join(", ")}`);
  if (ctx.topicsRepeated?.length) lines.push(`Topics mentioned repeatedly: ${ctx.topicsRepeated.join(", ")}`);
  if (ctx.lastReflection) {
    lines.push(`Last reflection: outcome=${ctx.lastReflection.outcome}, confidence=${ctx.lastReflection.confidence}/5`);
    if (ctx.lastReflection.note) lines.push(`Their note: "${ctx.lastReflection.note}"`);
  }
  return lines.join("\n");
}

function extractAction(text: string): string {
  const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
  const actionSentence = sentences.find(s =>
    /\b(do|send|call|write|post|reach out|open|find|talk|test|launch|build|contact)\b/i.test(s)
  );
  return actionSentence ?? sentences[sentences.length - 1] ?? "";
}
