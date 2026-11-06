/**
 * Market Watch scan. Reads the competitors from the founder's latest Break My Startup run, reads each
 * home page once, looks for new community threads about them, saves one snapshot for the week and
 * returns what changed since the last one. Builder-only (callers check the plan). Never throws.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { readPages, isSafePublicUrl } from "@/lib/pageReader";
import { discussionSearch } from "@/lib/search";
import { diffSnapshots, sortChanges, weekStartOf, type MarketChange, type MarketSnapshot, type WatchedCompetitor, type WatchedThread } from "@/lib/marketWatch/diff";

export const MAX_COMPETITORS = 5;
const MAX_THREAD_QUERIES = 3;

export interface WatchedSource { name: string; url: string }

/**
 * Pull named competitors with a usable URL from a saved Break My Startup payload.
 * The competitor agent's own list comes first. When that is empty (the agent failed or named nobody), the competitor
 * pages the run found by searching are used instead, so a run is never left with nothing to watch.
 */
export function competitorsFromRun(payload: unknown): WatchedSource[] {
  const p = payload as {
    agent_outputs?: { competitor?: { brief?: Array<{ name?: unknown; url?: unknown }> } };
    competitors?: Array<{ title?: unknown; url?: unknown }>;
  } | null;
  const collect = (rows: Array<{ name?: unknown; url?: unknown }>): WatchedSource[] => {
    const out: WatchedSource[] = [];
    const seen = new Set<string>();
    for (const c of rows) {
      const name = typeof c.name === "string" ? c.name.trim().slice(0, 80) : "";
      const url = typeof c.url === "string" ? c.url.trim() : "";
      if (!name || !url || !isSafePublicUrl(url)) continue;
      const k = name.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ name, url });
      if (out.length >= MAX_COMPETITORS) break;
    }
    return out;
  };
  const fromBrief = collect(p?.agent_outputs?.competitor?.brief ?? []);
  if (fromBrief.length) return fromBrief;
  return collect((Array.isArray(p?.competitors) ? p!.competitors! : []).map((c) => ({ name: c?.title, url: c?.url })));
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
    const sources = competitorsFromRun((run as { payload?: unknown } | null)?.payload);
    if (!run) return { ok: false, reason: "no_competitors", message: "No saved stress test yet. Run Break My Startup while signed in, then scan again." };
    if (!sources.length) return { ok: false, reason: "no_competitors", message: "Your last stress test did not find any competitor websites. Run it again with more detail on what you build and who it is for." };

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
