import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type InsightItem = { type: "warning" | "positive" | "insight"; text: string };

function toSse(event: string, payload: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ ok: false }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const projectId = String(body?.projectId ?? "").trim();

    const admin = createAdminClient();
    const { data: memory } = await admin
      .from("founder_memory")
      .select("avoidance_zones, strengths, personality_tags, last_insight, last_week_summary")
      .eq("user_id", user.id)
      .maybeSingle();

    const { data: reflections } = await admin
      .from("reflections")
      .select("outcome, note, confidence, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    const { data: project } = projectId
      ? await admin.from("projects").select("title, startup_stage").eq("id", projectId).eq("user_id", user.id).maybeSingle()
      : { data: null };

    const avoidanceZones = Array.isArray(memory?.avoidance_zones) ? memory.avoidance_zones as string[] : [];
    const strengths = Array.isArray(memory?.strengths) ? memory.strengths as string[] : [];
    const insights: InsightItem[] = [];

    if (avoidanceZones.length) {
      insights.push({ type: "warning", text: `You keep circling ${avoidanceZones[0]}. That is your current drag.` });
    }
    if (strengths.length) {
      insights.push({ type: "positive", text: `Your strongest mode is still around ${strengths[0]}. Lean into that when motivation is low.` });
    }
    const confidenceAvg = (reflections ?? []).reduce((sum, row) => sum + (row.confidence ?? 3), 0) / Math.max((reflections ?? []).length, 1);
    if (confidenceAvg >= 4) {
      insights.push({ type: "positive", text: `Confidence is high across recent reflections. You are likely underestimating your momentum.` });
    } else if (confidenceAvg <= 2.6) {
      insights.push({ type: "warning", text: `Confidence is sagging. The next task should reduce ambiguity, not increase it.` });
    }
    insights.push({ type: "insight", text: project?.startup_stage ? `Current stage: ${project.startup_stage}. This should shape the next task deeply.` : "Stage data is missing, so analysis is based on recent behavior only." });
    if (memory?.last_insight) {
      insights.push({ type: "insight", text: String(memory.last_insight) });
    }

    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode("retry: 1000\n\n"));
        insights.forEach((item, index) => {
          controller.enqueue(encoder.encode(toSse("insight", { index, item })));
        });
        controller.enqueue(encoder.encode(toSse("done", { items: insights })));
        controller.close();
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate insights";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}