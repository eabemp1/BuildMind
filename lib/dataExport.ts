/**
 * lib/dataExport.ts - the founder's own data, in one download, with a manifest that says exactly what is in it.
 *
 * Rules this module enforces:
 *  - Every query is scoped to the signed-in user's id (the caller passes the id from the verified session).
 *  - Nothing is dropped silently: each category is reported as exported, empty, unavailable or failed, with a safe
 *    reason, and anything deliberately left out (credentials, device keys) is listed with why.
 *  - Credential-looking fields are removed and the manifest names which fields were removed.
 *  - The file is built in memory and streamed to the user; nothing is stored on the server.
 * Schema notes for readers of the file: docs/data-export.md.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const EXPORT_SCHEMA_VERSION = "2.0";
export const PAGE_SIZE = 1000;
export const MAX_ROWS_PER_TABLE = 20_000;

export type ExportGroup = "profile" | "work" | "history" | "intelligence" | "growth" | "account";

export interface ExportCategory {
  table: string;
  /** Column that holds the owner's id. */
  ownerCol: string;
  group: ExportGroup;
  label: string;
  /** Newest-first ordering column, when the table has one. */
  orderBy?: string;
  /** True when the rows contain other people's data (for example emails typed into a signup page). */
  thirdParty?: boolean;
  /** True when the content is model-generated interpretation rather than something the founder recorded. */
  aiGenerated?: boolean;
}

export const EXPORT_CATEGORIES: ReadonlyArray<ExportCategory> = [
  { table: "profiles", ownerCol: "id", group: "profile", label: "Account profile" },
  { table: "founder_context", ownerCol: "user_id", group: "profile", label: "Founder context and settings" },
  { table: "founder_memory", ownerCol: "user_id", group: "profile", label: "Founder memory", aiGenerated: true },
  { table: "user_behavior_state", ownerCol: "user_id", group: "profile", label: "Saved preferences and app state", orderBy: "updated_at" },
  { table: "projects", ownerCol: "user_id", group: "work", label: "Projects", orderBy: "created_at" },
  { table: "milestones", ownerCol: "user_id", group: "work", label: "Milestones", orderBy: "created_at" },
  { table: "tasks", ownerCol: "user_id", group: "work", label: "Tasks", orderBy: "created_at" },
  { table: "prepared_work", ownerCol: "user_id", group: "work", label: "Prepared work (drafts and kits)", orderBy: "created_at", aiGenerated: true },
  { table: "reflections", ownerCol: "user_id", group: "history", label: "Reflections", orderBy: "created_at" },
  { table: "action_logs", ownerCol: "user_id", group: "history", label: "Action log", orderBy: "created_at" },
  { table: "activity_log", ownerCol: "user_id", group: "history", label: "Activity log", orderBy: "created_at" },
  { table: "today_feedback", ownerCol: "user_id", group: "history", label: "Feedback on Today tasks", orderBy: "created_at" },
  { table: "today_swaps", ownerCol: "user_id", group: "history", label: "Task swaps", orderBy: "created_at" },
  { table: "today_loops", ownerCol: "user_id", group: "history", label: "Open loops", orderBy: "created_at" },
  { table: "task_overrides", ownerCol: "user_id", group: "history", label: "Task overrides", orderBy: "created_at" },
  { table: "evening_checks", ownerCol: "user_id", group: "history", label: "Evening check-ins", orderBy: "created_at" },
  { table: "morning_briefings", ownerCol: "user_id", group: "history", label: "Morning briefings", orderBy: "created_at", aiGenerated: true },
  { table: "score_history", ownerCol: "user_id", group: "history", label: "Score history", orderBy: "created_at" },
  { table: "user_achievements", ownerCol: "user_id", group: "history", label: "Achievements", orderBy: "created_at" },
  { table: "reflexion_learning_log", ownerCol: "user_id", group: "intelligence", label: "Recommendation and learning log", orderBy: "created_at", aiGenerated: true },
  { table: "reflexion_quality_log", ownerCol: "user_id", group: "intelligence", label: "Recommendation quality checks", orderBy: "created_at", aiGenerated: true },
  { table: "today_quality_events", ownerCol: "user_id", group: "intelligence", label: "Today quality events", orderBy: "created_at", aiGenerated: true },
  { table: "cofounder_reframe_log", ownerCol: "user_id", group: "intelligence", label: "Co-founder reframes", orderBy: "created_at", aiGenerated: true },
  { table: "agent_runs", ownerCol: "user_id", group: "intelligence", label: "Agent crew runs", orderBy: "started_at", aiGenerated: true },
  { table: "agent_findings", ownerCol: "user_id", group: "intelligence", label: "Agent crew findings", orderBy: "created_at", aiGenerated: true },
  { table: "project_analyses", ownerCol: "user_id", group: "intelligence", label: "Project analyses", orderBy: "created_at", aiGenerated: true },
  { table: "weekly_reports", ownerCol: "user_id", group: "intelligence", label: "Weekly reports", orderBy: "created_at", aiGenerated: true },
  { table: "companion_settings", ownerCol: "user_id", group: "intelligence", label: "Companion settings" },
  { table: "companion_events", ownerCol: "user_id", group: "intelligence", label: "Companion events", orderBy: "created_at" },
  { table: "radar_items", ownerCol: "user_id", group: "growth", label: "Radar opportunities and contacts", orderBy: "created_at" },
  { table: "radar_settings", ownerCol: "user_id", group: "growth", label: "Radar settings" },
  { table: "signal_links", ownerCol: "user_id", group: "growth", label: "Tracked links and pages", orderBy: "created_at" },
  { table: "signal_events", ownerCol: "user_id", group: "growth", label: "Visits, signups and confirmations on your links", orderBy: "created_at", thirdParty: true },
  { table: "dist_conversations", ownerCol: "user_id", group: "growth", label: "Distribution conversations", orderBy: "created_at" },
  { table: "dist_drafts", ownerCol: "user_id", group: "growth", label: "Distribution drafts", orderBy: "created_at", aiGenerated: true },
  { table: "dist_experiments", ownerCol: "user_id", group: "growth", label: "Distribution experiments", orderBy: "created_at" },
  { table: "ventures_blueprints", ownerCol: "user_id", group: "growth", label: "Venture blueprints", orderBy: "created_at", aiGenerated: true },
  { table: "venture_tracks", ownerCol: "user_id", group: "growth", label: "Venture tracks", orderBy: "created_at" },
  { table: "break_shares", ownerCol: "user_id", group: "growth", label: "Shared Break My Startup results", orderBy: "created_at" },
  { table: "testimonials", ownerCol: "user_id", group: "growth", label: "Testimonials you submitted", orderBy: "created_at" },
  { table: "subscriptions", ownerCol: "user_id", group: "account", label: "Subscription status" },
  { table: "ai_usage", ownerCol: "user_id", group: "account", label: "AI usage counters" },
  { table: "ai_usage_daily", ownerCol: "user_id", group: "account", label: "Daily AI usage" },
  { table: "teams_waitlist", ownerCol: "user_id", group: "account", label: "Teams waitlist entry" },
];

