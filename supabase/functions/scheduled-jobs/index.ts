/**
 * supabase/functions/scheduled-jobs/index.ts
 *
 * Unified scheduled job runner — handles morning briefing AND evening check.
 * Deploy once, schedule twice with pg_cron:
 *
 * DEPLOY:
 *   supabase functions deploy scheduled-jobs --no-verify-jwt
 *
 * SCHEDULE (run in Supabase SQL editor):
 *   select cron.schedule(
 *     'morning-briefing',
 *     '0 5 * * *',   -- 5 AM UTC (Ghana is UTC+0)
 *     $$ select net.http_post(
 *       url := 'https://YOUR_REF.supabase.co/functions/v1/scheduled-jobs',
 *       headers := '{"Content-Type":"application/json","x-job-secret":"YOUR_SECRET"}'::jsonb,
 *       body := '{"job":"morning_briefing"}'::jsonb) $$
 *   );
 *
 *   select cron.schedule(
 *     'evening-check',
 *     '0 16 * * *',  -- 4 PM UTC (Ghana is UTC+0)
 *     $$ select net.http_post(
 *       url := 'https://YOUR_REF.supabase.co/functions/v1/scheduled-jobs',
 *       headers := '{"Content-Type":"application/json","x-job-secret":"YOUR_SECRET"}'::jsonb,
 *       body := '{"job":"evening_check"}'::jsonb) $$
 *   );
 *
 *   select cron.schedule(
 *     'weekly-mirror',
 *     '0 18 * * 0',  -- 6 PM UTC Sunday
 *     $$ select net.http_post(
 *       url := 'https://YOUR_REF.supabase.co/functions/v1/scheduled-jobs',
 *       headers := '{"Content-Type":"application/json","x-job-secret":"YOUR_SECRET"}'::jsonb,
 *       body := '{"job":"weekly_mirror"}'::jsonb) $$
 *   );
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") ?? "";
const GROQ_MODEL = "llama-3.3-70b-versatile";

async function groqJSON<T>(systemPrompt: string, userPrompt: string): Promise<T> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({
      model: GROQ_MODEL, temperature: 0.4, max_tokens: 300,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
    }),
  });
  const body = await res.json();
  return JSON.parse(body?.choices?.[0]?.message?.content ?? "{}") as T;
}

async function sendPushToUser(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  title: string,
  body: string,
  url: string
) {
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("subscription")
    .eq("user_id", userId);

  const vapidPublic = Deno.env.get("NEXT_PUBLIC_VAPID_PUBLIC_KEY") ?? "";
  const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:hello@buildmind.live";

  const payload = JSON.stringify({ title, body, icon: "/logo/buildmind-favicon.svg", url, tag: "briefing" });

  for (const row of subs ?? []) {
    const sub = row.subscription as { endpoint: string };
    const origin = new URL(sub.endpoint).origin;
    // Simple push — production should use proper VAPID signing (see send-daily-push function)
    await fetch(sub.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream", "TTL": "86400" },
      body: new TextEncoder().encode(payload),
    }).catch(() => {});
  }
}

/**
 * generateMorningBriefingFull — inlined version of lib/reflexion.ts:generateMorningBriefing
 * for Deno compatibility. Uses the full context (avoidance signals, cognitive load,
 * last reflection) to produce a briefing as specific as the on-demand API version.
 *
 * This is Fix 3: the cron MUST use the rich prompt, not the 2-line version.
 * The push notification is the most important delivery — not the least.
 */
