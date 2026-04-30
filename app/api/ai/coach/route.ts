import { NextResponse } from "next/server";
import { createUserNotification, enforceAndTrackAIUsage, groqJSON, hasAdminEnv } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPlanAccess } from "@/app/api/ai/_planCheck";
import type { FounderMemory } from "@/lib/founderMemory";

function buildFounderMemoryContext(memory: FounderMemory | null): string {
  if (!memory) return "";
  const lines: string[] = [];
  if (memory.personality_tags?.length)
    lines.push(`Founder personality: ${memory.personality_tags.join(", ")}`);
  if (memory.avoidance_zones?.length)
    lines.push(`Consistently avoids: ${memory.avoidance_zones.join(", ")} — call this out if relevant`);
  if (memory.strengths?.length)
    lines.push(`Strong at: ${memory.strengths.join(", ")}`);
  if (memory.last_insight)
    lines.push(`Last pattern observed: "${memory.last_insight}"`);
  if (memory.cofounder_style)
    lines.push(`Communication style to use: ${memory.cofounder_style}`);
  if (!lines.length) return "";
  return "\n\nFOUNDER MEMORY (persistent — do not repeat back verbatim, just let it inform your tone and advice):\n" + lines.join("\n");
}

function inferStage(completedTasks: number, totalTasks: number, completedMilestones: number, totalMilestones: number): string {
  if (totalTasks === 0) return "Idea";
  const milestoneRate = completedMilestones / Math.max(1, totalMilestones);
  const taskRate = completedTasks / Math.max(1, totalTasks);
  if (milestoneRate >= 0.8) return "Revenue";
  if (milestoneRate >= 0.6) return "Launch";
  if (milestoneRate >= 0.4) return "MVP";
  if (milestoneRate >= 0.2 || taskRate >= 0.3) return "Validation";
  return "Idea";
}

// ── Spiral detection — the patterns that signal a founder is collapsing ───────
// Kept server-side so the detection logic cannot be bypassed client-side.
type SpiralSignal = "competitor" | "motivation" | "avoidance" | null;

