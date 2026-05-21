/**
 * app/api/integrations/notion/connect/route.ts
 *
 * GET — initiates Notion OAuth flow.
 *
 * Flow:
 *   1. User clicks "Connect Notion" in Settings → Integrations tab
 *   2. This route creates a signed state token with the user's ID
 *   3. Redirects to Notion's authorization URL
 *   4. Notion redirects back to /api/integrations/notion/callback
 *
 * Requires env vars:
 *   NOTION_CLIENT_ID
 *   NOTION_CLIENT_SECRET  (used in callback, not here)
 *   NEXT_PUBLIC_APP_URL
 *   OAUTH_STATE_SECRET (or NEXTAUTH_SECRET or SUPABASE_SERVICE_ROLE_KEY)
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createHmac } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://buildmind.live";

function getStateSecret(): string {
  return (
    process.env.OAUTH_STATE_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    ""
  );
}

function createOAuthState(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ userId, exp: Math.floor(Date.now() / 1000) + 600 }) // 10 min expiry
  ).toString("base64url");

  const secret = getStateSecret();
  if (secret) {
    const sig = createHmac("sha256", secret).update(payload).digest("base64url");
    return `${payload}.${sig}`;
  }

  // Dev fallback — unsigned (only works in non-production)
  return userId;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.redirect(`${APP_URL}/auth/login`);
  }

  const clientId = process.env.NOTION_CLIENT_ID;
  if (!clientId) {
    // Notion not configured — redirect back with an error
    return NextResponse.redirect(
      `${APP_URL}/settings?tab=integrations&integration=notion&status=error&reason=not_configured`
    );
  }

  const state        = createOAuthState(user.id);
  const redirectUri  = encodeURIComponent(`${APP_URL}/api/integrations/notion/callback`);
  const notionOAuthUrl =
    `https://api.notion.com/v1/oauth/authorize` +
    `?client_id=${clientId}` +
    `&response_type=code` +
    `&owner=user` +
    `&redirect_uri=${redirectUri}` +
    `&state=${encodeURIComponent(state)}`;

  return NextResponse.redirect(notionOAuthUrl);
}
