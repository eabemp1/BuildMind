/**
 * /api/offers — the founder's offer pages.
 *   GET  list them.
 *   POST { personId, index, projectId? } draft one from a quote the founder approved. Nothing is published.
 */
import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { gateAIUsage } from "@/app/api/ai/_usageGate";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { callModelJSON } from "@/lib/ai-providers";
import { loadProject } from "@/lib/prep/engine";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildDraftPrompt, normalizeDraft, quoteInNotes, slugFor } from "@/lib/offers/page";
import type { Insight } from "@/lib/conversations/track";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
const UUID = /^[0-9a-f-]{36}$/i;
const COLS = "id, project_id, person_id, slug, status, content, views, clicks, published_at, updated_at";

export async function GET() {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasAdminEnv()) return NextResponse.json({ ok: true, pages: [] });
  const { data, error } = await createAdminClient().from("offer_pages").select(COLS).eq("user_id", user.userId).order("updated_at", { ascending: false }).limit(20);
  // The table may not exist until the migration is applied.
  if (error) return NextResponse.json({ ok: true, pages: [], setup: true });
  return NextResponse.json({ ok: true, pages: data ?? [] });
}

export async function POST(request: Request) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const b = (await request.json().catch(() => ({}))) as { personId?: unknown; index?: unknown; projectId?: unknown };
  if (typeof b.personId !== "string" || !UUID.test(b.personId) || !Number.isInteger(b.index)) return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  if (!hasAdminEnv()) return NextResponse.json({ ok: false, error: "Unavailable right now." }, { status: 503 });
  const admin = createAdminClient();
  const { data } = await admin.from("conversation_people").select("notes, insights, project_id").eq("id", b.personId).eq("user_id", user.userId).maybeSingle();
  const person = data as { notes: string | null; insights: Insight[] | null; project_id: string | null } | null;
  const insight = Array.isArray(person?.insights) ? person!.insights![b.index as number] : undefined;
  if (!person || !insight) return NextResponse.json({ ok: false }, { status: 404 });
  if (!insight.approved) return NextResponse.json({ ok: false, error: "Approve the quote first." }, { status: 409 });
  if (!quoteInNotes(insight.quote, person.notes ?? "")) return NextResponse.json({ ok: false, error: "That quote is no longer in your notes." }, { status: 409 });
  const blocked = await gateAIUsage(user.userId, "core");
  if (blocked) return blocked;

  const projectId = typeof b.projectId === "string" && UUID.test(b.projectId) ? b.projectId : person.project_id;
  const project = await loadProject(admin, user.userId, projectId);
  if (!project.name && !project.description) return NextResponse.json({ ok: false, error: "Add what your product does to your project first." }, { status: 409 });
  let raw: unknown = null;
  try {
    raw = await callModelJSON<unknown>([{ role: "user", content: buildDraftPrompt({ name: project.name, what: project.description || project.problem, customer: project.targetUsers, quote: insight.quote, notes: "" }) }], { maxTokens: 900, role: "reasoning", feature: "offer_page" });
  } catch { /* handled below */ }
  const allowed = [project.name, project.description, project.problem, project.targetUsers, insight.quote].join(" ");
  const content = raw === null ? null : normalizeDraft(raw, insight.quote, allowed);
  if (!content) return NextResponse.json({ ok: false, error: "BuildMind could not draft this just now. Nothing was saved. Please try again." }, { status: 502 });

  const { data: row, error } = await admin.from("offer_pages").insert({ user_id: user.userId, project_id: projectId, person_id: b.personId, status: "draft", slug: slugFor(content.headline), content }).select(COLS).single();
  if (error) return NextResponse.json({ ok: false, error: "Could not save the draft. The offer pages table may not be set up yet." }, { status: 500 });
  return NextResponse.json({ ok: true, page: row });
}
