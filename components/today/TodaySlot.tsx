"use client";
/**
 * components/today/TodaySlot.tsx - the one "what changed" line on Today, and a collapsed status line.
 * The server lists facts; lib/today/slot.ts picks one by rule. A drained day, a recovery day, or a quiet
 * week renders nothing. Dismissing hides that fact for a few days (this browser only).
 */
import React from "react";
import Link from "next/link";
import { BREAK_SEED_KEY, seedIsFresh, type BreakSeed } from "@/lib/break/frontDoor";
import { pickSlot, slotAllowed, statusLine, type SlotCandidate, type StatusInputs } from "@/lib/today/slot";

const KEY = "bm_today_slot_dismissed";
const readDismissed = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, string>; } catch { return {}; } };

export default function TodaySlot({ projectId, cogLoad, recoveryActive }: { projectId: string | null | undefined; cogLoad: "low" | "normal" | "high" | null; recoveryActive: boolean }) {
  const [data, setData] = React.useState<{ candidates: SlotCandidate[]; status: StatusInputs } | null>(null);
  const [dismissed, setDismissed] = React.useState<Record<string, string>>({});
  const [open, setOpen] = React.useState(false);
  const [seed, setSeed] = React.useState<BreakSeed | null>(null);

  React.useEffect(() => {
    setDismissed(readDismissed());
    try { const raw = localStorage.getItem(BREAK_SEED_KEY); const s = raw ? (JSON.parse(raw) as BreakSeed) : null; if (seedIsFresh(s)) setSeed(s); } catch { /* no saved stress test */ }
    if (!projectId) return;
    let alive = true;
    fetch(`/api/today/slot?projectId=${encodeURIComponent(projectId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j?.success) setData({ candidates: j.candidates ?? [], status: j.status ?? {} }); })
      .catch(() => {});
    return () => { alive = false; };
  }, [projectId]);

  if (!data || !slotAllowed(cogLoad, recoveryActive)) return null;
  const seedCand: SlotCandidate[] = seed ? [{ id: `seed:${seed.savedAt}`, kind: "seed", text: `Your stress test said: ${seed.advice}`, href: "/break-my-startup", cta: "Open the full stress test" }] : [];
  const slot = pickSlot([...seedCand, ...data.candidates], dismissed);
  const line = statusLine(data.status);
  if (!slot && !line) return null;

  function dismiss(id: string) {
    const next = { ...dismissed, [id]: new Date().toISOString() };
    setDismissed(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode */ }
  }

  return (
    <div style={{ marginBottom: 12, display: "grid", gap: 6 }}>
      {slot && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", border: "1px solid var(--bm-border)", borderRadius: 10, padding: "9px 12px", background: "var(--bm-surface, transparent)" }}>
          <span style={{ flex: "1 1 220px", fontSize: 13, color: "var(--bm-text)" }}>{slot.text}</span>
          {slot.href && slot.cta && <Link href={slot.href} style={{ fontSize: 12, fontWeight: 600, color: "var(--bm-text)", textDecoration: "underline" }}>{slot.cta}</Link>}
          <button type="button" onClick={() => dismiss(slot.id)} aria-label="Hide this for a few days" style={{ fontSize: 12, color: "var(--bm-text3)", background: "transparent", border: 0, cursor: "pointer" }}>Hide</button>
        </div>
      )}
      {line && (
        <div>
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} style={{ fontSize: 12, color: "var(--bm-text3)", background: "transparent", border: 0, padding: 0, cursor: "pointer" }}>
            {open ? "Hide status" : "Status"}
          </button>
          {open && <span style={{ fontSize: 12, color: "var(--bm-text3)", marginLeft: 8 }}>{line}</span>}
        </div>
      )}
    </div>
  );
}
