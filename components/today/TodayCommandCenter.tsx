"use client";

/**
 * components/today/TodayCommandCenter.tsx
 *
 * The control surface at the top of Today. It adds, without touching any
 * existing Today logic:
 *   1. Day arc      — how much of the working day is left, with a "now" marker.
 *   2. Week strip   — Mon..Sun with a dot for every day you completed an action.
 *   3. Focus block  — a timer bound to today's action. Length is suggested from
 *                     the action's own time estimate; it survives reloads, shows
 *                     the countdown in the tab title, and when it ends it leads
 *                     straight to logging the outcome.
 *   4. Nudge line   — one sentence built only from real numbers (streak, pace vs
 *                     last week, momentum change, time left). No AI call.
 *
 * Data: GET /api/founder-context/snapshot (the same source as the Cofounder
 * Pulse and Morning Briefing, so numbers never disagree). All timer state is
 * local and per-day. Layout uses minmax(0, 1fr) grids and wrapping flex so
 * nothing can overflow a phone screen.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { storage } from "@/lib/storage";
import {
  FOCUS_PRESETS, dayArc, finishBlock, formatClock, nearestPreset, normalizeFocusState, nudgeLine,
  parseSuggestedMinutes, pauseFocus, resetFocus, resumeFocus, secondsLeft, startFocus,
  type FocusState,
} from "@/lib/todayFocus";

type WeekDay = { date: string; done: boolean; isToday: boolean; isFuture: boolean };
type Snap = {
  momentum: number | null; momentumDelta: number | null; calibrating: boolean; streak: number;
  activeDaysThisWeek: number; daysElapsedThisWeek: number; activeDaysLastWeekSamePoint: number;
  completedToday: boolean; weekDays?: WeekDay[];
};

export interface TodayCommandCenterProps {
  actionTitle: string | null;
  timeText: string | null;
  done: boolean;
  streak: number;
}

const WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
const STORAGE_KEY = "bm_focus_state_v1";
const RING_R = 34;
const RING_C = 2 * Math.PI * RING_R;

export default function TodayCommandCenter({ actionTitle, timeText, done, streak }: TodayCommandCenterProps) {
  const suggested = useMemo(() => parseSuggestedMinutes(timeText), [timeText]);
  const defaultMinutes = suggested ? nearestPreset(suggested) : 25;

  const [now, setNow] = useState<Date>(() => new Date());
  const [focus, setFocus] = useState<FocusState>(() => normalizeFocusState(null, new Date(), defaultMinutes));
  const [minutes, setMinutes] = useState<number>(defaultMinutes);
  const [snap, setSnap] = useState<Snap | null>(null);
  const hydrated = useRef(false);
  const finishedAnnounced = useRef(false);

  // ── Load persisted focus state once (per-user storage is ready client-side) ──
  useEffect(() => {
    const stored = storage.getJSON<FocusState | null>(STORAGE_KEY, null);
    const next = normalizeFocusState(stored, new Date(), defaultMinutes);
    setFocus(next);
    if (next.mode !== "idle") setMinutes(Math.round(next.durationSec / 60));
    hydrated.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (hydrated.current) storage.setJSON(STORAGE_KEY, focus);
  }, [focus]);

  // ── Keep the idle default in step with the action's estimate ──
  useEffect(() => {
    setMinutes((m) => (focus.mode === "idle" ? defaultMinutes : m));
    setFocus((f) => (f.mode === "idle" ? resetFocus(f, defaultMinutes) : f));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultMinutes]);

  // ── Snapshot (refetched when the day's action is completed) ──
  useEffect(() => {
    let cancelled = false;
    fetch("/api/founder-context/snapshot", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled && j?.ok && j.data) setSnap(j.data as Snap); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [done]);

  // ── One-second clock; finishes a running block when its end time passes ──
  useEffect(() => {
    const id = setInterval(() => {
      const d = new Date();
      setNow(d);
      setFocus((f) => (f.mode === "running" && f.endAt !== null && f.endAt <= d.getTime() ? finishBlock(f) : f));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // ── Tab title countdown while running ──
  const left = secondsLeft(focus, now);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const base = document.title.replace(/^(⏱ \d\d:\d\d · |✅ Focus done · )/, "");
    if (focus.mode === "running") document.title = `⏱ ${formatClock(left)} · ${base}`;
    else if (focus.mode === "finished") document.title = `✅ Focus done · ${base}`;
    else document.title = base;
    return () => { document.title = base; };
  }, [focus.mode, left]);

  // ── Block finished: haptic + bring the outcome check-in into view once ──
  useEffect(() => {
    if (focus.mode === "finished" && !finishedAnnounced.current) {
      finishedAnnounced.current = true;
      try { navigator.vibrate?.([120, 60, 120]); } catch { /* optional */ }
    }
    if (focus.mode !== "finished") finishedAnnounced.current = false;
  }, [focus.mode]);

  // ── Command palette → "Start focus session" ──
  const start = useCallback(() => setFocus((f) => startFocus(f, minutes, new Date())), [minutes]);
  useEffect(() => {
    const onStart = () => setFocus((f) => (f.mode === "running" ? f : startFocus(f, minutes, new Date())));
    window.addEventListener("bm:focus-start", onStart);
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("focus") === "1") onStart();
    return () => window.removeEventListener("bm:focus-start", onStart);
  }, [minutes]);

  const goToCheckIn = () => document.getElementById("today-action")?.scrollIntoView({ behavior: "smooth", block: "start" });
  const arc = dayArc(now);
  const running = focus.mode === "running";
  const paused = focus.mode === "paused";
  const finished = focus.mode === "finished";
  const total = Math.max(1, focus.durationSec);
  const ringProgress = finished ? 1 : focus.mode === "idle" ? 0 : 1 - left / total;

  const nudge = nudgeLine({
    now, done, streak: snap?.streak ?? streak, focusMinutesToday: focus.minutesToday,
    activeDaysThisWeek: snap?.activeDaysThisWeek, activeDaysLastWeekSamePoint: snap?.activeDaysLastWeekSamePoint,
    momentumDelta: snap?.calibrating ? null : snap?.momentumDelta ?? null, suggestedMinutes: suggested,
  });

  const card: React.CSSProperties = {
    background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 14,
    padding: "14px 14px 12px", minWidth: 0, boxSizing: "border-box",
  };
  const mono: React.CSSProperties = { fontFamily: "'DM Mono', monospace" };

  return (
    <section aria-label="Today command center" style={{ ...card, margin: "16px 0 4px", display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Header: date + day arc + palette hint */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", minWidth: 0 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ ...mono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--bm-text4)" }}>
            {now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" })}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--bm-text)", marginTop: 2 }}>
            {arc.phase === "late" ? "Day is wrapping up" : `${arc.hoursLeft > 0 ? `${arc.hoursLeft}h ` : ""}${arc.minutesLeft}m left in your day`}
          </div>
        </div>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("bm:open-palette"))}
          aria-label="Open command palette"
          style={{ ...mono, fontSize: 10, color: "var(--bm-text3)", background: "var(--bm-bg3)", border: "1px solid var(--bm-border)", borderRadius: 8, padding: "6px 9px", cursor: "pointer" }}
        >
          Jump to… <span style={{ opacity: 0.7 }}>Ctrl K</span>
        </button>
      </div>

      {/* Day arc */}
      <div aria-hidden style={{ position: "relative", height: 6, borderRadius: 3, background: "var(--bm-border2)" }}>
        <div style={{ position: "absolute", inset: 0, width: `${arc.progress * 100}%`, borderRadius: 3, background: "linear-gradient(90deg, var(--bm-accent-dim), var(--bm-accent))", transition: "width 1s linear" }} />
        <div style={{ position: "absolute", top: -3, left: `calc(${arc.progress * 100}% - 6px)`, width: 12, height: 12, borderRadius: "50%", background: "var(--bm-accent)", boxShadow: "0 0 0 3px var(--bm-accent-dim)" }} />
      </div>

      {/* Week strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 6 }}>
        {(snap?.weekDays ?? Array.from({ length: 7 }, (_, i) => ({ date: String(i), done: false, isToday: false, isFuture: false }))).map((d, i) => (
          <div key={d.date} title={d.date} style={{ textAlign: "center", minWidth: 0 }}>
            <div style={{ ...mono, fontSize: 9, color: d.isToday ? "var(--bm-accent)" : "var(--bm-text4)", marginBottom: 4 }}>{WEEKDAY_LABELS[i]}</div>
            <div
              style={{
                height: 26, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12,
                background: d.done ? "var(--bm-green)" : d.isToday ? "var(--bm-accent-dim)" : "var(--bm-bg3)",
                border: `1px solid ${d.isToday ? "var(--bm-accent-bd)" : "var(--bm-border)"}`,
                color: d.done ? "#fff" : "var(--bm-text4)", opacity: d.isFuture ? 0.45 : 1,
              }}
            >
              {d.done ? "✓" : ""}
            </div>
          </div>
        ))}
      </div>

      {/* Focus block */}
      <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", minWidth: 0 }}>
        <div style={{ position: "relative", width: 84, height: 84, flex: "0 0 auto" }}>
          <svg width="84" height="84" viewBox="0 0 84 84" role="img" aria-label={`Focus timer ${formatClock(left)}`}>
            <circle cx="42" cy="42" r={RING_R} fill="none" stroke="var(--bm-border2)" strokeWidth="6" />
            <circle
              cx="42" cy="42" r={RING_R} fill="none" strokeWidth="6" strokeLinecap="round"
              stroke={finished ? "var(--bm-green)" : "var(--bm-accent)"}
              strokeDasharray={RING_C} strokeDashoffset={RING_C * (1 - ringProgress)}
              transform="rotate(-90 42 42)" style={{ transition: "stroke-dashoffset 0.9s linear" }}
            />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <span style={{ ...mono, fontSize: 15, fontWeight: 600, color: "var(--bm-text)" }}>{done && focus.mode === "idle" ? "✓" : formatClock(left)}</span>
            <span style={{ ...mono, fontSize: 8, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--bm-text4)" }}>
              {running ? "focus" : paused ? "paused" : finished ? "done" : "ready"}
            </span>
          </div>
        </div>

        <div style={{ flex: "1 1 180px", minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 12, color: "var(--bm-text2)", lineHeight: 1.45, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
            {actionTitle ? <>Focus on: <strong style={{ color: "var(--bm-text)" }}>{actionTitle}</strong></> : "Focus blocks unlock once today's action is ready."}
          </div>

          {focus.mode === "idle" && !done && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
              {FOCUS_PRESETS.map((p) => (
                <button key={p} type="button" onClick={() => { setMinutes(p); setFocus((f) => resetFocus(f, p)); }}
                  style={{ ...mono, fontSize: 11, padding: "6px 10px", borderRadius: 8, cursor: "pointer", color: minutes === p ? "#fff" : "var(--bm-text2)", background: minutes === p ? "var(--bm-accent)" : "var(--bm-bg3)", border: "1px solid var(--bm-border)" }}>
                  {p}m
                </button>
              ))}
              <button type="button" onClick={start} disabled={!actionTitle}
                style={{ fontSize: 12, fontWeight: 700, padding: "7px 14px", borderRadius: 8, cursor: actionTitle ? "pointer" : "not-allowed", opacity: actionTitle ? 1 : 0.5, color: "#fff", background: "var(--bm-accent)", border: "none" }}>
                Start focus
              </button>
            </div>
          )}

          {running && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              <button type="button" onClick={() => setFocus((f) => pauseFocus(f, new Date()))} style={btn("var(--bm-bg3)", "var(--bm-text2)")}>Pause</button>
              <button type="button" onClick={() => setFocus((f) => resetFocus(f, minutes))} style={btn("var(--bm-bg3)", "var(--bm-text3)")}>Stop</button>
            </div>
          )}
          {paused && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              <button type="button" onClick={() => setFocus((f) => resumeFocus(f, new Date()))} style={btn("var(--bm-accent)", "#fff")}>Resume</button>
              <button type="button" onClick={() => setFocus((f) => resetFocus(f, minutes))} style={btn("var(--bm-bg3)", "var(--bm-text3)")}>Stop</button>
            </div>
          )}
          {finished && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              <button type="button" onClick={goToCheckIn} style={btn("var(--bm-green)", "#fff")}>{done ? "Reflect on it" : "Log how it went →"}</button>
              <button type="button" onClick={() => setFocus((f) => startFocus({ ...f, mode: "idle" }, minutes, new Date()))} style={btn("var(--bm-bg3)", "var(--bm-text2)")}>Another {minutes}m</button>
            </div>
          )}
          {focus.mode === "idle" && done && (
            <button type="button" onClick={goToCheckIn} style={{ ...btn("var(--bm-bg3)", "var(--bm-text2)"), alignSelf: "flex-start" }}>Reflect on today →</button>
          )}
        </div>
      </div>

      {/* Nudge + today's focus tally */}
      <div style={{ borderTop: "1px solid var(--bm-border)", paddingTop: 10, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, color: "var(--bm-text2)", lineHeight: 1.55, flex: "1 1 220px", minWidth: 0 }}>{nudge}</div>
        {focus.blocksToday > 0 && (
          <div style={{ ...mono, fontSize: 10, color: "var(--bm-text3)", whiteSpace: "nowrap" }}>
            {focus.blocksToday} block{focus.blocksToday === 1 ? "" : "s"} · {focus.minutesToday}m focused
          </div>
        )}
      </div>
    </section>
  );
}

function btn(bg: string, color: string): React.CSSProperties {
  return { fontSize: 12, fontWeight: 600, padding: "7px 12px", borderRadius: 8, cursor: "pointer", color, background: bg, border: "1px solid var(--bm-border)", fontFamily: "inherit" };
}
