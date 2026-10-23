/**
 * GET /r/<code> - a tracked link. Counts one unique, non-bot, non-owner visitor, then redirects.
 * It never blocks the redirect: if counting fails the visitor still lands on the page.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getClientIp, rateLimitAsync } from "@/lib/server/rateLimit";
import { isValidCode, recordVisit, validateTarget, type SignalLink } from "@/lib/signalLinks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!isValidCode(code)) return new NextResponse("Not found", { status: 404 });

  const admin = createAdminClient();
  const { data: link } = await admin
    .from("signal_links")
    .select("id, user_id, code, kind, target_url, headline, pitch, label")
    .eq("code", code)
    .maybeSingle();
  if (!link) return new NextResponse("Not found", { status: 404 });

  if (link.kind === "interest") return NextResponse.redirect(new URL(`/i/${code}`, req.url), 302);

  // The target was validated when the link was made; check again so a bad row can never redirect somewhere unsafe.
  const target = validateTarget(link.target_url);
  if (!target.ok) return new NextResponse("This link is no longer available.", { status: 410 });

  try {
    const ip = getClientIp(req);
    const limit = await rateLimitAsync(`signal-visit:${ip}:${code}`, 30, 60 * 60 * 1000);
    if (limit.ok) {
      let viewerId: string | null = null;
      try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        viewerId = user?.id ?? null;
      } catch { /* anonymous */ }
      await recordVisit(admin, link as SignalLink, { ip, ua: req.headers.get("user-agent") ?? "", viewerUserId: viewerId });
    }
  } catch { /* counting is best effort */ }

  const res = NextResponse.redirect(target.url, 302);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
