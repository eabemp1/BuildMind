import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { FEATURES } from "@/lib/features";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const devAuthEnabled = process.env.NODE_ENV !== "production" && process.env.DEV_AUTH_ENABLED === "1";
  const isDevAuthed = devAuthEnabled && request.cookies.get("bm_dev_auth")?.value === "1";
  const isDevOnboarded = isDevAuthed && request.cookies.get("bm_dev_onboarded")?.value === "1";
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
  );

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    for (const cookie of request.cookies.getAll()) {
      if (cookie.name.startsWith("sb-")) {
        response.cookies.delete(cookie.name);
      }
    }
  }

  const pathname = request.nextUrl.pathname;
  const todayKey = new Date().toISOString().slice(0, 10);

  if (pathname === "/" && request.nextUrl.searchParams.has("code") && !user && !isDevAuthed) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/auth/callback";
    if (!redirectUrl.searchParams.has("next")) {
      redirectUrl.searchParams.set("next", "/onboarding");
    }
    return NextResponse.redirect(redirectUrl);
  }

  const isAuthRoute = pathname.startsWith("/auth");
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

  // Private admin-only route — /my-ventures
  if (pathname === "/my-ventures" || pathname.startsWith("/my-ventures/")) {
    let isAdmin = false;

    if (user) {
      try {
        const res = await fetch(new URL("/api/system/admin-check", request.url), {
          headers: { cookie: request.headers.get("cookie") ?? "" },
        });
        if (res.ok) {
          const json = await res.json();
          isAdmin = json.isAdmin === true;
        }
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
    const metadataCompleted = user?.user_metadata?.onboarding_completed === true;
    const { count: projectCount } = user
      ? await supabase
          .from("projects")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
      : { count: isDevOnboarded ? 1 : 0 };
    const onboardingCompleted = metadataCompleted || (projectCount ?? 0) > 0;

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
    if (onboardingCompleted && isPrivateRoute && pathname !== "/today" && !hasSeenToday) {
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

  if ((user || isDevAuthed) && (pathname === "/" || isAuthRoute)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = isDevAuthed && !isDevOnboarded ? "/onboarding" : "/today";
    return NextResponse.redirect(redirectUrl);
  }

  if ((user || isDevAuthed) && pathname === "/today") {
    response.cookies.set("bm_today_seen", todayKey, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24,
    });
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.json|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)",
  ],
};
