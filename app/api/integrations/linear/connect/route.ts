/**
 * app/api/integrations/linear/connect/route.ts
 *
 * GET — initiates Linear OAuth flow.
 *
 * Flow:
 *   1. User clicks "Connect Linear" in Settings → Integrations tab
 *   2. Creates a signed state token with the user's ID
 *   3. Redirects to Linear's authorization URL
 *   4. Linear redirects back to /api/integrations/linear/callback
 *
 * Requires env vars:
 *   LINEAR_CLIENT_ID
 *   LINEAR_CLIENT_SECRET  (used in callback)
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
    JSON.stringify({ userId, exp: Math.floor(Date.now() / 1000) + 600 })
  ).toString("base64url");

  const secret = getStateSecret();
  if (secret) {
    const sig = createHmac("sha256", secret).update(payload).digest("base64url");
    return `${payload}.${sig}`;
  }

  return userId;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.redirect(`${APP_URL}/auth/login`);
  }

  const clientId = process.env.LINEAR_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(
      `${APP_URL}/settings?tab=integrations&integration=linear&status=error&reason=not_configured`
    );
  }

  const state       = createOAuthState(user.id);
  const redirectUri = encodeURIComponent(`${APP_URL}/api/integrations/linear/callback`);

  // Linear OAuth scopes: read (issues, teams, cycles, projects)
  const linearOAuthUrl =
    `https://linear.app/oauth/authorize` +
    `?client_id=${clientId}` +
    `&redirect_uri=${redirectUri}` +
    `&response_type=code` +
    `&scope=read` +
    `&state=${encodeURIComponent(state)}`;

  return NextResponse.redirect(linearOAuthUrl);
}
