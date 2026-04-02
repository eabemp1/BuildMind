"use client";
/**
 * BuildMind Onboarding Tour
 *
 * A spotlight-style feature tour shown once to new users after onboarding.
 * Self-contained — no extra npm packages required.
 *
 * HOW IT WORKS:
 * - Reads localStorage key "bm_tour_done" to decide whether to show
 * - Renders a full-screen overlay with a spotlight cutout over the target element
 * - Each step points at a real element in the UI using data-tour="step-name" attributes
 * - User can click Next, Back, or Skip
 * - On completion, sets "bm_tour_done" = "1" so it never shows again
 * - Also exports useTour() hook for manual triggering (e.g. from Settings)
 *
 * USAGE:
 * 1. Add <TourOverlay /> anywhere in the layout (e.g. app/(dashboard)/layout.tsx)
 * 2. Add data-tour="step-name" to the elements you want to highlight
 *    (see TOUR_STEPS below for the exact attribute values needed)
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Tour step definitions ────────────────────────────────────────────────────
// Each step needs a matching data-tour="<selector>" on the target element.
// title: shown bold at the top
// body: the explanation (keep it short — 2 sentences max)
// position: where the tooltip appears relative to the spotlight
// icon: emoji shown in the tooltip header

export type TourStep = {
  selector: string;       // value of data-tour attribute
  title: string;
  body: string;
  icon: string;
  position: "top" | "bottom" | "left" | "right" | "center";
};

export const TOUR_STEPS: TourStep[] = [
  {
    selector: "today-action",
    title: "DO THIS NOW",
    body: "This is the one thing BuildMind wants you to do today — chosen based on your startup stage. No guessing. Just act.",
    icon: "⚡",
    position: "bottom",
  },
  {
    selector: "today-copy",
    title: "Copy and send",
    body: "This outreach message is ready to go. Copy it, personalise the brackets, and send it. That's the whole task.",
    icon: "📋",
    position: "bottom",
  },
  {
    selector: "today-done",
    title: "Mark it done",
    body: "When you've sent the message, tap Done. BuildMind logs your streak and unlocks tomorrow's action.",
    icon: "✓",
    position: "top",
  },
  {
    selector: "nav-today",
    title: "Today — your home screen",
    body: "Every session starts here. Not the dashboard. Not the metrics. The action. Come back here daily.",
    icon: "🏠",
    position: "right",
  },
  {
    selector: "nav-ai-coach",
    title: "AI Coach",
    body: "Ask BuildMind anything about your startup. It reads your real project data before every response — not guessing.",
    icon: "◈",
    position: "right",
  },
  {
    selector: "nav-break-startup",
    title: "Break My Startup",
    body: "No encouragement. BuildMind finds every reason your startup will fail — based on your actual data and evidence.",
    icon: "⚠",
    position: "right",
  },
  {
    selector: "today-score",
    title: "Your execution score",
    body: "This number goes up when you complete tasks and comes down when you don't. Aim for above 70. It compounds.",
    icon: "📊",
    position: "top",
  },
];

// ─── Storage helpers ──────────────────────────────────────────────────────────
const STORAGE_KEY = "bm_tour_done";

export function markTourDone() {
  try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* ssr */ }
}

export function isTourDone(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === "1"; } catch { return true; }
}

export function resetTour() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ssr */ }
}

// ─── Hook for manual trigger (e.g. from Settings → "Replay tour") ─────────────
export function useTour() {
  const [active, setActive] = useState(false);
  const start = useCallback(() => { resetTour(); setActive(true); }, []);
  const stop = useCallback(() => { markTourDone(); setActive(false); }, []);
  return { active, start, stop };
}

// ─── Spotlight rect ───────────────────────────────────────────────────────────
type Rect = { top: number; left: number; width: number; height: number };

