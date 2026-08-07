import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const correctionSchema = z.object({
  belief: z.string().trim().min(1).max(500),
  correction: z.string().trim().min(1).max(1000),
  evidence: z.string().trim().max(1000).optional(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const parsed = correctionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid correction" }, { status: 400 });

  const admin = createAdminClient();
  const { data: memory, error: readError } = await admin
    .from("founder_memory")
    .select("founder_corrections")
    .eq("user_id", user.id)
    .maybeSingle();
  if (readError) return NextResponse.json({ ok: false, error: "Could not load founder memory" }, { status: 500 });

  const existing = Array.isArray(memory?.founder_corrections) ? memory.founder_corrections : [];
  const correction = { ...parsed.data, created_at: new Date().toISOString() };
  const { error: writeError } = await admin.from("founder_memory").upsert({
    user_id: user.id,
    founder_corrections: [...existing, correction].slice(-30),
    updated_at: correction.created_at,
  }, { onConflict: "user_id" });
  if (writeError) return NextResponse.json({ ok: false, error: "Could not save correction" }, { status: 500 });

  return NextResponse.json({ ok: true, correction });
}
