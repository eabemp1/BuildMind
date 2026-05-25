"use client";

/**
 * BuildMind Tour — Mobile-first, covers all key features.
 * Uses a bottom-sheet style on mobile, tooltip on desktop.
 * Spotlights real DOM elements via data-tour attributes.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { storage } from "@/lib/storage";

export type TourStep = {
  selector: string;
  title: string;
  body: string;
  icon: string;
  position: "top" | "bottom" | "left" | "right" | "center";
};

export const TOUR_STEPS: TourStep[] = [
  {
    selector: "today-action",
    title: "Your one action for today",
    body: "BuildMind picks ONE high-leverage task based on your startup stage. Not a list — one thing. Do this first, every day.",
    icon: "⚡",
    position: "bottom",
  },
  {
    selector: "today-copy",
    title: "Copy & send in 30 seconds",
    body: "The outreach message is pre-written. Fill in the brackets and send it. That's the whole task. Don't overthink it.",
    icon: "📋",
    position: "bottom",
  },
  {
    selector: "today-done",
    title: "Mark done → build your streak",
    body: "When you've done it, tap Done. Your streak increments. Streaks are the system — they're what keep you building when motivation fades.",
    icon: "✓",
    position: "top",
  },
  {
    selector: "nav-reflect",
    title: "Reflect — the causality engine",
    body: "After you act, reflect. What happened? Your outcome here changes tomorrow's action. This is the feedback loop that makes BuildMind actually smart.",
    icon: "🪞",
    position: "center",
  },
  {
    selector: "nav-ai-coach",
    title: "AI Coach — follows the conversation",
    body: "Ask anything. It reads your real project data first, then answers directly. Ask follow-ups — it won't force you back to tasks.",
    icon: "🤖",
    position: "center",
  },
  {
    selector: "nav-break-startup",
    title: "Break My Startup",
    body: "No cheerleading. It finds every reason you'll fail, scans the web for live competitors, and tells you exactly how to stand out from them.",
    icon: "🔥",
    position: "center",
  },
  {
    selector: "nav-projects",
    title: "Projects — your milestones",
    body: "Each project gets an AI-generated roadmap. The Validation tab runs a full failure analysis on demand. Free plan: 1 project. Builder: unlimited.",
    icon: "📁",
    position: "center",
  },
  {
    selector: "nav-overview",
    title: "Overview — command centre",
    body: "Streak, execution score, stage journey, and quick jumps to every feature. Start here when you log in.",
    icon: "🗂️",
    position: "center",
  },
  {
    selector: "nav-reports",
    title: "Weekly Report (Builder)",
    body: "Every week: your intention vs action gap, momentum score, and a brutal honest assessment. The report that keeps you accountable to yourself.",
    icon: "📋",
    position: "center",
  },
];

const STORAGE_KEY = "bm_tour_done_v2";

export function markTourDone() {
  try { storage.set(STORAGE_KEY, "1"); } catch { }
}
export function isTourDone(): boolean {
  try { return storage.get(STORAGE_KEY) === "1"; } catch { return true; }
}
export function resetTour() {
  try { storage.remove(STORAGE_KEY); } catch { }
}
export function useTour() {
  const [active, setActive] = useState(false);
  const start = useCallback(() => { resetTour(); setActive(true); }, []);
  const stop = useCallback(() => { markTourDone(); setActive(false); }, []);
  return { active, start, stop };
}

type Rect = { top: number; left: number; width: number; height: number };

function getRect(selector: string): Rect | null {
  const el = document.querySelector(`[data-tour="${selector}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export function TourOverlay({ forceShow = false, onDone }: { forceShow?: boolean; onDone?: () => void }) {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (forceShow || !isTourDone()) {
      const t = setTimeout(() => setVisible(true), 900);
      return () => clearTimeout(t);
    }
  }, [forceShow]);

  useEffect(() => {
    if (!visible) return;
    const measure = () => {
      const r = getRect(TOUR_STEPS[step]?.selector ?? "");
      setRect(r);
    };
    measure();
    rafRef.current = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [visible, step]);

  const finish = () => {
    setVisible(false);
    markTourDone();
    onDone?.();
  };

  const next = () => {
    if (step < TOUR_STEPS.length - 1) setStep(s => s + 1);
    else finish();
  };
  const back = () => setStep(s => Math.max(0, s - 1));

  if (!visible) return null;

  const current = TOUR_STEPS[step];
  const total = TOUR_STEPS.length;
  const PAD = 12;

  // Spotlight clip path
  const spotlight = rect ? `path('M 0 0 L ${window.innerWidth} 0 L ${window.innerWidth} ${window.innerHeight} L 0 ${window.innerHeight} Z M ${rect.left - PAD} ${rect.top - PAD} L ${rect.left + rect.width + PAD} ${rect.top - PAD} L ${rect.left + rect.width + PAD} ${rect.top + rect.height + PAD} L ${rect.left - PAD} ${rect.top + rect.height + PAD} Z')` : undefined;

  // Mobile: always use bottom sheet
  const useBottomSheet = isMobile || !rect || current.position === "center";

  return (
    <AnimatePresence>
      {visible && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9000, pointerEvents: "none" }}>
          {/* Dim overlay */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{
              position: "absolute", inset: 0, background: "rgba(0,0,0,0.75)",
              clipPath: spotlight,
              pointerEvents: "auto",
            }}
            onClick={finish}
          />

          {/* Spotlight border */}
          {rect && (
            <motion.div
              key={step}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{
                position: "absolute",
                top: rect.top - PAD, left: rect.left - PAD,
                width: rect.width + PAD * 2, height: rect.height + PAD * 2,
                borderRadius: 10, border: "2px solid rgba(129,140,248,0.8)",
                boxShadow: "0 0 0 4px rgba(99,102,241,0.15)",
                pointerEvents: "none",
              }}
            />
          )}

          {/* Tooltip — bottom sheet on mobile, positioned on desktop */}
          <motion.div
            key={`tip-${step}`}
            initial={{ opacity: 0, y: useBottomSheet ? 40 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            style={{
              position: "fixed",
              pointerEvents: "auto",
              ...(useBottomSheet ? {
                bottom: 0, left: 0, right: 0,
                borderRadius: "16px 16px 0 0",
                padding: "20px 20px 32px",
              } : (() => {
                const vw = window.innerWidth;
                const vh = window.innerHeight;
                const TW = 300;
                let top = 0, left = 0;
                if (rect) {
                  if (current.position === "bottom") {
                    top = rect.top + rect.height + PAD + 8;
                    left = Math.min(Math.max(rect.left + rect.width / 2 - TW / 2, 12), vw - TW - 12);
                  } else if (current.position === "top") {
                    top = rect.top - 160 - PAD;
                    left = Math.min(Math.max(rect.left + rect.width / 2 - TW / 2, 12), vw - TW - 12);
                  } else if (current.position === "right") {
                    top = Math.max(12, rect.top + rect.height / 2 - 80);
                    left = rect.left + rect.width + PAD + 8;
                  } else {
                    top = vh / 2 - 100;
                    left = vw / 2 - TW / 2;
                  }
                  top = Math.max(12, Math.min(top, vh - 180));
                  left = Math.max(12, Math.min(left, vw - TW - 12));
                }
                return { top, left, width: TW, borderRadius: 14, padding: "16px 18px" };
              })()),
              background: "var(--bm-bg2, #0d0d0d)",
              border: "1px solid rgba(99,102,241,0.35)",
              boxShadow: "0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.1)",
            }}
          >
            {/* Drag handle for bottom sheet */}
            {useBottomSheet && (
              <div style={{ width: 36, height: 4, borderRadius: 99, background: "var(--bm-border3)", margin: "0 auto 16px" }} />
            )}

            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
              <div style={{ fontSize: 20, flexShrink: 0 }}>{current.icon}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", lineHeight: 1.2, marginBottom: 4 }}>{current.title}</div>
                <div style={{ fontSize: 12, color: "var(--bm-text3, #666)", lineHeight: 1.55 }}>{current.body}</div>
              </div>
            </div>

            {/* Progress dots */}
            <div style={{ display: "flex", gap: 4, marginBottom: 14, justifyContent: "center" }}>
              {Array.from({ length: total }).map((_, i) => (
                <div key={i} style={{ width: i === step ? 16 : 6, height: 6, borderRadius: 99, background: i === step ? "var(--bm-accent)" : "var(--bm-border2)", transition: "all 0.2s" }} />
              ))}
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              {step > 0 && (
                <button onClick={back}
                  style={{ flex: 1, padding: "10px 0", borderRadius: 9, border: "1px solid var(--bm-border, #1c1c1c)", background: "transparent", color: "var(--bm-text3, #666)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                  ← Back
                </button>
              )}
              <button onClick={next}
                style={{ flex: 2, padding: "10px 0", borderRadius: 9, border: "none", background: "var(--bm-accent)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                {step === total - 1 ? "Start building →" : "Next →"}
              </button>
              <button onClick={finish}
                style={{ padding: "10px 12px", borderRadius: 9, border: "1px solid var(--bm-border, #1c1c1c)", background: "transparent", color: "var(--bm-text4, #333)", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
                Skip
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export default TourOverlay;
