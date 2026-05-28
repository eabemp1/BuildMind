import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { FEATURES } from "@/lib/features";
import { isAdminUser } from "@/lib/server/adminAuth";

export async function middleware(request: NextRequest) {
  // Generate a per-request nonce for CSP (W5 fix — replaces static unsafe-inline)
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV !== "production";
  const devScriptSources = isDev ? " 'unsafe-eval'" : "";
  const devConnectSources = isDev ? " http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*" : "";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${devScriptSources}`,
    // This app intentionally uses React style attributes throughout the UI.
    // Do not pair a style nonce with 'unsafe-inline': CSP3 browsers ignore
    // 'unsafe-inline' when a nonce is present, which breaks those style attrs.
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    `connect-src 'self' https://*.supabase.co https://api.groq.com https://api.cerebras.ai https://generativelanguage.googleapis.com https://api.anthropic.com${devConnectSources}`,
    "frame-ancestors 'none'",
  ].join("; ");

  let response = NextResponse.next({
    request: { headers: new Headers({ ...Object.fromEntries(request.headers), "x-nonce": nonce }) },
  });
  response.headers.set("Content-Security-Policy", csp);
  const devAuthEnabled = process.env.NODE_ENV !== "production" && process.env.DEV_AUTH_ENABLED === "1";
  const isDevAuthed = devAuthEnabled && request.cookies.get("bm_dev_auth")?.value === "1";
  const isDevOnboarded = isDevAuthed && request.cookies.get("bm_dev_onboarded")?.value === "1";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
  const pathname = request.nextUrl.pathname;
  const todayKey = new Date().toISOString().slice(0, 10);

  if (!supabaseConfigured && process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Supabase public environment is not configured." },
      { status: 500 },
    );
  }

  if (pathname === "/" && request.nextUrl.searchParams.has("code") && !isDevAuthed) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/auth/callback";
    if (!redirectUrl.searchParams.has("next")) {
      redirectUrl.searchParams.set("next", "/onboarding");
    }
    const redirectResponse = NextResponse.redirect(redirectUrl);
    redirectResponse.headers.set("Content-Security-Policy", csp);
    return redirectResponse;
  }

  if (pathname === "/auth/callback") {
    return response;
  }

  const supabase = supabaseConfigured
    ? createServerClient(
        supabaseUrl!,
        supabaseAnonKey!,
        {
          cookies: {
            getAll() {
              return request.cookies.getAll();
            },
            setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
              cookiesToSet.forEach(({ name, value, options }) => {
                response.cookies.set(name, value, options);
              });
            },
          },
        },
      )
    : null;

  const {
    data: { user },
    error: authError,
  } = supabase
    ? await supabase.auth.getUser()
    : { data: { user: null }, error: null };

  if (authError) {
    for (const cookie of request.cookies.getAll()) {
      if (cookie.name.startsWith("sb-")) {
        response.cookies.delete(cookie.name);
      }
    }
  }

  const isAuthRoute = pathname.startsWith("/auth");
  const isAuthCallbackRoute = pathname === "/auth/callback";
  const isConversionRoute =
    pathname === "/try" ||
    pathname.startsWith("/try/") ||
    pathname === "/break" ||
    pathname.startsWith("/break/") ||
    pathname === "/upgrade" ||
    pathname === "/ventures" ||
    pathname.startsWith("/ventures/");
  const isExploreRoute = pathname === "/explore" || pathname.startsWith("/explore/");
  const isFounderRoute = pathname.startsWith("/founder/");
  const isStudentRoute = pathname === "/students";
  const isPublicRoute =
    pathname === "/" ||
    pathname === "/landing" ||
    pathname === "/welcome" ||
    isAuthRoute ||
    isExploreRoute ||
    isFounderRoute ||
    isConversionRoute ||
    isStudentRoute;
  const isApiRoute = pathname.startsWith("/api");
  const isOnboardingRoute = pathname === "/onboarding" || pathname.startsWith("/onboarding/");

  // Private admin-only routes — /my-ventures and /admin
  // Consolidated into one check to avoid two identical fetch round-trips on admin routes.
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const isMyVenturesRoute = pathname === "/my-ventures" || pathname.startsWith("/my-ventures/");

  if (isAdminRoute || isMyVenturesRoute) {
    let isAdmin = false;

    if (user) {
      try {
        // A3 FIX: Call isAdminUser() directly instead of making an HTTP
        // self-request back through the public internet. The self-fetch doubled
        // latency, risked cold-start loops, and leaked session cookies through
        // the network stack into logs.
        isAdmin = await isAdminUser(user.id);
      } catch {}
    }

    if (!isAdmin) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/overview";
      return NextResponse.redirect(redirectUrl);
    }
  }

  // /dashboard → /overview (dashboard is now the KPI overview)
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/overview";
    return NextResponse.redirect(redirectUrl);
  }

  const featureBlocks = [
    { enabled: FEATURES.aiCoach, match: (path: string) => path.startsWith("/ai-coach") },
    { enabled: FEATURES.ventures, match: (path: string) => path === "/ventures" || path.startsWith("/ventures/") },
    { enabled: FEATURES.notifications, match: (path: string) => path.startsWith("/notifications") },
    { enabled: FEATURES.publicProjects, match: (path: string) => path === "/explore" || path.startsWith("/explore/") },
    { enabled: FEATURES.publicProjects, match: (path: string) => path.startsWith("/founder/") },
    { enabled: FEATURES.analytics, match: (path: string) => path.startsWith("/reports") },
    { enabled: FEATURES.adminPortal, match: (path: string) => path.startsWith("/admin") },
  ];

  if (!isApiRoute) {
    const blocked = featureBlocks.some((item) => !item.enabled && item.match(pathname));
    if (blocked) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/overview";
      return NextResponse.redirect(redirectUrl);
    }
  }

  if ((user || isDevAuthed) && !isApiRoute) {
    // Always verify via DB project count — the JWT onboarding_completed flag
    // can become stale if the user deletes all their projects, which would
    // permanently block them from re-entering onboarding. The DB query is
    // fast (indexed on user_id, head-only count) and runs on every page
    // request only for authenticated users, which is acceptable.
    let onboardingCompleted: boolean;
    const { count: projectCount } = user
      ? await supabase!
          .from("projects")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
      : { count: isDevOnboarded ? 1 : 0 };
    onboardingCompleted = (projectCount ?? 0) > 0;

    if (!onboardingCompleted && !isOnboardingRoute) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/onboarding";
      return NextResponse.redirect(redirectUrl);
    }

    if (onboardingCompleted && isOnboardingRoute) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/today";
      return NextResponse.redirect(redirectUrl);
    }

    const isPrivateRoute = !isPublicRoute && !isApiRoute;
    const hasSeenToday = request.cookies.get("bm_today_seen")?.value === todayKey;
    // Only redirect to /today when the user arrives at the root path ("/") or
    // navigates directly to a non-specific entry point. Do NOT redirect mid-session
    // from pages like /settings or /projects/[id] — this would destroy unsaved
    // form state at midnight when the bm_today_seen cookie expires.
    const isEntryNavigation = pathname === "/" || pathname === "/overview";
    if (onboardingCompleted && isPrivateRoute && isEntryNavigation && !hasSeenToday) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/today";
      redirectUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(redirectUrl);
    }
  }

  if (!user && !isDevAuthed && !isPublicRoute && !isApiRoute) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/auth/login";
    return NextResponse.redirect(redirectUrl);
  }

  if ((user || isDevAuthed) && (pathname === "/" || (isAuthRoute && !isAuthCallbackRoute))) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = isDevAuthed && !isDevOnboarded ? "/onboarding" : "/today";
    return NextResponse.redirect(redirectUrl);
  }

  if ((user || isDevAuthed) && pathname === "/today") {
    // B3 FIX: Add secure flag so the cookie is not transmitted over plain HTTP
    // on staging/preview deployments. Without it the cookie is readable by
    // adjacent scripts (XSS) and surveyable on any non-TLS connection.
    // httpOnly: true prevents JS access (this cookie has no client-side purpose).
    response.cookies.set("bm_today_seen", todayKey, {
      path: "/",
      sameSite: "lax",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24,
    });
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.json|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|webp|ico|mp4|webm|mov|m4v)$).*)",
  ],
};
