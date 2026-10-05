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

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const STORAGE_KEY = "bm_focus_state_v1";

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

  // Colour identity: the card takes the colour of the part of the day you are in
  // (gold morning, teal afternoon, violet evening) and turns green once the action is done.
  const hour = now.getHours();
  const pal = done
    ? { c: "var(--bm-green, #4ade80)", dim: "rgba(74,222,128,0.14)", bd: "rgba(74,222,128,0.4)", tint: "rgba(74,222,128,0.10)", name: "done" }
    : hour < 12
      ? { c: "#E8C547", dim: "rgba(232,197,71,0.14)", bd: "rgba(232,197,71,0.4)", tint: "rgba(232,197,71,0.10)", name: "morning" }
      : hour < 18
        ? { c: "#4AB8B0", dim: "rgba(74,184,176,0.14)", bd: "rgba(74,184,176,0.4)", tint: "rgba(74,184,176,0.10)", name: "afternoon" }
        : { c: "#9B87F5", dim: "rgba(155,135,245,0.15)", bd: "rgba(155,135,245,0.4)", tint: "rgba(155,135,245,0.12)", name: "evening" };
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 18 ? "Good afternoon" : "Good evening";
  const dayLeft = arc.phase === "late" ? "The day is wrapping up" : `${arc.hoursLeft > 0 ? `${arc.hoursLeft}h ` : ""}${arc.minutesLeft}m left in your day`;
  const streakNow = snap?.streak ?? streak;
  const display: React.CSSProperties = { fontFamily: "'Syne', sans-serif" };
  const mono: React.CSSProperties = { fontFamily: "'DM Mono', monospace" };
  const RING = 132;
  const R = 56;
  const C = 2 * Math.PI * R;
  const tile: React.CSSProperties = { background: "var(--bm-bg3)", borderRadius: 12, padding: "10px 12px", minWidth: 0 };

  return (
    <section
      aria-label="Today command center"
      style={{
        margin: "4px 0 18px", padding: "20px 18px", borderRadius: 20, boxSizing: "border-box", minWidth: 0,
        background: `linear-gradient(160deg, ${pal.tint} 0%, var(--bm-bg2) 40%, var(--bm-bg) 100%)`,
        border: `1px solid ${running ? pal.c : pal.bd}`,
        boxShadow: running ? `0 0 0 3px ${pal.dim}` : "none",
        display: "flex", flexDirection: "column", gap: 18, transition: "box-shadow .3s, border-color .3s",
      }}
    >
      {/* Greeting + day arc */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ ...display, fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--bm-text)" }}>
            {done ? "Done for today" : greeting}
          </div>
          <div style={{ fontSize: 14, color: "var(--bm-text3)", marginTop: 2 }}>
            {now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })} &middot; {dayLeft}
          </div>
        </div>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("bm:open-palette"))}
          aria-label="Open command palette"
          style={{ ...mono, fontSize: 12, color: "var(--bm-text3)", background: "var(--bm-bg3)", border: "1px solid var(--bm-border)", borderRadius: 10, padding: "8px 12px", cursor: "pointer" }}
        >
          Jump to&hellip; <span style={{ opacity: 0.7 }}>Ctrl K</span>
        </button>
      </div>

      <div aria-hidden style={{ position: "relative", height: 6, borderRadius: 3, background: "var(--bm-border2)", margin: "-6px 0 0" }}>
        <div style={{ position: "absolute", inset: 0, width: `${arc.progress * 100}%`, borderRadius: 3, background: `linear-gradient(90deg, ${pal.dim}, ${pal.c})`, transition: "width 1s linear" }} />
        <div style={{ position: "absolute", top: -3, left: `calc(${arc.progress * 100}% - 6px)`, width: 12, height: 12, borderRadius: "50%", background: pal.c, boxShadow: `0 0 0 3px ${pal.dim}` }} />
      </div>

      {/* Completion payoff, real numbers */}
      {done && (
        <div role="status" style={{ padding: "12px 14px", borderRadius: 12, background: "var(--bm-green-dim, var(--bm-bg3))", border: "1px solid var(--bm-green, var(--bm-border))", fontSize: 14, color: "var(--bm-text)", lineHeight: 1.55 }}>
          {[
            `${streakNow}-day streak`,
            snap ? `${snap.activeDaysThisWeek} of ${snap.daysElapsedThisWeek} days this week` : null,
            focus.minutesToday > 0 ? `${focus.minutesToday} minutes focused` : null,
          ].filter(Boolean).join("  \u00b7  ")}
        </div>
      )}

      {/* Focus block: big timer, one clear primary action */}
      <div style={{ display: "flex", gap: 22, alignItems: "center", flexWrap: "wrap", minWidth: 0 }}>
        <div style={{ position: "relative", width: RING, height: RING, flex: "0 0 auto", margin: "0 auto" }}>
          <svg width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`} role="img" aria-label={`Focus timer ${formatClock(left)}`}>
            <circle cx={RING / 2} cy={RING / 2} r={R} fill="none" stroke="var(--bm-border2)" strokeWidth="8" />
            <circle
              cx={RING / 2} cy={RING / 2} r={R} fill="none" strokeWidth="8" strokeLinecap="round"
              stroke={finished ? "var(--bm-green)" : pal.c}
              strokeDasharray={C} strokeDashoffset={C * (1 - ringProgress)}
              transform={`rotate(-90 ${RING / 2} ${RING / 2})`} style={{ transition: "stroke-dashoffset 0.9s linear" }}
            />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <span style={{ ...mono, fontSize: 28, fontWeight: 600, color: "var(--bm-text)", lineHeight: 1 }}>{done && focus.mode === "idle" ? "\u2713" : formatClock(left)}</span>
            <span style={{ fontSize: 12, color: "var(--bm-text3)", marginTop: 4 }}>
              {running ? "Focusing" : paused ? "Paused" : finished ? "Block done" : done ? "Finished" : "Ready"}
            </span>
          </div>
        </div>

        <div style={{ flex: "1 1 240px", minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 15, color: "var(--bm-text2)", lineHeight: 1.5 }}>
            {actionTitle
              ? <><span style={{ color: "var(--bm-text3)" }}>Focus on</span><br /><strong style={{ color: "var(--bm-text)", fontSize: 16 }}>{actionTitle}</strong></>
              : "Focus blocks unlock once today's action is ready."}
          </div>

          {focus.mode === "idle" && !done && (
            <>
              <div role="group" aria-label="Block length" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {FOCUS_PRESETS.map((p) => (
                  <button key={p} type="button" aria-pressed={minutes === p} onClick={() => { setMinutes(p); setFocus((f) => resetFocus(f, p)); }}
                    style={{ ...mono, fontSize: 14, padding: "9px 14px", borderRadius: 10, cursor: "pointer", color: minutes === p ? "#15130a" : "var(--bm-text2)", background: minutes === p ? pal.c : "var(--bm-bg3)", border: "1px solid var(--bm-border)" }}>
                    {p}m
                  </button>
                ))}
              </div>
              <button type="button" onClick={start} disabled={!actionTitle}
                style={{ fontSize: 16, fontWeight: 700, padding: "14px 20px", borderRadius: 12, cursor: actionTitle ? "pointer" : "not-allowed", opacity: actionTitle ? 1 : 0.5, color: "#15130a", background: pal.c, border: "none", fontFamily: "inherit", width: "100%" }}>
                Start {minutes}-minute focus
              </button>
            </>
          )}

          {running && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button type="button" onClick={() => setFocus((f) => pauseFocus(f, new Date()))} style={btn("var(--bm-bg3)", "var(--bm-text2)")}>Pause</button>
              <button type="button" onClick={() => setFocus((f) => resetFocus(f, minutes))} style={btn("var(--bm-bg3)", "var(--bm-text3)")}>Stop</button>
            </div>
          )}
          {paused && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button type="button" onClick={() => setFocus((f) => resumeFocus(f, new Date()))} style={btn(pal.c, "#15130a")}>Resume</button>
              <button type="button" onClick={() => setFocus((f) => resetFocus(f, minutes))} style={btn("var(--bm-bg3)", "var(--bm-text3)")}>Stop</button>
            </div>
          )}
          {finished && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button type="button" onClick={goToCheckIn} style={btn("var(--bm-green)", "#fff")}>{done ? "Reflect on it" : "Log how it went"}</button>
              <button type="button" onClick={() => setFocus((f) => startFocus({ ...f, mode: "idle" }, minutes, new Date()))} style={btn("var(--bm-bg3)", "var(--bm-text2)")}>Another {minutes}m</button>
            </div>
          )}
          {focus.mode === "idle" && done && (
            <button type="button" onClick={goToCheckIn} style={{ ...btn("var(--bm-bg3)", "var(--bm-text2)"), alignSelf: "flex-start" }}>Reflect on today</button>
          )}
        </div>
      </div>

      {/* Real numbers, readable at a glance */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
        <div style={tile}>
          <div style={{ ...mono, fontSize: 20, fontWeight: 600, color: pal.c }}>{streakNow}</div>
          <div style={{ fontSize: 12, color: "var(--bm-text3)" }}>day streak</div>
        </div>
        <div style={tile}>
          <div style={{ ...mono, fontSize: 20, fontWeight: 600, color: "var(--bm-text)" }}>{snap ? `${snap.activeDaysThisWeek}/${snap.daysElapsedThisWeek}` : "-"}</div>
          <div style={{ fontSize: 12, color: "var(--bm-text3)" }}>days this week</div>
        </div>
        <div style={tile}>
          <div style={{ ...mono, fontSize: 20, fontWeight: 600, color: "var(--bm-text)" }}>{focus.minutesToday}m</div>
          <div style={{ fontSize: 12, color: "var(--bm-text3)" }}>focused today</div>
        </div>
      </div>

      {/* Week strip with day names */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 8 }}>
        {(snap?.weekDays ?? Array.from({ length: 7 }, (_, i) => ({ date: String(i), done: false, isToday: false, isFuture: false }))).map((d, i) => (
          <div key={d.date} title={d.date} style={{ textAlign: "center", minWidth: 0 }}>
            <div style={{ fontSize: 12, color: d.isToday ? pal.c : "var(--bm-text4)", fontWeight: d.isToday ? 700 : 400, marginBottom: 5 }}>{WEEKDAY_LABELS[i]}</div>
            <div
              style={{
                height: 32, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
                background: d.done ? "var(--bm-green)" : d.isToday ? pal.dim : "var(--bm-bg3)",
                border: `1px solid ${d.isToday ? pal.bd : "var(--bm-border)"}`,
                color: d.done ? "#fff" : "var(--bm-text4)", opacity: d.isFuture ? 0.45 : 1,
              }}
            >
              {d.done ? "\u2713" : ""}
            </div>
          </div>
        ))}
      </div>

      {/* Nudge */}
      <div style={{ borderTop: "1px solid var(--bm-border)", paddingTop: 12, fontSize: 14, color: "var(--bm-text2)", lineHeight: 1.6 }}>{nudge}</div>
    </section>
  );
}

function btn(bg: string, color: string): React.CSSProperties {
  return { fontSize: 14, fontWeight: 600, padding: "11px 18px", borderRadius: 10, cursor: "pointer", color, background: bg, border: "1px solid var(--bm-border)", fontFamily: "inherit" };
                }
