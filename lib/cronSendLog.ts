/**
 * lib/cronSendLog.ts
 *
 * Atomic per-user-per-day "did we already send this" claim, backed by
 * supabase/migrations/20260803000000_cron_send_log.sql. Fixes High #9
 * (push/email crons had no durable marker at all — only best-effort
 * logging after the send) and High #11 (re-engage's check-then-send-then-
 * update pattern, which two overlapping runs could both pass).
 *
 * Call claimSendSlots() BEFORE sending anything, and only send to the
 * userIds it returns. Two overlapping cron runs (retry, double-trigger,
 * pg_cron + Vercel Cron both firing) can never both claim the same slot —
 * the underlying INSERT ... ON CONFLICT DO NOTHING means Postgres itself
 * arbitrates the race, not application-code timing.
 */
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * @param userIds   Candidates to claim a send slot for.
 * @param sendType  A stable string identifying this specific kind of send
 *                  (e.g. "daily_push", "weekly_report", "sunday_email",
 *                  "promoter_digest", "re_engage_7day", "re_engage_14day").
 *                  Each sendType has its own independent claim space, so a
 *                  founder can receive one of each type on the same day.
 * @param sendDate  Defaults to today (UTC date). Pass an explicit value for
 *                  crons whose "day" boundary differs from UTC midnight.
 * @returns         The subset of userIds that were NOT already claimed —
 *                   i.e. the ones actually safe to send to right now.
 */
export async function claimSendSlots(
  userIds: string[],
  sendType: string,
  sendDate: string = new Date().toISOString().slice(0, 10),
): Promise<string[]> {
  if (userIds.length === 0) return [];

  const supabase = createAdminClient();
  const rows = userIds.map((user_id) => ({ user_id, send_type: sendType, send_date: sendDate }));

  const { data, error } = await supabase
    .from("cron_send_log")
    .upsert(rows, { onConflict: "user_id,send_type,send_date", ignoreDuplicates: true })
    .select("user_id");

  if (error) {
    // Fail CLOSED, not open — if we can't confirm a claim, don't send.
    // Skipping a send is recoverable next run; a duplicate send is not.
    console.error("[cronSendLog] claim failed, skipping this batch", error);
    return [];
  }

  return (data ?? []).map((r: { user_id: string }) => r.user_id);
      }
