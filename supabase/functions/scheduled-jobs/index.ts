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

async function runMorningBriefing(supabase: ReturnType<typeof createClient>) {
  const { data: contexts } = await supabase
    .from("founder_context")
    .select("user_id, startup_summary, current_stage, momentum_score, avoidance_signals, topics_mentioned_repeatedly");

  let sent = 0;
  for (const ctx of contexts ?? []) {
    try {
      const briefing = await groqJSON<{ win: string; risk: string; action: string }>(
        `You are BuildMind's morning briefing engine. Generate a 3-line morning briefing.
win: One win from their recent work (max 15 words)
risk: Their single biggest risk TODAY (max 15 words)  
action: One concrete action for the next 2 hours (max 15 words)
Respond in JSON with keys: win, risk, action`,
        `Startup: "${ctx.startup_summary ?? "not set"}" | Stage: ${ctx.current_stage} | Momentum: ${ctx.momentum_score}/100`
      );

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
  const { data: contexts } = await supabase.from("founder_context").select("user_id, startup_summary, current_stage, momentum_score");

  let sent = 0;
  for (const ctx of contexts ?? []) {
    try {
      const { data: reflections } = await supabase
        .from("reflections")
        .select("outcome, today_action, confidence")
        .eq("user_id", ctx.user_id)
        .gte("created_at", sevenDaysAgo);

      const completed = (reflections ?? []).filter(r => r.outcome === "completed").length;
      const total = (reflections ?? []).length;

      const { analysis } = await groqJSON<{ analysis: string }>(
        `Generate a 2-sentence weekly mirror for a founder.
Pattern: "You said you would [X]. You actually did [Y]."
Then: One question — "Adjust your ambition or your execution?"
Max 40 words total. Respond in JSON: { "analysis": "..." }`,
        `Stage: ${ctx.current_stage} | Completed: ${completed}/${total} tasks | Momentum: ${ctx.momentum_score}/100`
      );

      await supabase.from("notifications").insert({
        user_id: ctx.user_id, type: "weekly_mirror",
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
