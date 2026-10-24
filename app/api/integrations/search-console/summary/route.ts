/**
 * GET — what BuildMind can see in the founder's Search Console, so the connection is not invisible.
 * Always answers with a state the card can show; never throws. Live numbers when Google answers, the last saved
 * snapshot (dated) when it does not, and a reconnect state when the token stopped working.
 */
import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/integrations/crypto";
import { fetchSearchSummary, describeSearch, type SearchSummary } from "@/lib/integrations/searchConsole";
import { logError } from "@/lib/server/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false, state: "unauthorized" }, { status: 401 });
  if (!hasAdminEnv()) return NextResponse.json({ ok: false, state: "error" });
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("integrations").select("access_token, database_id, metadata").eq("user_id", user.userId).eq("provider", "search_console").maybeSingle();
    if (!data) return NextResponse.json({ ok: true, state: "not_connected" });
    if (!data.database_id) return NextResponse.json({ ok: true, state: "no_site" });
    const meta = (data.metadata ?? {}) as { summary?: SearchSummary; needs_reconnect?: boolean };
    const token = decryptSecret(data.access_token);
    if (!token) return NextResponse.json({ ok: true, state: "reconnect", site: data.database_id });

    const live = await fetchSearchSummary(token, data.database_id);
    if (live.ok) {
      void Promise.resolve(admin.from("integrations").update({ metadata: { ...meta, summary: live.summary, needs_reconnect: false }, updated_at: new Date().toISOString() }).eq("user_id", user.userId).eq("provider", "search_console")).catch(() => {});
      return NextResponse.json({ ok: true, state: "live", site: data.database_id, summary: live.summary, note: describeSearch(live.summary) });
    }
    if (live.kind === "auth") return NextResponse.json({ ok: true, state: "reconnect", site: data.database_id });
    if (live.kind === "site") return NextResponse.json({ ok: true, state: "site_denied", site: data.database_id });
    if (meta.summary) return NextResponse.json({ ok: true, state: "cached", site: data.database_id, summary: meta.summary, note: describeSearch(meta.summary) });
    return NextResponse.json({ ok: true, state: "error", site: data.database_id });
  } catch (err) {
    logError("integrations/search-console/summary", err);
    return NextResponse.json({ ok: false, state: "error" });
  }
}
