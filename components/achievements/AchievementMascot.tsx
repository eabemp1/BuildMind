"use client";

/**
 * components/achievements/AchievementMascot.tsx
 *
 * The Achievements page mascot. Unlike the small status avatar in
 * CofounderAvatar.tsx, this one is meant to be played with: it idles with a
 * bob and blink, glances around, and every few seconds does something on its
 * own (wave, tilt its head, dance, spin). Tapping it triggers a random move,
 * and a real achievement unlock (the `celebrateKey` prop) makes it jump with
 * both arms up and burst confetti.
 *
 * Pure SVG + framer-motion, no assets. With reduced motion enabled it stays
 * still and only swaps expressions.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";

export type MascotMove = "idle" | "wave" | "cheer" | "dance" | "spin" | "tilt";

const IDLE_MOVES: MascotMove[] = ["wave", "tilt", "dance", "spin"];
const TAP_MOVES: MascotMove[] = ["cheer", "dance", "spin", "wave", "tilt"];
const DURATION: Record<MascotMove, number> = { idle: 0, wave: 2400, cheer: 2600, dance: 2000, spin: 1300, tilt: 1800 };

const body: Variants = {
  idle: { y: [0, -3, 0], rotate: 0, scaleY: 1, transition: { duration: 3, repeat: Infinity, ease: "easeInOut" } },
  wave: { y: 0, rotate: [0, -2, 0], transition: { duration: 2.4, ease: "easeInOut" } },
  cheer: { y: [0, -22, 0, -22, 0, -10, 0], scaleY: [1, 1.07, 0.92, 1.07, 0.93, 1.03, 1], rotate: [0, -4, 4, -4, 4, 0, 0], transition: { duration: 2.2, ease: "easeInOut" } },
  dance: { y: [0, -6, 0, -6, 0, -6, 0], rotate: [-7, 7, -7, 7, -7, 7, 0], transition: { duration: 1.9, ease: "easeInOut" } },
  spin: { y: [0, -18, 0], rotate: [0, 360], transition: { duration: 1.1, ease: "easeInOut" } },
  tilt: { y: 0, rotate: [0, -9, -9, 0], transition: { duration: 1.7, times: [0, 0.3, 0.7, 1], ease: "easeInOut" } },
};

const armLeft: Variants = {
  idle: { rotate: [0, 3, 0], transition: { duration: 3, repeat: Infinity, ease: "easeInOut" } },
  wave: { rotate: 0 },
  cheer: { rotate: [0, 150, 125, 150, 125, 150, 0], transition: { duration: 2.2 } },
  dance: { rotate: [0, 60, 0, 60, 0, 60, 0], transition: { duration: 1.9 } },
  spin: { rotate: [0, 70, 70, 0], transition: { duration: 1.1 } },
  tilt: { rotate: 0 },
};
const armRight: Variants = {
  idle: { rotate: [0, -3, 0], transition: { duration: 3, repeat: Infinity, ease: "easeInOut" } },
  wave: { rotate: [0, -145, -115, -145, -115, -145, 0], transition: { duration: 2.4 } },
  cheer: { rotate: [0, -150, -125, -150, -125, -150, 0], transition: { duration: 2.2 } },
  dance: { rotate: [0, -60, 0, -60, 0, -60, 0], transition: { duration: 1.9 } },
  spin: { rotate: [0, -70, -70, 0], transition: { duration: 1.1 } },
  tilt: { rotate: 0 },
};

// Confetti: fixed angles/distances so server and client render the same markup.
const CONFETTI = Array.from({ length: 14 }, (_, i) => {
  const a = (i / 14) * Math.PI * 2 + (i % 2) * 0.2;
  const d = 52 + (i % 4) * 14;
  return { x: Math.cos(a) * d, y: Math.sin(a) * d - 26, r: (i * 47) % 360, c: ["#E8C547", "#9B87F5", "#4ade80", "#60a5fa", "#fb7185"][i % 5], s: 5 + (i % 3) * 2 };
});

export default function AchievementMascot({
  size = 150,
  celebrateKey = 0,
  onTap,
}: {
  size?: number;
  /** Increment to make the mascot celebrate (e.g. on a real unlock). */
  celebrateKey?: number;
  onTap?: (move: MascotMove) => void;
}) {
  const reduce = useReducedMotion();
  const [move, setMove] = useState<MascotMove>("idle");
  const [burst, setBurst] = useState(0);
  const [look, setLook] = useState(0); // -1 left, 0 centre, 1 right
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastTap = useRef<MascotMove | null>(null);

  const play = useCallback((m: MascotMove) => {
    if (reduce) return;
    clearTimeout(timer.current);
    setMove(m);
    if (m === "cheer") setBurst((b) => b + 1);
    timer.current = setTimeout(() => setMove("idle"), DURATION[m]);
  }, [reduce]);

  // Does something on its own every few seconds, so the page never feels frozen.
  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => {
      setMove((cur) => {
        if (cur !== "idle") return cur;
        const next = IDLE_MOVES[Math.floor(Math.random() * IDLE_MOVES.length)];
        timer.current = setTimeout(() => setMove("idle"), DURATION[next]);
        return next;
      });
    }, 7000);
    return () => { clearInterval(id); clearTimeout(timer.current); };
  }, [reduce]);

  // Glances left and right while idle.
  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => {
      setLook(Math.random() < 0.4 ? 0 : Math.random() < 0.5 ? -1 : 1);
    }, 2600);
    return () => clearInterval(id);
  }, [reduce]);

  useEffect(() => {
    if (celebrateKey > 0) play("cheer");
  }, [celebrateKey, play]);

  const happy = move === "cheer" || move === "dance";
  const cheering = move === "cheer";

  const tap = () => {
    // Never repeat the same move twice in a row.
    const pool = TAP_MOVES.filter((m) => m !== lastTap.current);
    const next = pool[Math.floor(Math.random() * pool.length)];
    lastTap.current = next;
    play(next);
    onTap?.(next);
  };

  const stateKey = reduce ? "idle" : move;
  const H = size * 1.1;

  return (
    <button
      type="button"
      onClick={tap}
      aria-label="Tap the mascot"
      style={{ position: "relative", width: size, height: H, flexShrink: 0, background: "none", border: 0, padding: 0, cursor: "pointer", WebkitTapHighlightColor: "transparent" }}
    >
      {/* soft floor shadow that squashes when the mascot jumps */}
      <motion.div
        aria-hidden
        animate={cheering && !reduce ? { scaleX: [1, 0.6, 1, 0.6, 1], opacity: [0.35, 0.15, 0.35, 0.15, 0.35] } : { scaleX: 1, opacity: 0.3 }}
        transition={{ duration: 2.2 }}
        style={{ position: "absolute", left: "22%", right: "22%", bottom: 2, height: size * 0.07, borderRadius: "50%", background: "#000", filter: "blur(4px)" }}
      />

      <svg width={size} height={H} viewBox="0 0 100 110" fill="none" style={{ overflow: "visible", position: "relative" }}>
        {/* orbiting intelligence ring */}
        {!reduce && (
          <motion.g animate={{ rotate: 360 }} transition={{ duration: 8, repeat: Infinity, ease: "linear" }} style={{ transformOrigin: "50px 22px" }}>
            <path d="M30 22 A20 20 0 0 1 70 22" stroke="var(--bm-intel, #9B87F5)" strokeWidth="2.5" strokeLinecap="round" opacity="0.75" />
            <circle cx="30" cy="22" r="2.5" fill="var(--bm-intel, #9B87F5)" />
          </motion.g>
        )}

        <motion.g variants={body} animate={stateKey} style={{ transformOrigin: "50px 100px" }}>
          {/* arms (behind torso) */}
          <motion.rect x="16" y="64" width="10" height="24" rx="5" fill="#e9e9ee" stroke="#c9c9d4" strokeWidth="1.5" variants={armLeft} style={{ transformOrigin: "21px 67px" }} />
          <motion.rect x="74" y="64" width="10" height="24" rx="5" fill="#e9e9ee" stroke="#c9c9d4" strokeWidth="1.5" variants={armRight} style={{ transformOrigin: "79px 67px" }} />

          {/* feet */}
          <rect x="33" y="97" width="13" height="7" rx="3.5" fill="#d4d4de" />
          <rect x="54" y="97" width="13" height="7" rx="3.5" fill="#d4d4de" />

          {/* torso with brand gold trim */}
          <rect x="28" y="58" width="44" height="42" rx="16" fill="#e9e9ee" stroke="#c9c9d4" strokeWidth="1.5" />
          <motion.rect
            x="40" y="72" width="20" height="4" rx="2" fill="var(--bm-accent, #E8C547)"
            animate={reduce ? undefined : { opacity: [0.6, 1, 0.6] }} transition={{ duration: 2.4, repeat: Infinity }}
          />

          {/* head */}
          <rect x="20" y="15" width="60" height="50" rx="22" fill="#f5f5f8" stroke="#c9c9d4" strokeWidth="1.5" />
          <circle cx="18" cy="40" r="4" fill="var(--bm-intel, #9B87F5)" opacity="0.9" />
          <circle cx="82" cy="40" r="4" fill="var(--bm-intel, #9B87F5)" opacity="0.9" />
          <rect x="32" y="28" width="36" height="26" rx="10" fill="#15131e" />

          {/* cheeks when happy */}
          {happy && (<><circle cx="37" cy="46" r="2.6" fill="#fb7185" opacity="0.55" /><circle cx="63" cy="46" r="2.6" fill="#fb7185" opacity="0.55" /></>)}

          {/* eyes */}
          {happy ? (
            <>
              <path d="M39 42 Q43.5 35 48 42" stroke="var(--bm-accent, #E8C547)" strokeWidth="2.4" strokeLinecap="round" />
              <path d="M52 42 Q56.5 35 61 42" stroke="var(--bm-accent, #E8C547)" strokeWidth="2.4" strokeLinecap="round" />
            </>
          ) : (
            <motion.g animate={{ x: look * 2.2 }} transition={{ duration: 0.35 }}>
              <motion.circle cx="43" cy="39" r="3.4" fill="var(--bm-accent, #E8C547)"
                animate={reduce ? undefined : { scaleY: [1, 1, 0.1, 1] }} transition={{ duration: 4, repeat: Infinity, times: [0, 0.92, 0.96, 1] }} style={{ transformOrigin: "43px 39px" }} />
              <motion.circle cx="57" cy="39" r="3.4" fill="var(--bm-accent, #E8C547)"
                animate={reduce ? undefined : { scaleY: [1, 1, 0.1, 1] }} transition={{ duration: 4, repeat: Infinity, times: [0, 0.92, 0.96, 1] }} style={{ transformOrigin: "57px 39px" }} />
            </motion.g>
          )}

          {/* mouth: small smile, open grin when cheering */}
          {cheering
            ? <path d="M43 46 Q50 56 57 46 Z" fill="var(--bm-accent, #E8C547)" />
            : <path d="M45 47 Q50 51 55 47" stroke="var(--bm-accent, #E8C547)" strokeWidth="1.8" strokeLinecap="round" />}
        </motion.g>

        {/* confetti burst, re-triggered by key */}
        {cheering && !reduce && CONFETTI.map((p, i) => (
          <motion.rect
            key={`${burst}-${i}`}
            x={50 - p.s / 2} y={30} width={p.s} height={p.s * 0.6} rx="1" fill={p.c}
            initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
            animate={{ x: p.x, y: [0, p.y, p.y + 46], opacity: [1, 1, 0], rotate: p.r }}
            transition={{ duration: 1.5, ease: "easeOut", delay: (i % 3) * 0.05 }}
          />
        ))}
      </svg>
    </button>
  );
}
