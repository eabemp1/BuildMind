/** GET — Google redirects here. Stores the refresh token encrypted and the sites the founder can read. */
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/server/logger";
import { verifyOAuthState } from "@/lib/server/oauthState";
import { encryptSecret } from "@/lib/integrations/crypto";
import { listSites } from "@/lib/integrations/searchConsole";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://buildmind.live";

export async function GET(request: NextRequest) {
  const q = new URL(request.url).searchParams;
  const back = (status: string, path = "/settings") => {
    const r = NextResponse.redirect(`${APP_URL}${path}?integration=search_console&status=${status}`);
    r.cookies.set("bm_oauth_return", "", { maxAge: 0, path: "/" });
    return r;
  };
  const ret = request.cookies.get("bm_oauth_return")?.value ?? "/settings";
  const path = ["/today", "/settings"].includes(ret) ? ret : "/settings";
  const code = q.get("code");
  if (q.get("error") || !code) return back("denied", path);

  try {
    const userId = verifyOAuthState(q.get("state"));
    if (!userId) return back("error", path);
    const id = process.env.GOOGLE_CLIENT_ID, secret = process.env.GOOGLE_CLIENT_SECRET;
    if (!id || !secret) return back("error", path);

    const tr = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: `${APP_URL}/api/integrations/search-console/callback`, grant_type: "authorization_code" }),
    });
    if (!tr.ok) throw new Error(`Google token exchange failed: ${tr.status}`);
    const t = (await tr.json()) as { access_token?: string; refresh_token?: string };
    if (!t.access_token || !t.refresh_token) return back("error", path);

    const sites = await listSites(t.access_token);
    if (!sites.length) return back("no_sites", path);
    // Prefer a domain property, then the first owned site.
    const pick = sites.find((s) => s.url.startsWith("sc-domain:")) ?? sites.find((s) => s.level === "siteOwner") ?? sites[0];

    await createAdminClient().from("integrations").upsert({
      user_id: userId, provider: "search_console", access_token: encryptSecret(t.refresh_token), database_id: pick.url,
      metadata: { sites, needs_reconnect: false }, updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,provider" });
    return back("connected", path);
  } catch (err) {
    logError("integrations/search-console/callback", err);
    return back("error", path);
  }
}
