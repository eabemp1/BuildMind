/**
 * PATCH /api/project/mrr
 * Updates current_mrr for the authenticated user's active project.
 * Uses admin client to bypass RLS - auth still enforced via session check.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const Schema = z.object({
  projectId: z.string().uuid(),
  mrr: z.number().int().min(0).max(100_000_000),
});

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });

  const { projectId, mrr } = parsed.data;
  const admin = createAdminClient();

  const { data: project } = await admin
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!project) return NextResponse.json({ ok: false, error: "Project not found" }, { status: 404 });

  const { error: updateError } = await admin
    .from("projects")
    .update({ current_mrr: mrr, mrr_updated_at: new Date().toISOString() })
    .eq("id", projectId);

  if (updateError) {
    console.error("[project/mrr]", updateError);
    return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, mrr });
}
