/**
 * POST /api/break/share/event — public, called from a shared report page.
 *   { token, kind: "open" }                              first view by this visitor (counted once)
 *   { token, kind: "answer", answer: yes|partly|no, note? }   their answer to "Is this accurate?" (can be changed)
 * A visitor is a random id in a cookie. The link's owner is never counted.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
const ANSWERS = ["yes", "partly", "no"] as const;
const COOKIE = "bm_bsv";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const token = String(body?.token ?? "").replace(/[^a-f0-9]/gi, "").slice(0, 32);
  const kind = body?.kind;
  if (!token || (kind !== "open" && kind !== "answer")) return NextResponse.json({ ok: false }, { status: 400 });

  const admin = createAdminClient();
  const { data: share } = await admin.from("break_shares").select("user_id, revoked_at").eq("token", token).maybeSingle();
  if (!share || share.revoked_at) return NextResponse.json({ ok: false }, { status: 404 });

  // Opening your own link to check it is not a response.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user?.id === share.user_id) return NextResponse.json({ ok: true, own: true });

  const cookie = request.headers.get("cookie")?.match(new RegExp(`(?:^|; )${COOKIE}=([a-f0-9]{20,40})`))?.[1];
  const visitor = cookie ?? crypto.randomUUID().replace(/-/g, "").slice(0, 24);

  let error;
  if (kind === "open") {
    ({ error } = await admin.from("break_share_events").upsert({ token, visitor }, { onConflict: "token,visitor", ignoreDuplicates: true }));
  } else {
    const answer = ANSWERS.find((a) => a === body?.answer);
    if (!answer) return NextResponse.json({ ok: false }, { status: 400 });
    const note = typeof body?.note === "string" ? body.note.replace(/\s+/g, " ").trim().slice(0, 280) : "";
    ({ error } = await admin.from("break_share_events").upsert(
      { token, visitor, answer, note: note || null, answered_at: new Date().toISOString() },
      { onConflict: "token,visitor" },
    ));
  }
  const res = NextResponse.json({ ok: !error });
  if (!cookie) res.cookies.set(COOKIE, visitor, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 365 });
  return res;
}
