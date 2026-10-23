/** POST /api/proof/reddit { url } - the founder checks a Reddit post before saving: ownership code and reply count. */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { rateLimitAsync } from "@/lib/server/rateLimit";
import { verifyRedditProof } from "@/lib/redditProof";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const parsed = z.object({ url: z.string().max(500) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Paste the link to your Reddit post." }, { status: 400 });
  const limit = await rateLimitAsync(`reddit-proof:${user.id}`, 20, 60 * 60 * 1000, { failClosed: false });
  if (!limit.ok) return NextResponse.json({ ok: false, error: "Too many checks. Try again later." }, { status: 429 });
  const v = await verifyRedditProof(user.id, parsed.data.url.trim());
  if (v.status === "not_reddit") return NextResponse.json({ ok: false, error: "That is not a link to a Reddit post." }, { status: 400 });
  return NextResponse.json({ ok: true, ...v });
}
