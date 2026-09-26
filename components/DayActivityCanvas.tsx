"use client";

/**
 * components/DayActivityCanvas.tsx
 *
 * One unified SVG canvas — not 7 separate bordered day-cards — showing this
 * week's DayActivity[] (lib/weeklyPulseData.ts): every distinct completed
 * action per day, stacked as bands, each band's color intensity mapped to
 * how crucial that one action was (ACTION_TYPE_WEIGHT,
 * lib/actionClassification.ts — a stated heuristic: direct customer
 * evidence and strategic/revenue work read as deep, saturated bands;
 * content/research busywork reads pale and thin).
 *
 * Band COUNT in a column is the at-a-glance "how many distinct things got
 * done" read; band COLOR/opacity is the "how deep was each one" read — the
 * two together are what was asked for: volume and depth in one shape,
 * without needing a legend to decode a single blended number.
 */

import { useState } from "react";

export interface DayActivityEntry { title: string; type: string; weight: number; }
export interface DayActivity {
  date: string;
  day_label: string;
  activities: DayActivityEntry[];
  total_weight: number;
}

const BAND_H = 20;
const BAND_GAP = 3;
const COL_GAP = 7;
const COL_W = 42;
const PAD = 10;
const MIN_SLOTS = 3; // keeps a quiet week from rendering as a single sliver

function bandColor(weight: number): string {
  // 0-100 -> a floor of ~22% opacity (never fully invisible — even a low-
  // weight action should read as "something happened") up to ~90%.
  const opacity = 0.22 + Math.min(1, Math.max(0, weight / 100)) * 0.68;
  return `rgba(232, 197, 71, ${opacity.toFixed(2)})`; // --bm-accent's rgb, computed inline (SVG fill can't read CSS vars reliably across export/PNG contexts)
}

export function DayActivityCanvas({ days }: { days: DayActivity[] }) {
  const [hovered, setHovered] = useState<{ date: string; entry: DayActivityEntry } | null>(null);
  const todayStr = new Date().toISOString().slice(0, 10);

  const maxCount = Math.max(MIN_SLOTS, ...days.map((d) => d.activities.length));
  const width = days.length * COL_W + (days.length - 1) * COL_GAP + PAD * 2;
  const height = maxCount * (BAND_H + BAND_GAP) + PAD * 2 + 18; // +18 for the day-label row

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        style={{ display: "block", overflow: "visible" }}
        role="img"
        aria-label="This week's completed activity by day, shaded by how crucial each was"
      >
        {days.map((day, colIndex) => {
          const x = PAD + colIndex * (COL_W + COL_GAP);
          const isToday = day.date === todayStr;
          const isFuture = day.date > todayStr;
          const activities = day.activities;

          return (
            <g key={day.date}>
              {/* Today ring — so a completion logged today is immediately
                  visible in the exact column it landed in, not just trusted
                  to have counted somewhere. */}
              {isToday && (
                <rect
                  x={x - 3} y={PAD - 3}
                  width={COL_W + 6} height={height - PAD - 14}
                  rx={6}
                  fill="none"
                  stroke="var(--bm-intel, #5da9e0)"
                  strokeWidth={1.5}
                  strokeDasharray={activities.length === 0 ? "3 3" : undefined}
                />
              )}

              {activities.length === 0 ? (
                // Empty day — a faint single placeholder band, not a blank
                // gap, so "nothing done" reads as a deliberate state rather
                // than a rendering gap. Future days are dimmer still.
                <rect
                  x={x} y={height - PAD - 18 - BAND_H}
                  width={COL_W} height={BAND_H}
                  rx={4}
                  fill="var(--bm-bg3, #1c1c22)"
                  opacity={isFuture ? 0.35 : 0.6}
                />
              ) : (
                activities.map((entry, bandIndex) => {
                  const y = height - PAD - 18 - (bandIndex + 1) * (BAND_H + BAND_GAP) + BAND_GAP;
                  return (
                    <rect
                      key={bandIndex}
                      x={x} y={y}
                      width={COL_W} height={BAND_H}
                      rx={4}
                      fill={bandColor(entry.weight)}
                      stroke={hovered?.date === day.date && hovered.entry === entry ? "var(--bm-accent, #e8c547)" : "none"}
                      strokeWidth={1.5}
                      style={{ cursor: "pointer" }}
                      onMouseEnter={() => setHovered({ date: day.date, entry })}
                      onMouseLeave={() => setHovered((h) => (h?.entry === entry ? null : h))}
                    >
                      <title>{`${entry.title} — ${day.day_label}`}</title>
                    </rect>
                  );
                })
              )}

              <text
                x={x + COL_W / 2} y={height - PAD}
                textAnchor="middle"
                fontFamily="'Inter', sans-serif"
                fontSize={10}
                fontWeight={isToday ? 700 : 500}
                fill={isToday ? "var(--bm-accent, #e8c547)" : isFuture ? "var(--bm-text4, #666)" : "var(--bm-text3, #999)"}
              >
                {day.day_label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Always-visible caption for the hovered/tapped band — the SVG
          <title> above already gives a native browser tooltip, this is the
          same info without requiring a mouse (touch devices, screenshots). */}
      <div style={{ minHeight: 16, fontFamily: "'Inter', sans-serif", fontSize: 11, color: "var(--bm-text3)" }}>
        {hovered ? `${hovered.entry.title} · ${hovered.date}` : "Tap or hover a band to see what it was"}
      </div>
    </div>
  );
}
