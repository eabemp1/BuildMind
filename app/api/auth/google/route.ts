import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();

  const next = request.nextUrl.searchParams.get("next") ?? "/today";
  const origin = request.nextUrl.origin;

  const callbackUrl = new URL("/auth/callback", origin);
  callbackUrl.searchParams.set("next", next);

  // Create the client THEN manually intercept the verifier cookie it tries to set,
  // writing it directly via Next.js cookies() so it is guaranteed to be stored.
  // This works around a known @supabase/ssr bug where setItemAsync does not
  // consistently persist the PKCE verifier on repeat sign-in attempts.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, {
              ...options,
              // Must be readable server-side on the callback request
              httpOnly: true,
              secure: process.env.NODE_ENV === "production",
              sameSite: "lax",
              path: "/",
              maxAge: 60 * 10, // 10 minutes — enough for the OAuth round-trip
            });
          });
        },
      },
    },
  );

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
    loginUrl.searchParams.set(
      "reason",
      error?.message ?? "Could not start Google sign-in.",
    );
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.redirect(data.url);
        }
