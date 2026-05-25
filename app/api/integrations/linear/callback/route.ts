/**
 * app/api/integrations/linear/callback/route.ts — Linear OAuth callback
 */

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/server/logger";
import { verifyOAuthState } from "@/lib/server/oauthState";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://buildmind.live";

export async function GET(request: NextRequest) {
  const url   = new URL(request.url);
  const code  = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code) {
    return NextResponse.redirect(`${APP_URL}/settings?integration=linear&status=denied`);
  }

  try {
    const userId = verifyOAuthState(state);
    if (!userId) {
      return NextResponse.redirect(`${APP_URL}/settings?integration=linear&status=error&reason=invalid_state`);
    }

    const clientId = process.env.LINEAR_CLIENT_ID ?? "";
    const clientSecret = process.env.LINEAR_CLIENT_SECRET ?? "";
    if (!clientId || !clientSecret) {
      throw new Error("Linear OAuth credentials are not configured");
    }

    const tokenRes = await fetch("https://api.linear.app/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id:     clientId,
        client_secret: clientSecret,
        redirect_uri:  `${APP_URL}/api/integrations/linear/callback`,
        code,
        grant_type:    "authorization_code",
      }),
    });

    if (!tokenRes.ok) throw new Error(`Linear token exchange failed: ${tokenRes.status}`);
    const tokenData = await tokenRes.json() as { access_token: string };

    const supabase = createAdminClient();
    await supabase.from("integrations").upsert({
      user_id:      userId,
      provider:     "linear",
      access_token: tokenData.access_token,
    }, { onConflict: "user_id,provider" });

    const returnPath = request.cookies.get("bm_oauth_return")?.value ?? "/settings";
    const safeReturn = ["/onboarding", "/settings"].includes(returnPath) ? returnPath : "/settings";
    const redirectUrl = `${APP_URL}${safeReturn}?integration=linear&status=connected`;
    const response = NextResponse.redirect(redirectUrl);
    response.cookies.set("bm_oauth_return", "", { maxAge: 0, path: "/" });
    return response;
  } catch (err) {
    logError("integrations/linear/callback", err);
    return NextResponse.redirect(`${APP_URL}/settings?integration=linear&status=error`);
  }
}
