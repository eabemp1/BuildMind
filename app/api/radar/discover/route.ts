/**
 * POST /api/radar/discover { projectId?, where? } — search the web for opportunities that fit this founder.
 * Bounded: 4 searches, 6 pages read, every call has a deadline, one failure never sinks the rest.
 * Anything without a real future date backed by the page text is dropped and counted.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { gateAIUsage } from "@/app/api/ai/_usageGate";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimitAsync } from "@/lib/server/rateLimit";
import { webSearch } from "@/lib/search";
import { loadProject } from "@/lib/prep/engine";
import { withTimeout, settleAll } from "@/lib/resilience";
import { buildQueries, pickCandidates, type Hit } from "@/lib/radar/discover";
import { extractDraft } from "@/lib/radar/extract";
import { typeOfKind } from "@/lib/radar/types";
import { fitFor } from "@/lib/radar/fit";
import type { RadarItem } from "@/lib/radar/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({ projectId: z.string().uuid().nullable().optional(), where: z.string().max(80).optional() });

export async function POST(request: Request) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  if (!hasAdminEnv()) return NextResponse.json({ ok: false, error: "Not available." }, { status: 503 });
  const rl = await rateLimitAsync(`radar-discover:${user.userId}`, 4, 24 * 60 * 60 * 1000, { failClosed: true });
  if (!rl.ok) return NextResponse.json({ ok: false, error: "You have searched enough for today. Try again tomorrow." }, { status: 429 });
  const blocked = await gateAIUsage(user.userId, "general");
  if (blocked) return blocked;

  const admin = createAdminClient();
  const project = await loadProject(admin, user.userId, parsed.data.projectId);
  if (!project.name && !project.description) return NextResponse.json({ ok: false, error: "Add a project first so BuildMind knows what to look for." }, { status: 400 });
  const queries = buildQueries(project, parsed.data.where ?? "");

  const { data: existing, error: exErr } = await admin.from("radar_items").select("url").eq("user_id", user.userId).limit(500);
  if (exErr) return NextResponse.json({ ok: false, error: "Radar is not set up yet. Run the latest database migrations.", reason: "setup" }, { status: 503 });
  const seen = new Set<string>(((existing ?? []) as Array<{ url: string | null }>).map((r) => (r.url ?? "").replace(/[#?].*$/, "").replace(/\/$/, "").toLowerCase()).filter(Boolean));

  const searched = await settleAll(queries, async (q) => {
    const res = await withTimeout(webSearch(q.q, 6), 9000, "search");
    const hits: Hit[] = (res.scraped ? res.results : []).map((r) => ({ title: r.title, url: r.url, snippet: r.snippet }));
    return { wanted: q.kind, hits, query: q.q };
  }, 4);
  const { picked, dropped } = pickCandidates(searched.ok, seen, 6);

  const read = await settleAll(picked, async (c) => {
    const d = await withTimeout(extractDraft({ url: c.url }), 14000, "read");
    if (!d) throw new Error("unreadable");
    return { c, d };
  }, 3);

  const stats = { searched: queries.length, searchFailed: searched.failed, found: picked.length, unreadable: read.failed, ...dropped, undated: 0, passed: 0, wrongKind: dropped.wrongKind, lowFit: 0, added: 0 };
  const added: Array<Record<string, unknown>> = [];
  const now = Date.now();
  for (const { c, d } of read.ok) {
    if (d.kind !== c.wanted && !d.alternatives.includes(c.wanted)) { stats.wrongKind++; continue; }
    const kind = d.kind === c.wanted || d.kind_confirmed ? d.kind : c.wanted;
    const type = typeOfKind(kind);
    const actionAt = type === "program" ? d.deadline_at ?? d.starts_at : d.starts_at ?? d.deadline_at;
    if (!actionAt) { stats.undated++; continue; }
    if (Date.parse(actionAt) < now) { stats.passed++; continue; }
    const probe = { type, kind, kind_confirmed: d.kind_confirmed, title: d.title, organizer: d.organizer, location: d.location, is_virtual: d.is_virtual, meeting_url: d.meeting_url, starts_at: d.starts_at, deadline_at: d.deadline_at, eligibility: d.eligibility, cost: d.cost, notes: null, role: null, status: "new", source_text: d.source_text } as unknown as RadarItem;
    const fit = fitFor(probe, { stage: project.stage, projectText: [project.name, project.description, project.problem, project.targetUsers].join(" "), homeWhere: parsed.data.where, now });
    if (fit.score < 45) { stats.lowFit++; continue; }
    const { error } = await admin.from("radar_items").insert({
      user_id: user.userId, project_id: parsed.data.projectId ?? null, type, kind, kind_confirmed: d.kind_confirmed, title: d.title, organizer: d.organizer, url: d.url, location: d.location,
      is_virtual: d.is_virtual, meeting_url: d.meeting_url, starts_at: d.starts_at, ends_at: d.ends_at && d.starts_at && Date.parse(d.ends_at) >= Date.parse(d.starts_at) ? d.ends_at : null,
      deadline_at: d.deadline_at, eligibility: d.eligibility, cost: d.cost, source_text: d.source_text, status: "new", source: "discovered", discovered_query: queries.find((q) => q.kind === c.wanted)?.q ?? null,
    });
    if (error) { stats.passed += 0; continue; }
    stats.added++; added.push({ title: d.title, kind, score: fit.score });
  }
  return NextResponse.json({ ok: true, added, stats, queries: queries.map((q) => q.q) });
}
