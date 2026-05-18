/**
 * app/api/integrations/linear/callback/route.ts — Linear OAuth callback
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/server/logger";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://buildmind.live";

export async function GET(request: Request) {
  const url   = new URL(request.url);
  const code  = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code) {
    return NextResponse.redirect(`${APP_URL}/settings?integration=linear&status=denied`);
  }

  try {
    const tokenRes = await fetch("https://api.linear.app/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id:     process.env.LINEAR_CLIENT_ID ?? "",
        client_secret: process.env.LINEAR_CLIENT_SECRET ?? "",
        redirect_uri:  `${APP_URL}/api/integrations/linear/callback`,
        code,
        grant_type:    "authorization_code",
      }),
    });

    if (!tokenRes.ok) throw new Error(`Linear token exchange failed: ${tokenRes.status}`);
    const tokenData = await tokenRes.json() as { access_token: string };

    const userId = state ?? null;
    if (!userId) {
      return NextResponse.redirect(`${APP_URL}/settings?integration=linear&status=error&reason=no_user`);
    }

    const supabase = createAdminClient();
    await supabase.from("integrations").upsert({
      user_id:      userId,
      provider:     "linear",
      access_token: tokenData.access_token,
    }, { onConflict: "user_id,provider" });

    return NextResponse.redirect(`${APP_URL}/settings?integration=linear&status=connected`);
  } catch (err) {
    logError("integrations/linear/callback", err);
    return NextResponse.redirect(`${APP_URL}/settings?integration=linear&status=error`);
  }
}
