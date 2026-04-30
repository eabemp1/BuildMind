import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/onboarding";
  return value;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = safeNextPath(requestUrl.searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      const redirectUrl = new URL(requestUrl.origin);
      redirectUrl.pathname = "/auth/login";
      redirectUrl.searchParams.set("error", "auth_callback_failed");
      return NextResponse.redirect(redirectUrl);
    }
  }

  const redirectUrl = new URL(requestUrl.origin);
  redirectUrl.pathname = next;
  return NextResponse.redirect(redirectUrl);
}
