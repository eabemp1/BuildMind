"use client";

/**
 * components/GhostRaceCard.tsx — the Ghost Race on Progress.
 *
 * Your ghost is your own typical week (lib/ghostRace.ts). This card shows the
 * race day by day, what it takes to win, and how past weeks went. Free shows
 * the live race and the last three weeks. Builder adds the pace forecast,
 * the weekday you tend to slip on, and twelve weeks of history.
 *
 * Free also has a real ceiling worth being straight about: it includes 3
 * Today actions a week, so once the ghost grows past 3 the founder cannot
 * race it without Builder. The card says exactly that, once, where it applies.
 */

import Link from "next/link";
import { motion } from "framer-motion";
import { usePlan } from "@/lib/usePlan";
import { useMeasuredWidth } from "@/lib/useMeasuredWidth";
import { dayName, type GhostRace, type GhostStatus } from "@/lib/ghostRace";

const DAY_INITIAL = ["M", "T", "W", "T", "F", "S", "S"];
const mono = "'DM Mono', monospace";

const STATUS_COLOR: Record<GhostStatus, string> = {
  won: "var(--bm-green)",
  ahead: "var(--bm-green)",
  level: "var(--bm-accent)",
  starting: "var(--bm-accent)",
  behind: "var(--bm-amber, #d9a441)",
  out_of_reach: "var(--bm-text3)",
};

function RaceChart({ race }: { race: GhostRace }) {
  const [wrapRef, measured] = useMeasuredWidth<HTMLDivElement>(320);
  const W = Math.max(260, Math.min(measured, 720)), H = 140, padL = 24, padR = 52, padT = 12, padB = 24;
  const top = Math.max(race.ghost, race.doneSoFar, 3);
  const x = (i: number) => padL + (i / 6) * (W - padL - padR);
  const y = (v: number) => padT + (1 - v / top) * (H - padT - padB);
  const ghostPts = race.ghostByDay.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const youPts = race.youByDay.map((v, i) => (v === null ? null : { i, v })).filter((p): p is { i: number; v: number } => p !== null);
  const youLine = youPts.map((p) => `${x(p.i)},${y(p.v)}`).join(" ");
  const youArea = youPts.length ? `${x(youPts[0].i)},${y(0)} ${youLine} ${x(youPts[youPts.length - 1].i)},${y(0)}` : "";
  const ticks = Array.from(new Set([0, race.ghost, top])).sort((a, b) => a - b);
  const color = STATUS_COLOR[race.status];
  const last = youPts[youPts.length - 1];

  return (
    <div ref={wrapRef} style={{ width: "100%" }}>
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`You have finished ${race.doneSoFar} actions against a ghost of ${race.ghost}`} style={{ display: "block" }}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--bm-border)" strokeWidth={1} />
          <text x={padL - 8} y={y(t) + 4} textAnchor="end" fontSize={10} fill="var(--bm-text3)" fontFamily={mono}>{t}</text>
        </g>
      ))}
      {youArea && <polygon points={youArea} fill={color} opacity={0.14} />}
      <polyline points={ghostPts} fill="none" stroke="var(--bm-text3)" strokeWidth={2} strokeDasharray="5 5" strokeLinejoin="round" />
      {youLine && <polyline points={youLine} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />}
      {last && <circle cx={x(last.i)} cy={y(last.v)} r={5} fill={color} />}
      <circle cx={x(6)} cy={y(race.ghost)} r={4} fill="var(--bm-bg2)" stroke="var(--bm-text3)" strokeWidth={2} />
      <text x={x(6) + 10} y={y(race.ghost) + 4} fontSize={11} fill="var(--bm-text2)" fontFamily={mono}>ghost {race.ghost}</text>
      {DAY_INITIAL.map((d, i) => (
        <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize={11} fontFamily={mono} fill={i === race.todayIndex ? "var(--bm-accent)" : "var(--bm-text3)"} fontWeight={i === race.todayIndex ? 700 : 400}>{d}</text>
      ))}
    </svg>
    </div>
  );
}

