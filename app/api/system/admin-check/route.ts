/**
 * app/api/system/admin-check/route.ts
 *
 * Server-side admin verification. Replaces the NEXT_PUBLIC_ADMIN_USER_ID
 * client-side comparison that was previously used in app/owner/page.tsx.
 *
 * Uses the Supabase service-role key (never sent to the browser) to read
 * the is_admin column from the profiles table. Returns { isAdmin: boolean }.
 *
 * The client page calls this route and redirects if isAdmin is false.
 * The route itself is the authority — not the client.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/server/adminAuth";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ isAdmin: false }, { status: 401 });
  }

  try {
    const isAdmin = await isAdminUser(user.id);
    return NextResponse.json({ isAdmin }, { status: isAdmin ? 200 : 403 });
  } catch {
    return NextResponse.json({ isAdmin: false }, { status: 500 });
  }
}
