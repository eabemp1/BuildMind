/**
 * POST /api/ai/prep/reply — the conversation after the first message.
 *   mode "reply":    the founder pastes what the other person wrote. BuildMind
 *                    reads it, drafts a reply, and records that they replied.
 *   mode "followup": nobody answered. BuildMind drafts a short follow-up that
 *                    adds something new instead of "just bumping this".
 * Nothing is sent.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { gateAIUsage } from "@/app/api/ai/_usageGate";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { callModelJSON } from "@/lib/ai-providers";
import { createAdminClient } from "@/lib/supabase/admin";
import { guardReply, type ReplyAssist } from "@/lib/prep/reply";
import type { Platform } from "@/lib/distribution/textSignals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const Body = z.object({ id: z.string().uuid(), mode: z.enum(["reply", "followup"]), theirReply: z.string().max(4000).optional() });

export async function POST(request: Request) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const p = Body.safeParse(await request.json().catch(() => ({})));
  if (!p.success) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  const { id, mode, theirReply } = p.data;
  if (mode === "reply" && (theirReply ?? "").trim().length < 5) return NextResponse.json({ ok: false, error: "Paste what they wrote first." }, { status: 400 });
  if (!hasAdminEnv()) return NextResponse.json({ ok: false, error: "Not available." }, { status: 503 });

  const admin = createAdminClient();
  const { data: row } = await admin.from("prepared_work").select("kind,platform,final_text,payload,chosen_variant,status,outcome").eq("id", id).eq("user_id", user.userId).maybeSingle();
  if (!row || row.kind !== "outreach") return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  if (row.status !== "sent") return NextResponse.json({ ok: false, error: "Mark the message sent first." }, { status: 409 });

  const blocked = await gateAIUsage(user.userId, "general");
  if (blocked) return blocked;

  const payload = row.payload as { variants?: Array<{ id: string; text: string }> };
  const mine = (row.final_text as string | null) || payload.variants?.find((v) => v.id === row.chosen_variant)?.text || payload.variants?.[0]?.text || "";
  const platform = (["linkedin", "x", "reddit", "hn", "other"].includes(row.platform as string) ? row.platform : "other") as Platform;
  const shape = `Return JSON: {"read":"interested|question|objection|decline|unclear","summary":"one sentence on what they actually said or want","quote":"the exact words from THEIR message that matter most, or empty","reply":"the draft, 60 words or fewer","nextStep":"one sentence: what the founder should do next"}`;
  const prompt = mode === "reply"
    ? `You help a solo founder answer someone who replied to their outreach. Use only what is written below. Answer their actual question or objection first. Ask for at most one small next step. No flattery, no pitch paragraph, no emojis, no invented facts or numbers. If they declined, thank them, keep the door open in one line, and ask nothing.\n\nFOUNDER'S MESSAGE:\n"""${mine.slice(0, 1500)}"""\n\nTHEIR REPLY:\n"""${(theirReply ?? "").slice(0, 3000)}"""\n\n${shape}`
    : `You help a solo founder follow up on a message nobody answered. Write ONE short follow-up (45 words or fewer) that adds something new for the reader, such as a sharper question or one concrete observation from the founder's message. Never write "just bumping", "circling back" or "following up". No emojis, no invented facts. Set "quote" to an empty string and "read" to "unclear".\n\nORIGINAL MESSAGE:\n"""${mine.slice(0, 1500)}"""\n\n${shape}`;

  let out: ReplyAssist;
  try { out = guardReply(await callModelJSON<unknown>([{ role: "user", content: prompt }], { maxTokens: 700 }), theirReply ?? "", platform); }
  catch { return NextResponse.json({ ok: false, error: "Could not draft that just now. Try again." }, { status: 502 }); }
  if (!out.reply && !out.summary) return NextResponse.json({ ok: false, error: "Could not draft a usable reply. Try again." }, { status: 502 });

  const recordReplied = mode === "reply" && (!row.outcome || row.outcome === "no_reply");
  if (recordReplied) {
    await admin.from("prepared_work").update({ outcome: "replied", outcome_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.userId);
  }
  return NextResponse.json({ ok: true, assist: out, outcome: recordReplied ? "replied" : (row.outcome as string | null) ?? null });
}
