"use client";

import React from "react";
import {
  EVENING_BLOCKERS, EVENING_OUTCOMES, NOTE_MAX, TOMORROW_MAX, canSubmit, closingLine, needsBlocker,
  type EveningBlocker, type EveningOutcome,
} from "@/lib/today/evening";
import { DURATION_CHOICES, defaultChoiceFor, defaultMeasure, looksLikeOpenLoop, type DurationChoice } from "@/lib/today/loops";

/**
 * Evening close-out: four quick answers that become a real reflection.
 * Flat and compact. Nothing here is decorative; each answer changes what
 * Today, Mirror and the Co-founder do tomorrow.
 */

const chip = (active: boolean): React.CSSProperties => ({
  border: `1px solid ${active ? "var(--bm-accent)" : "var(--bm-border)"}`,
  background: active ? "var(--bm-accent-dim)" : "transparent",
  color: active ? "var(--bm-text)" : "var(--bm-text3)",
  borderRadius: 6, padding: "6px 10px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", minHeight: 32,
});
const label: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "var(--bm-text2)", marginBottom: 6 };
const field: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", background: "var(--bm-bg3)", border: "1px solid var(--bm-border)",
  borderRadius: 8, padding: "8px 10px", fontSize: 13, color: "var(--bm-text)", fontFamily: "inherit",
};

export default function EveningCloseout({ task, projectId, onSaved }: { task?: string | null; projectId?: string | null; onSaved?: () => void }) {
  const [outcome, setOutcome] = React.useState<EveningOutcome | null>(null);
  const [blocker, setBlocker] = React.useState<EveningBlocker | null>(null);
  const [note, setNote] = React.useState("");
  const [tomorrow, setTomorrow] = React.useState("");
  const [follow, setFollow] = React.useState<DurationChoice | null>(null);
  const [followTouched, setFollowTouched] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState<string | null>(null);
  const [err, setErr] = React.useState("");

  const pending = looksLikeOpenLoop(note, tomorrow);
  React.useEffect(() => {
    if (followTouched) return;
    setFollow(pending ? defaultChoiceFor(`${note} ${tomorrow}`) : null);
  }, [pending, note, tomorrow, followTouched]);

  const ready = canSubmit({ outcome, blocker, note });

  async function save() {
    if (!outcome || !ready || busy) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/evening-checkin", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: note.trim(), outcome, blocker: needsBlocker(outcome) ? blocker : null, tomorrow: tomorrow.trim() || null, task: task ?? null, projectId: projectId ?? null }),
      });
      if (!r.ok) throw new Error("save failed");
      if (follow && task) {
        const taskText = task.slice(0, 500);
        await fetch("/api/today/loops", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task_text: taskText.length >= 3 ? taskText : "Follow up", measure: defaultMeasure(taskText, note).slice(0, 300), choice: follow, projectId: projectId ?? null }),
        }).catch(() => {});
      }
      setDone(closingLine(outcome, tomorrow));
      onSaved?.();
    } catch {
      setErr("Couldn't save that. Try again.");
    } finally { setBusy(false); }
  }

  const box: React.CSSProperties = { border: "1px solid var(--bm-border)", borderRadius: 10, background: "var(--bm-bg2)", padding: 14, minWidth: 0, overflowWrap: "anywhere" };

  if (done) {
    return (
      <div style={box}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--bm-text)" }}>{done}</div>
        {follow && <div style={{ fontSize: 12, color: "var(--bm-text3)", marginTop: 4 }}>I'll ask for the result {DURATION_CHOICES[follow].label.toLowerCase()}.</div>}
      </div>
    );
  }

  return (
    <div style={box}>
      <div style={{ fontSize: 11, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 }}>Evening close-out</div>
      {task && <div style={{ fontSize: 13, color: "var(--bm-text)", fontWeight: 600, marginBottom: 12, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{task}</div>}

      <div style={label}>What happened to it?</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {EVENING_OUTCOMES.map((o) => (
          <button key={o.key} type="button" style={chip(outcome === o.key)} onClick={() => { setOutcome(o.key); if (o.key === "done") setBlocker(null); }}>{o.label}</button>
        ))}
      </div>

      {outcome && needsBlocker(outcome) && (
        <>
          <div style={label}>What got in the way?</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            {EVENING_BLOCKERS.map((b) => (
              <button key={b.key} type="button" style={chip(blocker === b.key)} onClick={() => setBlocker(b.key)}>{b.label}</button>
            ))}
          </div>
        </>
      )}

      {outcome && (
        <>
          <div style={label}>{outcome === "done" ? "What exactly did you do, and what came back?" : "What actually happened? Be specific."}</div>
          <textarea value={note} maxLength={NOTE_MAX} rows={2} onChange={(e) => setNote(e.target.value)} placeholder={outcome === "done" ? "Sent 12 DMs, 2 replied…" : "I opened it, rewrote it twice, never sent it…"} style={{ ...field, resize: "vertical", marginBottom: 12 }} />

          <div style={label}>Tomorrow's first move <span style={{ fontWeight: 400, color: "var(--bm-text3)" }}>(optional)</span></div>
          <input value={tomorrow} maxLength={TOMORROW_MAX} onChange={(e) => setTomorrow(e.target.value)} placeholder="The first thing you'll do, before anything else" style={{ ...field, marginBottom: 12 }} />

          {pending && task && (
            <div style={{ marginBottom: 12 }}>
              <div style={label}>You're waiting on a result. Check back?</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button type="button" style={chip(follow === null)} onClick={() => { setFollowTouched(true); setFollow(null); }}>No</button>
                {(Object.keys(DURATION_CHOICES) as DurationChoice[]).map((k) => (
                  <button key={k} type="button" style={chip(follow === k)} onClick={() => { setFollowTouched(true); setFollow(k); }}>{DURATION_CHOICES[k].label}</button>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button type="button" disabled={!ready || busy} onClick={save} style={{ ...chip(true), padding: "7px 14px", fontWeight: 600, opacity: ready && !busy ? 1 : 0.5, cursor: ready && !busy ? "pointer" : "default" }}>
              {busy ? "Saving…" : "Close out the day"}
            </button>
            {!ready && <span style={{ fontSize: 11, color: "var(--bm-text3)" }}>{needsBlocker(outcome) && !blocker ? "Pick what got in the way." : "Add a few words."}</span>}
            {err && <span style={{ fontSize: 12, color: "var(--bm-text2)" }}>{err}</span>}
          </div>
        </>
      )}
    </div>
  );
}
