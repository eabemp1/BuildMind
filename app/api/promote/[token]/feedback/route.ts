import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { callModel } from "@/lib/ai-providers";
import { MISSIONS } from "../route";

export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: promoter } = await admin
    .from("promoters")
    .select("id, name")
    .eq("access_token", token)
    .maybeSingle();
  if (!promoter) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const { data: activity } = await admin
    .from("promoter_activity")
    .select("mission_key, note, completed_at")
    .eq("promoter_id", promoter.id)
    .order("completed_at", { ascending: false })
    .limit(20);

  const rows = activity ?? [];
  if (!rows.length) {
    return NextResponse.json({
      ok: true,
      feedback: `Hey ${promoter.name} — nothing logged yet. Pick one mission from the list and log it once you've posted, and I'll actually have something useful to say.`,
    });
  }

  const summary = rows
    .map(r => {
      const mission = MISSIONS.find(m => m.key === r.mission_key)?.title ?? r.mission_key;
      const when = new Date(r.completed_at).toISOString().slice(0, 10);
      return `[${when}] ${mission}${r.note ? ` — note: ${r.note}` : ""}`;
    })
    .join("\n");

  try {
    const feedback = await callModel(
      [
        {
          role: "system",
          content:
            "You are a warm, direct coach giving feedback to someone who is voluntarily helping promote a friend's startup, unpaid. " +
            "Their effort deserves genuine appreciation, not generic praise. Look at what they've actually logged and say something " +
            "SPECIFIC about the pattern you see — which channel they favor, whether they're spreading across channels or repeating one, " +
            "any gaps (e.g. no direct outreach logged). One encouraging observation, one honest specific suggestion for what to try next. " +
            "Max 4 sentences. No corporate language, no 'great job!' filler — sound like a person who actually read their log.",
        },
        {
          role: "user",
          content: `Recent logged activity:\n${summary}`,
        },
      ],
      { role: "fast", temperature: 0.5, maxTokens: 220 },
    );

    return NextResponse.json({ ok: true, feedback: feedback.trim() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI feedback unavailable right now";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
