"use client";
/**
 * components/today/StatusTicker.tsx: Today's status updates as ONE moving headline, so the task keeps the space.
 * Rotates every few seconds; stops while the founder hovers, focuses, or has the full list open; never moves for
 * people who ask for reduced motion (they get the first update and a button to step through). The full list is always
 * one tap away. A quiet day renders nothing.
 */
import React from "react";
import Link from "next/link";
import { BREAK_SEED_KEY, seedIsFresh, type BreakSeed } from "@/lib/break/frontDoor";
import { slotAllowed, statusLine, type SlotCandidate, type StatusInputs } from "@/lib/today/slot";
import { nextIndex, tickerItems, type TickerItem } from "@/lib/today/ticker";

const KEY = "bm_today_slot_dismissed";
const ROTATE_MS = 6000;
const readDismissed = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, string>; } catch { return {}; } };

export default function StatusTicker({ projectId, cogLoad, recoveryActive, radar }: {
  projectId: string | null | undefined;
  cogLoad: "low" | "normal" | "high" | null;
  recoveryActive: boolean;
  /** Radar's quiet line (watching / empty). Urgent Radar keeps its own bar elsewhere. */
  radar?: { text: string; href: string; cta: string } | null;
}) {
  const [data, setData] = React.useState<{ candidates: SlotCandidate[]; status: StatusInputs } | null>(null);
  const [dismissed, setDismissed] = React.useState<Record<string, string>>({});
  const [seed, setSeed] = React.useState<BreakSeed | null>(null);
  const [idx, setIdx] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [reduced, setReduced] = React.useState(false);

  React.useEffect(() => {
    setDismissed(readDismissed());
    try { const raw = localStorage.getItem(BREAK_SEED_KEY); const s = raw ? (JSON.parse(raw) as BreakSeed) : null; if (seedIsFresh(s)) setSeed(s); } catch { /* ignore */ }
    try { setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch { /* ignore */ }
    if (!projectId) return;
    let alive = true;
    fetch(`/api/today/slot?projectId=${encodeURIComponent(projectId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j?.success) setData({ candidates: j.candidates ?? [], status: j.status ?? {} }); })
      .catch(() => {});
    return () => { alive = false; };
  }, [projectId]);

  const allowed = Boolean(data) && slotAllowed(cogLoad, recoveryActive);
  const seedCand: SlotCandidate[] = seed ? [{ id: `seed:${seed.savedAt}`, kind: "seed", text: `Your stress test said: ${seed.advice}`, href: "/break-my-startup", cta: "Open" }] : [];
  const items: TickerItem[] = allowed && data ? tickerItems({ candidates: [...seedCand, ...data.candidates], dismissed, progress: statusLine(data.status), radar }) : [];
  const count = items.length;
  const safeIdx = count ? idx % count : 0;

  React.useEffect(() => {
    if (reduced || paused || open || count < 2) return;
    const t = setInterval(() => setIdx((i) => nextIndex(i, count)), ROTATE_MS);
    return () => clearInterval(t);
  }, [reduced, paused, open, count]);

  if (!count) return null;
  const cur = items[safeIdx];

  function dismiss(id: string) {
    const next = { ...dismissed, [id]: new Date().toISOString() };
    setDismissed(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode */ }
  }
  const row: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, minHeight: 40, minWidth: 0 };
  const ghost: React.CSSProperties = { minHeight: 32, padding: "0 8px", fontSize: 12, color: "var(--bm-text3)", background: "transparent", border: 0, cursor: "pointer", whiteSpace: "nowrap" };

  return (
    <section aria-label="Status updates" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}
      style={{ marginBottom: 12, border: "1px solid var(--bm-border)", borderRadius: 10, padding: "2px 10px", background: "var(--bm-surface, transparent)" }}>
      <style>{`@keyframes bmTickIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}.bm-tick{animation:bmTickIn .35s ease-out}@media (prefers-reduced-motion:reduce){.bm-tick{animation:none}}`}</style>
      <div style={row}>
        <span key={cur.id} className="bm-tick" style={{ flex: 1, minWidth: 0, fontSize: 13, color: "var(--bm-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: open ? "normal" : "nowrap" }} title={cur.text}>{cur.text}</span>
        {cur.href && cur.cta && <Link href={cur.href} style={{ fontSize: 12, fontWeight: 600, color: "var(--bm-text)", textDecoration: "underline", whiteSpace: "nowrap" }}>{cur.cta}</Link>}
        {count > 1 && (
          <button type="button" style={ghost} aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? "Hide" : `${count} updates`}</button>
        )}
        {reduced && count > 1 && !open && <button type="button" style={ghost} onClick={() => setIdx((i) => nextIndex(i, count))}>Next</button>}
      </div>
      {open && (
        <ul style={{ listStyle: "none", margin: 0, padding: "0 0 8px", display: "grid", gap: 6 }}>
          {items.map((it) => (
            <li key={it.id} style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap", fontSize: 13, color: "var(--bm-text2)" }}>
              <span style={{ flex: "1 1 220px", minWidth: 0, overflowWrap: "anywhere" }}>{it.text}</span>
              {it.href && it.cta && <Link href={it.href} style={{ fontSize: 12, fontWeight: 600, color: "var(--bm-text)", textDecoration: "underline" }}>{it.cta}</Link>}
              {it.dismissible && <button type="button" onClick={() => dismiss(it.id)} style={ghost} aria-label="Hide this for a few days">Hide</button>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
