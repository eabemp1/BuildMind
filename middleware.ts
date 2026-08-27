import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { FEATURES } from "@/lib/features";
import { isAdminUser } from "@/lib/server/adminAuth";

// Vercel Edge Middleware has a hard ~25s execution budget that Next.js
// cannot extend (unlike serverless functions' maxDuration). This
// middleware previously made two sequential, unbounded Supabase round
// trips on every authenticated request — auth.getUser() and a projects
// count query — with no timeout on either. A Supabase latency blip on
// either call therefore stalled middleware long enough to hit
// MIDDLEWARE_INVOCATION_TIMEOUT, which took the entire site down (this
// runs on every route, not just the one that happened to be requested).
// MIDDLEWARE_TIMEOUT_MS bounds each external call well under that budget
// so a slow backend degrades gracefully instead of 504ing every route.
const MIDDLEWARE_TIMEOUT_MS = 6000;

function withTimeout<T>(promise: Promise<T>, fallback: T, ms = MIDDLEWARE_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

const MIDDLEWARE_TIMED_OUT = Symbol("middleware-timed-out");
type TimedOut = typeof MIDDLEWARE_TIMED_OUT;

/** Races a promise against the timeout, resolving to a distinguishable
 *  sentinel on timeout instead of a caller-supplied fallback value — used
 *  where the fallback shape can't be faked (e.g. Supabase's discriminated
 *  auth response) or where "timed out" must stay distinguishable from a
 *  real result down the line. */
function withTimeoutSentinel<T>(promise: Promise<T>, ms = MIDDLEWARE_TIMEOUT_MS): Promise<T | TimedOut> {
  return Promise.race([
    promise,
    new Promise<TimedOut>((resolve) => setTimeout(() => resolve(MIDDLEWARE_TIMED_OUT), ms)),
  ]);
}

/** Resolves to { user, error, timedOut } — timedOut is true only when the
 *  network call itself didn't finish in time, kept distinct from a real
 *  auth error so a Supabase blip never triggers the stale-cookie wipe below. */
async function getUserWithTimeout(
  supabase: NonNullable<ReturnType<typeof createServerClient>>,
): Promise<{
  user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"];
  error: Awaited<ReturnType<typeof supabase.auth.getUser>>["error"];
  timedOut: boolean;
}> {
  const result = await withTimeoutSentinel(
    supabase.auth.getUser().then((r) => ({ user: r.data.user, error: r.error })),
  );
  if (result === MIDDLEWARE_TIMED_OUT) return { user: null, error: null, timedOut: true };
  return { ...result, timedOut: false };
}

/** Resolves to the project count, or null if the query times out. */
function getProjectCountWithTimeout(
  supabase: NonNullable<ReturnType<typeof createServerClient>>,
  userId: string,
): Promise<number | null> {
  const countPromise = Promise.resolve(
    supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .then((result) => result.count),
  );
  return withTimeout(countPromise, null);
}

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

  // ── Referral attribution ────────────────────────────────────────────────
  // Captures ?ref=<promoter_ref_code> into a 30-day cookie so
  // app/auth/callback/route.ts can credit the right promoter at signup time,
  // regardless of how many pages the person visits in between. Read-only
  // capture here — the actual conversion is recorded at signup, not here,
  // so a click alone is never counted as a conversion.
  const refCode = request.nextUrl.searchParams.get("ref");
  if (refCode && /^[A-Za-z0-9_-]{1,32}$/.test(refCode)) {
    response.cookies.set("bm_ref", refCode, {
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
      httpOnly: true,
      sameSite: "lax",
    });
  }

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

  if (
    pathname === "/auth/callback" ||
    pathname === "/auth/implicit-callback" ||
    pathname === "/api/auth/google"
  ) {
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
                request.cookies.set(name, value);
                response.cookies.set(name, value, options);
              });
            },
          },
        },
      )
    : null;

  const { user, error: authError } = supabase
    ? await getUserWithTimeout(supabase)
    : { user: null, error: null };

  if (authError) {
    for (const cookie of request.cookies.getAll()) {
      if (cookie.name.startsWith("sb-")) {
        response.cookies.delete(cookie.name);
      }
    }
  }

  const isAuthRoute = pathname.startsWith("/auth");
  const isAuthCallbackRoute =
    pathname === "/auth/callback" ||
    pathname === "/auth/implicit-callback" ||
    pathname === "/api/auth/google";
  const isConversionRoute =
    pathname === "/try" ||
    pathname.startsWith("/try/") ||
    pathname === "/break" ||
    pathname.startsWith("/break/") ||
    pathname === "/upgrade" ||
    pathname === "/ventures" ||
    pathname.startsWith("/ventures/") ||
    pathname === "/quiz" ||
    pathname.startsWith("/quiz/") ||
    pathname.startsWith("/promote/");
  const isExploreRoute = pathname === "/explore" || pathname.startsWith("/explore/");
  const isFounderRoute = pathname.startsWith("/founder/");
  const isStudentRoute = pathname === "/students";
  const isGeoDefinitionRoute =
    pathname === "/founder-execution-intelligence" ||
    pathname === "/founder-drift" ||
    pathname === "/execution-memory" ||
    pathname === "/startup-cognitive-load";
  const isPublicRoute =
    pathname === "/" ||
    pathname === "/landing" ||
    pathname === "/welcome" ||
    pathname === "/terms" ||
    pathname.startsWith("/terms/") ||
    pathname === "/privacy" ||
    pathname.startsWith("/privacy/") ||
    pathname === "/refund" ||
    pathname.startsWith("/refund/") ||
    pathname === "/legal" ||
    pathname.startsWith("/legal/") ||
    isAuthRoute ||
    isExploreRoute ||
    isFounderRoute ||
    isConversionRoute ||
    isStudentRoute ||
    isGeoDefinitionRoute;
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
    //
    // FALLBACK NOTE: on timeout we get `count: null` (distinct from a real
    // `count: 0`), which we treat as "assume onboarding completed" below —
    // bouncing an existing user back into onboarding because Supabase was
    // slow for one request is worse than briefly skipping this check.
    let onboardingCompleted: boolean;
    const projectCount = user
      ? await getProjectCountWithTimeout(supabase!, user.id)
      : isDevOnboarded ? 1 : 0;
    onboardingCompleted = projectCount === null ? true : (projectCount ?? 0) > 0;

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
