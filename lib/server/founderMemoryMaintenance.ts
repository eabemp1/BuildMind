/**
 * lib/server/founderMemoryMaintenance.ts — automatic classification of
 * founder_memory.avoidance_zones / strengths.
 *
 * This used to run only when the owner pressed a button in the admin page.
 * It now runs three ways, all through the same code:
 *   1. daily cron (/api/cron/maintain-founder-memory) for every founder
 *   2. self-heal: when a founder's Weekly Pulse / Mirror loads and their row is
 *      behind the current CLASSIFIER_VERSION, it is rebuilt first
 *   3. the admin buttons (dry run / live), unchanged for manual spot checks
 *
 * The rebuild folds reflections.today_action and completed tasks.title through
 * actionCategoryLabelOrNull() in chronological order. Areas the founder has
 * already faced (avoidance_resolved, last 30 days) are never resurrected.
 *
 * Bump CLASSIFIER_VERSION whenever lib/actionClassification.ts changes: every
 * row is then reclassified once, automatically.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { actionCategoryLabelOrNull } from "@/lib/actionClassification";
import { deduplicateTags } from "@/lib/founderMemory";
import { BLOCKER_ZONE_LABELS } from "@/lib/blockerIntelligence";

export const CLASSIFIER_VERSION = 3;
const STALE_DAYS = 7;
const RESOLVED_QUIET_DAYS = 30;
// Mirrors app/api/founder-context/task-complete: "abandoned" counts as a strength there.
const ABANDONED_AS_AVOIDANCE = false;

type SourceEvent = { at: number; text: string; bucket: "avoidance" | "strength" };

export interface ReclassifyRow {
  user_id: string;
  source_events: number;
  avoidance_zones?: { before: string[]; after: string[] };
  strengths?: { before: string[]; after: string[] };
  writeError?: string;
}

function isAvoidanceOutcome(outcome: string | null): boolean {
  return outcome === "blocked" || outcome === "skipped" || (outcome === "abandoned" && ABANDONED_AS_AVOIDANCE);
}

function same(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Pure: events → rebuilt zone labels, minus recently faced zones. */
export function rebuildLabels(events: SourceEvent[], bucket: "avoidance" | "strength", faced: Set<string> = new Set()): string[] {
  const labels = events
    .filter((e) => e.bucket === bucket)
    .sort((a, b) => a.at - b.at)
    .map((e) => actionCategoryLabelOrNull(e.text))
    .filter((x): x is string => Boolean(x))
    .filter((l) => bucket !== "avoidance" || !faced.has(l.toLowerCase()));
  return deduplicateTags(labels, 10);
}

/** Pure: re-run stored labels through the classifier (fixes garbled fragments). */
/** A stored entry that is already a short category label, not a raw task fragment. */
export function looksLikeLabel(entry: string): boolean {
  const e = entry.trim();
  return e.length > 0 && e.length <= 40 && !/[\d,.:;!?]|\s-\s/.test(e) && e.split(/\s+/).length <= 5;
}

export function cleanZoneArray(raw: unknown): { changed: boolean; before: string[]; after: string[] } {
  const before = Array.isArray(raw) ? (raw as string[]).filter(Boolean) : [];
  if (before.length === 0) return { changed: false, before, after: [] };
  // Re-classify raw fragments; keep entries that are already clean labels (the
  // classifier is not idempotent on its own output, so a second pass must not drop them).
  const after = deduplicateTags(
    before
      .map((e) =>
        // Blocker zones first: the classifier would turn "Finding users" into "research".
        BLOCKER_ZONE_LABELS.has(e.trim().toLowerCase()) ? e.trim()
          : actionCategoryLabelOrNull(e) ?? (looksLikeLabel(e) ? e.trim() : null))
      .filter((x): x is string => Boolean(x)),
  );
  return { changed: !same(before, after), before, after };
}

export function recentlyFaced(resolved: unknown, now = Date.now()): Set<string> {
  const out = new Set<string>();
  if (!Array.isArray(resolved)) return out;
  for (const r of resolved as Array<{ zone?: string; at?: string }>) {
    if (!r?.zone || !r.at) continue;
    if (now - Date.parse(r.at) <= RESOLVED_QUIET_DAYS * 86_400_000) out.add(String(r.zone).toLowerCase());
  }
  return out;
}

async function eventsFor(admin: SupabaseClient, userId: string): Promise<SourceEvent[]> {
  const events: SourceEvent[] = [];
  const { data: reflections } = await admin
    .from("reflections").select("today_action, outcome, created_at")
    .eq("user_id", userId).not("today_action", "is", null).limit(2000);
  for (const r of (reflections ?? []) as Array<{ today_action: string | null; outcome: string | null; created_at: string | null }>) {
    const text = r.today_action?.trim();
    if (text) events.push({ at: r.created_at ? Date.parse(r.created_at) : 0, text, bucket: isAvoidanceOutcome(r.outcome) ? "avoidance" : "strength" });
  }
  const { data: tasks } = await admin
    .from("tasks").select("title, updated_at, completed_at, created_at")
    .eq("user_id", userId).eq("is_completed", true).limit(2000);
  for (const t of (tasks ?? []) as Array<{ title: string | null; updated_at: string | null; completed_at: string | null; created_at: string | null }>) {
    const text = t.title?.trim();
    const raw = t.completed_at ?? t.updated_at ?? t.created_at;
    if (text) events.push({ at: raw ? Date.parse(raw) : 0, text, bucket: "strength" });
  }
  return events;
}

