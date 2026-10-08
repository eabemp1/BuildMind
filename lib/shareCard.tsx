/**
 * lib/shareCard.tsx
 *
 * The weekly share card — one design, three shapes (post 4:5, story 9:16,
 * square 1:1) and two themes (ink, paper). Rendered by next/og (Satori), so
 * the usual constraints apply: flexbox only, every multi-child div declares
 * display:flex, no CSS variables.
 *
 * The idea: the week is the picture. Seven columns, one per day; each
 * completed action is a band stacked in its day (darker = more crucial,
 * ACTION_TYPE_WEIGHT). A missed day is a dashed empty outline, a future day
 * is faint. One huge number — days you showed up — sits above it. Everything
 * on the card is a real value from getWeeklyPulseData(); nothing is
 * decorative data.
 */

import React from "react";
import { readFile } from "fs/promises";
import path from "path";
import type { WeeklyPulseResponse } from "@/lib/weeklyPulseData";

export type CardFormat = "post" | "story" | "square";
export type CardTheme = "ink" | "paper";

export const CARD_SIZES: Record<CardFormat, { w: number; h: number }> = {
  post: { w: 1080, h: 1350 },
  story: { w: 1080, h: 1920 },
  square: { w: 1080, h: 1080 },
};

interface Palette {
  bg: string; bg2: string; text: string; text2: string; text3: string;
  line: string; accent: string; accentRgb: string; good: string; bad: string; glow: string; onAccent: string;
}

const PALETTES: Record<CardTheme, Palette> = {
  ink: {
    bg: "#09090A", bg2: "#131316", text: "#F0F0EE", text2: "#A9A9A3", text3: "#6A6A65",
    line: "rgba(255,255,255,0.10)", accent: "#E8C547", accentRgb: "232,197,71",
    good: "#5CC592", bad: "#E8706A", glow: "rgba(232,197,71,0.26)", onAccent: "#09090A",
  },
  paper: {
    bg: "#F4F1E8", bg2: "#EBE6D8", text: "#17160F", text2: "#4F4C40", text3: "#8B8774",
    line: "rgba(23,22,15,0.14)", accent: "#B8890B", accentRgb: "184,137,11",
    good: "#2E8B5E", bad: "#C4483F", glow: "rgba(184,137,11,0.22)", onAccent: "#F4F1E8",
  },
};

export interface CardFont { name: string; data: ArrayBuffer; weight: 400 | 500 | 700 | 800; style: "normal" }

let fontCache: CardFont[] | null = null;

/** Syne (display) + DM Mono (labels), read from public/fonts. Satori takes
 *  woff/ttf/otf, not woff2. Cached after first read. Returns [] if missing
 *  so the card still renders (in Satori's fallback face) rather than 500ing. */
