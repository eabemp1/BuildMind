/**
 * app/api/card/weekly-report/route.tsx
 *
 * PNG export for /reports. Same strategy as app/api/card/weekly-share/route.tsx:
 * a POST route that accepts data the page has ALREADY computed, rather than
 * re-deriving it here. app/api/ai/weekly-report/route.ts is 555 lines, plan-
 * gated (builder), doubles as a cron endpoint, and makes its own LLM call —
 * re-implementing that safely under time pressure was the wrong call, so
 * this route trusts the client's already-fetched metrics instead.
 *
 * Same visual language as the other two card routes: dark card, quiet glow
 * accents, every number always paired with a label. The one addition here:
 * a day-by-day task bar chart, since /reports already has real daily data
 * (taskData, a 7-value array) that the other two cards don't — same
 * "legend + axis labels + explicit interpretation" discipline as the
 * weekly-pulse sparkline, so the chart is never the only place a claim lives.
 */

import { ImageResponse } from "next/og";

export const runtime = "nodejs";

const WIDTH = 1080;
const HEIGHT = 1350;

const COLORS = {
  bg: "#0A0A10", glowBlue: "#1D3A5F", glowPurple: "#2A1D4A",
  text: "#F0F0F5", text2: "#B8B8C5", text3: "#6B6B78", border: "#24242E",
  accent: "#5DA9E0", purple: "#8B7BE8", green: "#7BC9A8", amber: "#E0A85D", red: "#E05555",
};

interface WeeklyReportCardBody {
  score?: number; scoreDelta?: number;
  streak?: number; tasksThisWeek?: number; taskDelta?: number;
  intentionRate?: number | null; prevIntentionRate?: number | null;
  totalXP?: number; momentumScore?: number | null;
  weekOverWeekSentence?: string | null;
  taskData?: number[]; // 7 values, oldest → newest day
}

function val(v: number | null | undefined, suffix = ""): string {
  return v == null ? "—" : `${v}${suffix}`;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as WeeklyReportCardBody;
  const taskData = body.taskData?.length === 7 ? body.taskData : [0, 0, 0, 0, 0, 0, 0];
  const maxTasks = Math.max(...taskData, 1);
  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const barW = 100, barGap = 24, chartH = 140;

  const rateDelta = body.intentionRate != null && body.prevIntentionRate != null
    ? body.intentionRate - body.prevIntentionRate
    : null;

  return new ImageResponse(
    (
      <div style={{
        width: WIDTH, height: HEIGHT, display: "flex", flexDirection: "column",
        background: COLORS.bg, padding: "72px 64px", position: "relative", fontFamily: "sans-serif",
      }}>
        <div style={{ position: "absolute", top: -140, right: -140, width: 480, height: 480, borderRadius: 480, background: COLORS.glowBlue, opacity: 0.3, display: "flex" }} />
        <div style={{ position: "absolute", bottom: -180, left: -100, width: 520, height: 520, borderRadius: 520, background: COLORS.glowPurple, opacity: 0.25, display: "flex" }} />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: COLORS.accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "white", fontSize: 26, fontWeight: 700 }}>B</span>
            </div>
            <span style={{ color: COLORS.text, fontSize: 30, fontWeight: 700, letterSpacing: -0.5 }}>BuildMind</span>
          </div>
          <span style={{ color: COLORS.text3, fontSize: 20, letterSpacing: 2, textTransform: "uppercase" }}>Weekly Report</span>
        </div>

        {/* Score headline */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginTop: 40, zIndex: 1 }}>
          <span style={{ color: COLORS.text, fontSize: 76, fontWeight: 700 }}>{val(body.score)}</span>
          <span style={{ color: COLORS.text3, fontSize: 26 }}>/100 execution score</span>
          {body.scoreDelta != null && (
            <span style={{ fontSize: 22, color: body.scoreDelta >= 0 ? COLORS.green : COLORS.red }}>
              {body.scoreDelta >= 0 ? "+" : ""}{body.scoreDelta} vs last week
            </span>
          )}
        </div>

        {/* Week-over-week sentence — the story, stated in words, not just implied by the chart */}
        {body.weekOverWeekSentence && (
          <span style={{ color: COLORS.text2, fontSize: 26, lineHeight: 1.5, marginTop: 20, zIndex: 1 }}>
            {body.weekOverWeekSentence}
          </span>
        )}

        {/* Day-by-day task chart — legend-free by design (only one series),
            but axis-labeled and captioned so it's never just a vague set of
            bars. */}
        <div style={{ display: "flex", flexDirection: "column", marginTop: 40, zIndex: 1 }}>
          <span style={{ color: COLORS.text2, fontSize: 18, marginBottom: 14 }}>Tasks completed per day</span>
          <div style={{ display: "flex", alignItems: "flex-end", gap: barGap, height: chartH }}>
            {taskData.map((v, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: barW }}>
                <span style={{ color: COLORS.text3, fontSize: 15, marginBottom: 6 }}>{v}</span>
                <div style={{
                  display: "flex", width: barW - 20, height: Math.max(4, (v / maxTasks) * (chartH - 30)),
                  borderRadius: 6, background: v > 0 ? COLORS.accent : COLORS.border,
                }} />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: barGap, marginTop: 10 }}>
            {dayLabels.map((d) => (
              <span key={d} style={{ color: COLORS.text3, fontSize: 15, width: barW, textAlign: "center" }}>{d}</span>
            ))}
          </div>
          <span style={{ color: COLORS.text3, fontSize: 16, marginTop: 10 }}>
            {body.tasksThisWeek ?? taskData.reduce((a, b) => a + b, 0)} total this week
            {body.taskDelta != null && (body.taskDelta >= 0 ? ` (+${body.taskDelta} vs last week)` : ` (${body.taskDelta} vs last week)`)}
          </span>
        </div>

        {/* Metrics row */}
        <div style={{ display: "flex", gap: 16, marginTop: 40, zIndex: 1 }}>
          {[
            { label: "Execution rate", value: body.intentionRate != null ? `${body.intentionRate}%` : "—", note: rateDelta != null ? `${rateDelta >= 0 ? "+" : ""}${rateDelta}%` : null },
            { label: "Streak", value: val(body.streak, "d"), note: null },
            { label: "Total XP", value: val(body.totalXP), note: null },
            { label: "Momentum", value: val(body.momentumScore), note: null },
          ].map((m) => (
            <div key={m.label} style={{
              display: "flex", flexDirection: "column", alignItems: "center", flex: 1,
              background: "rgba(255,255,255,0.04)", border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: "18px 10px",
            }}>
              <span style={{ color: COLORS.text, fontSize: 28, fontWeight: 700 }}>{m.value}</span>
              <span style={{ color: COLORS.text3, fontSize: 14, marginTop: 4, textAlign: "center" }}>{m.label}</span>
              {m.note && <span style={{ color: rateDelta != null && rateDelta >= 0 ? COLORS.green : COLORS.red, fontSize: 13, marginTop: 2 }}>{m.note}</span>}
            </div>
          ))}
        </div>

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
