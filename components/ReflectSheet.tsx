/**
 * components/ReflectSheet.tsx
 *
 * Product Improvement #1 — Reflect as a bottom-sheet modal, not a separate route.
 *
 * Triggered from Today's done state ("Done — reflect on this?" CTA).
 * Slides up from the bottom of the screen as a sheet overlay.
 * On submit, calls the existing /api/reflect endpoint and calls onDone().
 *
 * Usage:
 *   import { ReflectSheet } from "@/components/ReflectSheet";
 *   <ReflectSheet open={showReflect} onDone={() => setShowReflect(false)} projectStage="Idea" />
 */

"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronRight } from "lucide-react";

type Outcome = "completed" | "blocked" | "partial" | "learned";

const OUTCOME_CHIPS: {
  id: Outcome;
  label: string;
  sublabel: string;
  color: string;
  bg: string;
  border: string;
  icon: string;
}[] = [
  { id: "completed", label: "Nailed it",         sublabel: "Made real progress", color: "var(--bm-accent)",  bg: "var(--bm-accent-dim)",       border: "var(--bm-accent-bd)",         icon: "✓" },
  { id: "partial",   label: "Partly done",        sublabel: "Some progress",      color: "var(--bm-amber)",   bg: "rgba(232,160,32,0.08)",       border: "rgba(232,160,32,0.22)",       icon: "◐" },
  { id: "blocked",   label: "Got blocked",        sublabel: "Hit a roadblock",    color: "var(--bm-red)",     bg: "rgba(224,85,85,0.08)",        border: "rgba(224,85,85,0.22)",        icon: "✕" },
  { id: "learned",   label: "Learned something",  sublabel: "New insight",        color: "#A78BFA",           bg: "rgba(167,139,250,0.08)",      border: "rgba(167,139,250,0.22)",      icon: "↯" },
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
  const [outcome, setOutcome]         = useState<Outcome | null>(null);
  const [whatTried, setWhatTried]     = useState("");   // specific action attempted
  const [whatHappened, setWhatHappened] = useState(""); // concrete result/metric
  const [whatLearned, setWhatLearned] = useState("");   // insight extracted
  const [blocker, setBlocker]         = useState("");   // exact blocker if blocked
  const [confidence, setConfidence]   = useState(3);
  const [submitting, setSubmitting]   = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [extracting, setExtracting]   = useState(false);

  // Reset on open
  useEffect(() => {
    if (open) {
      setOutcome(null);
      setWhatTried("");
      setWhatHappened("");
      setWhatLearned("");
      setBlocker("");
      setConfidence(3);
      setSubmitting(false);
      setUploadedFile(null);
      setExtracting(false);
    }
  }, [open]);

  const canSubmit = outcome !== null && whatTried.trim().length > 0;

  // ── File upload extraction ────────────────────────────────────────────────
  // Founder drops a screenshot, markdown, or CSV — AI extracts structured data
  async function handleFileExtract(file: File) {
    setExtracting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/reflect/extract", { method: "POST", body: formData });
      if (res.ok) {
        const data = await res.json();
        if (data.what_tried)    setWhatTried(prev    => prev || data.what_tried);
        if (data.what_happened) setWhatHappened(prev => prev || data.what_happened);
        if (data.what_learned)  setWhatLearned(prev  => prev || data.what_learned);
        if (data.blocker)       setBlocker(prev       => prev || data.blocker);
        if (data.outcome)       setOutcome(prev       => prev || data.outcome);
      }
    } catch {
      // Non-fatal — founder can fill manually
    }
    setExtracting(false);
  }

  async function handleSubmit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    // Compose rich note for backward compat with AI prompt
    const richNote = [
      whatTried    ? `Tried: ${whatTried}`         : "",
      whatHappened ? `Result: ${whatHappened}`      : "",
      whatLearned  ? `Learned: ${whatLearned}`      : "",
      blocker      ? `Blocker: ${blocker}`          : "",
    ].filter(Boolean).join(" | ");
    try {
      await fetch("/api/ai/reflect-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outcome,
          note: richNote,
          what_tried:    whatTried,
          what_happened: whatHappened,
          what_learned:  whatLearned,
          blocker:       blocker || undefined,
          confidence,
          stage: projectStage,
          todayAction: taskAction ?? "",
          streak: 0,
        }),
      });
    } catch {
      // Non-fatal — local state still updates
    }
    onDone(outcome!, richNote, confidence);
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.55)",
              zIndex: 80,
              backdropFilter: "blur(2px)",
            }}
          />

          {/* Sheet */}
          <motion.div
            key="sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 320 }}
            style={{
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 81,
              background: "var(--bm-bg2)",
              borderTop: "1px solid var(--bm-border2)",
              borderRadius: "20px 20px 0 0",
              padding: "24px 20px 36px",
              maxHeight: "85vh",
              overflowY: "auto",
            }}
          >
            {/* Drag handle */}
            <div
              style={{
                width: 36,
                height: 4,
                borderRadius: 2,
                background: "var(--bm-bg4)",
                margin: "0 auto 20px",
              }}
            />

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, color: "var(--bm-text4)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 3px" }}>
                  Reflexion Loop
                </p>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--bm-text)", letterSpacing: "-0.03em", margin: 0 }}>
                  Reflect on today
                </h2>
              </div>
              <button
                onClick={onClose}
                style={{ background: "none", border: "none", color: "var(--bm-text4)", cursor: "pointer", padding: 4 }}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {taskAction && (
              <div style={{ background: "var(--bm-bg3)", border: "1px solid var(--bm-border)", borderRadius: 8, padding: "10px 12px", marginBottom: 18 }}>
                <p style={{ fontSize: 11, color: "var(--bm-text4)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 4px", fontWeight: 700 }}>Today's task</p>
                <p style={{ fontSize: 13, color: "var(--bm-text2)", margin: 0, lineHeight: 1.5 }}>{taskAction}</p>
              </div>
            )}

            {/* Outcome chips */}
            <p style={{ fontSize: 11, fontWeight: 700, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 10px" }}>
              How did it go?
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
              {OUTCOME_CHIPS.map((chip) => (
                <button
                  key={chip.id}
                  onClick={() => setOutcome(chip.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "11px 14px",
                    borderRadius: 10,
                    border: `1px solid ${outcome === chip.id ? chip.border : "var(--bm-border)"}`,
                    background: outcome === chip.id ? chip.bg : "var(--bm-bg3)",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    textAlign: "left",
                    transition: "all 0.15s",
                  }}
                >
                  <span style={{ fontSize: 16, color: chip.color, flexShrink: 0 }}>{chip.icon}</span>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: outcome === chip.id ? chip.color : "var(--bm-text2)", margin: 0 }}>{chip.label}</p>
                    <p style={{ fontSize: 11, color: "var(--bm-text4)", margin: 0 }}>{chip.sublabel}</p>
                  </div>
                </button>
              ))}
            </div>

            {/* ── File upload — screenshot / markdown / CSV ─────────────────── */}
            <div
              style={{
                border: "1px dashed var(--bm-border2)",
                borderRadius: 10,
                padding: "12px 14px",
                marginBottom: 16,
                display: "flex",
                alignItems: "center",
                gap: 10,
                cursor: "pointer",
                background: uploadedFile ? "var(--bm-bg3)" : "transparent",
              }}
              onClick={() => document.getElementById("reflect-file-input")?.click()}
            >
              <span style={{ fontSize: 18 }}>📎</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--bm-text2)" }}>
                  {extracting ? "Extracting data from file…" : uploadedFile ? uploadedFile.name : "Upload markdown, CSV, or text log"}
                </div>
                <div style={{ fontSize: 11, color: "var(--bm-text4)", marginTop: 2 }}>
                  AI will extract your data points automatically
                </div>
              </div>
              {uploadedFile && !extracting && (
                <span style={{ fontSize: 11, color: "var(--bm-green)", fontWeight: 700 }}>✓ Done</span>
              )}
            </div>
            <input
              id="reflect-file-input"
              type="file"
              accept=".md,.csv,.txt"
              style={{ display: "none" }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setUploadedFile(file);
                await handleFileExtract(file);
              }}
            />

            {/* ── Rich data capture fields ──────────────────────────────────── */}
            {(["what_tried", "what_happened", "what_learned", ...(outcome === "blocked" ? ["blocker"] : [])] as const).map((field) => {
              const cfg = {
                what_tried:    { label: "What did you actually try?", required: true,  placeholder: "Specific action: posted on Reddit r/indiehackers, cold-emailed 5 founders…", value: whatTried,    set: setWhatTried },
                what_happened: { label: "What concretely happened?",  required: false, placeholder: "Numbers if possible: 3 replies, 0 signups, 1 interested DM, post got 47 upvotes…", value: whatHappened, set: setWhatHappened },
                what_learned:  { label: "What did you learn?",        required: false, placeholder: "Insight you can act on tomorrow: founders want X not Y, the problem is actually Z…", value: whatLearned,  set: setWhatLearned },
                blocker:       { label: "What exactly is blocking you?", required: false, placeholder: "Specific blocker — not 'motivation', but: can't find users, auth keeps failing, no reply from…", value: blocker, set: setBlocker },
              }[field];
              if (!cfg) return null;
              return (
                <div key={field} style={{ marginBottom: 14 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 6px" }}>
                    {cfg.label}
                    {cfg.required && <span style={{ color: "var(--bm-accent)", marginLeft: 4 }}>*</span>}
                  </p>
                  <textarea
                    value={cfg.value}
                    onChange={(e) => cfg.set(e.target.value)}
                    placeholder={cfg.placeholder}
                    rows={2}
                    style={{
                      width: "100%",
                      background: "var(--bm-bg3)",
                      border: `1px solid ${cfg.value.trim() ? "var(--bm-border3)" : "var(--bm-border)"}`,
                      borderRadius: 10,
                      padding: "11px 13px",
                      color: "var(--bm-text)",
                      fontSize: 14,
                      fontFamily: "inherit",
                      resize: "none",
                      outline: "none",
                      boxSizing: "border-box",
                      transition: "border-color 0.2s",
                    }}
                  />
                </div>
              );
            })}

            {/* Confidence slider */}
            <p style={{ fontSize: 11, fontWeight: 700, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 10px" }}>
              Confidence level
            </p>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              {[1, 2, 3, 4, 5].map((v) => (
                <button
                  key={v}
                  onClick={() => setConfidence(v)}
                  style={{
                    flex: 1,
                    height: 36,
                    borderRadius: 8,
                    border: `1px solid ${confidence === v ? CONFIDENCE_COLORS[v] + "44" : "var(--bm-border)"}`,
                    background: confidence === v ? CONFIDENCE_COLORS[v] + "18" : "var(--bm-bg3)",
                    color: confidence === v ? CONFIDENCE_COLORS[v] : "var(--bm-text3)",
                    fontSize: 13,
                    fontWeight: confidence === v ? 700 : 400,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    transition: "all 0.15s",
                  }}
                >
                  {v}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 11, color: CONFIDENCE_COLORS[confidence], textAlign: "center", marginBottom: 24, fontWeight: 600 }}>
              {CONFIDENCE_LABELS[confidence]}
            </p>

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              style={{
                width: "100%",
                padding: "14px",
                borderRadius: 12,
                border: "none",
                background: canSubmit ? "var(--bm-accent)" : "var(--bm-bg4)",
                color: canSubmit ? "#fff" : "var(--bm-text4)",
                fontSize: 14,
                fontWeight: 600,
                cursor: canSubmit ? "pointer" : "not-allowed",
                fontFamily: "inherit",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                transition: "all 0.15s",
              }}
            >
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
