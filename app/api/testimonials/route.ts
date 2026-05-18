import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/testimonials
 *
 * Saves a founder testimonial. Called from TestimonialModal after the
 * founder submits their quote.
 *
 * Body:
 *   quote        — required, 10–400 chars
 *   display_name — optional, defaults to "Anonymous founder"
 *   is_public    — boolean, founder's consent to public display
 *   streak       — current streak at time of submission
 *   stage        — startup stage at time of submission
 *   source       — what triggered the modal
 *   rating       — 1–5 (default 5)
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const quote = String(body?.quote ?? "").trim().slice(0, 400);
  if (quote.length < 10) {
    return NextResponse.json(
      { error: "Quote must be at least 10 characters." },
      { status: 422 },
    );
  }

  const display_name = String(body?.display_name ?? "").trim().slice(0, 80) ||
    user.user_metadata?.full_name ||
    user.email?.split("@")[0] ||
    "Anonymous founder";

  const streak   = Number(body?.streak   ?? 0);
  const stage    = String(body?.stage    ?? "Idea").slice(0, 40);
  const source   = String(body?.source   ?? "manual").slice(0, 40);
  const rating   = Math.min(5, Math.max(1, Number(body?.rating  ?? 5)));
  const is_public = body?.is_public === true;

  // Fetch avatar_url from profiles (best-effort)
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  const { data, error } = await admin.from("testimonials").insert({
    user_id: user.id,
    display_name,
    avatar_url: profile?.avatar_url ?? null,
    streak,
    stage,
    quote,
    rating,
    is_public,
    source,
  }).select("id").single();

  if (error) {
    console.error("[testimonials] insert error:", error.message);
    return NextResponse.json({ error: "Failed to save." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data.id });
}

/**
 * GET /api/testimonials?public=1
 *
 * Returns approved public testimonials for the landing page.
 * No auth required.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const isPublicRequest = searchParams.get("public") === "1";

  const admin = createAdminClient();

  if (isPublicRequest) {
    const { data, error } = await admin
      .from("testimonials")
      .select("id, display_name, avatar_url, quote, rating, streak, stage, approved_at")
      .eq("is_public", true)
      .not("approved_at", "is", null)
      .order("approved_at", { ascending: false })
      .limit(20);

    if (error) return NextResponse.json({ testimonials: [] });
    return NextResponse.json({ testimonials: data ?? [] });
  }

  // Authenticated: return own testimonials
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await admin
    .from("testimonials")
    .select("id, quote, rating, is_public, source, created_at, approved_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ testimonials: data ?? [] });
}
