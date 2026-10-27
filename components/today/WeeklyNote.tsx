"use client";
import { useEffect, useState } from "react";

/** One quiet line about the week, shown once per ISO-ish week and then out of the way. */
const weekKey = () => { const d = new Date(); const j = new Date(d.getFullYear(), 0, 1); return `bm_week_note_${d.getFullYear()}_${Math.floor((+d - +j) / 604_800_000)}`; };

export default function WeeklyNote() {
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    try { if (localStorage.getItem(weekKey())) return; } catch { /* show it */ }
    fetch("/api/today/week").then((r) => r.json()).then((b) => setNote(typeof b?.note === "string" ? b.note : null)).catch(() => {});
  }, []);
  if (!note) return null;
  const hide = () => { setNote(null); try { localStorage.setItem(weekKey(), "1"); } catch { /* ignore */ } };
  return (
    <div role="status" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "9px 12px", borderRadius: "var(--mood-radius, 10px)", background: "var(--bm-bg2)" }}>
      <span style={{ flex: "1 1 240px", fontSize: "var(--text-sm)", color: "var(--bm-text2)" }}>{note}</span>
      <button type="button" onClick={hide} style={{ minHeight: 34, padding: "0 12px", borderRadius: 8, border: "none", background: "transparent", color: "var(--bm-text3)", fontSize: "var(--text-sm)", fontWeight: 600, cursor: "pointer" }}>Got it</button>
    </div>
  );
}