function detectSpiralSignal(message: string): { detected: boolean; signal: SpiralSignal } {
  const triggers: { pattern: RegExp; signal: SpiralSignal }[] = [
    { pattern: /someone (is already|already|just) (doing|built|building|launched|shipped)/i, signal: "competitor" },
    { pattern: /(they already have|there'?s already a) (this|that|something like|an app|a tool)/i, signal: "competitor" },
    { pattern: /too late (to|for)/i, signal: "competitor" },
    { pattern: /what'?s the point/i, signal: "motivation" },
    { pattern: /i (don'?t|do not) see the point/i, signal: "motivation" },
    { pattern: /why (am i|bother|even)/i, signal: "motivation" },
    { pattern: /nobody (cares|will use|wants)/i, signal: "motivation" },
    { pattern: /this (is|was) a (bad|stupid|dumb|terrible) idea/i, signal: "motivation" },
    { pattern: /i should (just )?give up/i, signal: "motivation" },
    { pattern: /maybe i should (pivot|quit|stop|abandon)/i, signal: "motivation" },
    { pattern: /i keep (putting off|avoiding|procrastinating)/i, signal: "avoidance" },
    { pattern: /haven'?t (touched|worked on|opened|started)/i, signal: "avoidance" },
    { pattern: /i'?m stuck (on|at|with)/i, signal: "avoidance" },
    { pattern: /can'?t bring myself to/i, signal: "avoidance" },
  ];
  for (const { pattern, signal } of triggers) {
    if (pattern.test(message)) return { detected: true, signal };
  }
  return { detected: false, signal: null };
}

function buildSpiralInstruction(signal: SpiralSignal, message: string): string {
  if (!signal) return "";
  if (signal === "competitor") {
    return `\n\nSPIRAL ALERT — COMPETITOR: The founder is in a competitor spiral. Before anything else:
1. Acknowledge the competitor is real — do NOT dismiss it
2. Name a specific gap that competitor has NOT solved for this founder's exact target user
3. Reframe: competitors = proof of market. Use their user count as evidence.
4. Give ONE 20-minute task to differentiate, not "don't worry about it"
Be direct, not reassuring. The goal is to redirect energy, not comfort.`;
  }
  if (signal === "motivation") {
    return `\n\nSPIRAL ALERT — MOTIVATION: The founder is questioning the point. Before anything else:
1. Name exactly what they've done (even if small) — not to celebrate, to remind them it's real
2. Identify if this is a real signal (bad idea) or temporary noise (rough day)
3. If it's noise: one concrete re-entry task, under 30 minutes
4. If it might be real: ask the one question that will distinguish noise from signal
Do NOT say "believe in yourself." Do NOT dismiss the feeling.`;
  }
  if (signal === "avoidance") {
    return `\n\nSPIRAL ALERT — AVOIDANCE: The founder is in an avoidance pattern. Before anything else:
1. Name the avoidance directly — "You're describing a pattern, not a problem"
2. Break the avoided task into its smallest possible first step (under 15 min)
3. Ask: "Is this hard because it's actually hard, or because you're afraid of the feedback?"
4. Give them a timer — "Do 10 minutes of it right now, then come back"
Be firm. Avoidance compounds. Interrupting it early is the job.`;
  }
  return "";
}

export async function POST(request: Request) {

  // ── Server-side plan enforcement (builder required for AI coach) ──────────
  const planCheck = await checkPlanAccess("builder");
  if (!planCheck.ok) return planCheck.response;

  try {
    const body = await request.json().catch(() => ({}));
    const userId = String(body?.userId ?? "").trim();
    const projectId = String(body?.projectId ?? "").trim();
    const message = String(body?.message ?? "").trim();
    const blockerType = String(body?.blockerType ?? "").trim();
    const domain = String(body?.domain ?? "").trim();
    const history = Array.isArray(body?.messages)
      ? (body.messages as { role?: string; content?: string }[])
          .map((m) => ({ role: (m?.role === "assistant" ? "assistant" : "user") as "user" | "assistant", content: String(m?.content ?? "").trim() }))
          .filter((m) => m.content)
          .slice(-8)
      : [];

    if (!userId || !projectId) {
      return NextResponse.json({ success: false, error: "userId and projectId required" }, { status: 400 });
    }

    await enforceAndTrackAIUsage(userId);

    // ── Spiral detection (server-side, plan-gated) ──────────────────────────
    const { detected: spiralDetected, signal: spiralSignal } = detectSpiralSignal(message);

    let projectContext = "";
    let stage = "MVP";
    let founderMemoryContext = "";

    if (hasAdminEnv()) {
      const supabase = createAdminClient();

      const [projectResult, memoryResult, milestonesResult] = await Promise.allSettled([
        supabase
          .from("projects")
          .select("title, description, target_users, problem, startup_stage, validation_strengths, validation_weaknesses")
          .eq("id", projectId)
          .eq("user_id", userId)
          .single(),
        supabase.from("founder_memory").select("*").eq("user_id", userId).maybeSingle(),
        supabase.from("milestones").select("id, title, is_completed").eq("project_id", projectId),
      ]);

      const project = projectResult.status === "fulfilled" ? projectResult.value.data : null;
      const memory = memoryResult.status === "fulfilled" ? memoryResult.value.data as FounderMemory | null : null;
      const milestones = milestonesResult.status === "fulfilled" ? milestonesResult.value.data ?? [] : [];

      const milestoneIds = milestones.map((m) => m.id);
      const { data: tasks } = milestoneIds.length
        ? await supabase.from("tasks").select("title, is_completed").in("milestone_id", milestoneIds)
        : { data: [] };

      const completedTasks = (tasks ?? []).filter((t) => t.is_completed).length;
      const totalTasks = (tasks ?? []).length;
      const completedMilestones = milestones.filter((m) => m.is_completed).length;

      if (project) {
        stage = project.startup_stage ?? inferStage(completedTasks, totalTasks, completedMilestones, milestones.length);
        const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
        const valStrengths = (project.validation_strengths ?? []).join(", ");
        const valWeaknesses = (project.validation_weaknesses ?? []).join(", ");
        projectContext = `
Project: ${project.title}
Stage: ${stage}
Problem: ${project.problem ?? "Not defined"}
Target users: ${project.target_users ?? "Not defined"}
Task completion: ${completedTasks}/${totalTasks} (${completionRate}%)
Milestone completion: ${completedMilestones}/${milestones.length}
Validation strengths: ${valStrengths || "None recorded"}
Validation gaps: ${valWeaknesses || "None recorded"}`;
      }

      founderMemoryContext = buildFounderMemoryContext(memory);

      // ── Persist spiral event to founder_memory for pattern tracking ────────
      if (spiralDetected && memory) {
        const signals = (memory.emotional_signals ?? []) as { trigger: string; type: string; confidence: number }[];
        signals.push({ trigger: message.slice(0, 80), type: "draining", confidence: 0.85 });
        await supabase.from("founder_memory")
          .update({ emotional_signals: signals.slice(-20), updated_at: new Date().toISOString() })
          .eq("user_id", userId);
      }
    }

    const blockerContext = blockerType
      ? `\n\nFounder flagged a specific blocker: "${blockerType}" — address this directly.`
      : "";
    const domainContext = domain
      ? `\n\nDomain/context they're focused on: ${domain}`
      : "";
    const historyContext = history.length
      ? "\n\nConversation so far:\n" + history.map((m) => `${m.role === "user" ? "Founder" : "Coach"}: ${m.content}`).join("\n")
      : "";

    // ── Spiral instruction injected into system prompt when detected ─────────
    const spiralInstruction = buildSpiralInstruction(spiralSignal, message);

    const systemPrompt = `You are BuildMind — a direct, honest AI coach for founders. You think like a great co-founder: you have full context on their project, you follow the conversation, and you never give generic advice.

You must return ONLY valid JSON with exactly these two fields:
{
  "reasoning": ["step 1", "step 2", "step 3"],
  "answer": "your response here"
}

The "reasoning" array: 2-4 short internal thinking steps (8-15 words each). Show what you're noticing about this specific founder's situation.

Answer rules:
- READ THE FOUNDER'S MESSAGE FIRST. If they ask a follow-up, answer it directly.
- If they ask something unrelated to their project, engage — then optionally connect back.
- If they ask for your opinion, give it. Do not deflect.
- Only push toward action when it naturally fits.
- Under 200 words. Dense and direct. Never "Great question!" Never filler.
${spiralInstruction}

${projectContext ? `FOUNDER'S REAL DATA:\n${projectContext}` : ""}${founderMemoryContext}${blockerContext}${domainContext}${historyContext}

Founder's message: ${message}

Return ONLY the JSON object. No preamble. No markdown.`;

    const result = await groqJSON<{ reasoning: string[]; answer: string }>(systemPrompt, message);

    const reasoning = Array.isArray(result?.reasoning) && result.reasoning.length > 0
      ? result.reasoning.slice(0, 4).map((r) => String(r).trim()).filter(Boolean)
      : ["Reading your project data...", "Identifying the key constraint...", "Deciding what matters most right now..."];

    const answer = typeof result?.answer === "string" && result.answer.trim().length > 10
      ? result.answer.trim()
      : "BuildMind couldn't generate a response right now. Focus on your most important open task.";

    await createUserNotification(userId, "BuildMind has a new coaching response for you.", "ai_recommendation");

    return NextResponse.json({
      success: true,
      data: { reasoning, answer, spiralDetected, spiralSignal },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Coach failed";
    const status = msg.toLowerCase().includes("limit") ? 429 : msg.includes("GROQ_API_KEY") ? 503 : 500;
    return NextResponse.json({
      success: false,
      error: msg,
      data: {
        reasoning: ["Encountering an issue...", "Falling back to default guidance..."],
        answer: msg.includes("GROQ_API_KEY")
          ? "⚠️ AI is not configured yet. Add the GROQ_API_KEY to your environment variables."
          : "BuildMind is temporarily unavailable. Your most important task right now: complete the top pending item in your project.",
      },
    }, { status });
  }
}
