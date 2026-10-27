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
import { isGithubAppConfigured } from "@/lib/integrations/githubApp";

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
      .select("provider, metadata, database_id")
      .eq("user_id", user.id)
      .in("provider", ["notion", "linear", "stripe", "polar", "paystack", "revenue_manual", "github", "search_console"]);

    const providers = new Set((integrations ?? []).map(i => i.provider));

    const needs = new Set(
      (integrations ?? [])
        .filter(i => (i.metadata as { needs_reconnect?: boolean } | null)?.needs_reconnect)
        .map(i => i.provider),
    );

    return NextResponse.json({
      notion: providers.has("notion"),
      linear: providers.has("linear"),
      // A connected row whose token stopped working. Settings should ask to reconnect.
      needsReconnect: { search_console: needs.has("search_console"), notion: needs.has("notion"), linear: needs.has("linear"), stripe: needs.has("stripe"), polar: needs.has("polar"), paystack: needs.has("paystack"), github: needs.has("github") },
      stripe: providers.has("stripe"),
      polar: providers.has("polar"),
      paystack: providers.has("paystack"),
      revenueManual: providers.has("revenue_manual"),
      searchConsole: providers.has("search_console"),
      searchConsoleSite: ((integrations ?? []) as Array<{ provider: string; database_id?: string | null }>).find((i) => i.provider === "search_console")?.database_id ?? null,
      searchConsoleSites: (((integrations ?? []) as Array<{ provider: string; metadata?: { sites?: Array<{ url: string }> } | null }>).find((i) => i.provider === "search_console")?.metadata?.sites ?? []).map((x) => x.url),
      github: providers.has("github"),
      // True when one-click GitHub is set up on this deployment; the card then offers it before the token fields.
      githubApp: isGithubAppConfigured(),
      githubRepo: ((integrations ?? []) as Array<{ provider: string; database_id?: string | null }>).find((i) => i.provider === "github")?.database_id ?? null,
    });
  } catch {
    return NextResponse.json({ notion: false, linear: false });
  }
}