async function generateMorningBriefingFull(ctx: {
  startupSummary: string;
  stage: string;
  momentumScore: number;
  avoidanceSignals: string[];
  topicsRepeated: string[];
  cognitiveLoad: string;
  daysInactive: number;
  consecutiveTasksCompleted: number;
  yesterdayTask?: string;
  completedYesterday?: boolean;
}): Promise<{ win: string; risk: string; action: string }> {
  const avoidanceBlock = ctx.avoidanceSignals?.length
    ? `Avoidance signals: ${ctx.avoidanceSignals.join(", ")}`
    : "";
  const topicsBlock = ctx.topicsRepeated?.length
    ? `Topics mentioned repeatedly: ${ctx.topicsRepeated.join(", ")}`
    : "";

  // Emotional tone injection — matches lib/reflexion.ts inferEmotionalTrigger
  let emotionalInstruction = "";
  if (ctx.daysInactive >= 3) {
    emotionalInstruction = `TONE: This founder has been inactive ${ctx.daysInactive} days. The win should acknowledge the gap without judgment. The action must be micro — completable in 20 minutes.`;
  } else if (ctx.consecutiveTasksCompleted >= 2) {
    emotionalInstruction = `TONE: This founder just completed ${ctx.consecutiveTasksCompleted} tasks in a row. Acknowledge the streak in the win. Push them harder in the action.`;
  } else if (ctx.momentumScore < 40) {
    emotionalInstruction = `TONE: Momentum is low but not falling. The win should surface something real they have. The action should be one micro-win, not an ambitious target.`;
  }

  const systemPrompt = `You are BuildMind's morning briefing engine. Generate a 3-part morning briefing for a solo founder.
Rules:
- win: One specific, real win tied to their stage or recent work. Not generic praise. (max 20 words)
- risk: The single biggest risk they face TODAY at ${ctx.stage} stage — specific to their situation. (max 20 words)
- action: One concrete action they must do in the next 2 hours — name the platform, the user type, and a number. (max 20 words)
${emotionalInstruction}
No emojis. No fluff. Brutally specific.
Respond in JSON with keys: win, risk, action`;

  const userPrompt = `Startup: "${ctx.startupSummary || "not yet set"}"
Stage: ${ctx.stage} | Momentum: ${ctx.momentumScore}/100 | Cognitive state: ${ctx.cognitiveLoad}
${avoidanceBlock}
${topicsBlock}
${ctx.yesterdayTask ? `Yesterday's task: "${ctx.yesterdayTask}"` : ""}
${ctx.completedYesterday !== undefined ? `Completed yesterday: ${ctx.completedYesterday}` : ""}`;

  return groqJSON<{ win: string; risk: string; action: string }>(systemPrompt, userPrompt);
}

async function runMorningBriefing(supabase: ReturnType<typeof createClient>) {
  // Fetch FULL context — avoidance signals, cognitive load, inactivity tracking.
  // The cron uses the same rich context as the on-demand API route.
  const { data: contexts } = await supabase
    .from("founder_context")
    .select("user_id, startup_summary, current_stage, momentum_score, avoidance_signals, topics_mentioned_repeatedly, cognitive_load, days_inactive, consecutive_tasks_completed");

  const today = new Date().toISOString().split("T")[0];

  let sent = 0;
  for (const ctx of contexts ?? []) {
    try {
      // Idempotent: skip if briefing already generated today
      const { data: existing } = await supabase
        .from("morning_briefings")
        .select("id")
        .eq("user_id", ctx.user_id)
        .gte("created_at", `${today}T00:00:00Z`)
        .limit(1)
        .maybeSingle();
      if (existing) continue;

      // Fetch last reflection for causality loop
      const { data: lastReflection } = await supabase
        .from("reflections")
        .select("outcome, today_action")
        .eq("user_id", ctx.user_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let briefing: { win: string; risk: string; action: string };
      try {
        // Use the full reflexion-powered generator — not the 2-line prompt
        briefing = await generateMorningBriefingFull({
          startupSummary: ctx.startup_summary ?? "",
          stage: ctx.current_stage ?? "Idea",
          momentumScore: ctx.momentum_score ?? 50,
          avoidanceSignals: ctx.avoidance_signals ?? [],
          topicsRepeated: ctx.topics_mentioned_repeatedly ?? [],
          cognitiveLoad: ctx.cognitive_load ?? "fresh",
          daysInactive: ctx.days_inactive ?? 0,
          consecutiveTasksCompleted: ctx.consecutive_tasks_completed ?? 0,
          yesterdayTask: lastReflection?.today_action ?? undefined,
          completedYesterday: lastReflection?.outcome === "completed",
        });
      } catch {
        // Reliability layer: if generation fails, reuse last good briefing structure
        // rather than sending generic output. Habit formation depends on this.
        const { data: lastGood } = await supabase
          .from("morning_briefings")
          .select("win, risk, action")
          .eq("user_id", ctx.user_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastGood) {
          briefing = {
            win: lastGood.win,
            risk: lastGood.risk,
            action: lastReflection?.outcome === "completed"
              ? "Build on yesterday. What's the next step in the same direction?"
              : "I couldn't generate full context today. Name one thing blocking you and write it down.",
          };
        } else {
          // Absolute last resort — stage-aware, never fully generic
          briefing = {
            win: `You're at ${ctx.current_stage ?? "early"} stage and still building — that's already real.`,
            risk: "Inertia: every hour without a concrete action makes the next one harder.",
            action: "Write down the one thing you're avoiding. Then do 10 minutes of it.",
          };
        }
      }

      await supabase.from("morning_briefings").insert({
        user_id: ctx.user_id, ...briefing, delivered_at: new Date().toISOString(),
      });

      const briefText = `Win: ${briefing.win} | Risk: ${briefing.risk}`;
      await sendPushToUser(supabase, ctx.user_id, "⚡ Your morning briefing is ready", briefText, "/today");
      await supabase.from("notifications").insert({
        user_id: ctx.user_id, type: "morning_briefing",
        message: `Morning briefing: ${briefing.win}. Today's action: ${briefing.action}`,
        is_read: false,
      }).catch(() => {});

      await supabase.from("scheduled_job_log").insert({ job_name: "morning_briefing", user_id: ctx.user_id, status: "success" });
      sent++;
    } catch (e) {
      await supabase.from("scheduled_job_log").insert({ job_name: "morning_briefing", user_id: ctx.user_id, status: "error", detail: String(e) });
    }
  }
  return { job: "morning_briefing", sent, total: (contexts ?? []).length };
}

