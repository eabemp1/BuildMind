/**
 * lib/pushWindow.ts - do not send the daily push in the middle of someone's night.
 *
 * The daily push runs at fixed UTC times. At 07:00 UTC it is 03:00 for a founder in New York. A
 * founder's browser reports their UTC offset (user_behavior_state.tz_offset_minutes); this decides
 * whether "now" falls inside their waking window. Unknown offsets count as in-window, which keeps the
 * old behaviour for anyone whose browser has not reported one yet. Pure.
 */

/** First and last local hour (inclusive) a daily push may be delivered. */
export const WINDOW_START_HOUR = 7;
export const WINDOW_END_HOUR = 21;

/** Offsets that real time zones can have: UTC-12:00 to UTC+14:00. */
export function parseOffsetMinutes(raw: unknown): number | null {
  const n = typeof raw === "string" ? Number(raw) : raw;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  if (n < -12 * 60 || n > 14 * 60) return null;
  return Math.round(n);
}

export function localHour(nowUtc: Date, offsetMinutes: number): number {
  const mins = nowUtc.getUTCHours() * 60 + nowUtc.getUTCMinutes() + offsetMinutes;
  return Math.floor((((mins % 1440) + 1440) % 1440) / 60);
}

export function inSendWindow(nowUtc: Date, rawOffset: unknown): boolean {
  const off = parseOffsetMinutes(rawOffset);
  if (off === null) return true;
  const h = localHour(nowUtc, off);
  return h >= WINDOW_START_HOUR && h <= WINDOW_END_HOUR;
}
