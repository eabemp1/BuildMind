/** GET/PUT /api/companion/settings — style (founder_memory.cofounder_style) and intensity. */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadPrefs } from "@/lib/companion/gather";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  style: z.enum(["direct-challenger", "strategic-partner", "execution-coach", "devil-advocate"]).optional(),
  intensity: z.enum(["quiet", "balanced", "relentless"]).optional(),
}).refine((b) => b.style || b.intensity, "Nothing to change");

export async function GET() {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, ...(await loadPrefs(createAdminClient(), user.userId)) });
}

export async function PUT(request: Request) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid settings" }, { status: 400 });

  const admin = createAdminClient();
  const now = new Date().toISOString();
  try {
    if (parsed.data.style) await admin.from("founder_memory").upsert({ user_id: user.userId, cofounder_style: parsed.data.style, updated_at: now }, { onConflict: "user_id" });
    if (parsed.data.intensity) await admin.from("companion_settings").upsert({ user_id: user.userId, intensity: parsed.data.intensity, updated_at: now }, { onConflict: "user_id" });
  } catch { return NextResponse.json({ ok: false, error: "Could not save" }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}