export async function loadCardFonts(): Promise<CardFont[]> {
  if (fontCache) return fontCache;
  const dir = path.join(process.cwd(), "public", "fonts");
  const files: Array<[string, string, CardFont["weight"]]> = [
    ["Syne", "syne-latin-500-normal.woff", 500],
    ["Syne", "syne-latin-700-normal.woff", 700],
    ["Syne", "syne-latin-800-normal.woff", 800],
    ["DM Mono", "dm-mono-latin-400-normal.woff", 400],
    ["DM Mono", "dm-mono-latin-500-normal.woff", 500],
  ];
  try {
    fontCache = await Promise.all(
      files.map(async ([name, file, weight]) => {
        const buf = await readFile(path.join(dir, file));
        return { name, data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, weight, style: "normal" as const };
      }),
    );
  } catch {
    fontCache = [];
  }
  return fontCache;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_INITIAL = ["M", "T", "W", "T", "F", "S", "S"];

function rangeLabel(first: string, last: string): string {
  const a = new Date(first + "T00:00:00Z");
  const b = new Date(last + "T00:00:00Z");
  const am = MONTHS[a.getUTCMonth()];
  const bm = MONTHS[b.getUTCMonth()];
  return am === bm
    ? `${am} ${a.getUTCDate()} – ${b.getUTCDate()}`
    : `${am} ${a.getUTCDate()} – ${bm} ${b.getUTCDate()}`;
}

/** First one or two sentences of the story, capped so it never overflows. */
export function insightLine(story: string, max = 190): string {
  const clean = story.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const sentences = clean.match(/[^.!?]+[.!?]+/g) ?? [clean];
  let out = "";
  for (const s of sentences) {
    if ((out + s).length > max) break;
    out += s;
  }
  return (out || clean.slice(0, max - 1)).trim().replace(/[,;:—-]$/, "") + (out ? "" : "…");
}

export function headline(data: WeeklyPulseResponse): { big: string; line: string; sub: string } {
  const done = data.tasks_completed;
  const total = data.tasks_total;
  if (total === 0) return { big: "0", line: "days logged", sub: "A fresh week. Day one is the hard one." };
  if (done === 0) return { big: "0", line: `of ${total} days showed up`, sub: "A quiet week. Still here, still building." };
  if (done === total) return { big: String(done), line: `of ${total} days showed up`, sub: "Every day so far. Nothing skipped." };
  return { big: String(done), line: `of ${total} days showed up`, sub: done / total >= 0.8 ? "A solid week." : done / total >= 0.5 ? "More on than off." : "Building the habit." };
}

const FULL_DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** The deterministic story is just the stats the card already shows. */
const STATS_ONLY_STORY = /^(\d+ of \d+ tasks completed|Quiet week|A quieter week|No Today actions)/;

export interface InsightRow { k: string; v: string }

/** Things the card does NOT already show, each computed from real data. */
export function insightRows(data: WeeklyPulseResponse): InsightRow[] {
  const rows: InsightRow[] = [];
  const clip = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t);

  const busiest = [...data.day_activity].sort((a, b) => b.total_weight - a.total_weight)[0];
  if (busiest && busiest.activities.length > 0) {
    const d = new Date(busiest.date + "T00:00:00Z");
    const n = busiest.activities.length;
    rows.push({ k: "Strongest day", v: `${FULL_DAY[d.getUTCDay()]}, ${n} finished ${n === 1 ? "action" : "actions"}` });
  }
  let best: { title: string; weight: number } | null = null;
  for (const d of data.day_activity) for (const a of d.activities) if (!best || a.weight > best.weight) best = { title: a.title, weight: a.weight };
  if (best?.title) rows.push({ k: "Biggest block", v: clip(best.title, 58) });
  if ((data.un_ghosted?.length ?? 0) > 0) rows.push({ k: "Faced", v: clip((data.un_ghosted ?? []).slice(0, 2).join(", "), 58) });
  const grades = data.grades ?? [];
  const top = grades.find((g) => g.grade === "A") ?? grades.find((g) => g.grade === "B");
  if (rows.length < 3 && top) rows.push({ k: "Strongest habit", v: `${top.label}, grade ${top.grade}` });
  return rows.slice(0, 3);
}

/** A model-written story is worth showing; the stats-only fallback is not. */
export function usableStory(story: string): string | null {
  const t = story.replace(/\s+/g, " ").trim();
  return t && !STATS_ONLY_STORY.test(t) ? insightLine(t, 180) : null;
}

export function shareCaption(data: WeeklyPulseResponse): string {
  const h = headline(data);
  const delta = data.momentum_delta ? ` (${data.momentum_delta > 0 ? "+" : ""}${data.momentum_delta} vs last week)` : "";
  const lines = [
    `${h.big} ${h.line} this week.`,
    [data.streak > 0 ? `${data.streak}-day streak.` : "", `Momentum ${data.momentum_score}/100${delta}.`].filter(Boolean).join(" "),
    "",
    "Tracked with BuildMind: buildmind.live",
    "#BuildInPublic",
  ];
  return lines.join("\n");
}

