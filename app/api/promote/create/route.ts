import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/promote/create — { name: "Kwame" }
 *
 * Requires you to be logged into BuildMind (this is YOUR action, not the
 * promoter's). Returns a shareable URL with an unguessable token — send
 * that link directly to whoever's helping promote, no account needed on
 * their end.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 60) : "";
  if (!name) return NextResponse.json({ ok: false, error: "Name is required" }, { status: 400 });

  const token = crypto.randomBytes(24).toString("base64url");
  const admin = createAdminClient();
  const { error } = await admin
    .from("promoters")
    .insert({ name, access_token: token, created_by: user.id });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, token, url: `/promote/${token}` });
}
