/**
 * app/api/integrations/notion/callback/route.ts — Notion OAuth callback
 *
 * Flow:
 *   1. User clicks "Connect Notion" → redirect to Notion OAuth URL
 *   2. Notion redirects back here with ?code=... & ?state=<userId>
 *   3. Exchange code for access_token
 *   4. Find or create their default database (first DB in workspace)
 *   5. Store in integrations table
 *   6. Redirect to /settings?integration=notion&status=connected
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/server/logger";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://buildmind.live";

export async function GET(request: Request) {
  const url     = new URL(request.url);
  const code    = url.searchParams.get("code");
  const state   = url.searchParams.get("state"); // userId encoded as state
  const errorParam = url.searchParams.get("error");

  if (errorParam || !code) {
    return NextResponse.redirect(`${APP_URL}/settings?integration=notion&status=denied`);
  }

  try {
    // Exchange code for token
    const tokenRes = await fetch("https://api.notion.com/v1/oauth/token", {
      method: "POST",
      headers: {
        "Authorization": "Basic " + Buffer.from(
          `${process.env.NOTION_CLIENT_ID}:${process.env.NOTION_CLIENT_SECRET}`
        ).toString("base64"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grant_type:   "authorization_code",
        code,
        redirect_uri: `${APP_URL}/api/integrations/notion/callback`,
      }),
    });

    if (!tokenRes.ok) {
      throw new Error(`Notion token exchange failed: ${tokenRes.status}`);
    }

    const tokenData = await tokenRes.json() as {
      access_token: string;
      workspace_id: string;
      workspace_name?: string;
      bot_id?: string;
    };

    // Find their first database in the workspace (default target)
    let databaseId: string | null = null;
    try {
      const searchRes = await fetch("https://api.notion.com/v1/search", {
        method:  "POST",
        headers: {
          "Authorization":  `Bearer ${tokenData.access_token}`,
          "Notion-Version": "2022-06-28",
          "Content-Type":   "application/json",
        },
        body: JSON.stringify({ filter: { value: "database", property: "object" }, page_size: 1 }),
      });
      const searchData = await searchRes.json() as { results?: Array<{ id: string }> };
      databaseId = searchData.results?.[0]?.id ?? null;
    } catch { /* non-fatal — user can configure later */ }

    // Determine userId: from state param or from session
    const supabase = createAdminClient();
    let userId = state ?? null;

    if (!userId) {
      // Fallback: get user from session cookie — requires server-side session
      // In this architecture, state should always carry the userId
      return NextResponse.redirect(`${APP_URL}/settings?integration=notion&status=error&reason=no_user`);
    }

    await supabase.from("integrations").upsert({
      user_id:      userId,
      provider:     "notion",
      access_token: tokenData.access_token,
      workspace_id: tokenData.workspace_id,
      database_id:  databaseId,
      metadata:     { workspace_name: tokenData.workspace_name },
    }, { onConflict: "user_id,provider" });

    return NextResponse.redirect(`${APP_URL}/settings?integration=notion&status=connected`);
  } catch (err) {
    logError("integrations/notion/callback", err);
    return NextResponse.redirect(`${APP_URL}/settings?integration=notion&status=error`);
  }
}
