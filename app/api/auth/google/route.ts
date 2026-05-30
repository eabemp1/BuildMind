import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const next = request.nextUrl.searchParams.get("next") ?? "/today";
  const origin = "https://www.buildmind.live";
  const callbackUrl = new URL("/auth/callback", origin);
  callbackUrl.searchParams.set("next", next);
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, {
              ...options,
              httpOnly: true,
              secure: true,
              sameSite: "lax",
              path: "/",
              maxAge: 60 * 10,
              domain: ".buildmind.live",
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
    loginUrl.searchParams.set("reason", error?.message ?? "Could not start Google sign-in.");
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.redirect(data.url);
                            }      
