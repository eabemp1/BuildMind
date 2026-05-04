/**
 * app/api/ventures/blueprint-used/route.ts
 *
 * GET  → returns whether the user has used their free blueprint
 * POST → marks blueprint_first_used = true in founder_context
 *
 * Was previously localStorage-only (bm_blueprint_first_used key), so a free
 * user on a new device would get a second free blueprint generation. This
 * persists the flag server-side on the founder_context row.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { data } = await supabase
      .from("founder_context")
      .select("blueprint_first_used")
      .eq("user_id", user.id)
      .single();

    return NextResponse.json({ ok: true, used: data?.blueprint_first_used ?? false });
  } catch {
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { error } = await supabase
      .from("founder_context")
      .upsert(
        { user_id: user.id, blueprint_first_used: true },
        { onConflict: "user_id" }
      );

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
