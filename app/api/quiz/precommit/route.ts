import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/server/logger";

function isValidEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export async function POST(request: Request) {
  let body: { email?: unknown; archetype?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const archetype = typeof body.archetype === "string" ? body.archetype.slice(0, 100) : null;

  if (!isValidEmail(email)) {
    return NextResponse.json({ ok: false, error: "A valid email is required." }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    // Upsert on email: re-submitting the quiz just refreshes their archetype,
    // it does not create duplicate pre-commitments.
    const { error } = await admin
      .from("founding_members")
      .upsert(
        { email, archetype, source: "quiz" },
        { onConflict: "email", ignoreDuplicates: false },
      );

    if (error) {
      logError("api/quiz/precommit", error);
      return NextResponse.json({ ok: false, error: "Could not save your spot. Please try again." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logError("api/quiz/precommit", err);
    return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
