"use client";
import { useState } from "react";
import { KIND_LABEL, type RadarPrep } from "@/lib/radar/types";
import type { RadarView } from "@/lib/radar/store";
import { googleCalendarUrl } from "@/lib/radar/nextMove";

const box: React.CSSProperties = { border: "1px solid var(--bm-border2)", borderRadius: "var(--mood-radius, 10px)", background: "var(--bm-bg3)", padding: 12, display: "grid", gap: 8, minWidth: 0 };
const small: React.CSSProperties = { fontSize: "var(--text-sm)", color: "var(--bm-text2)", lineHeight: "var(--leading-normal)", margin: 0 };
const btn: React.CSSProperties = { minHeight: 36, padding: "0 12px", borderRadius: 8, border: "1px solid var(--bm-border3)", background: "transparent", color: "var(--bm-text)", fontSize: "var(--text-sm)", fontWeight: 600, fontFamily: "inherit", cursor: "pointer" };

function fmtWhen(i: RadarView): string {
  const iso = i.type === "program" ? i.deadline_at : i.starts_at ?? i.deadline_at;
  if (!iso) return "No date found";
  const d = new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  return `${i.type === "program" ? "Deadline" : "When"}: ${d}`;
}

export function downloadIcs(i: RadarView) {
  if (!i.ics) return;
  const url = URL.createObjectURL(new Blob([i.ics], { type: "text/calendar" }));
  const a = document.createElement("a"); a.href = url; a.download = `${i.title.slice(0, 40).replace(/[^\w]+/g, "-")}.ics`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function RadarItemCard({ item, compact, onChange }: { item: RadarView; compact?: boolean; onChange?: () => void }) {
  const [prep, setPrep] = useState<RadarPrep | null>(item.prep);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    try { await fetch("/api/radar", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, ...body }) }); onChange?.(); } finally { setBusy(false); }
  }
  async function prepare() {
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/radar/prep", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id }) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok || !b.prep) setMsg(b?.error ?? "Could not prepare this. Try again."); else setPrep(b.prep);
    } catch { setMsg("Could not prepare this. Try again."); } finally { setBusy(false); }
  }

  const place = item.meeting_url ? "Meeting link" : item.is_virtual ? "Online" : item.location;
  return (
    <div style={box}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--bm-accent)", border: "1px solid var(--bm-accent-bd)", borderRadius: 999, padding: "1px 8px" }}>{KIND_LABEL[item.kind]}{item.kind_confirmed ? "" : " (confirm)"}</span>
        {item.source === "discovered" && <span style={{ fontSize: "var(--text-xs)", color: "var(--bm-text3)" }}>Found for you · verify on the page</span>}
        <span style={{ fontSize: "var(--text-xs)", color: "var(--bm-text3)" }}>{fmtWhen(item)}{place ? ` · ${place}` : ""}</span>
        <span style={{ marginLeft: "auto", fontSize: "var(--text-xs)", fontWeight: 700, color: item.fit.band === "act" ? "var(--bm-green)" : "var(--bm-text3)" }} title={[...item.fit.reasons, ...item.fit.cautions].join(" ")}>Fit {item.fit.score}</span>
      </div>
      <div style={{ fontSize: "var(--text-md)", fontWeight: 700, color: "var(--bm-text)", overflowWrap: "anywhere" }}>{item.title}{item.organizer ? <span style={{ fontWeight: 400, color: "var(--bm-text3)" }}> · {item.organizer}</span> : null}</div>
      <p style={{ ...small, color: "var(--bm-text)" }}>{item.next_move}</p>
      {!compact && item.fit.reasons.length > 0 && <p style={small}>Why: {item.fit.reasons.join(" ")}</p>}
      {item.fit.cautions.length > 0 && <p style={{ ...small, color: "var(--bm-text3)" }}>Check: {item.fit.cautions.join(" ")}</p>}
      {prep && (
        <div style={{ display: "grid", gap: 4, borderTop: "1px solid var(--bm-border)", paddingTop: 8 }}>
          {prep.why_it_fits && <p style={small}>{prep.why_it_fits}</p>}
          {prep.questions.length > 0 && <ul style={{ margin: 0, paddingLeft: 18, listStyleType: "disc" }}>{prep.questions.map((q, k) => <li key={k} style={{ ...small, marginBottom: 2 }}>{q}</li>)}</ul>}
          {prep.intro && <p style={{ ...small, color: "var(--bm-text)", whiteSpace: "pre-wrap" }}>{prep.intro}</p>}
          {prep.ask && <p style={small}>Ask: {prep.ask}</p>}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {item.meeting_url && <a href={item.meeting_url} target="_blank" rel="noopener noreferrer" style={{ ...btn, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>Open meeting link</a>}
        {item.url && !item.meeting_url && <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ ...btn, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>{item.type === "program" ? "Open application" : "Open page"}</a>}
        {item.location && !item.is_virtual && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.location)}`} target="_blank" rel="noopener noreferrer" style={{ ...btn, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>Map</a>}
        {googleCalendarUrl(item) && <a href={googleCalendarUrl(item) as string} target="_blank" rel="noopener noreferrer" style={{ ...btn, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>Google Calendar</a>}
        {item.ics && <button type="button" style={btn} onClick={() => downloadIcs(item)}>.ics file</button>}
        <button type="button" style={btn} disabled={busy} onClick={prepare}>{prep ? "Redo prep" : "Prepare"}</button>
        {!compact && item.type !== "person" && item.status !== "applied" && item.status !== "attending" && <button type="button" style={btn} disabled={busy} onClick={() => patch({ status: item.type === "program" ? "applied" : "attending" })}>{item.type === "program" ? "Mark applied" : "Mark attending"}</button>}
        {item.type === "person" && <button type="button" style={btn} disabled={busy} onClick={() => patch({ last_contacted_at: new Date().toISOString(), next_follow_up_at: new Date(Date.now() + 7 * 86400000).toISOString() })}>Contacted, follow up in 7 days</button>}
        <button type="button" style={btn} disabled={busy} onClick={() => patch({ status: "done" })}>Done</button>
        <button type="button" style={{ ...btn, color: "var(--bm-text3)" }} disabled={busy} onClick={() => patch({ status: "dismissed" })}>Not for me</button>
      </div>
      {msg && <p role="status" style={{ ...small, color: "var(--bm-red)" }}>{msg}</p>}
    </div>
  );
}
