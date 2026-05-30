import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const next = request.nextUrl.searchParams.get("next") ?? "/today";
  const origin = request.nextUrl.origin;

  const callbackUrl = new URL("/auth/callback", origin);
  callbackUrl.searchParams.set("next", next);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callbackUrl.toString(),
      queryParams: { prompt: "select_account" },
    },
  });

  if (error || !data.url) {
    const loginUrl = new URL("/auth/login", origin);
    loginUrl.searchParams.set("error", "oauth_provider_failed");
    loginUrl.searchParams.set("reason", error?.message ?? "Could not start Google sign-in.");
    return NextResponse.redirect(loginUrl);
  }

  // NextResponse.redirect to the Google OAuth URL.
  // The SSR createClient writes the PKCE verifier into Set-Cookie headers
  // on this response — so it's a real browser cookie, not document.cookie.
  return NextResponse.redirect(data.url);
    }
