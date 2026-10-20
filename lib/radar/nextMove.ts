/** The concrete next step for an item, written from its type so an event is never given an application's task. */
import type { RadarItem } from "@/lib/radar/types";
import { actionDate, daysUntil } from "@/lib/radar/fit";

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const left = (d: number | null) => (d === null ? "" : d <= 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`);

export function nextMove(i: RadarItem, now = Date.now()): string {
  const when = actionDate(i);
  const d = daysUntil(when, now);
  const by = when ? ` ${fmt(when)} (${left(d)})` : "";
  switch (i.kind) {
    case "grant": case "accelerator": case "competition":
      return d !== null && d <= 1
        ? `Submit today. Re-read the eligibility line, then send.`
        : `Apply by${by || " the deadline"}. Today: check eligibility and draft the 150-word summary of what you are building.`;
    case "hackathon":
      return `Register${by ? ` before${by}` : ""}. Decide the one thing you would build there that moves your product forward, and write it in one sentence.`;
    case "conference": case "meetup":
      return `RSVP${by ? ` for${by}` : ""}. Pick 3 people you want to meet, and write your one-line intro.`;
    case "workshop": case "webinar":
      return `Add it to your calendar${by ? ` (${fmt(when as string)})` : ""}. Write 2 questions from your own blockers before it starts.`;
    case "meeting":
      return `Prepare 3 questions and a one-line goal${by ? ` for${by}` : ""}. Send the agenda 24 hours before.`;
    case "person":
      return i.next_follow_up_at && (d ?? 1) <= 0
        ? `Follow up with ${i.title} today. Reference what you said last time.`
        : `Send ${i.title} a short, specific intro. Press Prepare for a draft built from your record.`;
  }
}

/** An .ics calendar file (RFC 5545, UTC). Null when the item has no time to put on a calendar. */
export function buildIcs(i: RadarItem, now = Date.now()): string | null {
  const start = i.type === "program" ? i.deadline_at : i.type === "person" ? i.next_follow_up_at : i.starts_at ?? i.deadline_at;
  if (!start || Number.isNaN(Date.parse(start))) return null;
  const z = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const end = i.ends_at && Date.parse(i.ends_at) > Date.parse(start) ? i.ends_at : new Date(Date.parse(start) + 60 * 60 * 1000).toISOString();
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  const title = i.type === "program" ? `Deadline: ${i.title}` : i.title;
  const where = i.meeting_url || i.location || "";
  const desc = [nextMove(i, now), i.url ?? ""].filter(Boolean).join("\n");
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//BuildMind//Radar//EN", "BEGIN:VEVENT", `UID:${i.id}@buildmind.live`, `DTSTAMP:${z(new Date(now).toISOString())}`, `DTSTART:${z(start)}`, `DTEND:${z(end)}`, `SUMMARY:${esc(title)}`, ...(where ? [`LOCATION:${esc(where)}`] : []), `DESCRIPTION:${esc(desc)}`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
}
