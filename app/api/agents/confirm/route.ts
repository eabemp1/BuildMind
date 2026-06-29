/**
 * POST /api/agents/confirm
 *
 * Founder confirms or rejects a single finding.
 * Confirmed findings are flagged for promotion to founder_context
 * on the next morning briefing refresh (async — never written here directly).
 *
 * Body: { findingId: string, confirmed: boolean }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRouteUser } from "@/app/api/ai/_planCheck";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  findingId: z.string().uuid(),
  confirmed: z.boolean(),
});

export async function POST(req: NextRequest) {
  const auth = await getRouteUser();
  if (!auth) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid body." }, { status: 400 });
  }

  const admin = createAdminClient();

  // Verify finding belongs to this user
  const { data: finding } = await admin
    .from("agent_findings")
    .select("id,user_id")
    .eq("id", body.findingId)
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (!finding) {
    return NextResponse.json({ ok: false, error: "Finding not found." }, { status: 404 });
  }

  const { error } = await admin
    .from("agent_findings")
    .update({ founder_confirmed: body.confirmed })
    .eq("id", body.findingId)
    .eq("user_id", auth.userId);

  if (error) {
    return NextResponse.json({ ok: false, error: "Failed to update finding." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, confirmed: body.confirmed });
}
