/**
 * app/api/integrations/status/route.ts
 *
 * GET — returns which integrations the current user has connected.
 *
 * Response: { notion: boolean, linear: boolean }
 *
 * Used by the Integrations settings tab to show connected badges
 * without requiring the user to go through OAuth again.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ notion: false, linear: false }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const { data: integrations } = await admin
      .from("integrations")
      .select("provider")
      .eq("user_id", user.id)
      .in("provider", ["notion", "linear"]);

    const providers = new Set((integrations ?? []).map(i => i.provider));

    return NextResponse.json({
      notion: providers.has("notion"),
      linear: providers.has("linear"),
    });
  } catch {
    return NextResponse.json({ notion: false, linear: false });
  }
}