export function WeekCard({ data, format, theme }: { data: WeeklyPulseResponse; format: CardFormat; theme: CardTheme }) {
  const P = PALETTES[theme];
  const { w, h } = CARD_SIZES[format];
  const tall = format === "story";
  const compact = format === "square";
  const pad = 72;
  const innerW = w - pad * 2;

  const days = data.day_activity;
  const todayStr = new Date().toISOString().slice(0, 10);
  const hl = headline(data);
  const bigSize = compact ? 200 : tall ? 340 : 290;

  // Week strip geometry
  const gap = 14;
  const colW = Math.floor((innerW - gap * 6) / 7);
  const bandH = compact ? 30 : tall ? 54 : 38;
  const bandGap = 6;
  const MAX_BANDS = compact ? 3 : tall ? 6 : 5;
  const stripH = MAX_BANDS * (bandH + bandGap) + 8;

  const delta = data.momentum_delta;
  const deltaColor = delta === null || delta === 0 ? P.text3 : delta > 0 ? P.good : P.bad;
  const deltaText = delta === null ? "first week" : delta === 0 ? "level with last week" : `${delta > 0 ? "+" : ""}${delta} vs last week`;

  const mono = "DM Mono";
  const display = "Syne";
  const range = days.length === 7 ? rangeLabel(days[0].date, days[6].date) : "This week";
  const story = usableStory(data.story);
  const rows = insightRows(data);

  const stats = [
    { k: "Streak", v: `${data.streak}`, u: data.streak === 1 ? "day" : "days", note: data.streak > 0 ? "in a row" : "starts with today" },
    { k: "Momentum", v: `${data.momentum_score}`, u: "/100", note: deltaText, noteColor: deltaColor },
    { k: "Completion", v: `${data.completion_rate}`, u: "%", note: `${data.active_days} active ${data.active_days === 1 ? "day" : "days"}` },
  ];

  return (
    <div style={{ width: w, height: h, display: "flex", flexDirection: "column", background: P.bg, padding: `${compact ? 56 : 72}px ${pad}px ${compact ? 48 : 64}px`, position: "relative", overflow: "hidden", fontFamily: display, color: P.text }}>
      <div style={{ position: "absolute", top: -260, right: -220, width: 760, height: 760, borderRadius: 760, backgroundImage: `radial-gradient(circle, ${P.glow} 0%, rgba(0,0,0,0) 68%)`, display: "flex" }} />
      <div style={{ position: "absolute", left: 0, top: 0, width: 10, height: h, background: P.accent, display: "flex" }} />

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", width: 44, height: 44, borderRadius: 12, background: P.accent, alignItems: "center", justifyContent: "center", color: P.onAccent, fontSize: 26, fontWeight: 800 }}>B</div>
          <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: -0.5 }}>BuildMind</span>
        </div>
        <span style={{ fontFamily: mono, fontSize: 22, color: P.text3 }}>{range}</span>
      </div>

      {/* Hero number */}
      <div style={{ display: "flex", alignItems: "flex-end", marginTop: compact ? 22 : tall ? 80 : 44 }}>
        <span style={{ fontSize: bigSize, fontWeight: 800, lineHeight: 0.82, letterSpacing: -10, color: P.accent }}>{hl.big}</span>
        <div style={{ display: "flex", flexDirection: "column", marginLeft: 28, paddingBottom: compact ? 6 : 14 }}>
          <span style={{ fontFamily: mono, fontSize: 28, color: P.text2 }}>{hl.line}</span>
          <span style={{ fontSize: compact ? 34 : 42, fontWeight: 700, lineHeight: 1.12, marginTop: 10, maxWidth: 520, letterSpacing: -0.8 }}>{hl.sub}</span>
        </div>
      </div>

      {/* Week strip */}
      <div style={{ display: "flex", flexDirection: "column", marginTop: compact ? 24 : tall ? 70 : 38 }}>
        <div style={{ display: "flex", gap }}>
          {days.map((d, i) => {
            const isToday = d.date === todayStr;
            const isFuture = d.date > todayStr;
            const missed = !isFuture && !isToday && d.activities.length === 0;
            const shown = d.activities.slice(0, MAX_BANDS);
            return (
              <div key={d.date} style={{ display: "flex", flexDirection: "column", width: colW, alignItems: "center" }}>
                <div style={{
                  display: "flex", flexDirection: "column", justifyContent: "flex-end", width: colW, height: stripH, gap: bandGap, padding: 4, borderRadius: 14,
                  border: isToday ? `3px solid ${P.accent}` : missed ? `2px dashed ${P.line}` : `2px solid ${isFuture ? P.line : "transparent"}`,
                  background: isFuture ? "transparent" : P.bg2,
                }}>
                  {shown.map((a, j) => (
                    <div key={j} style={{ display: "flex", width: "100%", height: bandH, borderRadius: 8, background: `rgba(${P.accentRgb},${(0.3 + Math.min(1, a.weight / 100) * 0.7).toFixed(2)})` }} />
                  ))}
                </div>
                <span style={{ fontFamily: mono, fontSize: 22, marginTop: 12, color: isToday ? P.accent : P.text3, fontWeight: isToday ? 500 : 400 }}>{DAY_INITIAL[i]}</span>
                <span style={{ fontFamily: mono, fontSize: 18, marginTop: 2, color: d.activities.length ? P.text2 : P.text3 }}>
                  {isFuture ? "·" : d.activities.length > 0 ? `${d.activities.length}` : "–"}
                </span>
              </div>
            );
          })}
        </div>
        <span style={{ fontFamily: mono, fontSize: 19, color: P.text3, marginTop: 14 }}>
          Each block is one finished action. Darker means more important.
        </span>
      </div>

      {/* Stats */}
      <div style={{ display: "flex", marginTop: compact ? 22 : tall ? 60 : 30, borderTop: `1px solid ${P.line}`, paddingTop: compact ? 22 : 30 }}>
        {stats.map((s, i) => (
          <div key={s.k} style={{ display: "flex", flexDirection: "column", flex: 1, paddingLeft: i === 0 ? 0 : 28, borderLeft: i === 0 ? "none" : `1px solid ${P.line}` }}>
            <span style={{ fontFamily: mono, fontSize: 20, color: P.text3 }}>{s.k}</span>
            <div style={{ display: "flex", alignItems: "baseline", marginTop: 6 }}>
              <span style={{ fontSize: compact ? 62 : tall ? 92 : 76, fontWeight: 800, letterSpacing: -2, lineHeight: 1 }}>{s.v}</span>
              <span style={{ fontFamily: mono, fontSize: 24, color: P.text2, marginLeft: 6 }}>{s.u}</span>
            </div>
            <span style={{ fontFamily: mono, fontSize: 19, marginTop: 8, color: s.noteColor ?? P.text3 }}>{s.note}</span>
          </div>
        ))}
      </div>

      {/* Insight */}
      <div style={{ display: "flex", flexDirection: "column", marginTop: compact ? 22 : tall ? 56 : 34, paddingLeft: 26, borderLeft: `4px solid ${P.accent}` }}>
        <span style={{ fontFamily: mono, fontSize: 20, color: P.accent }}>
          {data.archetype ? `What BuildMind noticed · ${data.archetype.replace(/-/g, " ")}` : "What BuildMind noticed"}
        </span>
        {story ? (
          <span style={{ fontSize: compact ? 30 : tall ? 42 : 36, fontWeight: 500, lineHeight: 1.3, marginTop: 10, letterSpacing: -0.4 }}>{story}</span>
        ) : rows.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", marginTop: 10, gap: compact ? 6 : 10 }}>
            {rows.map((r) => (
              <div key={r.k} style={{ display: "flex", alignItems: "baseline" }}>
                <span style={{ fontFamily: mono, fontSize: 21, color: P.text3, width: 230 }}>{r.k}</span>
                <span style={{ fontSize: compact ? 28 : tall ? 38 : 33, fontWeight: 700, letterSpacing: -0.5, flex: 1 }}>{r.v}</span>
              </div>
            ))}
          </div>
        ) : (
          <span style={{ fontSize: compact ? 30 : 36, fontWeight: 500, lineHeight: 1.3, marginTop: 10 }}>Log a finished action to see what shows up here.</span>
        )}
      </div>

      {/* Footer */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto", paddingTop: 20 }}>
        <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: -0.5 }}>buildmind.live</span>
        <span style={{ fontFamily: mono, fontSize: 21, color: P.text3 }}>Track what you actually do.</span>
      </div>
    </div>
  );
}
