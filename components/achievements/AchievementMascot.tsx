"use client";

/**
 * components/achievements/AchievementMascot.tsx
 *
 * The Achievements page mascot. It is alive in five layers:
 *  1. Idle life   - breathing bob, blinking, orbiting ring, pulsing chest light.
 *  2. Attention   - its eyes and head follow your pointer (spring-smoothed);
 *                   on touch screens it glances around by itself instead.
 *  3. Personality - every few seconds it waves, tilts, dances, spins or puffs
 *                   its chest and shows a trophy. It never repeats the last move.
 *  4. Reactions   - tap it for a random move, `celebrateKey` makes it jump,
 *                   grin and burst confetti (a real unlock), `levelUpKey` adds
 *                   a crown and a spin.
 *  5. Rest        - after ~25s without interaction it falls asleep (closed
 *                   eyes, floating Zs, slow breathing) and startles awake the
 *                   moment you touch the page again.
 *
 * Pure SVG + framer-motion, no assets. Reduced motion: no loops, only
 * expression changes.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform, type Variants } from "framer-motion";

export type MascotMove = "idle" | "wave" | "cheer" | "dance" | "spin" | "tilt" | "proud" | "levelup" | "startle";

const IDLE_MOVES: MascotMove[] = ["wave", "tilt", "dance", "spin", "proud"];
const TAP_MOVES: MascotMove[] = ["cheer", "dance", "spin", "wave", "tilt", "proud"];
const DURATION: Record<MascotMove, number> = { idle: 0, wave: 2400, cheer: 2600, dance: 2000, spin: 1300, tilt: 1800, proud: 2600, levelup: 3400, startle: 700 };
const SLEEP_AFTER_MS = 25000;

const body: Variants = {
  idle: { y: [0, -3, 0], rotate: 0, scaleY: 1, scaleX: 1, transition: { duration: 3, repeat: Infinity, ease: "easeInOut" } },
  sleep: { y: [2, 4, 2], rotate: 3, scaleY: [1, 0.98, 1], scaleX: 1, transition: { duration: 4.5, repeat: Infinity, ease: "easeInOut" } },
  wave: { y: 0, rotate: [0, -2, 0], transition: { duration: 2.4, ease: "easeInOut" } },
  cheer: { y: [0, -22, 0, -22, 0, -10, 0], scaleY: [1, 1.07, 0.92, 1.07, 0.93, 1.03, 1], rotate: [0, -4, 4, -4, 4, 0, 0], transition: { duration: 2.2, ease: "easeInOut" } },
  dance: { y: [0, -6, 0, -6, 0, -6, 0], rotate: [-7, 7, -7, 7, -7, 7, 0], transition: { duration: 1.9, ease: "easeInOut" } },
  spin: { y: [0, -18, 0], rotate: [0, 360], transition: { duration: 1.1, ease: "easeInOut" } },
  tilt: { y: 0, rotate: [0, -9, -9, 0], transition: { duration: 1.7, times: [0, 0.3, 0.7, 1], ease: "easeInOut" } },
  proud: { y: [0, -2, -2, 0], scaleY: [1, 1.05, 1.05, 1], scaleX: [1, 1.04, 1.04, 1], transition: { duration: 2.4, times: [0, 0.25, 0.8, 1] } },
  levelup: { y: [0, -26, 0, -26, 0, -12, 0], rotate: [0, 360, 360, 360, 360, 360, 360], scaleY: [1, 1.08, 0.9, 1.08, 0.92, 1.03, 1], transition: { duration: 3, ease: "easeInOut" } },
  startle: { y: [0, -14, 0], scaleY: [1, 1.1, 1], rotate: [0, -6, 0], transition: { duration: 0.6 } },
};

const armLeft: Variants = {
  idle: { rotate: [0, 3, 0], transition: { duration: 3, repeat: Infinity, ease: "easeInOut" } },
  sleep: { rotate: 4 },
  wave: { rotate: 0 },
  cheer: { rotate: [0, 150, 125, 150, 125, 150, 0], transition: { duration: 2.2 } },
  dance: { rotate: [0, 60, 0, 60, 0, 60, 0], transition: { duration: 1.9 } },
  spin: { rotate: [0, 70, 70, 0], transition: { duration: 1.1 } },
  tilt: { rotate: 0 },
  proud: { rotate: [0, 160, 160, 0], transition: { duration: 2.4, times: [0, 0.25, 0.8, 1] } },
  levelup: { rotate: [0, 150, 125, 150, 125, 150, 0], transition: { duration: 3 } },
  startle: { rotate: [0, 40, 0], transition: { duration: 0.6 } },
};
const armRight: Variants = {
  idle: { rotate: [0, -3, 0], transition: { duration: 3, repeat: Infinity, ease: "easeInOut" } },
  sleep: { rotate: -4 },
  wave: { rotate: [0, -145, -115, -145, -115, -145, 0], transition: { duration: 2.4 } },
  cheer: { rotate: [0, -150, -125, -150, -125, -150, 0], transition: { duration: 2.2 } },
  dance: { rotate: [0, -60, 0, -60, 0, -60, 0], transition: { duration: 1.9 } },
  spin: { rotate: [0, -70, -70, 0], transition: { duration: 1.1 } },
  tilt: { rotate: 0 },
  proud: { rotate: [0, -160, -160, 0], transition: { duration: 2.4, times: [0, 0.25, 0.8, 1] } },
  levelup: { rotate: [0, -150, -125, -150, -125, -150, 0], transition: { duration: 3 } },
  startle: { rotate: [0, -40, 0], transition: { duration: 0.6 } },
};

// Confetti: fixed angles/distances so server and client render identical markup.
const CONFETTI = Array.from({ length: 16 }, (_, i) => {
  const a = (i / 16) * Math.PI * 2 + (i % 2) * 0.2;
  const d = 52 + (i % 4) * 14;
  return { x: Math.cos(a) * d, y: Math.sin(a) * d - 26, r: (i * 47) % 360, c: ["#E8C547", "#9B87F5", "#4ade80", "#60a5fa", "#fb7185"][i % 5], s: 5 + (i % 3) * 2 };
});

export default function AchievementMascot({
  size = 150,
  celebrateKey = 0,
  levelUpKey = 0,
  onTap,
}: {
  size?: number;
  /** Increment to make the mascot celebrate (a real unlock). */
  celebrateKey?: number;
  /** Increment on a real level-up: bigger celebration with a crown. */
  levelUpKey?: number;
  onTap?: (move: MascotMove) => void;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLButtonElement>(null);
  const [move, setMove] = useState<MascotMove>("idle");
  const [asleep, setAsleep] = useState(false);
  const [burst, setBurst] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastMove = useRef<MascotMove | null>(null);
  const lastActive = useRef<number>(0);
  const moveRef = useRef<MascotMove>("idle");
  const asleepRef = useRef(false);
  moveRef.current = move;
  asleepRef.current = asleep;

  // Pointer-follow: spring-smoothed look target, -1..1 on each axis.
  const lx = useMotionValue(0);
  const ly = useMotionValue(0);
  const sx = useSpring(lx, { stiffness: 140, damping: 16 });
  const sy = useSpring(ly, { stiffness: 140, damping: 16 });
  const eyeX = useTransform(sx, (v) => v * 3);
  const eyeY = useTransform(sy, (v) => v * 2);
  const headRot = useTransform(sx, (v) => v * 4);

  const play = useCallback((m: MascotMove) => {
    if (reduce) return;
    clearTimeout(timer.current);
    lastMove.current = m;
    setMove(m);
    if (m === "cheer" || m === "levelup") setBurst((b) => b + 1);
    timer.current = setTimeout(() => setMove("idle"), DURATION[m]);
  }, [reduce]);

  const wake = useCallback(() => {
    lastActive.current = Date.now();
    if (asleepRef.current) {
      setAsleep(false);
      play("startle");
    }
  }, [play]);

  useEffect(() => { lastActive.current = Date.now(); }, []);

  // Pointer tracking over the whole window, throttled to animation frames.
  useEffect(() => {
    if (reduce) return;
    let raf = 0;
    let usedPointer = false;
    const onMove = (e: PointerEvent) => {
      usedPointer = true;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) / Math.max(240, window.innerWidth / 2);
        const dy = (e.clientY - (r.top + r.height / 3)) / Math.max(240, window.innerHeight / 2);
        lx.set(Math.max(-1, Math.min(1, dx)));
        ly.set(Math.max(-1, Math.min(1, dy)));
      });
      if (asleepRef.current) wake(); else lastActive.current = Date.now();
    };
    const onTouch = () => { if (asleepRef.current) wake(); else lastActive.current = Date.now(); };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onTouch, { passive: true });
    window.addEventListener("keydown", onTouch);
    // Touch screens have no hover, so glance around by itself.
    const glance = setInterval(() => {
      if (usedPointer || asleepRef.current) return;
      lx.set([-0.9, 0, 0.9, 0.3][Math.floor(Math.random() * 4)]);
      ly.set([-0.3, 0, 0.3][Math.floor(Math.random() * 3)]);
    }, 2600);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onTouch);
      window.removeEventListener("keydown", onTouch);
      clearInterval(glance);
      cancelAnimationFrame(raf);
    };
  }, [reduce, lx, ly, wake]);

  // Does something on its own every few seconds; falls asleep when ignored.
  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => {
      if (asleepRef.current || moveRef.current !== "idle") return;
      if (Date.now() - lastActive.current > SLEEP_AFTER_MS) {
        lx.set(0); ly.set(0.5);
        setAsleep(true);
        return;
      }
      const pool = IDLE_MOVES.filter((m) => m !== lastMove.current);
      play(pool[Math.floor(Math.random() * pool.length)]);
    }, 6500);
    return () => { clearInterval(id); clearTimeout(timer.current); };
  }, [reduce, play, lx, ly]);

  useEffect(() => { if (celebrateKey > 0) { setAsleep(false); lastActive.current = Date.now(); play("cheer"); } }, [celebrateKey, play]);
  useEffect(() => { if (levelUpKey > 0) { setAsleep(false); lastActive.current = Date.now(); play("levelup"); } }, [levelUpKey, play]);

  const tap = () => {
    lastActive.current = Date.now();
    if (asleep) { wake(); onTap?.("startle"); return; }
    const pool = TAP_MOVES.filter((m) => m !== lastMove.current);
    const next = pool[Math.floor(Math.random() * pool.length)];
    play(next);
    onTap?.(next);
  };

  const stateKey = reduce ? "idle" : asleep ? "sleep" : move;
  const happy = move === "cheer" || move === "dance" || move === "levelup";
  const grin = move === "cheer" || move === "levelup";
  const trophy = move === "proud" || move === "cheer";
  const crown = move === "levelup";
  const surprised = move === "startle";
  const H = size * 1.18;

  return (
    <button
      ref={ref}
      type="button"
      onClick={tap}
      aria-label="Tap the mascot"
      style={{ position: "relative", width: size, height: H, flexShrink: 0, background: "none", border: 0, padding: 0, cursor: "pointer", WebkitTapHighlightColor: "transparent" }}
    >
      <motion.div
        aria-hidden
        animate={grin && !reduce ? { scaleX: [1, 0.6, 1, 0.6, 1], opacity: [0.35, 0.15, 0.35, 0.15, 0.35] } : { scaleX: 1, opacity: 0.3 }}
        transition={{ duration: 2.2 }}
        style={{ position: "absolute", left: "22%", right: "22%", bottom: size * 0.04, height: size * 0.07, borderRadius: "50%", background: "#000", filter: "blur(4px)" }}
      />

      <svg width={size} height={H} viewBox="0 0 100 118" fill="none" style={{ overflow: "visible", position: "relative" }}>
        {!reduce && !asleep && (
          <motion.g animate={{ rotate: 360 }} transition={{ duration: 8, repeat: Infinity, ease: "linear" }} style={{ transformOrigin: "50px 30px" }}>
            <path d="M30 30 A20 20 0 0 1 70 30" stroke="var(--bm-intel, #9B87F5)" strokeWidth="2.5" strokeLinecap="round" opacity="0.75" />
            <circle cx="30" cy="30" r="2.5" fill="var(--bm-intel, #9B87F5)" />
          </motion.g>
        )}

        <g transform="translate(0 8)">
          <motion.g variants={body} animate={stateKey} style={{ transformOrigin: "50px 100px" }}>
            {/* arms (behind torso) */}
            <motion.rect x="16" y="64" width="10" height="24" rx="5" fill="#e9e9ee" stroke="#c9c9d4" strokeWidth="1.5" variants={armLeft} style={{ transformOrigin: "21px 67px" }} />
            <motion.rect x="74" y="64" width="10" height="24" rx="5" fill="#e9e9ee" stroke="#c9c9d4" strokeWidth="1.5" variants={armRight} style={{ transformOrigin: "79px 67px" }} />

            {/* trophy held overhead: drops in with a bounce */}
            {trophy && !reduce && (
              <g transform="translate(0 -14)"><motion.g
                key={`trophy-${burst}-${move}`}
                initial={{ y: -30, opacity: 0, scale: 0.6 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 12 }}
                style={{ transformOrigin: "50px 0px" }}
              >
                <path d="M41 -8 h18 v9 a9 9 0 0 1 -18 0 z" fill="var(--bm-accent, #E8C547)" stroke="#b8941f" strokeWidth="1" />
                <path d="M41 -5 h-4 a4 4 0 0 0 4 7 M59 -5 h4 a4 4 0 0 1 -4 7" stroke="#b8941f" strokeWidth="1.2" fill="none" strokeLinecap="round" />
                <rect x="47" y="9" width="6" height="4" fill="#b8941f" />
                <rect x="43" y="13" width="14" height="3" rx="1.5" fill="var(--bm-accent, #E8C547)" stroke="#b8941f" strokeWidth="0.8" />
                <motion.path d="M46 -3 l1.4 2.8 3 .4 -2.2 2 .6 3 -2.8 -1.5" stroke="#fff" strokeWidth="0.8" fill="none" strokeLinecap="round"
                  animate={{ opacity: [0.2, 0.9, 0.2] }} transition={{ duration: 1.2, repeat: Infinity }} />
              </motion.g></g>
            )}

            <rect x="33" y="97" width="13" height="7" rx="3.5" fill="#d4d4de" />
            <rect x="54" y="97" width="13" height="7" rx="3.5" fill="#d4d4de" />

            <rect x="28" y="58" width="44" height="42" rx="16" fill="#e9e9ee" stroke="#c9c9d4" strokeWidth="1.5" />
            <motion.rect
              x="40" y="72" width="20" height="4" rx="2" fill="var(--bm-accent, #E8C547)"
              animate={reduce ? undefined : { opacity: asleep ? [0.2, 0.45, 0.2] : [0.6, 1, 0.6] }} transition={{ duration: asleep ? 4.5 : 2.4, repeat: Infinity }}
            />

            {/* head follows the pointer with a gentle tilt */}
            <motion.g style={{ rotate: reduce ? 0 : headRot, transformOrigin: "50px 62px" }}>
              <rect x="20" y="15" width="60" height="50" rx="22" fill="#f5f5f8" stroke="#c9c9d4" strokeWidth="1.5" />
              <circle cx="18" cy="40" r="4" fill="var(--bm-intel, #9B87F5)" opacity={asleep ? 0.35 : 0.9} />
              <circle cx="82" cy="40" r="4" fill="var(--bm-intel, #9B87F5)" opacity={asleep ? 0.35 : 0.9} />
              <rect x="32" y="28" width="36" height="26" rx="10" fill="#15131e" />

              {crown && (
                <motion.g initial={{ y: -12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 300, damping: 14, delay: 0.25 }}>
                  <path d="M36 14 l5 -9 5 6 4 -8 4 8 5 -6 5 9 z" fill="var(--bm-accent, #E8C547)" stroke="#b8941f" strokeWidth="1" strokeLinejoin="round" />
                </motion.g>
              )}

              {happy && (<><circle cx="37" cy="46" r="2.6" fill="#fb7185" opacity="0.55" /><circle cx="63" cy="46" r="2.6" fill="#fb7185" opacity="0.55" /></>)}

              {asleep ? (
                <>
                  <path d="M39 40 Q43.5 43 48 40" stroke="var(--bm-accent, #E8C547)" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
                  <path d="M52 40 Q56.5 43 61 40" stroke="var(--bm-accent, #E8C547)" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
                </>
              ) : happy ? (
                <>
                  <path d="M39 42 Q43.5 35 48 42" stroke="var(--bm-accent, #E8C547)" strokeWidth="2.4" strokeLinecap="round" />
                  <path d="M52 42 Q56.5 35 61 42" stroke="var(--bm-accent, #E8C547)" strokeWidth="2.4" strokeLinecap="round" />
                </>
              ) : (
                <motion.g style={reduce ? undefined : { x: eyeX, y: eyeY }}>
                  <motion.circle cx="43" cy="39" r={surprised ? 4.4 : 3.4} fill="var(--bm-accent, #E8C547)"
                    animate={reduce ? undefined : { scaleY: [1, 1, 0.1, 1] }} transition={{ duration: 4, repeat: Infinity, times: [0, 0.92, 0.96, 1] }} style={{ transformOrigin: "43px 39px" }} />
                  <motion.circle cx="57" cy="39" r={surprised ? 4.4 : 3.4} fill="var(--bm-accent, #E8C547)"
                    animate={reduce ? undefined : { scaleY: [1, 1, 0.1, 1] }} transition={{ duration: 4, repeat: Infinity, times: [0, 0.92, 0.96, 1] }} style={{ transformOrigin: "57px 39px" }} />
                </motion.g>
              )}

              {grin
                ? <path d="M43 46 Q50 56 57 46 Z" fill="var(--bm-accent, #E8C547)" />
                : surprised
                  ? <ellipse cx="50" cy="49" rx="2.6" ry="3" fill="var(--bm-accent, #E8C547)" />
                  : asleep
                    ? <path d="M47 48 h6" stroke="var(--bm-accent, #E8C547)" strokeWidth="1.6" strokeLinecap="round" opacity="0.6" />
                    : <path d="M45 47 Q50 51 55 47" stroke="var(--bm-accent, #E8C547)" strokeWidth="1.8" strokeLinecap="round" />}
            </motion.g>
          </motion.g>

          {/* floating Zs while asleep */}
          {asleep && !reduce && [0, 1, 2].map((i) => (
            <motion.text key={i} x={70 + i * 5} y={22} fontSize={9 + i * 2} fontWeight="700" fill="var(--bm-intel2, #b7a8ff)"
              initial={{ opacity: 0, y: 0 }} animate={{ opacity: [0, 1, 0], y: -18 - i * 6, x: i * 4 }}
              transition={{ duration: 3, repeat: Infinity, delay: i * 1 }}>z</motion.text>
          ))}
        </g>

        {/* confetti burst, re-triggered by key */}
        {grin && !reduce && CONFETTI.map((p, i) => (
          <motion.rect
            key={`${burst}-${i}`}
            x={50 - p.s / 2} y={38} width={p.s} height={p.s * 0.6} rx="1" fill={p.c}
            initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
            animate={{ x: p.x, y: [0, p.y, p.y + 46], opacity: [1, 1, 0], rotate: p.r }}
            transition={{ duration: 1.5, ease: "easeOut", delay: (i % 3) * 0.05 }}
          />
        ))}
      </svg>
    </button>
  );
                               }
