/**
 * lib/today/whenToday.ts — the times offered under today's task ("When today?"). Pure.
 * Works in the viewer's own local time, so the caller passes a Date made in their browser.
 */
export interface WhenChoice { label: string; h: number; m: number; tomorrow: boolean }

const SLOTS = [12, 15, 18, 20];

export function timeLabel(h: number, m: number): string {
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** Up to three choices: in an hour, then the next two fixed times left today. Late at night: tomorrow morning. */
export function whenChoices(now: Date): WhenChoice[] {
  const hour = new Date(now.getTime() + 60 * 60_000);
  const crosses = hour.getDate() !== now.getDate();
  const out: WhenChoice[] = [{ label: "In 1 hour", h: hour.getHours(), m: hour.getMinutes(), tomorrow: crosses }];
  const minsNow = now.getHours() * 60 + now.getMinutes();
  for (const h of SLOTS) {
    if (out.length >= 3) break;
    if (h * 60 > minsNow + 90) out.push({ label: timeLabel(h, 0), h, m: 0, tomorrow: false });
  }
  if (out.length === 1) out.push({ label: `Tomorrow ${timeLabel(9, 0)}`, h: 9, m: 0, tomorrow: true });
  return out;
}