/** Tables that hold a user id but are deliberately not exported, with the reason shown to the user. */
export const EXCLUDED_TABLES: ReadonlyArray<{ table: string; reason: string }> = [
  { table: "integrations", reason: "Holds the access keys for apps you connected. Keys are never exported." },
  { table: "push_subscriptions", reason: "Holds your browser or phone's push-notification keys. Not useful as data and sensitive." },
  { table: "radar_feeds", reason: "Holds the private link to your Radar calendar feed." },
  { table: "trial_claims", reason: "An anti-abuse record used to enforce one trial per person." },
  { table: "owner_events", reason: "Internal operator analytics about the product, not your content." },
  { table: "funnel_events", reason: "Product analytics events used to improve onboarding." },
  { table: "briefing_opens", reason: "Email-open tracking used to time notifications." },
  { table: "scheduled_job_log", reason: "A system log of background jobs." },
];

/** Tables that exist in the live database but are not created by the migrations in this repository. */
export const LIVE_ONLY_TABLES = ["projects", "reflections", "agent_runs", "agent_findings", "action_logs"] as const;

/** Field names removed from every row. Whole-name matches only, so "tokens_used" is kept. */
const SECRET_KEY = /^(?:.*_)?(?:access_?token|refresh_?token|id_?token|api_?key|secret|password|authorization|credentials?|share_?token|confirm_?token|token|private_?key)$/i;

/** Remove credential-looking keys at any depth, noting which names were removed. Pure. */
export function redactSecrets<T>(value: T, removed?: Set<string>): T {
  if (Array.isArray(value)) return value.map((v) => redactSecrets(v, removed)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY.test(k)) { removed?.add(k); continue; }
      out[k] = redactSecrets(v, removed);
    }
    return out as T;
  }
  return value;
}

export type CategoryStatus = "exported" | "empty" | "unavailable" | "failed";

export interface CategoryManifest {
  table: string;
  label: string;
  group: ExportGroup;
  status: CategoryStatus;
  exported_rows: number;
  /** Rows the database reports for this user, when it said. */
  total_rows: number | null;
  truncated: boolean;
  /** Safe, plain-language reason for unavailable / failed / truncated. Never an internal error. */
  reason?: string;
  redacted_fields?: string[];
  contains_third_party_data?: boolean;
  ai_generated?: boolean;
}

export interface DataExport {
  schema_version: string;
  exported_at: string;
  user_id: string;
  email: string | null;
  /** True only when nothing failed and nothing was cut short. Categories with no table are listed, not hidden. */
  complete: boolean;
  summary: { categories: number; exported: number; empty: number; unavailable: number; failed: number; total_rows: number; truncated: number };
  manifest: CategoryManifest[];
  excluded: Array<{ table: string; reason: string }>;
  /** Backward compatible with version 1. */
  tables: Record<string, unknown[]>;
  skipped: string[];
  truncated: string[];
  notes: string[];
}

