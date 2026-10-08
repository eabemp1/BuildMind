/**
 * GET /api/card/week?format=post|story|square&theme=ink|paper&projectId=…&download=1
 *
 * The weekly share card as a real PNG. Same data as the in-app "This Week"
 * tab (lib/weeklyPulseData.ts), so the image can never disagree with it.
 * Auth required: it renders the signed-in founder's own week.
 */
import { ImageResponse } from "next/og";
import { createClient } from "@/lib/supabase/server";
import { getWeeklyPulseData } from "@/lib/weeklyPulseData";
import { WeekCard, loadCardFonts, shareCaption, CARD_SIZES, type CardFormat, type CardTheme } from "@/lib/shareCard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const fmtParam = url.searchParams.get("format");
  const format: CardFormat = fmtParam === "story" || fmtParam === "square" ? fmtParam : "post";
  const theme: CardTheme = url.searchParams.get("theme") === "paper" ? "paper" : "ink";
  const projectId = url.searchParams.get("projectId") ?? undefined;
  const download = url.searchParams.get("download") === "1";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  // Free plan keeps the deterministic one-line story (no model call per render).
  const [data, fonts] = await Promise.all([
    getWeeklyPulseData(user.id, projectId, { aiStory: false }),
    loadCardFonts(),
  ]);
  if (url.searchParams.get("caption") === "1") {
    return new Response(shareCaption(data), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" } });
  }
  const { w, h } = CARD_SIZES[format];

  const res = new ImageResponse(<WeekCard data={data} format={format} theme={theme} />, {
    width: w,
    height: h,
    fonts: fonts.length ? fonts : undefined,
  });
  res.headers.set("Cache-Control", "private, no-store");
  if (download) res.headers.set("Content-Disposition", `attachment; filename="buildmind-week-${format}-${theme}.png"`);
  return res;
}
