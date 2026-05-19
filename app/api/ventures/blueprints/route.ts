/**
 * Server-owned Ventures blueprint history.
 *
 * The client may cache this for instant rendering, but this table is the source
 * of truth for generated blueprints across devices and browser clears.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data, error: dbError } = await admin
    .from("ventures_blueprints")
    .select("blueprint_json, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (dbError) {
    const fallback = await admin
      .from("ventures_blueprints")
      .select("blueprint, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (fallback.error) return NextResponse.json({ ok: false, error: fallback.error.message }, { status: 500 });
    return NextResponse.json({
      ok: true,
      blueprints: (fallback.data ?? []).map(row => row.blueprint).filter(Boolean),
    });
  }

  return NextResponse.json({
    ok: true,
    blueprints: (data ?? []).map(row => row.blueprint_json).filter(Boolean),
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { blueprint?: Record<string, unknown>; description?: string };
  const blueprint = body.blueprint;
  if (!blueprint || typeof blueprint !== "object") {
    return NextResponse.json({ ok: false, error: "blueprint is required" }, { status: 400 });
  }

  const raw = JSON.stringify(blueprint);
  if (raw.length > 256 * 1024) {
    return NextResponse.json({ ok: false, error: "Blueprint payload too large" }, { status: 413 });
  }

  const id = typeof blueprint.id === "string" && UUID_RE.test(blueprint.id)
    ? blueprint.id
    : crypto.randomUUID();
  const layer1 = blueprint.layer1 as Record<string, unknown> | undefined;
  const intent = String(layer1?.intentSummary ?? body.description ?? "Ventures blueprint").slice(0, 500);
  const problem = String(layer1?.problemStatement ?? body.description ?? "").slice(0, 500);

  const admin = createAdminClient();
  const { error: dbError } = await admin
    .from("ventures_blueprints")
    .upsert({
      id,
      user_id: user.id,
      input_type: "text",
      intent_summary: intent,
      problem_statement: problem,
      blueprint_json: blueprint,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });

  if (dbError) {
    const fallback = await admin
      .from("ventures_blueprints")
      .upsert({
        id,
        user_id: user.id,
        venture_idea: intent,
        blueprint,
        status: "saved",
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });
    if (fallback.error) return NextResponse.json({ ok: false, error: fallback.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