function getElementRect(selector: string): Rect | null {
  const el = document.querySelector(`[data-tour="${selector}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

// ─── Tooltip positioning ──────────────────────────────────────────────────────
function getTooltipStyle(
  rect: Rect | null,
  position: TourStep["position"],
): React.CSSProperties {
  const PAD = 16;
  const TIP_W = 320;
  const TIP_H = 160; // approximate

  if (!rect || position === "center") {
    return {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: TIP_W,
    };
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let top = 0, left = 0;

  if (position === "bottom") {
    top = rect.top + rect.height + PAD;
    left = Math.min(Math.max(rect.left + rect.width / 2 - TIP_W / 2, PAD), vw - TIP_W - PAD);
  } else if (position === "top") {
    top = rect.top - TIP_H - PAD;
    left = Math.min(Math.max(rect.left + rect.width / 2 - TIP_W / 2, PAD), vw - TIP_W - PAD);
  } else if (position === "right") {
    top = Math.min(Math.max(rect.top + rect.height / 2 - TIP_H / 2, PAD), vh - TIP_H - PAD);
    left = rect.left + rect.width + PAD;
  } else if (position === "left") {
    top = Math.min(Math.max(rect.top + rect.height / 2 - TIP_H / 2, PAD), vh - TIP_H - PAD);
    left = rect.left - TIP_W - PAD;
  }

  // Clamp to viewport
  top = Math.max(PAD, Math.min(top, vh - TIP_H - PAD));
  left = Math.max(PAD, Math.min(left, vw - TIP_W - PAD));

  return { position: "fixed", top, left, width: TIP_W };
}

// ─── Main component ───────────────────────────────────────────────────────────
type TourOverlayProps = {
  /** Force-show the tour regardless of localStorage (for Storybook/testing) */
  forceShow?: boolean;
  /** Called when tour finishes or is skipped */
  onDone?: () => void;
};

export function TourOverlay({ forceShow = false, onDone }: TourOverlayProps) {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const rafRef = useRef<number | null>(null);

  // Decide whether to show
  useEffect(() => {
    if (forceShow || !isTourDone()) {
      // Small delay so the UI has painted before we try to measure elements
      const t = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(t);
    }
  }, [forceShow]);

  // Measure target element on each step
  useEffect(() => {
    if (!visible) return;
    setDims({ w: window.innerWidth, h: window.innerHeight });

    const measure = () => {
      const r = getElementRect(TOUR_STEPS[step]?.selector ?? "");
      setRect(r);
    };
    measure();

    // Re-measure on resize
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [step, visible]);

  const currentStep = TOUR_STEPS[step];
  const isLast = step === TOUR_STEPS.length - 1;

  const handleNext = () => {
    if (isLast) {
      handleDone();
    } else {
      setStep((s) => s + 1);
    }
  };

  const handleBack = () => setStep((s) => Math.max(0, s - 1));

  const handleDone = () => {
    markTourDone();
    setVisible(false);
    onDone?.();
  };

  const handleSkip = () => {
    markTourDone();
    setVisible(false);
    onDone?.();
  };

  if (!visible || !currentStep) return null;

  // Spotlight padding — how much bigger the spotlight is than the element
  const PAD = 8;
  const spotRect = rect
    ? {
        top: rect.top - PAD,
        left: rect.left - PAD,
        width: rect.width + PAD * 2,
        height: rect.height + PAD * 2,
      }
    : null;

  const tooltipStyle = getTooltipStyle(rect, currentStep.position);

  return (
    <AnimatePresence>
      <motion.div
        key="tour-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          pointerEvents: "all",
        }}
      >
        {/* Dark overlay with spotlight cutout */}
        <svg
          width={dims.w}
          height={dims.h}
          style={{ position: "absolute", inset: 0, display: "block" }}
        >
          <defs>
            <mask id="bm-tour-mask">
              {/* White = visible (the dark overlay) */}
              <rect width={dims.w} height={dims.h} fill="white" />
              {/* Black = transparent (the spotlight) */}
              {spotRect && (
                <rect
                  x={spotRect.left}
                  y={spotRect.top}
                  width={spotRect.width}
                  height={spotRect.height}
                  rx={10}
                  fill="black"
                />
              )}
            </mask>
          </defs>
          <rect
            width={dims.w}
            height={dims.h}
            fill="rgba(0,0,0,0.72)"
            mask="url(#bm-tour-mask)"
          />
          {/* Spotlight border glow */}
          {spotRect && (
            <rect
              x={spotRect.left}
              y={spotRect.top}
              width={spotRect.width}
              height={spotRect.height}
              rx={10}
              fill="none"
              stroke="rgba(139,92,246,0.7)"
              strokeWidth={2}
            />
          )}
        </svg>

        {/* Tooltip */}
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ type: "spring", stiffness: 340, damping: 26 }}
          style={{
            ...tooltipStyle,
            background: "#0d0d0d",
            border: "1px solid rgba(139,92,246,0.35)",
            borderRadius: 14,
            padding: "18px 20px",
            boxShadow: "0 0 0 1px rgba(139,92,246,0.15), 0 24px 48px rgba(0,0,0,0.6)",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          {/* Step counter */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <div style={{ display: "flex", gap: 4 }}>
              {TOUR_STEPS.map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: i === step ? 16 : 5,
                    height: 5,
                    borderRadius: 3,
                    background:
                      i === step
                        ? "#8b5cf6"
                        : i < step
                        ? "#4b5563"
                        : "#1f2937",
                    transition: "all 0.2s",
                  }}
                />
              ))}
            </div>
            <button
              onClick={handleSkip}
              style={{
                background: "none",
                border: "none",
                color: "#4b5563",
                fontSize: 12,
                cursor: "pointer",
                fontFamily: "inherit",
                padding: 0,
              }}
            >
              Skip tour
            </button>
          </div>

          {/* Icon + title */}
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
            <span
              style={{
                fontSize: 18,
                width: 36,
                height: 36,
                background: "rgba(139,92,246,0.12)",
                border: "1px solid rgba(139,92,246,0.25)",
                borderRadius: 9,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {currentStep.icon}
            </span>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "#f1f5f9",
                letterSpacing: "-0.01em",
              }}
            >
              {currentStep.title}
            </div>
          </div>

          {/* Body */}
          <p
            style={{
              fontSize: 13,
              color: "#94a3b8",
              lineHeight: 1.65,
              margin: "0 0 18px",
            }}
          >
            {currentStep.body}
          </p>

          {/* Buttons */}
          <div style={{ display: "flex", gap: 8 }}>
            {step > 0 && (
              <button
                onClick={handleBack}
                style={{
                  flex: 1,
                  padding: "9px",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid #1f2937",
                  borderRadius: 8,
                  color: "#6b7280",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                ← Back
              </button>
            )}
            <button
              onClick={handleNext}
              style={{
                flex: 2,
                padding: "9px",
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                border: "none",
                borderRadius: 8,
                color: "white",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {isLast ? "Let's build →" : `Next (${step + 1}/${TOUR_STEPS.length})`}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default TourOverlay;
