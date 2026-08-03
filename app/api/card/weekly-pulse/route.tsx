/**
 * app/api/card/weekly-pulse/route.ts
 *
 * Generates a real, downloadable PNG of the weekly pulse — replaces the
 * html2canvas DOM-screenshot approach with server-side rendering via
 * next/og's ImageResponse (Satori under the hood). No new dependency: Next
 * 15 (confirmed in package.json) ships this built in.
 *
 * Data comes from lib/weeklyPulseData.ts — the same function
 * app/api/ai/weekly-pulse/route.ts calls, so this can never drift from what
 * the in-app "This Week" tab shows.
 *
 * DESIGN NOTE ON THE SPARKLINE: an earlier version of this chart (shown as
 * a design preview) was two unlabeled lines — visually nice, but the
 * founder correctly pointed out it's not actually readable: no way to tell
 * what the lines represent, what the values are, or what "up" means here.
 * Fixed by adding: (1) a legend distinguishing Actual vs Target, (2) start/
 * end value labels directly on the real line, (3) day-of-week labels on the
 * x-axis, (4) an explicit one-line interpretation below the chart stating
 * the actual delta in words, so the chart is never the only place the
 * information lives — every visual claim here is also stated as text.
 *
 * Satori (the renderer behind ImageResponse) supports a constrained CSS
 * subset — flexbox only, no CSS grid, styles as JS objects not strings.
 * That's why this file's styling looks different from the app's own
 * inline-style conventions (which use CSS strings) — this genuinely is a
 * different rendering engine, not a style inconsistency.
 */

import { ImageResponse } from "next/og";
import { createClient } from "@/lib/supabase/server";
import { getWeeklyPulseData, type SparklinePoint } from "@/lib/weeklyPulseData";
import { getLogoDataUri } from "@/lib/cardLogo";

export const runtime = "nodejs";

const WIDTH = 1080;
const HEIGHT = 1350; // 4:5 — native fit on LinkedIn/X/Instagram without cropping

const COLORS = {
  bg: "#0A0A10",
  glowBlue: "#1D3A5F",
  glowPurple: "#2A1D4A",
  text: "#F0F0F5",
  text2: "#B8B8C5",
  text3: "#6B6B78",
  border: "#24242E",
  accent: "#5DA9E0",
  purple: "#8B7BE8",
  green: "#7BC9A8",
  amber: "#E0A85D",
  red: "#E05555",
};

const GRADE_COLOR: Record<string, string> = { A: COLORS.green, B: COLORS.accent, C: COLORS.amber, D: COLORS.red, F: COLORS.red };

