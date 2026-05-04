/**
 * app/api/ventures/tracks/route.ts
 *
 * Persists roadmap track progress to Supabase so it survives device switches
 * and browser clears. Replaces the localStorage-only storage pattern that
 * caused progress loss for returning users on new devices.
 *
 * GET  /api/ventures/tracks          → returns all tracks for the session user
 * PUT  /api/ventures/tracks          → upserts a single track (full object)
 * DELETE /api/ventures/tracks?id=X   → deletes a track by id
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ── GET — load all tracks ─────────────────────────────────────────────────────

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("venture_tracks")
      .select("id, data, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const tracks = (data ?? []).map((row: { id: string; data: unknown; updated_at: string }) => row.data);
    return NextResponse.json({ ok: true, tracks });
  } catch {
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}

// ── PUT — upsert a single track ───────────────────────────────────────────────

export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || !body.id || typeof body.id !== "string") {
      return NextResponse.json({ ok: false, error: "track.id is required" }, { status: 400 });
    }

    // Prevent enormous payloads — a track with 4 paths × 4 decisions is ~4 KB.
    // 128 KB is a generous ceiling that blocks obvious abuse.
    const raw = JSON.stringify(body);
    if (raw.length > 128 * 1024) {
      return NextResponse.json({ ok: false, error: "Track payload too large" }, { status: 413 });
    }

    const { error } = await supabase
      .from("venture_tracks")
      .upsert(
        { id: body.id, user_id: user.id, data: body },
        { onConflict: "id" }
      );

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}

// ── DELETE — remove a track ───────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id")?.trim();
    if (!id) {
      return NextResponse.json({ ok: false, error: "id query param is required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("venture_tracks")
      .delete()
      // RLS ensures user_id = session user, but we add .eq for defence-in-depth
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