function History({ race, limit }: { race: GhostRace; limit: number }) {
  const rows = race.history.slice(-limit);
  if (rows.length === 0) return null;
  const max = Math.max(7, ...rows.map((r) => Math.max(r.total, r.ghost)));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, color: "var(--bm-text)" }}>Past weeks against their ghost</span>
        {race.beatStreak > 0 && (
          <span style={{ fontFamily: mono, fontSize: 11, color: "var(--bm-green)" }}>
            {race.beatStreak} {race.beatStreak === 1 ? "week" : "weeks"} beaten in a row
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", height: 84 }}>
        {rows.map((r) => {
          const barArea = 62;
          return (
            <div key={r.weekStart} title={`Week of ${r.weekStart}: ${r.total} against a ghost of ${r.ghost}`} style={{ flex: "1 1 0", maxWidth: 72, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%", position: "relative" }}>
              <div style={{ position: "absolute", left: 0, right: 0, bottom: 20 + (r.ghost / max) * barArea, borderTop: "1.5px dashed var(--bm-text3)" }} />
              <div style={{ width: "62%", height: Math.max(5, (r.total / max) * barArea), borderRadius: 6, background: r.beat ? "var(--bm-green)" : "transparent", border: r.beat ? "none" : "1.5px solid var(--bm-text3)" }} />
              <span style={{ fontFamily: mono, fontSize: 11, color: "var(--bm-text2)", marginTop: 4, height: 16 }}>{r.total}</span>
            </div>
          );
        })}
      </div>
      <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: "var(--bm-text3)" }}>Solid bar: you beat that week&apos;s ghost. Hollow: you did not. Dashed line: the ghost.</span>
    </div>
  );
}

export function GhostRaceCard({ race }: { race: GhostRace }) {
  const { plan, limits, isLoading } = usePlan();
  const paid = plan === "builder";
  const cap = limits?.actionsPerWeek ?? -1;
  const blockedByPlan = !isLoading && !paid && cap > 0 && race.ghost > cap;
  const color = STATUS_COLOR[race.status];

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      aria-label="Ghost race"
      style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: "var(--r-lg)", padding: "16px", display: "flex", flexDirection: "column", gap: 14 }}
    >
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0, flex: "1 1 240px" }}>
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: "var(--bm-text3)" }}>This week&apos;s race against your ghost</span>
          <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 700, color, letterSpacing: "-0.01em", lineHeight: 1.3 }}>{race.headline}</span>
          {race.detail && <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: "var(--bm-text2)", lineHeight: 1.5 }}>{race.detail}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }} aria-label={`${race.doneSoFar} of ${race.ghost}`}>
          <span style={{ fontFamily: "'Syne', sans-serif", fontSize: "clamp(24px, 6vw, 28px)", fontWeight: 800, lineHeight: 1, letterSpacing: "-0.03em", color: "var(--bm-text)" }}>{race.doneSoFar}</span>
          <span style={{ fontFamily: mono, fontSize: 13, color: "var(--bm-text3)" }}>/ {race.ghost}</span>
        </div>
      </div>

      <RaceChart race={race} />

      <p style={{ margin: 0, fontFamily: "'Inter', sans-serif", fontSize: 12, color: "var(--bm-text3)", lineHeight: 1.5 }}>{race.basisText}</p>

      {blockedByPlan && (
        <div style={{ borderRadius: 12, border: "1px solid var(--bm-accent-bd)", background: "var(--bm-accent-dim)", padding: "12px 14px", display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: "var(--bm-text)", lineHeight: 1.5, flex: "1 1 220px" }}>
            Your ghost is {race.ghost}, and Free includes {cap} Today actions a week. You have outgrown the free week.
          </span>
          <Link href="/upgrade?feature=ghost" style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 700, color: "var(--bm-text-inv)", background: "var(--bm-accent)", padding: "8px 14px", borderRadius: 9, textDecoration: "none" }}>
            Race it with Builder
          </Link>
        </div>
      )}

      <History race={race} limit={paid ? 12 : 3} />

      {race.history.length > 0 && (
        paid ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, borderTop: "1px solid var(--bm-border)", paddingTop: 14 }}>
            <div>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: "var(--bm-text3)" }}>On this pace you finish</div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 700, color: race.projected >= race.ghost ? "var(--bm-green)" : "var(--bm-text)" }}>
                {race.projected} {race.projected === 1 ? "action" : "actions"}
              </div>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: "var(--bm-text3)" }}>{race.projected >= race.ghost ? "Enough to beat the ghost." : `${race.ghost - race.projected} short of the ghost.`}</div>
            </div>
            <div>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: "var(--bm-text3)" }}>The day you usually slip</div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 700, color: "var(--bm-text)" }}>{race.slipDay === null ? "No pattern yet" : dayName(race.slipDay)}</div>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: "var(--bm-text3)" }}>{race.slipDay === null ? "Needs three active weeks." : "Plan your hardest action for the day before."}</div>
            </div>
          </div>
        ) : (
          <div style={{ borderTop: "1px solid var(--bm-border)", paddingTop: 14, display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: "var(--bm-text2)", lineHeight: 1.5, flex: "1 1 240px" }}>
              Builder adds your pace forecast, the weekday you usually slip on, and twelve weeks of ghost history.
            </span>
            <Link href="/upgrade?feature=ghost" style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, color: "var(--bm-accent)", textDecoration: "none" }}>See what Builder adds</Link>
          </div>
        )
      )}
    </motion.section>
  );
}
