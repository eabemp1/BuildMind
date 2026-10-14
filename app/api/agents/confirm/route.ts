/**
 * POST /api/agents/confirm
 *
 * Founder confirms or rejects a single finding.
 * Records the founder's decision with provenance (evidence tier, source count,
 * verification status). Nothing is written to founder_context from here.
 *
 * Body: { findingId, confirmed, verifiedByFounder?, note? }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { buildProvenance, classifyFinding, type EvidenceTier } from "@/lib/evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  findingId: z.string().uuid(),
  confirmed: z.boolean(),
  /** Founder says they checked this against their own evidence (interviews, data). */
  verifiedByFounder: z.boolean().optional(),
  note: z.string().max(500).optional(),
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
    .select("*")
    .eq("id", body.findingId)
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (!finding) {
    return NextResponse.json({ ok: false, error: "Finding not found." }, { status: 404 });
  }

  // Provenance: what the founder is actually vouching for. A thin signal
  // confirmed without the founder saying they checked it stays a hypothesis.
  const c = classifyFinding(finding);
  const tier = (finding.evidence_tier as EvidenceTier | undefined) ?? c.tier;
  const sourceCount = typeof finding.source_count === "number" ? finding.source_count : c.sourceCount;
  const prov = body.confirmed ? buildProvenance(tier, sourceCount, body.verifiedByFounder === true, body.note) : null;

  const richUpdate = {
    founder_confirmed: body.confirmed,
    verification_status: prov ? prov.verification_status : "rejected",
    confirm_note: prov?.confirm_note ?? (body.note?.trim() || null),
    confirmed_at: new Date().toISOString(),
  };
  let { error } = await admin.from("agent_findings").update(richUpdate).eq("id", body.findingId).eq("user_id", auth.userId);
  if (error) {
    // Evidence columns not migrated yet: keep the original behaviour.
    ({ error } = await admin.from("agent_findings").update({ founder_confirmed: body.confirmed }).eq("id", body.findingId).eq("user_id", auth.userId));
  }

  if (error) {
    return NextResponse.json({ ok: false, error: "Failed to update finding." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, confirmed: body.confirmed, verification_status: richUpdate.verification_status });
}
