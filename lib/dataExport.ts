/**
 * lib/dataExport.ts - the founder's own data, in one download.
 *
 * Reads user-scoped tables best-effort: a table that does not exist yet, or errors, is listed in
 * `skipped` instead of failing the whole export. Secret-looking columns (tokens, keys, passwords) are
 * removed. Connected-app credentials (the integrations table) are never included.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** [table, column that holds the owner's user id] */
export const EXPORT_TABLES: ReadonlyArray<readonly [string, string]> = [
  ["projects", "user_id"],
  ["milestones", "user_id"],
  ["tasks", "user_id"],
  ["reflections", "user_id"],
  ["reflexion_learning_log", "user_id"],
  ["founder_memory", "user_id"],
  ["founder_context", "user_id"],
  ["agent_runs", "user_id"],
  ["agent_findings", "user_id"],
  ["action_logs", "user_id"],
  ["today_feedback", "user_id"],
  ["evening_checks", "user_id"],
  ["morning_briefings", "user_id"],
  ["score_history", "user_id"],
  ["prepared_work", "user_id"],
  ["project_analyses", "user_id"],
  ["activity_log", "user_id"],
  ["signal_links", "user_id"],
  ["signal_events", "user_id"],
];

export const MAX_ROWS_PER_TABLE = 5000;

const SECRET_KEY = /token|secret|password|api[_-]?key|authorization|refresh|credential/i;

/** Remove secret-looking keys, at any depth. Pure. */
export function redactSecrets<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => redactSecrets(v)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY.test(k)) continue;
      out[k] = redactSecrets(v);
    }
    return out as T;
  }
  return value;
}

export interface DataExport {
  exported_at: string;
  user_id: string;
  email: string | null;
  tables: Record<string, unknown[]>;
  /** Tables that could not be read (not created yet, or an error), so the file never silently looks complete. */
  skipped: string[];
  truncated: string[];
}

export async function buildDataExport(admin: SupabaseClient, user: { id: string; email?: string | null }, now = new Date()): Promise<DataExport> {
  const out: DataExport = { exported_at: now.toISOString(), user_id: user.id, email: user.email ?? null, tables: {}, skipped: [], truncated: [] };
  await Promise.all(EXPORT_TABLES.map(async ([table, col]) => {
    try {
      const { data, error } = await admin.from(table).select("*").eq(col, user.id).limit(MAX_ROWS_PER_TABLE);
      if (error) { out.skipped.push(table); return; }
      const rows = (data ?? []) as unknown[];
      out.tables[table] = redactSecrets(rows);
      if (rows.length >= MAX_ROWS_PER_TABLE) out.truncated.push(table);
    } catch {
      out.skipped.push(table);
    }
  }));
  out.skipped.sort();
  out.truncated.sort();
  return out;
}