async function runEveningCheck(supabase: ReturnType<typeof createClient>) {
  const today = new Date().toISOString().split("T")[0];
  const { data: contexts } = await supabase
    .from("founder_context")
    .select("user_id, startup_summary, current_stage, momentum_score, avoidance_signals, topics_mentioned_repeatedly, last_active");

  let nudged = 0;
  for (const ctx of contexts ?? []) {
    try {
      const completed = ctx.last_active === today;

      if (!completed) {
        // Generate a context-specific nudge — NEVER generic
        const avoidance = (ctx.avoidance_signals ?? []).join(", ");
        const repeated = (ctx.topics_mentioned_repeatedly ?? []).join(", ");
        const { nudge } = await groqJSON<{ nudge: string }>(
          `Generate ONE specific evening nudge for a founder who hasn't completed their task today.
NEVER generic. Reference their actual situation. Ask one pointed question. Max 25 words.
${avoidance ? `They avoid: ${avoidance}.` : ""}
${repeated ? `Keep mentioning: ${repeated}.` : ""}
Respond in JSON: { "nudge": "..." }`,
          `Stage: ${ctx.current_stage} | Momentum: ${ctx.momentum_score}/100`
        );

        await sendPushToUser(supabase, ctx.user_id, "BuildMind check-in", nudge, "/today");
        await supabase.from("notifications").insert({
          user_id: ctx.user_id, type: "evening_check", message: nudge, is_read: false,
        }).catch(() => {});

        // Decay momentum slightly for inactive day
        const newMomentum = Math.max(20, (ctx.momentum_score ?? 50) - 2);
        await supabase.from("founder_context")
          .update({ momentum_score: newMomentum, days_inactive: 1 })
          .eq("user_id", ctx.user_id);

        await supabase.from("evening_checks").insert({
          user_id: ctx.user_id, task_completed: false, nudge_sent: true, nudge_text: nudge,
          momentum_before: ctx.momentum_score, momentum_after: newMomentum,
        });
        nudged++;
      } else {
        // Task completed — positive reinforcement
        await supabase.from("evening_checks").insert({
          user_id: ctx.user_id, task_completed: true, nudge_sent: false,
        });
        await supabase.from("founder_context")
          .update({ days_inactive: 0 })
          .eq("user_id", ctx.user_id);
      }

      await supabase.from("scheduled_job_log").insert({ job_name: "evening_check", user_id: ctx.user_id, status: "success" });
    } catch (e) {
      await supabase.from("scheduled_job_log").insert({ job_name: "evening_check", user_id: ctx.user_id, status: "error", detail: String(e) });
    }
  }
  return { job: "evening_check", nudged, total: (contexts ?? []).length };
}

