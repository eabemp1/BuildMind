"use client";

/**
 * "When today?" — one quiet row under the Start button. Reading the task and leaving "for later" is the usual way
 * it gets dropped, so the founder picks a time and the existing reminder (today_loops, sent by the loops-due cron
 * as an in-app notification and a push) brings them back. Nothing is sent to anyone else.
 */
import { useEffect, useState } from "react";
import { whenChoices, timeLabel, type WhenChoice } from "@/lib/today/whenToday";

const muted = { fontSize: 13, color: "var(--bm-text3)" } as const;

export default function WhenToday({ task, ink }: { task: string; ink: string }) {
  const [choices, setChoices] = useState<WhenChoice[]>([]);
  const [setFor, setSetFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const text = task.slice(0, 500);

  useEffect(() => {
    setChoices(whenChoices(new Date()));
    let live = true;
    fetch("/api/today/loops", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const hit = (j?.upcoming ?? []).find((l: { task_text?: string; due_at?: string }) => l.task_text === text);
        if (live && hit?.due_at) { const d = new Date(hit.due_at); setSetFor(timeLabel(d.getHours(), d.getMinutes())); }
      })
      .catch(() => {});
    return () => { live = false; };
  }, [text]);

  async function pick(c: WhenChoice) {
    if (busy) return;
    setBusy(true); setFailed(false);
    try {
      const r = await fetch("/api/today/loops", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_text: text, measure: "Did you get to it?", clock: { h: c.h, m: c.m, tomorrow: c.tomorrow }, tzOffset: new Date().getTimezoneOffset() }),
      });
      if (r.ok) setSetFor(c.tomorrow ? `tomorrow ${timeLabel(c.h, c.m)}` : timeLabel(c.h, c.m)); else setFailed(true);
    } catch { setFailed(true); } finally { setBusy(false); }
  }

  if (setFor) return <p role="status" style={{ ...muted, margin: "14px 0 0" }}>Reminder set for {setFor}. The draft will be waiting.</p>;
  if (!choices.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 14 }}>
      <span style={muted}>Not now? Remind me</span>
      {choices.map((c) => (
        <button key={c.label} type="button" className="bm-ink-link" disabled={busy} onClick={() => pick(c)}
          style={{ ...muted, color: ink, background: "none", border: `1px solid ${ink}`, borderRadius: 999, padding: "6px 12px", cursor: "pointer", fontFamily: "inherit" }}>
          {c.label}
        </button>
      ))}
      {failed ? <span style={muted}>Could not save. Try again.</span> : null}
    </div>
  );
}