type MemoryRow = { user_id: string; avoidance_zones?: string[] | null; strengths?: string[] | null; avoidance_resolved?: unknown; zones_classifier_version?: number; zones_classified_at?: string | null };

async function stamp(admin: SupabaseClient, userId: string) {
  try {
    await admin.from("founder_memory").update({ zones_classifier_version: CLASSIFIER_VERSION, zones_classified_at: new Date().toISOString() }).eq("user_id", userId);
  } catch { /* column not migrated yet: the next run simply repeats the (idempotent) rebuild */ }
}

export async function reclassifyRow(admin: SupabaseClient, row: MemoryRow, dryRun: boolean): Promise<ReclassifyRow | null> {
  const events = await eventsFor(admin, row.user_id);
  if (events.length === 0) { if (!dryRun) await stamp(admin, row.user_id); return null; }

  const faced = recentlyFaced(row.avoidance_resolved);
  // Blocker-derived zones (Visibility, Finding users…) come from blocker_insights, not task text: keep them.
  const keep = (row.avoidance_zones ?? []).filter((z) => BLOCKER_ZONE_LABELS.has(String(z).trim().toLowerCase()) && !faced.has(String(z).trim().toLowerCase()));
  const nextAvoidance = deduplicateTags([...keep, ...rebuildLabels(events, "avoidance", faced)], 10);
  const nextStrengths = rebuildLabels(events, "strength");
  const curA = (row.avoidance_zones ?? []).filter(Boolean);
  const curS = (row.strengths ?? []).filter(Boolean);
  const aChanged = !same(curA, nextAvoidance);
  const sChanged = !same(curS, nextStrengths);

  if (!aChanged && !sChanged) { if (!dryRun) await stamp(admin, row.user_id); return null; }

  const entry: ReclassifyRow = { user_id: row.user_id, source_events: events.length };
  if (aChanged) entry.avoidance_zones = { before: curA, after: nextAvoidance };
  if (sChanged) entry.strengths = { before: curS, after: nextStrengths };
  if (!dryRun) {
    const update: Record<string, string[]> = {};
    if (aChanged) update.avoidance_zones = nextAvoidance;
    if (sChanged) update.strengths = nextStrengths;
    const { error } = await admin.from("founder_memory").update(update).eq("user_id", row.user_id);
    if (error) entry.writeError = error.message; else await stamp(admin, row.user_id);
  }
  return entry;
}

export async function reclassifyAll(admin: SupabaseClient, opts: { userId?: string | null; dryRun: boolean; onlyStale?: boolean; limit?: number }) {
  let q = admin.from("founder_memory").select("*");
  if (opts.userId) q = q.eq("user_id", opts.userId);
  const { data, error } = await q.limit(opts.limit ?? 5000);
  if (error) return { ok: false as const, error: error.message };

  const cutoff = Date.now() - STALE_DAYS * 86_400_000;
  const rows = ((data ?? []) as MemoryRow[]).filter((r) =>
    !opts.onlyStale || (r.zones_classifier_version ?? 0) < CLASSIFIER_VERSION || !r.zones_classified_at || Date.parse(r.zones_classified_at) < cutoff,
  );

  const results: ReclassifyRow[] = [];
  let skipped = 0;
  for (const row of rows) {
    const r = await reclassifyRow(admin, row, opts.dryRun);
    if (r) results.push(r); else skipped++;
  }
  return { ok: true as const, dryRun: opts.dryRun, touched: results.length, skipped, results };
}

/** Self-heal for one founder. Cheap no-op once the row is current. Never throws. */
export async function healFounderMemoryIfStale(admin: SupabaseClient, userId: string): Promise<boolean> {
  try {
    const { data } = await admin.from("founder_memory").select("*").eq("user_id", userId).maybeSingle();
    const row = data as MemoryRow | null;
    // No row, or the stamp column isn't migrated: leave it to the daily job.
    if (!row || !("zones_classifier_version" in row)) return false;
    const fresh = (row.zones_classifier_version ?? 0) >= CLASSIFIER_VERSION
      && row.zones_classified_at && Date.now() - Date.parse(row.zones_classified_at) < STALE_DAYS * 86_400_000;
    if (fresh) return false;
    const r = await reclassifyRow(admin, { ...row, user_id: userId }, false);
    return Boolean(r);
  } catch {
    return false;
  }
}
