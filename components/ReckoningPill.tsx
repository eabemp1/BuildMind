"use client";

/**
 * components/ReckoningPill.tsx
 *
 * The Reckoning — GET /api/monthly-reckoning already exists server-side
 * (lib/monthlyReckoning.ts: a milestone qualifies as stale after ~21 days
 * of no real activity) but had no UI at all before this. Per the Today
 * page's task-first rule, this renders NOTHING on the ~29 days a month
 * there's no stale goal — no reserved space, no empty card. On the rare
 * day GET returns a real row, a small pill appears; tapping it opens the
 * revive/kill decision.
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";

interface Reckoning {
  id: string;
  milestone_id: string;
  milestone_title_snapshot: string;
  days_stale_at_detection: number;
  status: "pending" | "revived" | "killed";
}

export default function ReckoningPill({ projectId }: { projectId: string }) {
  const [reckoning, setReckoning] = useState<Reckoning | null>(null);
  const [open, setOpen] = useState(false);
  const [resolving, setResolving] = useState<"revive" | "kill" | null>(null);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    fetch(`/api/monthly-reckoning?project_id=${projectId}`)
      .then(r => r.ok ? r.json() : null)
      .then((json: { ok: boolean; data?: Reckoning | null } | null) => {
        if (cancelled) return;
        // GET returns { data: null } on every normal day — that's the
        // expected, good state, not an error. Only a real pending row
        // renders anything.
        if (json?.ok && json.data && json.data.status === "pending") {
          setReckoning(json.data);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [projectId]);

  async function resolve(action: "revive" | "kill") {
    if (!reckoning) return;
    setResolving(action);
    try {
      const res = await fetch("/api/monthly-reckoning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, action }),
      });
      if (res.ok) {
        setReckoning(null);
        setOpen(false);
      }
    } catch {
      // Non-fatal — leaves the pill up so the founder can retry.
    } finally {
      setResolving(null);
    }
  }

  // Zero height on every ordinary day — no reserved space at all.
  if (!reckoning) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: "3px 9px",
          borderRadius: 99,
          border: "1px solid rgba(224,85,85,0.25)",
          background: "var(--bm-bg3)",
          color: "var(--bm-red, #E05555)",
          fontFamily: "'DM Mono', monospace",
          fontSize: 10,
          cursor: "pointer",
          flexShrink: 0,
        }}
        title={`"${reckoning.milestone_title_snapshot}" — ${reckoning.days_stale_at_detection} days stale`}
      >
        <AlertTriangle size={10} />
        Reckoning
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{
              position: "fixed", inset: 0, zIndex: 999,
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: 20, background: "rgba(12,13,15,0.82)", backdropFilter: "blur(10px)",
              fontFamily: "inherit",
            }}
            onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}
          >
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              style={{
                width: "100%", maxWidth: 380,
                borderRadius: 14, border: "1px solid rgba(224,85,85,0.25)",
                background: "var(--bm-bg2)", overflow: "hidden", padding: "16px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--bm-red, #E05555)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  The Reckoning
                </span>
                <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--bm-text4)" }}>
                  <X size={14} />
                </button>
              </div>

              <p style={{ fontSize: 13, color: "var(--bm-text2)", lineHeight: 1.6, margin: "0 0 14px" }}>
                <strong style={{ color: "var(--bm-text)" }}>&ldquo;{reckoning.milestone_title_snapshot}&rdquo;</strong> hasn&apos;t
                seen real activity in {reckoning.days_stale_at_detection} days. Decide now — revive it with fresh
                intent, or kill it and free up the space.
              </p>

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => void resolve("revive")}
                  disabled={resolving !== null}
                  style={{
                    flex: 1, padding: "9px 12px", borderRadius: 8,
                    border: "1px solid var(--bm-accent-bd)", background: "var(--bm-accent)",
                    color: "var(--bm-bg)", fontSize: 12, fontWeight: 700,
                    cursor: resolving !== null ? "not-allowed" : "pointer",
                    opacity: resolving !== null && resolving !== "revive" ? 0.5 : 1,
                    fontFamily: "inherit",
                  }}
                >
                  {resolving === "revive" ? "Reviving..." : "Revive"}
                </button>
                <button
                  onClick={() => void resolve("kill")}
                  disabled={resolving !== null}
                  style={{
                    flex: 1, padding: "9px 12px", borderRadius: 8,
                    border: "1px solid var(--bm-border2)", background: "var(--bm-bg3)",
                    color: "var(--bm-text2)", fontSize: 12, fontWeight: 600,
                    cursor: resolving !== null ? "not-allowed" : "pointer",
                    opacity: resolving !== null && resolving !== "kill" ? 0.5 : 1,
                    fontFamily: "inherit",
                  }}
                >
                  {resolving === "kill" ? "Killing..." : "Kill it"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
