"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronRight } from "lucide-react";

type Outcome = "completed" | "blocked" | "partial" | "learned";

const OUTCOME_CHIPS = [
  { id: "completed" as Outcome, label: "Nailed it",        sublabel: "Made real progress", color: "var(--bm-accent)", bg: "var(--bm-accent-dim)",      border: "var(--bm-accent-bd)",        icon: "✓" },
  { id: "partial"   as Outcome, label: "Partly done",      sublabel: "Some progress",       color: "var(--bm-amber)", bg: "rgba(232,160,32,0.08)",      border: "rgba(232,160,32,0.22)",      icon: "◐" },
  { id: "blocked"   as Outcome, label: "Got blocked",      sublabel: "Hit a roadblock",     color: "var(--bm-red)",   bg: "rgba(224,85,85,0.08)",       border: "rgba(224,85,85,0.22)",       icon: "✕" },
  { id: "learned"   as Outcome, label: "Learned something",sublabel: "New insight",         color: "#A78BFA",         bg: "rgba(167,139,250,0.08)",     border: "rgba(167,139,250,0.22)",     icon: "↯" },
];

const CONFIDENCE_LABELS = ["", "Lost", "Uncertain", "Steady", "Confident", "Unstoppable"];
const CONFIDENCE_COLORS = ["", "var(--bm-red)", "var(--bm-amber)", "var(--bm-text2)", "var(--bm-accent)", "var(--bm-accent)"];

interface Props {
  open: boolean;
  onDone: (outcome: Outcome, note: string, confidence: number) => void;
  onClose: () => void;
  projectStage?: string;
  taskAction?: string;
}

export function ReflectSheet({ open, onDone, onClose, projectStage = "Idea", taskAction }: Props) {
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [note, setNote] = useState("");
  const [confidence, setConfidence] = useState(3);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) { setOutcome(null); setNote(""); setConfidence(3); setSubmitting(false); }
  }, [open]);

  async function handleSubmit() {
    if (!outcome || submitting) return;
    setSubmitting(true);
    try {
      await fetch("/api/reflect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome, note, confidence, stage: projectStage }),
      });
    } catch { /* non-fatal */ }
    onDone(outcome, note, confidence);
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 80, backdropFilter: "blur(2px)" }}
          />
          <motion.div key="sheet"
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 320 }}
            style={{
              position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 81,
              background: "var(--bm-bg2)", borderTop: "1px solid var(--bm-border2)",
              borderRadius: "20px 20px 0 0", padding: "24px 20px 36px",
              maxHeight: "85vh", overflowY: "auto",
            }}
          >
            <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--bm-bg4)", margin: "0 auto 20px" }} />

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, color: "var(--bm-text4)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 3px" }}>Reflexion Loop</p>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--bm-text)", letterSpacing: "-0.03em", margin: 0 }}>Reflect on today</h2>
              </div>
              <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--bm-text4)", cursor: "pointer", padding: 4 }} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            {taskAction && (
              <div style={{ background: "var(--bm-bg3)", border: "1px solid var(--bm-border)", borderRadius: 8, padding: "10px 12px", marginBottom: 18 }}>
                <p style={{ fontSize: 11, color: "var(--bm-text4)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 4px", fontWeight: 700 }}>Today's task</p>
                <p style={{ fontSize: 13, color: "var(--bm-text2)", margin: 0, lineHeight: 1.5 }}>{taskAction}</p>
              </div>
            )}

            <p style={{ fontSize: 11, fontWeight: 700, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 10px" }}>How did it go?</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
              {OUTCOME_CHIPS.map((chip) => (
                <button key={chip.id} onClick={() => setOutcome(chip.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "11px 14px",
                    borderRadius: 10, border: `1px solid ${outcome === chip.id ? chip.border : "var(--bm-border)"}`,
                    background: outcome === chip.id ? chip.bg : "var(--bm-bg3)",
                    cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "all 0.15s",
                  }}>
                  <span style={{ fontSize: 16, color: chip.color, flexShrink: 0 }}>{chip.icon}</span>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: outcome === chip.id ? chip.color : "var(--bm-text2)", margin: 0 }}>{chip.label}</p>
                    <p style={{ fontSize: 11, color: "var(--bm-text4)", margin: 0 }}>{chip.sublabel}</p>
                  </div>
                </button>
              ))}
            </div>

            <p style={{ fontSize: 11, fontWeight: 700, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px" }}>
              What happened? <span style={{ opacity: 0.5, textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>(optional)</span>
            </p>
            <textarea value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Blockers, insights, or what you'd do differently..." rows={3}
              style={{ width: "100%", background: "var(--bm-bg3)", border: "1px solid var(--bm-border)", borderRadius: 10, padding: "11px 13px", color: "var(--bm-text)", fontSize: 14, fontFamily: "inherit", resize: "none", outline: "none", boxSizing: "border-box", marginBottom: 20 }}
            />

            <p style={{ fontSize: 11, fontWeight: 700, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 10px" }}>Confidence level</p>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              {[1, 2, 3, 4, 5].map((v) => (
                <button key={v} onClick={() => setConfidence(v)}
                  style={{
                    flex: 1, height: 36, borderRadius: 8,
                    border: `1px solid ${confidence === v ? CONFIDENCE_COLORS[v] + "44" : "var(--bm-border)"}`,
                    background: confidence === v ? CONFIDENCE_COLORS[v] + "18" : "var(--bm-bg3)",
                    color: confidence === v ? CONFIDENCE_COLORS[v] : "var(--bm-text3)",
                    fontSize: 13, fontWeight: confidence === v ? 700 : 400, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
                  }}>{v}</button>
              ))}
            </div>
            <p style={{ fontSize: 11, color: CONFIDENCE_COLORS[confidence], textAlign: "center", marginBottom: 24, fontWeight: 600 }}>
              {CONFIDENCE_LABELS[confidence]}
            </p>

            <button onClick={handleSubmit} disabled={!outcome || submitting}
              style={{
                width: "100%", padding: "14px", borderRadius: 12, border: "none",
                background: outcome ? "var(--bm-accent)" : "var(--bm-bg4)",
                color: outcome ? "#fff" : "var(--bm-text4)",
                fontSize: 14, fontWeight: 600, cursor: outcome ? "pointer" : "not-allowed",
                fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "all 0.15s",
              }}>
              {submitting ? "Logging reflection…" : "Log reflection"}
              {!submitting && <ChevronRight size={16} />}
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default ReflectSheet;