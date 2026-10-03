"use client";

/**
 * Full-screen celebration: pieces launch from the top centre, spread out and
 * tumble down. Fixed overlay, ignores pointer events, removes itself when done.
 * Render with a new `burstKey` to fire again. Does nothing with reduced motion.
 */

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

const COLORS = ["#E8C547", "#9B87F5", "#4ade80", "#60a5fa", "#fb7185", "#f59e0b"];
const PIECES = Array.from({ length: 72 }, (_, i) => {
  // simple deterministic pseudo-random so SSR and client agree
  const r = (n: number) => { const x = Math.sin((i + 1) * 9301 + n * 49297) * 233280; return x - Math.floor(x); };
  return {
    dx: (r(1) - 0.5) * 1100,
    up: 120 + r(2) * 260,
    fall: 520 + r(3) * 420,
    spin: (r(4) - 0.5) * 1080,
    w: 6 + r(5) * 8,
    h: 4 + r(6) * 6,
    delay: r(7) * 0.18,
    dur: 1.9 + r(8) * 1.1,
    color: COLORS[i % COLORS.length],
    round: i % 4 === 0,
  };
});

export default function ConfettiBurst({ burstKey, ms = 3200 }: { burstKey: number; ms?: number }) {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (burstKey <= 0 || reduce) return;
    setActive(burstKey);
    const t = setTimeout(() => setActive(0), ms);
    return () => clearTimeout(t);
  }, [burstKey, reduce, ms]);
  if (!active) return null;
  return (
    <div aria-hidden style={{ position: "fixed", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 80 }}>
      {PIECES.map((p, i) => (
        <motion.span
          key={`${active}-${i}`}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
          animate={{ x: p.dx, y: [0, -p.up, p.fall], opacity: [1, 1, 0], rotate: p.spin }}
          transition={{ duration: p.dur, delay: p.delay, ease: "easeOut", times: [0, 0.3, 1] }}
          style={{ position: "absolute", left: "50%", top: "22%", width: p.w, height: p.h, background: p.color, borderRadius: p.round ? 99 : 1.5 }}
        />
      ))}
    </div>
  );
}
