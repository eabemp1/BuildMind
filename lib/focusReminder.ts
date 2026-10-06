/**
 * lib/focusReminder.ts — gets a focus block onto the phone itself, so the
 * founder is reminded even after leaving the app.
 *
 * What a web page can and cannot do, stated plainly:
 *   - It cannot write into iOS Clock or any stock timer app. No web API does.
 *   - Android: a link of the form intent:#Intent;action=android.intent.action.SET_TIMER
 *     asks the default Clock app to start a timer, which keeps ringing with the app closed.
 *   - Any phone: a calendar file (.ics) with an alarm opens in the phone's own Calendar,
 *     which alerts at the end of the block. This is the route that works on iPhone.
 *   - Both need one tap from the founder; the browser will not set alarms silently.
 *
 * Pure builders live here so they can be tested. The two small browser helpers
 * at the bottom only run in response to a tap.
 */

export type Platform = "android" | "ios" | "other";

export function detectPlatform(userAgent: string, maxTouchPoints = 0): Platform {
  if (/android/i.test(userAgent)) return "android";
  // iPadOS 13+ reports as a Mac but has touch points.
  if (/iphone|ipad|ipod/i.test(userAgent) || (/macintosh/i.test(userAgent) && maxTouchPoints > 1)) return "ios";
  return "other";
}

const cleanLabel = (s: string, n = 80) => s.replace(/[\r\n;]+/g, " ").replace(/\s+/g, " ").trim().slice(0, n);

/** Opens the Android Clock app with a timer already set for this block. */
export function androidTimerIntentUrl(params: { seconds: number; label: string }): string {
  const seconds = Math.max(1, Math.round(params.seconds));
  const label = cleanLabel(`Focus: ${params.label}`);
  // Intent extras use ";" as the separator, so the label is stripped of it above.
  return `intent:#Intent;action=android.intent.action.SET_TIMER;i.android.intent.extra.alarm.LENGTH=${seconds};S.android.intent.extra.alarm.MESSAGE=${encodeURIComponent(label)};B.android.intent.extra.alarm.SKIP_UI=false;end`;
}

const icsStamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Folds long lines at 75 octets as RFC 5545 requires. */
function fold(line: string): string {
  if (line.length <= 73) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 73)); rest = rest.slice(73);
  while (rest.length > 0) { parts.push(` ${rest.slice(0, 72)}`); rest = rest.slice(72); }
  return parts.join("\r\n");
}

export interface FocusEventInput {
  task: string;
  start: Date;
  end: Date;
  /** Optional first step, shown in the event notes. */
  firstStep?: string;
  uid?: string;
}

/** A calendar event for the block, with an alert at the moment it ends. */
export function buildFocusIcs(input: FocusEventInput): string {
  const title = cleanLabel(`Focus: ${input.task}`, 120);
  const description = [input.task, input.firstStep ? `Start with: ${input.firstStep}` : "", "Set by BuildMind."].filter(Boolean).join("\n");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BuildMind//Focus block//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${input.uid ?? `${input.start.getTime()}-focus@buildmind.live`}`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(input.start)}`,
    `DTEND:${icsStamp(input.end)}`,
    `SUMMARY:${icsText(title)}`,
    `DESCRIPTION:${icsText(description)}`,
    "TRANSP:OPAQUE",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsText(`Time is up: ${cleanLabel(input.task, 60)}`)}`,
    "TRIGGER;RELATED=END:PT0S",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(fold).join("\r\n")}\r\n`;
}

// ── Browser helpers (run only from a tap) ─────────────────────────────────

/** Hands the calendar file to the phone. iOS opens its "Add to Calendar" sheet. */
export function openIcs(ics: string, filename: string, platform: Platform): void {
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  if (platform === "ios") {
    window.location.href = url;
  } else {
    const a = document.createElement("a");
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Starts the Clock app's timer on Android. */
export function openAndroidTimer(seconds: number, label: string): void {
  window.location.href = androidTimerIntentUrl({ seconds, label });
}
