/** POST { site } — choose which Search Console property BuildMind reads. Must be one Google listed for this founder. */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const p = z.object({ site: z.string().min(3).max(300) }).safeParse(await request.json().catch(() => ({})));
  if (!p.success || !hasAdminEnv()) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  const admin = createAdminClient();
  const { data } = await admin.from("integrations").select("metadata").eq("user_id", user.userId).eq("provider", "search_console").maybeSingle();
  const sites = ((data?.metadata as { sites?: Array<{ url: string }> } | null)?.sites ?? []).map((s) => s.url);
  if (!sites.includes(p.data.site)) return NextResponse.json({ ok: false, error: "Unknown site." }, { status: 400 });
  await admin.from("integrations").update({ database_id: p.data.site, updated_at: new Date().toISOString() }).eq("user_id", user.userId).eq("provider", "search_console");
  return NextResponse.json({ ok: true });
}
