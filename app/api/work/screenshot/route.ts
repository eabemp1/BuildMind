/**
 * POST /api/work/screenshot — review a screenshot of a landing page or an app screen (Builder).
 * Body: { images: ["data:image/…;base64,…"] (1 to 4; `image` still works for one), kind: "landing" | "app", note?: string }. Nothing is saved.
 * Gemini only: the other providers cannot read images, so when Gemini is busy the answer is an honest "try again".
 */
import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { gateAIUsage } from "@/app/api/ai/_usageGate";
import { geminiVisionJSON } from "@/lib/ai-providers";
import { normalizeReview, parseImages, reviewPrompt, type ReviewKind } from "@/lib/work/screenshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (user.plan !== "builder") return NextResponse.json({ ok: false, error: "Screenshot review is part of the Builder plan.", upgradeUrl: "/upgrade" }, { status: 402 });
  const b = (await request.json().catch(() => ({}))) as { image?: unknown; images?: unknown; kind?: unknown; note?: unknown };
  const images = parseImages(Array.isArray(b.images) ? b.images : [b.image]);
  if (!images) return NextResponse.json({ ok: false, error: "Upload 1 to 4 PNG, JPEG or WebP screenshots." }, { status: 400 });
  const kind: ReviewKind = b.kind === "app" ? "app" : "landing";
  const note = typeof b.note === "string" ? b.note.replace(/\s+/g, " ").trim().slice(0, 300) : "";
  const blocked = await gateAIUsage(user.userId, "general");
  if (blocked) return blocked;
  try {
    const raw = await geminiVisionJSON<unknown>(reviewPrompt(kind, note, images.length), images, { maxTokens: 1200 });
    const review = normalizeReview(raw);
    if (!review) return NextResponse.json({ ok: false, error: "BuildMind could not read that screenshot clearly. Try a sharper one." }, { status: 422 });
    return NextResponse.json({ ok: true, review });
  } catch {
    return NextResponse.json({ ok: false, error: "The image reader is busy or not set up right now. Nothing was used. Please try again later." }, { status: 502 });
  }
}
