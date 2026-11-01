/**
 * POST /api/conversations/message — draft one message for one person, either a first message or a follow-up.
 * Body: { id, kind: "first" | "followup", projectId? }. Saves the draft on the person; sends nothing.
 */
import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { gateAIUsage } from "@/app/api/ai/_usageGate";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { callModelJSON } from "@/lib/ai-providers";
import { unsupportedNumbers } from "@/lib/distribution/engine";
import { loadProject } from "@/lib/prep/engine";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeLine } from "@/lib/conversations/track";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
const UUID = /^[0-9a-f-]{36}$/i;

export async function POST(request: Request) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const b = (await request.json().catch(() => ({}))) as { id?: unknown; kind?: unknown; projectId?: unknown };
  if (typeof b.id !== "string" || !UUID.test(b.id) || (b.kind !== "first" && b.kind !== "followup")) return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  if (!hasAdminEnv()) return NextResponse.json({ ok: false, error: "Drafting is unavailable right now." }, { status: 503 });
  const blocked = await gateAIUsage(user.userId, "core");
  if (blocked) return blocked;

  const admin = createAdminClient();
  const { data: person } = await admin.from("conversation_people").select("name, where_found, message").eq("id", b.id).eq("user_id", user.userId).maybeSingle();
  if (!person) return NextResponse.json({ ok: false }, { status: 404 });
  const p = person as { name: string; where_found: string | null; message: string | null };
  const projectId = typeof b.projectId === "string" && UUID.test(b.projectId) ? b.projectId : null;
  const project = await loadProject(admin, user.userId, projectId);

  const followup = b.kind === "followup";
  const prompt = `You write one short message for a solo founder to send themselves. Nothing is sent by anyone but the founder.
RULES
- Use only facts below. Never invent shared history, compliments, numbers, results or names. If something needed is missing, write [add: what is needed].
- The goal is a short conversation to learn about THEIR problem. Do not pitch or sell. Ask for 15 minutes, and make it easy to say no.
- Plain, warm, specific. Under 70 words. No emojis, no buzzwords, no flattery.
- ${followup ? "This is a follow-up. They did not reply to the first message. Be brief, kind and give a graceful way out. Do not guilt them." : "This is the first message."}
FOUNDER'S PROJECT: ${project.name || "(not given)"}. ${project.description || ""} Problem: ${project.problem || "(not given)"}. For: ${project.targetUsers || "(not given)"}.
PERSON: ${p.name}. Where the founder found them: ${p.where_found || "(not given)"}.
${followup && p.message ? `FIRST MESSAGE SENT:\n${p.message}` : ""}
Return JSON only: {"text":"the message"}`;
  let text = "";
  try {
    const raw = (await callModelJSON<unknown>([{ role: "user", content: prompt }], { maxTokens: 400 })) as { text?: unknown };
    text = sanitizeLine(raw?.text, 1200).replace(/\*\*/g, "");
  } catch { /* handled below */ }
  if (!text) return NextResponse.json({ ok: false, error: "BuildMind could not write this just now. Please try again." }, { status: 502 });
  const allowed = [project.name, project.description, project.problem, project.targetUsers, p.name, p.where_found ?? "", p.message ?? ""].join(" ");
  const figures = unsupportedNumbers(text, allowed);
  await admin.from("conversation_people").update({ message: text, updated_at: new Date().toISOString() }).eq("id", b.id).eq("user_id", user.userId);
  return NextResponse.json({ ok: true, text, check: figures.length ? `Check these figures before you send: ${figures.join(", ")}` : null });
}
