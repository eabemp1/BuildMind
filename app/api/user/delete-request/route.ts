/**
 * POST /api/user/delete-request - the founder asks for their account and data to be deleted.
 * Body: { confirm: "DELETE" }. This records the request and tells the owner; deletion is carried out
 * by a person within 7 business days (as the privacy policy says), not automatically.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { rateLimitAsync } from "@/lib/server/rateLimit";
import { notifyOwner } from "@/lib/ownerNotify";
import { logWarn } from "@/lib/server/logger";

export const runtime = "nodejs";

const Body = z.object({ confirm: z.literal("DELETE") });

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  if (!Body.safeParse(await req.json().catch(() => null)).success) {
    return NextResponse.json({ ok: false, error: "Type DELETE to confirm." }, { status: 400 });
  }
  const limit = await rateLimitAsync(`delete-request:${user.id}`, 3, 24 * 60 * 60 * 1000);
  if (!limit.ok) return NextResponse.json({ ok: true, alreadyRequested: true, message: "Your request is already with us." });

  logWarn("user/delete-request", "Account deletion requested", { userId: user.id, route: "/api/user/delete-request" });
  const sent = await notifyOwner({
    title: "Account deletion request",
    body: `User ${user.id} (${user.email ?? "no email"}) asked to delete their account and data.`,
    priority: "high",
  });
  return NextResponse.json({
    ok: true,
    message: sent.length
      ? "Request received. Your account and data will be deleted within 7 business days."
      : "Request recorded. If you do not hear back within 7 business days, email hello@buildmind.live.",
  });
}
