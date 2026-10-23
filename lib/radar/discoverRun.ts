/**
 * lib/radar/discoverRun.ts - one bounded opportunity search for one founder.
 * Used by the manual button (/api/radar/discover) and by the twice-weekly automatic run
 * (/api/cron/radar-discover). Bounded: 4 searches, 6 pages read, every call has a deadline, one failure
 * never sinks the rest. Anything without a real future date backed by the page text is dropped and counted.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { webSearch } from "@/lib/search";
import { loadProject } from "@/lib/prep/engine";
import { withTimeout, settleAll } from "@/lib/resilience";
import { buildQueries, pickCandidates, type Hit } from "@/lib/radar/discover";
import { extractDraft } from "@/lib/radar/extract";
import { typeOfKind } from "@/lib/radar/types";
import { fitFor } from "@/lib/radar/fit";
import type { RadarItem } from "@/lib/radar/types";

export type DiscoverResult =
  | { ok: true; added: Array<{ title: string; kind: string; score: number }>; stats: Record<string, number>; queries: string[] }
  | { ok: false; status: number; error: string; reason?: "setup" | "no_project" };

export async function runDiscovery(admin: SupabaseClient, input: { userId: string; projectId?: string | null; where?: string }): Promise<DiscoverResult> {
  const { userId } = input;
  const where = input.where ?? "";
  const project = await loadProject(admin, userId, input.projectId);
  if (!project.name && !project.description) return { ok: false, status: 400, error: "Add a project first so BuildMind knows what to look for.", reason: "no_project" };
  const queries = buildQueries(project, where);

  const { data: existing, error: exErr } = await admin.from("radar_items").select("url").eq("user_id", userId).limit(500);
  if (exErr) return { ok: false, status: 503, error: "Radar is not set up yet. Run the latest database migrations.", reason: "setup" };
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
  const added: Array<{ title: string; kind: string; score: number }> = [];
  const now = Date.now();
  for (const { c, d } of read.ok) {
    if (d.kind !== c.wanted && !d.alternatives.includes(c.wanted)) { stats.wrongKind++; continue; }
    const kind = d.kind === c.wanted || d.kind_confirmed ? d.kind : c.wanted;
    const type = typeOfKind(kind);
    const actionAt = type === "program" ? d.deadline_at ?? d.starts_at : d.starts_at ?? d.deadline_at;
    if (!actionAt) { stats.undated++; continue; }
    if (Date.parse(actionAt) < now) { stats.passed++; continue; }
    const probe = { type, kind, kind_confirmed: d.kind_confirmed, title: d.title, organizer: d.organizer, location: d.location, is_virtual: d.is_virtual, meeting_url: d.meeting_url, starts_at: d.starts_at, deadline_at: d.deadline_at, eligibility: d.eligibility, cost: d.cost, notes: null, role: null, status: "new", source_text: d.source_text } as unknown as RadarItem;
    const fit = fitFor(probe, { stage: project.stage, projectText: [project.name, project.description, project.problem, project.targetUsers].join(" "), homeWhere: where, now });
    if (fit.score < 45) { stats.lowFit++; continue; }
    const { error } = await admin.from("radar_items").insert({
      user_id: userId, project_id: input.projectId ?? null, type, kind, kind_confirmed: d.kind_confirmed, title: d.title, organizer: d.organizer, url: d.url, location: d.location,
      is_virtual: d.is_virtual, meeting_url: d.meeting_url, starts_at: d.starts_at, ends_at: d.ends_at && d.starts_at && Date.parse(d.ends_at) >= Date.parse(d.starts_at) ? d.ends_at : null,
      deadline_at: d.deadline_at, eligibility: d.eligibility, cost: d.cost, source_text: d.source_text, status: "new", source: "discovered", discovered_query: queries.find((q) => q.kind === c.wanted)?.q ?? null,
    });
    if (error) continue;
    stats.added++; added.push({ title: d.title, kind, score: fit.score });
  }
  return { ok: true, added, stats, queries: queries.map((q) => q.q) };
}