const MISSING = /42P01|PGRST205|does not exist|schema cache/i;

function classify(error: unknown): { status: "unavailable" | "failed"; reason: string } {
  const e = error as { code?: string; message?: string } | null;
  if (MISSING.test(`${e?.code ?? ""} ${e?.message ?? ""}`)) return { status: "unavailable", reason: "This kind of data is not set up in your account yet, so there is nothing to export." };
  return { status: "failed", reason: "This category could not be read just now. Download again in a few minutes." };
}

/** Reads every row for one owner, newest first, up to MAX_ROWS_PER_TABLE. */
async function readAll(admin: SupabaseClient, cat: ExportCategory, userId: string): Promise<{ rows: unknown[]; total: number | null; error: unknown | null }> {
  const rows: unknown[] = [];
  let total: number | null = null;
  let order = cat.orderBy;
  for (let from = 0; from < MAX_ROWS_PER_TABLE; from += PAGE_SIZE) {
    const run = (ord?: string) => {
      let q = admin.from(cat.table).select("*", { count: "exact" }).eq(cat.ownerCol, userId);
      if (ord) q = q.order(ord, { ascending: false });
      return q.range(from, from + PAGE_SIZE - 1);
    };
    let res = await run(order);
    // An ordering column that does not exist must not lose the data: retry without ordering.
    if (res.error && order) { order = undefined; res = await run(undefined); }
    if (res.error) return { rows, total, error: res.error };
    if (typeof res.count === "number") total = res.count;
    const page = (res.data ?? []) as unknown[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return { rows, total, error: null };
}

export async function buildDataExport(admin: SupabaseClient, user: { id: string; email?: string | null }, now = new Date()): Promise<DataExport> {
  const tables: Record<string, unknown[]> = {};
  const results = await Promise.all(EXPORT_CATEGORIES.map(async (cat): Promise<CategoryManifest> => {
    const base: CategoryManifest = { table: cat.table, label: cat.label, group: cat.group, status: "empty", exported_rows: 0, total_rows: null, truncated: false };
    if (cat.thirdParty) base.contains_third_party_data = true;
    if (cat.aiGenerated) base.ai_generated = true;
    try {
      const { rows, total, error } = await readAll(admin, cat, user.id);
      if (error) { const c = classify(error); return { ...base, status: c.status, reason: c.reason }; }
      const removed = new Set<string>();
      tables[cat.table] = redactSecrets(rows, removed);
      const truncated = rows.length >= MAX_ROWS_PER_TABLE && (total === null || total > rows.length);
      return {
        ...base,
        status: rows.length ? "exported" : "empty",
        exported_rows: rows.length,
        total_rows: total,
        truncated,
        ...(truncated ? { reason: `Only the newest ${MAX_ROWS_PER_TABLE.toLocaleString("en-US")} rows are included. Email hello@buildmind.live for the rest.` } : {}),
        ...(removed.size ? { redacted_fields: [...removed].sort() } : {}),
      };
    } catch {
      const c = classify(null);
      return { ...base, status: c.status, reason: c.reason };
    }
  }));

  const count = (s: CategoryStatus) => results.filter((r) => r.status === s).length;
  const truncatedList = results.filter((r) => r.truncated).map((r) => r.table).sort();
  const skipped = results.filter((r) => r.status === "unavailable" || r.status === "failed").map((r) => r.table).sort();
  const summary = {
    categories: results.length, exported: count("exported"), empty: count("empty"), unavailable: count("unavailable"), failed: count("failed"),
    total_rows: results.reduce((n, r) => n + r.exported_rows, 0), truncated: truncatedList.length,
  };
  return {
    schema_version: EXPORT_SCHEMA_VERSION,
    exported_at: now.toISOString(),
    user_id: user.id,
    email: user.email ?? null,
    complete: summary.failed === 0 && summary.truncated === 0,
    summary,
    manifest: results,
    excluded: [...EXCLUDED_TABLES],
    tables,
    skipped,
    truncated: truncatedList,
    notes: [
      "Fields named in redacted_fields were removed because they act like passwords or private links.",
      "Categories marked ai_generated hold model-written interpretations. They are suggestions, not facts about you.",
      "signal_events can include email addresses typed by people who visited your pages. Handle them as that person's data.",
    ],
  };
}

/** What a download would contain, without reading any rows. For the screen shown before downloading. */
export function describeExport(): { categories: Array<Pick<ExportCategory, "table" | "label" | "group"> & { third_party: boolean; ai_generated: boolean }>; excluded: typeof EXCLUDED_TABLES } {
  return {
    categories: EXPORT_CATEGORIES.map((c) => ({ table: c.table, label: c.label, group: c.group, third_party: Boolean(c.thirdParty), ai_generated: Boolean(c.aiGenerated) })),
    excluded: EXCLUDED_TABLES,
  };
}
