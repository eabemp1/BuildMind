"use client";

/**
 * components/today/TodayCommandCenter.tsx
 *
 * Today's hero. The task sentence is the focal point AND the timer: while a
 * focus block runs, the words take the accent colour one by one, so the
 * sentence slowly "inks" as the time is spent. No ring, no tiles, no boxes:
 * one day line, the task, one way to start it, one line of real numbers.
 * (Original control-surface notes below still describe the data it uses.)
 *
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

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { storage } from "@/lib/storage";
import { useCountUp } from "@/components/today/useCountUp";
import { buildFocusIcs, detectPlatform, openAndroidTimer, openIcs, type Platform } from "@/lib/focusReminder";
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
  /** The task sentence as shown (may contain channel links). Falls back to actionTitle. */
  action?: React.ReactNode;
  kicker?: string;
  /** Colour for this kind of work; overridden by green once the action is done. */
  accent?: string;
  rationale?: React.ReactNode;
  reasons?: string[];
  expectedEvidence?: string;
  lowConfidence?: boolean;
  onExecute?: () => void;
  executeLabel?: string;
  actionTitle: string | null;
  timeText: string | null;
  done: boolean;
  streak: number;
  /** Shown in the phone reminder so the alert says what to start with. */
  firstStep?: string | null;
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const STORAGE_KEY = "bm_focus_state_v1";

