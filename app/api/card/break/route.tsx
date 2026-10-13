/**
 * GET /api/card/break?token=…&download=1 — PNG share card for a shared Break
 * result. Public by token (the token is the capability); revoked tokens 404.
 */
import { ImageResponse } from "next/og";
import { createAdminClient } from "@/lib/supabase/admin";
import { readSharePayload } from "@/lib/breakShare";
import { BreakCard, BREAK_CARD } from "@/lib/breakShareCard";
import { loadCardFonts } from "@/lib/shareCard";
import { getLogoDataUri } from "@/lib/cardLogo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = (url.searchParams.get("token") ?? "").replace(/[^a-f0-9]/gi, "").slice(0, 32);
  if (!token) return new Response("Not found", { status: 404 });
  const { data } = await createAdminClient().from("break_shares").select("payload,revoked_at").eq("token", token).maybeSingle();
  const payload = data && !data.revoked_at ? readSharePayload(data.payload) : null;
  if (!payload) return new Response("Not found", { status: 404 });
  const [fonts, logo] = await Promise.all([loadCardFonts(), getLogoDataUri()]);
  const res = new ImageResponse(<BreakCard p={payload} logo={logo || undefined} />, { width: BREAK_CARD.w, height: BREAK_CARD.h, fonts: fonts.length ? fonts : undefined });
  res.headers.set("Cache-Control", "public, max-age=300");
  if (url.searchParams.get("download") === "1") res.headers.set("Content-Disposition", 'attachment; filename="break-my-startup.png"');
  return res;
}
