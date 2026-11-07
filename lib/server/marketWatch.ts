/**
 * Market Watch scan. Reads the competitors from the founder's latest Break My Startup run, reads each
 * home page once, looks for new community threads about them, saves one snapshot for the week and
 * returns what changed since the last one. Builder-only (callers check the plan). Never throws.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { readPages } from "@/lib/pageReader";
import { MAX_COMPETITORS, mergeSources, type WatchSource } from "@/lib/marketWatch/sources";
import { discussionSearch } from "@/lib/search";
import { diffSnapshots, sortChanges, weekStartOf, type MarketChange, type MarketSnapshot, type WatchedCompetitor, type WatchedThread } from "@/lib/marketWatch/diff";

const MAX_THREAD_QUERIES = 3;

export type WatchedSource = WatchSource;

/**
 * The competitors the stress test itself named, as company homepages. Search results are not used: they include
 * articles and reviews, which are not competitors. When the run named nobody, the founder adds their own.
 */
export function competitorsFromRun(payload: unknown): WatchedSource[] {
  const p = payload as { agent_outputs?: { competitor?: { brief?: Array<{ name?: unknown; url?: unknown }> } } } | null;
  const rows = (p?.agent_outputs?.competitor?.brief ?? []).map((c) => ({
    name: typeof c.name === "string" ? c.name : "",
    url: typeof c.url === "string" ? c.url : "",
  })).filter((c) => c.name && c.url);
  return mergeSources([], rows);
}

/** Competitors the founder added by hand for this project. */
export async function loadManualCompetitors(admin: SupabaseClient, userId: string, projectId: string | null): Promise<WatchedSource[]> {
  let q = admin.from("market_watch_competitors").select("name, url").eq("user_id", userId).order("created_at", { ascending: true }).limit(MAX_COMPETITORS);
  q = projectId ? q.eq("project_id", projectId) : q.is("project_id", null);
  const { data, error } = await q;
  if (error) return [];
  return ((data ?? []) as Array<{ name: string; url: string }>).map((r) => ({ name: r.name, url: r.url }));
}

export type ScanOutcome =
  | { ok: true; baseline: boolean; changes: MarketChange[]; watched: number; weekStart: string }
  | { ok: false; reason: "no_competitors" | "failed"; message: string };

export async function runMarketWatch(admin: SupabaseClient, input: { userId: string; projectId: string | null; now?: Date }): Promise<ScanOutcome> {
  const now = input.now ?? new Date();
  try {
    let q = admin.from("break_runs").select("payload").eq("user_id", input.userId).order("created_at", { ascending: false }).limit(1);
    if (input.projectId) q = q.eq("project_id", input.projectId);
    const { data: run } = await q.maybeSingle();
    const manual = await loadManualCompetitors(admin, input.userId, input.projectId);
    const sources = mergeSources(manual, competitorsFromRun((run as { payload?: unknown } | null)?.payload));
    if (!sources.length) return { ok: false, reason: "no_competitors", message: run ? "No competitor websites to watch yet. Add the ones you compete with under Competitors to watch." : "No competitors to watch yet. Add the ones you compete with, or run Break My Startup while signed in." };

    const digests = await readPages(sources.map((s) => s.url));
    const competitors: WatchedCompetitor[] = sources.map((s, i) => {
      const d = digests[i];
      return { name: s.name, url: s.url, ok: Boolean(d?.ok), title: d?.ok ? (d.title ?? "").slice(0, 160) : "", price: d?.ok && d.prices?.length ? d.prices[0] : null };
    });

    const threads: WatchedThread[] = [];
    const seenUrl = new Set<string>();
    for (const s of sources.slice(0, MAX_THREAD_QUERIES)) {
      try {
        const r = await discussionSearch(`${s.name} review OR alternative OR pricing`, 5);
        if (!r.scraped) continue; // model-written stand-ins are not real threads
        for (const t of r.results.slice(0, 5)) {
          if (!t.url || seenUrl.has(t.url)) continue;
          seenUrl.add(t.url);
          threads.push({ url: t.url, title: t.title, about: s.name });
        }
      } catch { /* one failed search does not stop the scan */ }
    }

    const weekStart = weekStartOf(now);
    const cur: MarketSnapshot = { weekStart, competitors, threads };
    let pq = admin.from("market_watch_snapshots").select("payload,week_start").eq("user_id", input.userId).lt("week_start", weekStart).order("week_start", { ascending: false }).limit(1);
    pq = input.projectId ? pq.eq("project_id", input.projectId) : pq.is("project_id", null);
    const { data: prevRow } = await pq.maybeSingle();
    const prev = (prevRow as { payload?: MarketSnapshot } | null)?.payload ?? null;
    const { baseline, changes } = diffSnapshots(prev, cur);

    // One row per week: delete any earlier scan this week, then insert.
    let dq = admin.from("market_watch_snapshots").delete().eq("user_id", input.userId).eq("week_start", weekStart);
    dq = input.projectId ? dq.eq("project_id", input.projectId) : dq.is("project_id", null);
    await dq;
    const { error } = await admin.from("market_watch_snapshots").insert({ user_id: input.userId, project_id: input.projectId, week_start: weekStart, payload: { ...cur, changes: sortChanges(changes), baseline } });
    if (error) return { ok: false, reason: "failed", message: "Could not save this week's scan. Has the Market Watch migration been run?" };
    return { ok: true, baseline, changes: sortChanges(changes), watched: competitors.length, weekStart };
  } catch {
    return { ok: false, reason: "failed", message: "The scan did not finish. Try again later." };
  }
}

export interface StoredWatch { weekStart: string; baseline: boolean; changes: MarketChange[]; competitors: WatchedCompetitor[] }

/** The latest saved scan, with no network calls. */
export async function loadLatestWatch(admin: SupabaseClient, userId: string, projectId: string | null): Promise<StoredWatch | null> {
  try {
    let q = admin.from("market_watch_snapshots").select("payload,week_start").eq("user_id", userId).order("week_start", { ascending: false }).limit(1);
    q = projectId ? q.eq("project_id", projectId) : q.is("project_id", null);
    const { data } = await q.maybeSingle();
    const row = data as { payload?: MarketSnapshot & { changes?: MarketChange[]; baseline?: boolean }; week_start?: string } | null;
    if (!row?.payload) return null;
    return { weekStart: row.week_start ?? row.payload.weekStart, baseline: Boolean(row.payload.baseline), changes: row.payload.changes ?? [], competitors: row.payload.competitors ?? [] };
  } catch { return null; }
}