export default function TodayCommandCenter({ action, kicker, accent, rationale, reasons, expectedEvidence, lowConfidence = false, onExecute, executeLabel = "Open script", actionTitle, timeText, done, streak, firstStep }: TodayCommandCenterProps) {
  const suggested = useMemo(() => parseSuggestedMinutes(timeText), [timeText]);
  const defaultMinutes = suggested ? nearestPreset(suggested) : 25;

  const [now, setNow] = useState<Date>(() => new Date());
  const [focus, setFocus] = useState<FocusState>(() => normalizeFocusState(null, new Date(), defaultMinutes));
  const [minutes, setMinutes] = useState<number>(defaultMinutes);
  const [snap, setSnap] = useState<Snap | null>(null);
  const [narrow, setNarrow] = useState(false);
  const [platform, setPlatform] = useState<Platform>("other");
  const [reminderNote, setReminderNote] = useState<string | null>(null);
  useEffect(() => { setPlatform(detectPlatform(navigator.userAgent, navigator.maxTouchPoints ?? 0)); }, []);
  useEffect(() => {
    const q = window.matchMedia("(max-width: 480px)");
    const apply = () => setNarrow(q.matches);
    apply();
    q.addEventListener("change", apply);
    return () => q.removeEventListener("change", apply);
  }, []);
  useEffect(() => { if (focus.mode !== "running") setReminderNote(null); }, [focus.mode]);
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
      // If the tab is in the background, say so with a system notification (needs permission already granted).
      try {
        if (document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification("Focus block done", { body: actionTitle ? `Log how "${actionTitle.slice(0, 60)}" went.` : "Log how it went.", tag: "bm-focus-done" });
        }
      } catch { /* optional */ }
    }
    if (focus.mode !== "finished") finishedAnnounced.current = false;
  }, [focus.mode]);

  // ── Phone reminders: one tap hands the block to the phone's own Clock or Calendar ──
  const addToCalendar = useCallback(() => {
    const startAt = new Date();
    const endAt = new Date(focus.endAt ?? startAt.getTime() + left * 1000);
    openIcs(buildFocusIcs({ task: actionTitle ?? "Focus block", start: startAt, end: endAt, firstStep: firstStep ?? undefined }), "buildmind-focus.ics", platform);
    setReminderNote(platform === "ios" ? "Tap Add in the Calendar sheet. It will alert when the block ends." : "Open the downloaded file to add it. It will alert when the block ends.");
  }, [actionTitle, firstStep, focus.endAt, left, platform]);
  const setPhoneTimer = useCallback(() => {
    openAndroidTimer(Math.max(1, left), actionTitle ?? "Focus block");
    setReminderNote("Your Clock app now has this timer, and it keeps running with BuildMind closed.");
  }, [actionTitle, left]);

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
  const progress = done ? 1 : finished ? 1 : focus.mode === "idle" ? 0 : 1 - left / total;

  const nudge = nudgeLine({
    now, done, streak: snap?.streak ?? streak, focusMinutesToday: focus.minutesToday,
    activeDaysThisWeek: snap?.activeDaysThisWeek, activeDaysLastWeekSamePoint: snap?.activeDaysLastWeekSamePoint,
    momentumDelta: snap?.calibrating ? null : snap?.momentumDelta ?? null, suggestedMinutes: suggested,
  });

  // One accent per day: the kind of work's colour, green once it's done.
  const ink = done ? "var(--bm-green, #4ade80)" : accent ?? "var(--bm-accent)";
  const dayLeft = arc.phase === "late" ? "day is wrapping up" : `${arc.hoursLeft > 0 ? `${arc.hoursLeft}h ` : ""}${arc.minutesLeft}m left`;
  const streakNow = snap?.streak ?? streak;
  const streakShown = useCountUp(streakNow);
  const display: React.CSSProperties = { fontFamily: "var(--font-syne), 'Syne', sans-serif" };
  const mono: React.CSSProperties = { fontFamily: "'DM Mono', monospace" };
  const link = (extra: React.CSSProperties = {}): React.CSSProperties => ({
    background: "none", border: "none", padding: "10px 2px", margin: 0, cursor: "pointer", font: "inherit", fontSize: 14,
    color: "var(--bm-text2)", textDecoration: "underline", textUnderlineOffset: 4, textDecorationColor: "var(--bm-border3)", ...extra,
  });
  const clockMin = (d: Date) => d.getHours() * 60 + d.getMinutes();
  const blockStart = focus.endAt !== null ? clockMin(new Date(focus.endAt - focus.durationSec * 1000)) : null;
  const blockEnd = focus.endAt !== null ? clockMin(new Date(focus.endAt)) : null;
  const week = snap?.weekDays ?? [];

  return (
    <section aria-label="Today" style={{ margin: "0 0 22px", minWidth: 0 }}>
      <style>{`
        @keyframes bm-word-in { from { opacity: 0; transform: translateY(0.35em); } to { opacity: 1; transform: none; } }
        .bm-ink-word { display: inline-block; animation: bm-word-in .6s cubic-bezier(.16,1,.3,1) both; transition: color .5s ease; }
        .bm-ink-btn:focus-visible, .bm-ink-link:focus-visible { outline: 2px solid ${ink}; outline-offset: 3px; border-radius: 6px; }
        @media (prefers-reduced-motion: reduce) { .bm-ink-word { animation: none; transition: none; } }
      `}</style>

      {/* The date and the day as one hairline: lit up to now, a running block drawn on it */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div suppressHydrationWarning style={{ ...display, fontSize: narrow ? 14 : 15, fontWeight: 600, color: "var(--bm-text)", letterSpacing: "-0.01em" }}>
          {now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
        </div>
        <div suppressHydrationWarning style={{ ...mono, fontSize: 12, color: "var(--bm-text3)" }}>{done ? "done for today" : dayLeft}</div>
      </div>
      <DayLine nowMin={clockMin(now)} color={ink} done={done} blockStart={running ? blockStart : null} blockEnd={running ? blockEnd : null} />

      <div style={{ marginTop: narrow ? 26 : 38, display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
        <span style={{ ...mono, fontSize: 12, color: ink }}>{done ? "Done" : lowConfidence ? "Finding out first" : kicker ?? "Today"}</span>
        {timeText ? <span style={{ ...mono, fontSize: 12, color: "var(--bm-text4)" }}>{timeText}</span> : null}
      </div>

      <h2
        style={{
          margin: "10px 0 0", ...display, fontWeight: 700, color: "var(--bm-text)", textWrap: "balance",
          fontSize: headlineSize(narrow, nodesLength(action ?? actionTitle)), lineHeight: 1.2, letterSpacing: "-0.02em",
        }}
      >
        <InkText nodes={action ?? actionTitle ?? "Preparing today's action"} progress={progress} color={ink} />
      </h2>

      {lowConfidence ? (
        <p style={{ margin: "14px 0 0", maxWidth: "58ch", fontSize: 14, lineHeight: 1.6, color: "var(--bm-text3)" }}>
          This is a question for the real world, not a guess. What you learn shapes the next recommendation.
        </p>
      ) : null}
      {rationale ? <p style={{ margin: "18px 0 0", maxWidth: "60ch", fontSize: 14, lineHeight: 1.6, color: "var(--bm-text2)" }}>{rationale}</p> : null}
      {reasons && reasons.length > 0 ? (
        <ul style={{ margin: "10px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 3 }}>
          {reasons.slice(0, 2).map((r) => <li key={r} style={{ fontSize: 13, lineHeight: 1.5, color: "var(--bm-text3)" }}>{r}</li>)}
        </ul>
      ) : null}
      {expectedEvidence ? <p style={{ margin: "12px 0 0", maxWidth: "60ch", fontSize: 13, lineHeight: 1.55, color: "var(--bm-text3)" }}>You will know it worked when: {expectedEvidence}</p> : null}

      {/* Start / running / finished: one control, in the sentence's own colour */}
      <div style={{ marginTop: narrow ? 24 : 30, minWidth: 0 }}>
        {focus.mode === "idle" && !done && (
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: narrow ? 10 : 18 }}>
            <button type="button" className="bm-ink-btn" onClick={start} disabled={!actionTitle}
              style={{ fontSize: 16, fontWeight: 700, padding: "14px 24px", borderRadius: 999, cursor: actionTitle ? "pointer" : "not-allowed", opacity: actionTitle ? 1 : 0.5, color: "#15130a", background: ink, border: "none", fontFamily: "inherit", flex: narrow ? "1 1 100%" : "0 0 auto" }}>
              Start {minutes}-minute focus
            </button>
            <div role="group" aria-label="Block length" style={{ display: "flex", gap: 4, alignItems: "center" }}>
              {FOCUS_PRESETS.map((p) => (
                <button key={p} type="button" className="bm-ink-link" aria-pressed={minutes === p} onClick={() => { setMinutes(p); setFocus((f) => resetFocus(f, p)); }}
                  style={link({ ...mono, padding: "10px 8px", textDecoration: minutes === p ? "underline" : "none", textDecorationColor: ink, color: minutes === p ? "var(--bm-text)" : "var(--bm-text3)" })}>
                  {p}m
                </button>
              ))}
            </div>
            {onExecute ? <button type="button" className="bm-ink-link" onClick={onExecute} style={link({ marginLeft: narrow ? 0 : "auto" })}>{executeLabel}</button> : null}
          </div>
        )}

        {(running || paused || finished) && (
          <div style={{ display: "flex", alignItems: "baseline", gap: narrow ? 14 : 22, flexWrap: "wrap" }}>
            <span role="timer" aria-label={`Focus timer ${formatClock(left)}`} style={{ ...mono, fontSize: narrow ? 44 : 56, fontWeight: 500, lineHeight: 1, color: finished ? "var(--bm-green, #4ade80)" : "var(--bm-text)", letterSpacing: "-0.04em" }}>
              {formatClock(left)}
            </span>
            <span style={{ fontSize: 14, color: "var(--bm-text3)" }}>{running ? "focusing" : paused ? "paused" : "block done"}</span>
            <span style={{ display: "inline-flex", gap: 14, flexWrap: "wrap" }}>
              {running && <button type="button" className="bm-ink-link" onClick={() => setFocus((f) => pauseFocus(f, new Date()))} style={link()}>Pause</button>}
              {paused && <button type="button" className="bm-ink-btn" onClick={() => setFocus((f) => resumeFocus(f, new Date()))} style={{ ...btn(ink, "#15130a"), borderRadius: 999 }}>Resume</button>}
              {(running || paused) && <button type="button" className="bm-ink-link" onClick={() => setFocus((f) => resetFocus(f, minutes))} style={link({ color: "var(--bm-text3)" })}>Stop</button>}
              {finished && <button type="button" className="bm-ink-btn" onClick={goToCheckIn} style={{ ...btn("var(--bm-green, #4ade80)", "#0b1a10"), borderRadius: 999 }}>{done ? "Reflect on it" : "Log how it went"}</button>}
              {finished && <button type="button" className="bm-ink-link" onClick={() => setFocus((f) => startFocus({ ...f, mode: "idle" }, minutes, new Date()))} style={link()}>Another {minutes}m</button>}
            </span>
          </div>
        )}

        {running && (
          <div style={{ marginTop: 14, fontSize: 13, color: "var(--bm-text3)", lineHeight: 1.6 }}>
            Leaving the app? Put this block on your phone so it still alerts you:{" "}
            {platform === "android" && <><button type="button" className="bm-ink-link" onClick={setPhoneTimer} style={link({ fontSize: 13, padding: "6px 2px" })}>set it in Clock</button>{" or "}</>}
            <button type="button" className="bm-ink-link" onClick={addToCalendar} style={link({ fontSize: 13, padding: "6px 2px" })}>add an alert to Calendar</button>.
            {reminderNote && <div role="status" style={{ marginTop: 6, color: "var(--bm-text2)" }}>{reminderNote}</div>}
            {platform === "ios" && !reminderNote && <div style={{ marginTop: 6, color: "var(--bm-text4)", fontSize: 12 }}>iPhone does not let websites set Clock timers, so this uses Calendar, which alerts the same way.</div>}
          </div>
        )}

        {focus.mode === "idle" && done && (
          <button type="button" className="bm-ink-link" onClick={goToCheckIn} style={link({ padding: "10px 0" })}>Reflect on today</button>
        )}
      </div>

      {/* The numbers that matter, in one line, with the week as seven dots */}
      <div style={{ marginTop: narrow ? 26 : 34, paddingTop: 16, borderTop: "1px solid var(--bm-border)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ fontSize: narrow ? 13 : 14, color: "var(--bm-text2)", lineHeight: 1.6, flex: "1 1 260px", minWidth: 0 }}>
          <span style={{ ...mono, color: "var(--bm-text)" }}>{streakShown}</span>-day streak
          {snap ? <> &middot; <span style={{ ...mono, color: "var(--bm-text)" }}>{snap.activeDaysThisWeek}/{snap.daysElapsedThisWeek}</span> days this week</> : null}
          {focus.minutesToday > 0 ? <> &middot; <span style={{ ...mono, color: "var(--bm-text)" }}>{focus.minutesToday}m</span> focused</> : null}
          <div suppressHydrationWarning style={{ color: "var(--bm-text3)", marginTop: 2 }}>{nudge}</div>
        </div>
        {week.length > 0 && (
          <div role="img" aria-label={`This week: ${week.filter((d) => d.done).length} days with a completed action`} style={{ display: "flex", gap: 7, alignItems: "flex-end" }}>
            {week.map((d, i) => (
              <div key={d.date} title={d.date} style={{ display: "grid", justifyItems: "center", gap: 5 }}>
                <span style={{ width: 11, height: 11, borderRadius: "50%", background: d.done ? ink : "transparent", border: `1.5px solid ${d.done ? ink : d.isToday ? ink : "var(--bm-border3)"}`, opacity: d.isFuture ? 0.4 : 1 }} />
                <span style={{ ...mono, fontSize: 10, color: d.isToday ? "var(--bm-text)" : "var(--bm-text4)" }}>{WEEKDAY_LABELS[i]?.[0]}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/** The sentence, word by word: the first `progress` share of words takes the accent colour. */
function InkText({ nodes, progress, color }: { nodes: React.ReactNode; progress: number; color: string }) {
  const items: Array<{ key: string; node: React.ReactNode; space: boolean }> = [];
  const walk = (n: React.ReactNode, path: string) => {
    if (Array.isArray(n)) { n.forEach((c, i) => walk(c, `${path}.${i}`)); return; }
    if (typeof n === "string") {
      n.split(/(\s+)/).forEach((part, i) => {
        if (!part) return;
        if (/^\s+$/.test(part)) { items.push({ key: `${path}.${i}s`, node: " ", space: true }); return; }
        items.push({ key: `${path}.${i}`, node: part, space: false });
      });
      return;
    }
    items.push({ key: path, node: n, space: false });
  };
  walk(nodes, "w");
  const words = items.filter((i) => !i.space);
  const lit = Math.floor(Math.min(1, Math.max(0, progress)) * words.length + 1e-6);
  let w = 0;
  return (
    <>
      {items.map((it) => {
        if (it.space) return " ";
        const idx = w++;
        return (
          <span key={it.key} className="bm-ink-word" style={{ color: idx < lit ? color : undefined, animationDelay: `${Math.min(idx, 24) * 28}ms` }}>
            {it.node}
          </span>
        );
      })}
    </>
  );
}

/** The working day, 06:00 to 22:00, as a hairline with a dot at now. */
function DayLine({ nowMin, color, done, blockStart, blockEnd }: { nowMin: number; color: string; done: boolean; blockStart: number | null; blockEnd: number | null }) {
  const S = 360, E = 1320;
  const pct = (m: number) => `${Math.min(100, Math.max(0, ((m - S) / (E - S)) * 100))}%`;
  return (
    <div aria-hidden suppressHydrationWarning style={{ position: "relative", height: 18, marginTop: 10 }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 8, height: 2, background: "var(--bm-border2)", borderRadius: 1 }} />
      <div style={{ position: "absolute", left: 0, width: pct(nowMin), top: 8, height: 2, background: color, borderRadius: 1, opacity: 0.55 }} />
      {blockStart !== null && blockEnd !== null && (
        <div style={{ position: "absolute", left: pct(blockStart), width: `calc(${pct(blockEnd)} - ${pct(blockStart)})`, minWidth: 6, top: 5, height: 8, background: color, borderRadius: 4 }} />
      )}
      <div style={{ position: "absolute", left: pct(nowMin), top: 4, width: 10, height: 10, marginLeft: -5, borderRadius: "50%", background: done ? "var(--bm-green, #4ade80)" : color, boxShadow: "0 0 0 3px var(--bm-bg)" }} />
    </div>
  );
}

function btn(bg: string, color: string): React.CSSProperties {
  return { fontSize: 14, fontWeight: 700, padding: "11px 20px", cursor: "pointer", color, background: bg, border: "none", fontFamily: "inherit" };
}


/** Plain-text length of a headline, whether it arrives as a string or nodes. */
function nodesLength(v: unknown): number {
  if (typeof v === "string") return v.length;
  if (typeof v === "number") return String(v).length;
  if (Array.isArray(v)) return v.reduce((n: number, c) => n + nodesLength(c), 0);
  if (v && typeof v === "object" && "props" in (v as object)) return nodesLength((v as { props?: { children?: unknown } }).props?.children);
  return 0;
}

/**
 * The headline is generated text of very different lengths. A fixed 50px
 * turns a 120-character task into a wall; size it by length instead, topping
 * out at 30px so it reads as a heading, not a banner.
 */
function headlineSize(narrow: boolean, len: number): string {
  if (narrow) return len <= 70 ? "clamp(20px, 6vw, 24px)" : "clamp(18px, 5.2vw, 21px)";
  if (len <= 60) return "clamp(24px, 3vw, 30px)";
  if (len <= 110) return "clamp(21px, 2.5vw, 25px)";
  return "clamp(19px, 2.1vw, 22px)";
}
