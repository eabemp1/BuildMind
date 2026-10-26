/** GET — sends the founder to install BuildMind's read-only GitHub App. Needs GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_APP_SLUG. */
import { NextResponse } from "next/server";
import { createHmac } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { isGithubAppConfigured } from "@/lib/integrations/githubApp";

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
  if (!isGithubAppConfigured()) return NextResponse.redirect(`${APP_URL}/settings?tab=integrations&integration=github&status=error&reason=not_configured`);

  const url = `https://github.com/apps/${encodeURIComponent(String(process.env.GITHUB_APP_SLUG))}/installations/new?state=${encodeURIComponent(state(user.id))}`;
  const ret = new URL(request.url).searchParams.get("return") ?? "";
  const res = NextResponse.redirect(url);
  res.cookies.set("bm_oauth_return", ["/today", "/settings"].includes(ret) ? ret : "/settings", { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}
