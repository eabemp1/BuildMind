import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { FEATURES } from "@/lib/features";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
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
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isAuthRoute = pathname.startsWith("/auth");
  const isConversionRoute =
    pathname === "/landing" ||
    pathname === "/try" ||
    pathname.startsWith("/try/") ||
    pathname === "/upgrade" ||
    pathname === "/welcome";
  const isExploreRoute = pathname === "/explore" || pathname.startsWith("/explore/");
  const isFounderRoute = pathname.startsWith("/founder/");
  const isPublicRoute =
    pathname === "/" ||
    isAuthRoute ||
    isExploreRoute ||
    isFounderRoute ||
    isConversionRoute;
  const isApiRoute = pathname.startsWith("/api");

  const featureBlocks = [
    { enabled: FEATURES.aiCoach, match: (path: string) => path.startsWith("/ai-coach") },
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
      redirectUrl.pathname = "/dashboard";
      return NextResponse.redirect(redirectUrl);
    }
  }

  if (!user && !isPublicRoute && !isApiRoute) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/auth/login";
    return NextResponse.redirect(redirectUrl);
  }

  if (user && (pathname === "/" || isAuthRoute)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