async function runWeeklyMirror(supabase: ReturnType<typeof createClient>) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  // Fetch full context for richer synthesis
  const { data: contexts } = await supabase
    .from("founder_context")
    .select("user_id, startup_summary, current_stage, momentum_score, avoidance_signals, topics_mentioned_repeatedly, consecutive_tasks_completed");

  let sent = 0;
  for (const ctx of contexts ?? []) {
    try {
      const { data: reflections } = await supabase
        .from("reflections")
        .select("outcome, today_action, confidence, note")
        .eq("user_id", ctx.user_id)
        .gte("created_at", sevenDaysAgo);

      const { data: overrides } = await supabase
        .from("task_overrides")
        .select("reason, task_text")
        .eq("user_id", ctx.user_id)
        .gte("created_at", sevenDaysAgo)
        .catch(() => ({ data: [] }));

      const completed = (reflections ?? []).filter(r => r.outcome === "completed").length;
      const blocked = (reflections ?? []).filter(r => r.outcome === "blocked").length;
      const total = (reflections ?? []).length;
      const overrideCount = (overrides ?? []).length;

      // ── Trigger full agentic synthesis (updates founder_memory + founder_context) ──
      // This is what makes the weekly mirror actually learn — not just report.
      //
      // Previously gated on APP_URL env var — if not set, synthesis silently skipped
      // for ALL users. Now we run synthesis directly via Groq so it always fires
      // regardless of whether APP_URL is configured.
      if (total >= 3) {
        const appUrl = Deno.env.get("NEXT_PUBLIC_APP_URL") ?? Deno.env.get("APP_URL") ?? "";
        if (appUrl) {
          // Prefer Next.js route for full synthesis (writes to founder_memory)
          fetch(`${appUrl}/api/ai/founder-insight`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ synthesize: true, userId: ctx.user_id }),
          }).catch(() => {});
        } else {
          // APP_URL not set — synthesize directly here so context always updates
          const reflectionNotes = (reflections ?? [])
            .filter(r => r.note)
            .map(r => `[${r.outcome}] ${r.note}`)
            .join("; ");
          const synthesisInput = `Stage: ${ctx.current_stage} | Completed: ${completed}/${total} | Blocked: ${blocked} | Notes: ${reflectionNotes || "none"}`;
          try {
            const { avoidance_zones, strengths } = await groqJSON<{
              avoidance_zones: string[];
              strengths: string[];
            }>(
              `Analyse a founder's weekly reflections and return JSON: { "avoidance_zones": [max 3 strings], "strengths": [max 3 strings] }. Be specific, not generic.`,
              synthesisInput,
            );
            if (avoidance_zones?.length || strengths?.length) {
              await supabase.from("founder_context")
                .update({
                  avoidance_signals: avoidance_zones ?? [],
                  updated_at: new Date().toISOString(),
                })
                .eq("user_id", ctx.user_id)
                .catch(() => {});
            }
          } catch {
            // Non-fatal — continue to weekly mirror generation
          }
        }
      }

      // ── Generate the weekly mirror notification ──────────────────────────────
      // Uses real data: completions, blocks, overrides, avoidance signals
      const avoidanceHint = (ctx.avoidance_signals ?? []).length > 0
        ? `\nPersistent avoidance: ${ctx.avoidance_signals.join(", ")}`
        : "";

      const overrideHint = overrideCount > 0
        ? `\nSkipped tasks this week: ${overrideCount}` +
          (overrides && overrides.length > 0 ? ` (reasons: ${(overrides as Array<{reason: string}>).slice(0, 3).map(o => o.reason).join("; ")})` : "")
        : "";

      const { analysis } = await groqJSON<{ analysis: string }>(
        `Generate a weekly mirror message for a founder. Rules:
- Sentence 1: Specific behavioral observation about this week (reference actual numbers).
- Sentence 2: Name ONE pattern — either positive (streak) or avoidance (what they kept skipping).
- Sentence 3: One direct question — not rhetorical, one they can answer with a choice.
Max 50 words total. No emojis. Direct. Respond in JSON: { "analysis": "..." }`,
        `Stage: ${ctx.current_stage} | Completed: ${completed}/${total} reflections | Blocked: ${blocked} | Momentum: ${ctx.momentum_score}/100${avoidanceHint}${overrideHint}`
      );

      await supabase.from("notifications").insert({
        user_id: ctx.user_id,
        type: "weekly_mirror",
        message: analysis,
        is_read: false,
      }).catch(() => {});

      await sendPushToUser(supabase, ctx.user_id, "📋 Your weekly mirror", analysis, "/reports");
      await supabase.from("scheduled_job_log").insert({ job_name: "weekly_mirror", user_id: ctx.user_id, status: "success" });
      sent++;
    } catch (e) {
      await supabase.from("scheduled_job_log").insert({ job_name: "weekly_mirror", user_id: ctx.user_id, status: "error", detail: String(e) });
    }
  }
  return { job: "weekly_mirror", sent, total: (contexts ?? []).length };
}
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Origin": "*" } });

  const secret = req.headers.get("x-job-secret");
  if (secret !== Deno.env.get("CRON_SECRET")) return new Response("Unauthorized", { status: 401 });

  const { job, dry_run } = await req.json().catch(() => ({ job: "", dry_run: false }));

  if (dry_run) {
    if (job === "morning_briefing" || job === "evening_check" || job === "weekly_mirror") {
      return new Response(JSON.stringify({ job, dry_run: true, message: "Dry run accepted" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown job" }), { status: 400 });
  }

  if (job !== "morning_briefing" && job !== "evening_check" && job !== "weekly_mirror") {
    return new Response(JSON.stringify({ error: "Unknown job" }), { status: 400 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(supabaseUrl, serviceKey);

  let result;
  if (job === "morning_briefing") result = await runMorningBriefing(supabase);
  else if (job === "evening_check") result = await runEveningCheck(supabase);
  else if (job === "weekly_mirror") result = await runWeeklyMirror(supabase);
  else return new Response(JSON.stringify({ error: "Unknown job" }), { status: 400 });

  console.log(`[scheduled-jobs] ${JSON.stringify(result)}`);
  return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
});
