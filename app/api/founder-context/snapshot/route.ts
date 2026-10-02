/**
 * GET /api/founder-context/snapshot?projectId=...
 * The single "where do I stand" read used by the Cofounder Pulse and the
 * Morning Briefing. See lib/server/founderSnapshot.ts.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFounderSnapshot } from "@/lib/server/founderSnapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    const projectId = new URL(request.url).searchParams.get("projectId")?.trim() || undefined;
    const data = await getFounderSnapshot(user.id, projectId);
    return NextResponse.json({ ok: true, data });
  } catch {
    return NextResponse.json({ ok: false, error: "snapshot_failed" }, { status: 500 });
  }
}
