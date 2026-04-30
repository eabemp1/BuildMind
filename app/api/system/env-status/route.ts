import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBillingEnvStatus } from "@/lib/billing/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Admin check is server-side via profiles.is_admin (service-role key).
  // NEXT_PUBLIC_ADMIN_USER_ID is no longer used here.
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const adminProfile = await createAdminClient()
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!adminProfile.data?.is_admin) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const env = getBillingEnvStatus();
  let adminSupabaseReadable = false;
  let currentUserReadable = false;
  let adminError: string | null = null;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.getUserById(user.id);
    if (error) {
      adminError = error.message;
    } else {
      adminSupabaseReadable = true;
      currentUserReadable = Boolean(data.user?.id);
    }
  } catch (error) {
    adminError = error instanceof Error ? error.message : "Unknown admin error";
  }

  return NextResponse.json({
    ok: true,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    supabaseHost: process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host
      : null,
    env,
    checks: {
      adminSupabaseReadable,
      currentUserReadable,
      adminError,
    },
  });
}
