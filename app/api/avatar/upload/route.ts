/**
 * app/api/avatar/upload/route.ts — NEW
 *
 * Fix #3: Avatar / profile image upload.
 *
 * Uses Supabase Storage (S3-compatible) — no separate AWS account needed.
 * The bucket "avatars" must be created in your Supabase project > Storage
 * with public access enabled.
 *
 * Setup steps (one-time in Supabase dashboard):
 *   1. Storage → New bucket → name: "avatars" → Public: YES
 *   2. Storage → Policies → add policy: Allow authenticated users to upload
 *
 * POST /api/avatar/upload
 *   Body: FormData with field "avatar" (File, JPEG/PNG/WebP, max 3MB)
 *   Returns: { ok: true, url: "https://..." }
 *
 * The returned URL is then saved to user_metadata.avatar_url via
 * supabase.auth.updateUser({ data: { avatar_url: url } })
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "avatars";
const MAX_BYTES = 3 * 1024 * 1024; // 3 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json({ ok: false, error: "Invalid form data" }, { status: 400 });
    }

    const file = formData.get("avatar") as File | null;
    if (!file || typeof file === "string") {
      return NextResponse.json({ ok: false, error: "No file uploaded. Field name must be 'avatar'" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { ok: false, error: `File type not allowed. Use: ${ALLOWED_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { ok: false, error: `File too large. Max size: ${MAX_BYTES / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    const ext = file.type.split("/")[1].replace("jpeg", "jpg");
    // Deterministic path per user — uploading again overwrites the old avatar
    const path = `${user.id}/avatar.${ext}`;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const admin = createAdminClient();

    // Upload to Supabase Storage (S3-compatible)
    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: file.type,
        upsert: true, // overwrite existing avatar
        cacheControl: "3600",
      });

    if (uploadError) {
      // If bucket doesn't exist, surface a clear error
      if (uploadError.message?.includes("Bucket not found") || uploadError.message?.includes("does not exist")) {
        return NextResponse.json(
          {
            ok: false,
            error: `Storage bucket '${BUCKET}' not found. Create it in Supabase Dashboard > Storage > New Bucket (name: "${BUCKET}", Public: enabled).`,
          },
          { status: 500 }
        );
      }
      return NextResponse.json({ ok: false, error: uploadError.message }, { status: 500 });
    }

    // Get the public URL
    const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(path);
    const avatarUrl = urlData?.publicUrl;

    if (!avatarUrl) {
      return NextResponse.json({ ok: false, error: "Failed to get public URL" }, { status: 500 });
    }

    // Update user metadata so the avatar shows in the sidebar immediately
    await supabase.auth.updateUser({
      data: { avatar_url: avatarUrl },
    });

    // Also persist to profiles/founder_context if those tables exist
    try {
      await admin
        .from("profiles")
        .upsert({ user_id: user.id, avatar_url: avatarUrl }, { onConflict: "user_id" });
    } catch {
      // profiles table may not have avatar_url column — non-fatal
    }

    return NextResponse.json({ ok: true, url: avatarUrl });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 }
    );
  }
}

// DELETE existing avatar
export async function DELETE() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    // Try common extensions
    for (const ext of ["jpg", "png", "webp", "gif"]) {
      await admin.storage.from(BUCKET).remove([`${user.id}/avatar.${ext}`]).catch(() => {});
    }

    await supabase.auth.updateUser({ data: { avatar_url: null } });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Delete failed" },
      { status: 500 }
    );
  }
}
