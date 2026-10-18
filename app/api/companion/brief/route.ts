/**
 * GET /api/companion/brief — today's Co-founder moments for this founder.
 * Deterministic: built from the founder's records (lib/companion/moments.ts),
 * limited by style + intensity (lib/companion/policy.ts). New moments are
 * recorded as "shown" so the same set is returned all day and caps hold.
 */
import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { buildMoments, shape } from "@/lib/companion/moments";
import { selectMoments, styleForCapacity, STYLE_POLICY, type Capacity } from "@/lib/companion/policy";
import { gatherInput, loadHistory, loadPrefs } from "@/lib/companion/gather";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET(request: Request) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!hasAdminEnv()) return NextResponse.json({ ok: true, moments: [], style: "execution-coach", intensity: "balanced" });

  const admin = createAdminClient();
  const projectId = new URL(request.url).searchParams.get("projectId")?.trim() || undefined;
  const [prefs, history, input, founderContext] = await Promise.all([
    loadPrefs(admin, user.userId), loadHistory(admin, user.userId), gatherInput(admin, user.userId, projectId),
    admin.from("founder_context").select("cognitive_load").eq("user_id", user.userId).maybeSingle(),
  ]);
  const cognitiveLoad = founderContext.data?.cognitive_load;
  const state: Capacity = { level: cognitiveLoad === "autopilot" ? "depleted" : cognitiveLoad === "drained" ? "low" : "fresh" };

  const { selected, newKeys, cap } = selectMoments(buildMoments(input), history, prefs.style, prefs.intensity, input.now, state);
  const voice = styleForCapacity(prefs.style, state);

  if (newKeys.length) {
    try {
      const day = new Date(input.now).toISOString().slice(0, 10);
      await admin.from("companion_events").upsert(
        selected.filter((m) => newKeys.includes(m.key)).map((m) => ({ user_id: user.userId, moment_key: m.key, kind: m.kind, day, status: "shown" })),
        { onConflict: "user_id,moment_key,day", ignoreDuplicates: true },
      );
    } catch { /* tracking is best-effort */ }
  }

  return NextResponse.json({
    ok: true, style: prefs.style, intensity: prefs.intensity, cap,
    styles: Object.entries(STYLE_POLICY).map(([key, v]) => ({ key, label: v.label, tagline: v.tagline, color: v.color })),
    moments: selected.map((m) => shape(m, voice)),
  });
}
