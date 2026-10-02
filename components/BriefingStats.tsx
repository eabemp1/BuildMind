"use client";

/**
 * components/BriefingStats.tsx
 *
 * The deterministic half of the Morning Briefing: where the founder stands
 * right now, from real data — momentum + weekly change, streak, active days
 * vs the same point last week, the overdue milestone, the avoidance pattern,
 * and one-tap next steps. No AI call: instant, free for every plan, and it
 * cannot invent a number. Reads GET /api/founder-context/snapshot, the same
 * source the Cofounder Pulse uses, so surfaces never disagree on momentum.
 *
 * Shared by MorningBriefingModal (what founders see on first open) and
 * MorningBriefingCard.
 */

import { useEffect, useState } from "react";
import { truncateChars } from "@/lib/textTruncate";

type Snap = {
  momentum: number | null; momentumDelta: number | null; calibrating: boolean;
  streak: number; activeDaysThisWeek: number; daysElapsedThisWeek: number; activeDaysLastWeekSamePoint: number;
  completedToday: boolean; pendingActionTitle: string | null;
  overdueMilestones: number; worstOverdue: { title: string; daysLate: number } | null; topAvoidance: string | null;
};

export function paceLine(sn: Pick<Snap, "activeDaysThisWeek" | "activeDaysLastWeekSamePoint" | "daysElapsedThisWeek">): string {
  const diff = sn.activeDaysThisWeek - sn.activeDaysLastWeekSamePoint;
  if (sn.daysElapsedThisWeek <= 1 && sn.activeDaysThisWeek === 0) return "Fresh week — the first completed action sets the pace.";
  if (diff > 0) return `${diff} day${diff === 1 ? "" : "s"} ahead of the same point last week.`;
  if (diff < 0) return `${Math.abs(diff)} day${Math.abs(diff) === 1 ? "" : "s"} behind the same point last week — one completed action today closes ${Math.abs(diff) === 1 ? "it" : "part of it"}.`;
  return "Level with last week so far.";
}

export default function BriefingStats({ onNavigate }: { onNavigate?: () => void }) {
  const [snap, setSnap] = useState<Snap | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/founder-context/snapshot", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled && j?.ok && j.data) setSnap(j.data as Snap); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!snap) return null;

  const tiles = [
    { k: "Momentum", v: snap.calibrating || snap.momentum === null ? "—" : String(snap.momentum), sub: snap.calibrating ? "calibrating" : snap.momentumDelta !== null ? `${snap.momentumDelta >= 0 ? "+" : ""}${snap.momentumDelta} vs last wk` : "" },
    { k: "Streak", v: `${snap.streak}d`, sub: snap.completedToday ? "kept today" : "alive if you act" },
    { k: "Week", v: `${snap.activeDaysThisWeek}/${snap.daysElapsedThisWeek}`, sub: "active days" },
  ];

  const scrollToAction = () => {
    onNavigate?.();
    setTimeout(() => document.getElementById("today-action")?.scrollIntoView({ behavior: "smooth", block: "start" }), 250);
  };

  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--bm-border)", display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6 }}>
        {tiles.map((m) => (
          <div key={m.k} style={{ background: "var(--bm-bg3)", border: "1px solid var(--bm-border)", borderRadius: 8, padding: "7px 6px", textAlign: "center", minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--bm-text)" }}>{m.v}</div>
            <div style={{ fontSize: 9, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{m.k}</div>
            {m.sub && <div style={{ fontSize: 9, color: "var(--bm-text3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.sub}</div>}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--bm-text2)", lineHeight: 1.55 }}>{paceLine(snap)}</div>
      {snap.worstOverdue && (
        <div style={{ fontSize: 11.5, color: "var(--bm-amber)", lineHeight: 1.5 }}>
          ⏳ “{truncateChars(snap.worstOverdue.title, 46)}” is {snap.worstOverdue.daysLate}d past target{snap.overdueMilestones > 1 ? ` · ${snap.overdueMilestones - 1} more overdue` : ""}
        </div>
      )}
      {snap.topAvoidance && (
        <div style={{ fontSize: 11.5, color: "var(--bm-text3)", lineHeight: 1.5 }}>🪞 Pattern to watch: you keep sidestepping “{truncateChars(snap.topAvoidance, 40)}”.</div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {!snap.completedToday && (
          <button onClick={scrollToAction} style={{ fontSize: 11, fontWeight: 600, padding: "7px 11px", borderRadius: 8, background: "var(--bm-accent)", color: "#fff", border: "none", cursor: "pointer", fontFamily: "inherit", maxWidth: "100%" }}>
            {snap.pendingActionTitle ? `Start: ${truncateChars(snap.pendingActionTitle, 30)}` : "Go to today’s action"}
          </button>
        )}
        <a href="/ai-coach" style={{ fontSize: 11, padding: "7px 11px", borderRadius: 8, border: "1px solid var(--bm-border)", color: "var(--bm-text2)", textDecoration: "none" }}>Ask the Coach</a>
        {snap.completedToday && (
          <a href="/reflect" style={{ fontSize: 11, padding: "7px 11px", borderRadius: 8, border: "1px solid var(--bm-accent-bd)", color: "var(--bm-accent)", textDecoration: "none" }}>Reflect on today’s win</a>
        )}
      </div>
    </div>
  );
}
