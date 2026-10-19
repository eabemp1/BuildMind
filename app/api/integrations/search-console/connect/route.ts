/** GET — starts Google Search Console OAuth (read-only). Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET. */
import { NextResponse } from "next/server";
import { createHmac } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { SC_SCOPE } from "@/lib/integrations/searchConsole";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://buildmind.live";

function state(userId: string): string {
  const payload = Buffer.from(JSON.stringify({ userId, exp: Math.floor(Date.now() / 1000) + 600 })).toString("base64url");
  const secret = process.env.OAUTH_STATE_SECRET ?? process.env.NEXTAUTH_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return secret ? `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}` : userId;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${APP_URL}/auth/login`);
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return NextResponse.redirect(`${APP_URL}/settings?tab=integrations&integration=search_console&status=error&reason=not_configured`);

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: clientId, redirect_uri: `${APP_URL}/api/integrations/search-console/callback`, response_type: "code",
    scope: SC_SCOPE, access_type: "offline", prompt: "consent", include_granted_scopes: "false", state: state(user.id),
  }).toString();

  const ret = new URL(request.url).searchParams.get("return") ?? "";
  const res = NextResponse.redirect(url.toString());
  res.cookies.set("bm_oauth_return", ["/today", "/settings"].includes(ret) ? ret : "/settings", { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}
