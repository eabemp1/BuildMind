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

/**
 * CofounderMascot — the full-body version, for prominent placement (Today
 * page corner, an empty state, a celebration moment) rather than the
 * compact sidebar icon above.
 *
 * This is a genuine hand-drawn SVG character, not the illustrated/3D robot
 * from the reference image — I can't produce that art in this environment.
 * What this CAN do faithfully: real brand tokens (gold body trim, purple
 * "intelligence" antenna ring, matching --bm-accent/--bm-intel exactly),
 * and the same real style/mode contract as CofounderAvatar above, so
 * dropping in real character art later is a body-swap, not a rewrite —
 * every animation here is already keyed off the two real inputs.
 */
export function CofounderMascot({
  style,
  color,
  mode,
  pulsing,
  size = 96,
}: {
  style: CofounderStyle;
  color: string;
  mode: PulseMode;
  pulsing: boolean;
  size?: number;
}) {
  const isCelebrating = mode === "celebrate";
  const isAlert = mode === "alert";
  const isChallenge = mode === "challenge";
  const isObserving = mode === "observing";

  return (
    <div style={{ position: "relative", width: size, height: size * 1.15, flexShrink: 0 }}>
      <svg
        width={size}
        height={size * 1.15}
        viewBox="0 0 100 115"
        fill="none"
      >
        {/* Antenna / intelligence ring — the one motif carried over from the
            original abstract "sentinel" spec, which genuinely is achievable
            in pure vector: a purple arc that slowly orbits the head. */}
        <motion.g
          animate={{ rotate: 360 }}
          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          style={{ transformOrigin: "50px 20px" }}
        >
          <path
            d="M30 20 A20 20 0 0 1 70 20"
            stroke="var(--bm-intel, #9B87F5)"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
            opacity="0.75"
          />
          <circle cx="30" cy="20" r="2.5" fill="var(--bm-intel, #9B87F5)" />
        </motion.g>

        {/* Body — simple rounded capsule, breathes gently when idle */}
        <motion.g
          animate={
            isObserving
              ? { y: [0, -1.5, 0] }
              : isCelebrating
                ? { y: [0, -4, 0], rotate: [0, -3, 3, 0] }
                : {}
          }
          transition={{
            duration: isCelebrating ? 0.5 : 3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          {/* Torso */}
          <rect x="28" y="58" width="44" height="42" rx="16" fill="#e9e9ee" stroke="#c9c9d4" strokeWidth="1.5" />
          {/* Chest accent — real brand gold */}
          <rect x="40" y="72" width="20" height="4" rx="2" fill="var(--bm-accent, #E8C547)" />

          {/* Arms — simple stubs, lift slightly on celebrate */}
          <motion.rect
            x="16" y="64" width="10" height="24" rx="5"
            fill="#e9e9ee" stroke="#c9c9d4" strokeWidth="1.5"
            animate={isCelebrating ? { rotate: [-10, -35, -10] } : { rotate: 0 }}
            transition={{ duration: 0.5, repeat: isCelebrating ? Infinity : 0 }}
            style={{ transformOrigin: "21px 66px" }}
          />
          <motion.rect
            x="74" y="64" width="10" height="24" rx="5"
            fill="#e9e9ee" stroke="#c9c9d4" strokeWidth="1.5"
            animate={isCelebrating ? { rotate: [10, 35, 10] } : { rotate: 0 }}
            transition={{ duration: 0.5, repeat: isCelebrating ? Infinity : 0 }}
            style={{ transformOrigin: "79px 66px" }}
          />

          {/* Head */}
          <rect x="20" y="15" width="60" height="50" rx="22" fill="#f5f5f8" stroke="#c9c9d4" strokeWidth="1.5" />
          {/* Ear lights */}
          <circle cx="18" cy="40" r="4" fill={color} opacity="0.85" />
          <circle cx="82" cy="40" r="4" fill={color} opacity="0.85" />

          {/* Face screen */}
          <rect x="32" y="28" width="36" height="24" rx="10" fill="#15131e" />

          {/* Eyes — same blink logic as the compact avatar */}
          {isCelebrating ? (
            <>
              <path d="M40 42 Q44 36 48 42" stroke={color} strokeWidth="2.2" strokeLinecap="round" fill="none" />
              <path d="M52 42 Q56 36 60 42" stroke={color} strokeWidth="2.2" strokeLinecap="round" fill="none" />
            </>
          ) : (
            <>
              <motion.circle
                cx="43" cy="40" r={isAlert ? 4.2 : 3.4} fill={color}
                animate={{ scaleY: [1, 1, 0.1, 1] }}
                transition={{ duration: 4.2, repeat: Infinity, times: [0, 0.92, 0.96, 1], repeatDelay: Math.random() * 2 }}
                style={{ transformOrigin: "43px 40px" }}
              />
              <motion.circle
                cx="57" cy={isChallenge ? 41.5 : 40} r={isAlert ? 4.2 : 3.4} fill={color}
                animate={{ scaleY: [1, 1, 0.1, 1] }}
                transition={{ duration: 4.2, repeat: Infinity, times: [0, 0.92, 0.96, 1], repeatDelay: Math.random() * 2 }}
                style={{ transformOrigin: "57px 40px" }}
              />
            </>
          )}
        </motion.g>
      </svg>

      {pulsing && (
        <motion.div
          animate={{ scale: [1, 1.15], opacity: [0.35, 0] }}
          transition={{ duration: isCelebrating ? 0.9 : isAlert ? 1.1 : 1.6, repeat: Infinity }}
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: `1.5px solid ${MODE_COLOR[mode]}`,
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
}
