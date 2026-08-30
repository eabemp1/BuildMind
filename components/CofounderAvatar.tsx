"use client";

import { motion } from "framer-motion";
import type { CofounderStyle } from "@/lib/founderMemory";
import type { PulseMode } from "./CofounderPulse";

/**
 * components/CofounderAvatar.tsx
 *
 * The visual "face" of the AI Cofounder — currently a simple animated SVG
 * placeholder, built to be swapped for a real illustrated/rigged mascot
 * (Rive or Lottie) later without touching any call site. Every call site
 * passes only `style` and `mode`; nothing about how those are rendered is
 * exposed, so the swap is contained entirely to this file.
 *
 * ── STATE MACHINE CONTRACT (the brief for a future mascot asset) ──────────
 * Two independent inputs drive the whole visual:
 *
 * `style` — CofounderStyle, the founder's chosen personality (slow-changing,
 *   effectively "which character skin"):
 *   - "direct-challenger"  → accent color var(--bm-red-ish) #ef4444-family
 *   - "strategic-partner"  → accent color var(--bm-text2) (neutral/cool)
 *   - "execution-coach"    → accent color #22c55e (green)
 *   - "devil-advocate"     → accent color #f59e0b (amber)
 *
 * `mode` — PulseMode, the live behavioral state (changes moment to moment
 *   based on real signals — pulse score, streak, days inactive):
 *   - "observing"  → idle/resting. No pulse ring. Calm, neutral expression.
 *   - "alert"      → something needs attention now. Fast pulse ring, red-
 *                    tinted, "wide eyes" — should read as urgent, not scary.
 *   - "insight"    → the cofounder noticed a pattern worth sharing. Medium
 *                    pulse, thoughtful/attentive expression.
 *   - "challenge"  → pushing back on the founder. Amber-tinted, a slightly
 *                    narrowed/skeptical expression.
 *   - "celebrate"  → a real win happened. Green-tinted, fastest pulse,
 *                    happy/upward expression (this is the one state that
 *                    should feel unambiguously delighted — the "Duolingo
 *                    owl doing a happy dance" moment).
 *
 * A future Rive file should expose exactly these two inputs (an enum for
 * style, an enum for mode) as its state machine inputs — that's the whole
 * integration surface. Swap the return of this component for a <RiveComponent
 * stateMachineName="cofounder" inputs={{style, mode}} /> and every existing
 * call site keeps working unchanged.
 */

const MODE_COLOR: Record<PulseMode, string> = {
  observing: "#666",
  alert: "#ef4444",
  insight: "var(--bm-text2)",
  challenge: "#f59e0b",
  celebrate: "#22c55e",
};

export function CofounderAvatar({
  style,
  color,
  mode,
  pulsing,
  size = 40,
}: {
  style: CofounderStyle;
  /** Resolved accent color for the current style — passed in rather than
   *  re-derived, so this component doesn't need STYLE_META imported. */
  color: string;
  mode: PulseMode;
  pulsing: boolean;
  size?: number;
}) {
  const isCelebrating = mode === "celebrate";
  const isAlert = mode === "alert";
  const isChallenge = mode === "challenge";
  const eyeColor = color;

  return (
    <div style={{ position: "relative", flexShrink: 0, width: size, height: size }}>
      <motion.div
        animate={pulsing ? { scale: [1, 1.06, 1] } : {}}
        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.3,
          background: `${color}18`,
          border: `1.5px solid ${color}44`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width={size * 0.55} height={size * 0.4} viewBox="0 0 22 16" fill="none">
          {isCelebrating ? (
            // Happy — upward arcs instead of round eyes
            <>
              <path d="M2 10 Q6 4 10 10" stroke={eyeColor} strokeWidth="2" strokeLinecap="round" fill="none" />
              <path d="M12 10 Q16 4 20 10" stroke={eyeColor} strokeWidth="2" strokeLinecap="round" fill="none" />
            </>
          ) : (
            <>
              <motion.circle
                cx="6" cy="8"
                r={isAlert ? 3.2 : 2.6}
                fill={eyeColor}
                animate={{ scaleY: [1, 1, 0.1, 1] }}
                transition={{ duration: 4, repeat: Infinity, times: [0, 0.92, 0.96, 1], repeatDelay: Math.random() * 2 }}
                style={{ transformOrigin: "6px 8px" }}
              />
              <motion.circle
                cx="16" cy={isChallenge ? 9 : 8}
                r={isAlert ? 3.2 : 2.6}
                fill={eyeColor}
                animate={{ scaleY: [1, 1, 0.1, 1] }}
                transition={{ duration: 4, repeat: Infinity, times: [0, 0.92, 0.96, 1], repeatDelay: Math.random() * 2 }}
                style={{ transformOrigin: "16px 8px" }}
              />
            </>
          )}
        </svg>
      </motion.div>
      {pulsing && (
        <motion.div
          animate={{ scale: [1, 1.8], opacity: [0.4, 0] }}
          transition={{ duration: isCelebrating ? 0.9 : isAlert ? 1.1 : 1.5, repeat: Infinity }}
          style={{
            position: "absolute",
            inset: -4,
            borderRadius: size * 0.35,
            border: `1px solid ${MODE_COLOR[mode]}`,
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
          }
