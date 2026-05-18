import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const { projectId, momentum_score, execution_score } = await req.json().catch(() => ({}));
  if (!projectId) {
    return NextResponse.json({ ok: false, error: "projectId required" }, { status: 400 });
  }

  const update: Record<string, number> = {};
  if (typeof momentum_score === "number") {
    update.momentum_score = Math.min(100, Math.max(0, Math.round(momentum_score)));
  }
  if (typeof execution_score === "number") {
    update.execution_score = Math.min(100, Math.max(0, Math.round(execution_score)));
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: false, error: "No score supplied" }, { status: 400 });
  }

  const { error } = await supabase
    .from("projects")
    .update(update)
    .eq("id", projectId)
    .eq("user_id", user.id);

  return error
    ? NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    : NextResponse.json({ ok: true });
}