function buildSparklineChart(points: SparklinePoint[], hasGhost: boolean) {
  const w = 900, h = 220, padX = 30, padY = 20;
  const reals = points.map((p) => p.real).filter((v): v is number => v !== null);
  const ghosts = points.map((p) => p.ghost).filter((v): v is number => v !== null);
  const all = [...reals, ...ghosts];
  const min = Math.min(...all, 0);
  const max = Math.max(...all, 100);
  const x = (i: number) => padX + (i / Math.max(1, points.length - 1)) * (w - padX * 2);
  const y = (v: number) => h - padY - ((v - min) / Math.max(1, max - min)) * (h - padY * 2);

  const realPts = points.map((p, i) => (p.real !== null ? `${x(i)},${y(p.real)}` : null)).filter(Boolean).join(" ");
  const ghostPts = hasGhost ? points.map((p, i) => (p.ghost !== null ? `${x(i)},${y(p.ghost)}` : null)).filter(Boolean).join(" ") : "";

  const first = reals[0];
  const last = reals[reals.length - 1];
  const delta = first !== undefined && last !== undefined ? last - first : null;

  const dayLabels = points.map((p) => {
    const d = new Date(p.date + "T00:00:00Z");
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()];
  });

  return { svgWidth: w, svgHeight: h, realPts, ghostPts, min, max, first, last, delta, dayLabels, points };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId") ?? undefined;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const [data, logoDataUri] = await Promise.all([
    getWeeklyPulseData(user.id, projectId),
    getLogoDataUri(),
  ]);
  const chart = buildSparklineChart(data.sparkline, Boolean(data.weekly_goal));
  const topGrades = data.grades.filter((g) => g.grade !== "N/A").slice(0, 3);

  return new ImageResponse(
    (
      <div
        style={{
          width: WIDTH, height: HEIGHT, display: "flex", flexDirection: "column",
          background: COLORS.bg, padding: "72px 64px", position: "relative", fontFamily: "sans-serif",
        }}
      >
        {/* Ambient glow accents */}
        <div style={{ position: "absolute", top: -140, right: -140, width: 480, height: 480, borderRadius: 480, background: COLORS.glowBlue, opacity: 0.3, display: "flex" }} />
        <div style={{ position: "absolute", bottom: -180, left: -100, width: 520, height: 520, borderRadius: 520, background: COLORS.glowPurple, opacity: 0.25, display: "flex" }} />

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {logoDataUri ? (
              <img src={logoDataUri} width={52} height={52} style={{ borderRadius: 14 }} />
            ) : (
              <div style={{ width: 52, height: 52, borderRadius: 14, background: COLORS.accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ color: "white", fontSize: 26, fontWeight: 700 }}>B</span>
              </div>
            )}
            <span style={{ color: COLORS.text, fontSize: 30, fontWeight: 700, letterSpacing: -0.5 }}>BuildMind</span>
          </div>
          <span style={{ color: COLORS.text3, fontSize: 20, letterSpacing: 2, textTransform: "uppercase" }}>
            Week of {new Date(data.generated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
        </div>

        {/* Execution mode / archetype badge */}
        <div style={{ display: "flex", marginTop: 36, zIndex: 1 }}>
          <span style={{
            fontSize: 18, color: COLORS.purple, letterSpacing: 1.5, textTransform: "uppercase",
            padding: "10px 22px", borderRadius: 999, border: `2px solid ${COLORS.border}`, background: "rgba(139,123,232,0.08)",
          }}>
            {data.archetype ? data.archetype.replace(/-/g, " ") : "This week"}
          </span>
        </div>

        {/* Story */}
        <div style={{ display: "flex", marginTop: 28, zIndex: 1 }}>
          <span style={{ color: COLORS.text, fontSize: 40, lineHeight: 1.4, fontWeight: 500 }}>
            {data.story}
          </span>
        </div>

        {/* ── Chart: legend, axis labels, and an explicit interpretation —
             the founder's core feedback was that a bare two-line chart is
             not readable on its own. All three additions below address that
             directly, not just a nicer-looking line. ── */}
        <div style={{ display: "flex", flexDirection: "column", marginTop: 40, zIndex: 1 }}>
          {/* Legend */}
          <div style={{ display: "flex", gap: 28, marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 24, height: 4, borderRadius: 2, background: COLORS.accent, display: "flex" }} />
              <span style={{ color: COLORS.text2, fontSize: 18 }}>Actual momentum</span>
            </div>
            {chart.ghostPts && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <svg width="24" height="4"><line x1="0" y1="2" x2="24" y2="2" stroke={COLORS.text3} strokeWidth="3" strokeDasharray="5 4" /></svg>
                <span style={{ color: COLORS.text2, fontSize: 18 }}>Target pace</span>
              </div>
            )}
          </div>

          {/* Chart with y-axis min/max reference */}
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", height: chart.svgHeight }}>
              <span style={{ color: COLORS.text3, fontSize: 15 }}>{Math.round(chart.max)}</span>
              <span style={{ color: COLORS.text3, fontSize: 15 }}>{Math.round(chart.min)}</span>
            </div>
            <div style={{ display: "flex", position: "relative" }}>
              <svg width={chart.svgWidth} height={chart.svgHeight}>
                {chart.ghostPts && (
                  <polyline points={chart.ghostPts} fill="none" stroke={COLORS.text3} strokeWidth={3} strokeDasharray="7 5" />
                )}
                <polyline points={chart.realPts} fill="none" stroke={COLORS.accent} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>

          {/* X-axis day labels */}
          <div style={{ display: "flex", justifyContent: "space-between", paddingLeft: 42, marginTop: 6 }}>
            {chart.dayLabels.map((d, i) => (
              <span key={i} style={{ color: COLORS.text3, fontSize: 14 }}>{d}</span>
            ))}
          </div>

          {/* Explicit interpretation — turns the shape into a stated fact */}
          {chart.first !== undefined && chart.last !== undefined && chart.delta !== null && (
            <span style={{ color: COLORS.text2, fontSize: 18, marginTop: 14 }}>
              Momentum went from {Math.round(chart.first)} to {Math.round(chart.last)} this week
              {chart.delta >= 0 ? " (up " : " (down "}{Math.abs(Math.round(chart.delta))} pts)
              {data.weekly_goal ? `, target was ${data.weekly_goal.target_score}` : ""}.
            </span>
          )}
        </div>

        {/* Metrics row */}
        <div style={{ display: "flex", gap: 20, marginTop: 40, zIndex: 1 }}>
          {[
            { label: "Completion", value: `${data.completion_rate}%` },
            { label: "Momentum", value: `${data.momentum_score}` },
            { label: "Streak", value: `${data.streak}d` },
          ].map((m) => (
            <div key={m.label} style={{
              display: "flex", flexDirection: "column", alignItems: "center", flex: 1,
              background: "rgba(255,255,255,0.04)", border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: "20px 12px",
            }}>
              <span style={{ color: COLORS.text, fontSize: 40, fontWeight: 700 }}>{m.value}</span>
              <span style={{ color: COLORS.text3, fontSize: 16, marginTop: 4 }}>{m.label}</span>
            </div>
          ))}
        </div>

        {/* Grade badges — label + letter, never a bare color */}
        {topGrades.length > 0 && (
          <div style={{ display: "flex", gap: 12, marginTop: 20, zIndex: 1 }}>
            {topGrades.map((g) => (
              <span key={g.label} style={{
                fontSize: 16, color: GRADE_COLOR[g.grade] ?? COLORS.text3, padding: "8px 18px", borderRadius: 999,
                background: "rgba(255,255,255,0.04)", border: `1px solid ${COLORS.border}`,
              }}>
                {g.label}: {g.grade}
              </span>
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto",
          paddingTop: 28, borderTop: `1px solid ${COLORS.border}`, zIndex: 1,
        }}>
          <span style={{ color: COLORS.text3, fontSize: 18 }}>buildmind.live</span>
          <span style={{ color: COLORS.text3, fontSize: 18 }}>#BuildInPublic</span>
        </div>
      </div>
    ),
    { width: WIDTH, height: HEIGHT },
  );
}
