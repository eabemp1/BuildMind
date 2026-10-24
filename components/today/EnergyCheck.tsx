"use client";

import React from "react";
import { fetchBehaviorState, persistBehaviorState } from "@/lib/userBehaviorState";
import type { EnergyChoice } from "@/lib/founderState";

/**
 * One tap on how you are right now. BuildMind uses it (with the hour, your
 * recent writing and what you've swapped out) to size today's task and to hold
 * big decisions until you're rested. Flat and compact; skippable.
 */

const CHOICES: Array<{ key: EnergyChoice; label: string }> = [
  { key: "fresh", label: "Fresh" },
  { key: "ok", label: "Okay" },
  { key: "low", label: "Low" },
  { key: "wiped", label: "Wiped" },
];

const SIX_HOURS = 6 * 3_600_000;
const DISMISS_KEY = "bm_energy_dismissed_at";

function readDismissed(): number {
  try { return Number(window.localStorage.getItem(DISMISS_KEY) ?? 0) || 0; } catch { return 0; }
}

export default function EnergyCheck({ inferredNote, onLighten }: { inferredNote?: string | null; onLighten?: () => void | Promise<void> }) {
  const [level, setLevel] = React.useState<EnergyChoice | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [hidden, setHidden] = React.useState(false);
  const [changing, setChanging] = React.useState(false);
  const [lightened, setLightened] = React.useState(false);
  const [quiet, setQuiet] = React.useState<{ available: boolean; quietToday: boolean; canTakeToday: boolean; nextAllowed: string | null } | null>(null);
  const [quietMsg, setQuietMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    let live = true;
    if (Date.now() - readDismissed() < 3 * 3_600_000) setHidden(true);
    void fetchBehaviorState<{ founder_energy: { level?: EnergyChoice; at?: string } }>(["founder_energy"]).then((v) => {
      if (!live) return;
      const e = v.founder_energy;
      if (e?.level && e.at && Date.now() - Date.parse(e.at) <= SIX_HOURS) setLevel(e.level);
      setLoaded(true);
    });
    void fetch("/api/today/quiet-day", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live && j?.ok) setQuiet({ available: Boolean(j.available), quietToday: Boolean(j.quietToday), canTakeToday: Boolean(j.canTakeToday), nextAllowed: j.nextAllowed ?? null }); })
      .catch(() => { /* optional */ });
    return () => { live = false; };
  }, []);

  async function takeQuietDay() {
    setQuietMsg("Saving...");
    try {
      const r = await fetch("/api/today/quiet-day", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ day: "today" }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j?.ok) { setQuiet((q) => (q ? { ...q, quietToday: true, canTakeToday: false } : q)); setQuietMsg(null); }
      else setQuietMsg(j?.error ?? "Could not save that. Try again.");
    } catch { setQuietMsg("Could not save that. Try again."); }
  }

  async function pick(l: EnergyChoice) {
    setLevel(l); setChanging(false); setLightened(false);
    await persistBehaviorState({ founder_energy: { level: l, at: new Date().toISOString() } });
  }
  function dismiss() {
    setHidden(true);
    try { window.localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* optional */ }
  }

  if (!loaded) return null;
  // Resting today: say so once, calmly, and stop asking for anything.
  if (quiet?.quietToday) {
    return (
      <div style={{ padding: "6px 2px", marginBottom: 12, fontSize: 12.5, color: "var(--bm-text3)", lineHeight: 1.5 }}>
        Quiet day. Your streak is safe and there are no reminders today. Today's task is here when you want it.
      </div>
    );
  }
  const hour = new Date().getHours();
  const late = hour >= 23 || hour <= 4;
  const low = level === "low" || level === "wiped";

  const chip = (active: boolean): React.CSSProperties => ({
    border: `1px solid ${active ? "var(--bm-accent)" : "var(--bm-border)"}`,
    background: active ? "var(--bm-accent-dim)" : "transparent",
    color: active ? "var(--bm-text)" : "var(--bm-text2)",
    borderRadius: 6, padding: "5px 10px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", minHeight: 30,
  });
  const box: React.CSSProperties = { border: "1px solid var(--bm-border)", borderRadius: 10, background: "var(--bm-bg2)", padding: "10px 12px", marginBottom: 12, minWidth: 0, overflowWrap: "anywhere" };
  const small: React.CSSProperties = { fontSize: 12, color: "var(--bm-text3)" };

  const note = late && level !== "fresh"
    ? "It's late. Big decisions can wait until morning."
    : inferredNote ?? null;

  // Answered: one quiet line, with a way to lighten the task when you're low.
  if (level && !changing) {
    if (!low && !note) return null;
    return (
      <div style={box}>
        <div style={{ ...small, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span>{low ? `You said you're ${level === "wiped" ? "wiped" : "low"}.` : null} {note}</span>
          <button type="button" style={{ ...chip(false), padding: "2px 8px", minHeight: 24 }} onClick={() => setChanging(true)}>Change</button>
        </div>
        {low && onLighten && !lightened && (
          <button type="button" style={{ ...chip(true), marginTop: 8 }} onClick={async () => { setLightened(true); await onLighten(); }}>
            Make today's task lighter
          </button>
        )}
        {lightened && <div style={{ ...small, marginTop: 6 }}>Finding a smaller version of the same work.</div>}
        {low && quiet?.canTakeToday && (
          <div style={{ ...small, marginTop: 8 }}>
            Or rest today without losing your streak.{" "}
            <button type="button" style={{ ...chip(false), border: "none", padding: "2px 6px", minHeight: 24, textDecoration: "underline" }} onClick={() => void takeQuietDay()}>Take a quiet day</button>
            {quietMsg ? <span> {quietMsg}</span> : null}
          </div>
        )}
      </div>
    );
  }

  if (hidden && !changing) return note ? <div style={box}><span style={small}>{note}</span></div> : null;

  return (
    <div style={box}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--bm-text2)", marginBottom: 6 }}>How are you right now?</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {CHOICES.map((c) => (
          <button key={c.key} type="button" style={chip(level === c.key)} onClick={() => void pick(c.key)}>{c.label}</button>
        ))}
        {!changing && <button type="button" style={{ ...chip(false), border: "none", color: "var(--bm-text3)" }} onClick={dismiss}>Not now</button>}
      </div>
      {note && <div style={{ ...small, marginTop: 6 }}>{note}</div>}
      {quiet?.canTakeToday && (
        <div style={{ ...small, marginTop: 6 }}>
          Need a rest day? It will not break your streak.{" "}
          <button type="button" style={{ ...chip(false), border: "none", padding: "2px 6px", minHeight: 24, textDecoration: "underline" }} onClick={() => void takeQuietDay()}>Take a quiet day</button>
          {quietMsg ? <span> {quietMsg}</span> : null}
        </div>
      )}
    </div>
  );
}
