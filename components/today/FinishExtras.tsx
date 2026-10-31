"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { pickCrossLink, type CrossLink, type CrossLinkInput } from "@/lib/today/crossLinks";

const KEY = "bm_xlink_seen";

function readSeen(): Record<string, string> {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; }
}
function markSeen(id: string, day: string) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...readSeen(), [id]: day })); } catch { /* storage unavailable */ }
}

/**
 * Shown only on the finish screen, after a task: one line of what BuildMind did this week, and at most one
 * pointer to Break My Startup or the Agent workspace (rules in lib/today/crossLinks.ts). Renders nothing until
 * it has real numbers, and nothing at all when it has nothing useful to say.
 */
export function FinishExtras({ startup, band, outcome, tasksCompleted }: { startup: string; band: string; outcome: CrossLinkInput["outcome"]; tasksCompleted: number }) {
  const [week, setWeek] = useState<{ finished: number; prepared: number } | null>(null);
  const [link, setLink] = useState<CrossLink | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/today/crosslinks", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!live || !d?.ok) return;
        if (d.week?.finished >= 1) setWeek(d.week);
        const today = new Date().toISOString().slice(0, 10);
        const pick = pickCrossLink({ tasksCompleted, outcome, band, breakAgeDays: d.breakAgeDays ?? null, hasAgentRun: Boolean(d.hasAgentRun), startup, seen: readSeen(), today });
        if (pick) { setLink(pick); markSeen(pick.id, today); }
      })
      .catch(() => {});
    return () => { live = false; };
  }, [startup, band, outcome, tasksCompleted]);

  if (!week && !link) return null;
  return (
    <div style={{ display: "grid", gap: 10, marginBottom: 20, textAlign: "left" }}>
      {week && (
        <p style={{ margin: 0, fontSize: 13, color: "var(--bm-text3)", lineHeight: 1.5 }}>
          This week: {week.finished} {week.finished === 1 ? "task" : "tasks"} finished{week.prepared > 0 ? `, ${week.prepared} ${week.prepared === 1 ? "piece" : "pieces"} of work prepared for you` : ""}.
        </p>
      )}
      {link && (
        <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 12, padding: "12px 14px", display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: "var(--bm-text2)", lineHeight: 1.5, flex: "1 1 220px" }}>{link.text}</span>
          <Link href={link.href} style={{ fontSize: 13, fontWeight: 600, color: "var(--bm-accent)", textDecoration: "none", whiteSpace: "nowrap" }}>{link.cta} →</Link>
        </div>
      )}
    </div>
  );
}
