"use client";

/**
 * UpgradeCelebration — fires on /dashboard?upgraded=builder (or venture)
 * Full-screen confetti + personal welcome message.
 * Dismisses automatically after 6s or on click.
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Simple canvas confetti ───────────────────────────────────────────────────

function Confetti() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ["#6366f1", "#8b5cf6", "#a78bfa", "#4ade80", "#fbbf24", "#f87171", "#5eead4", "#fff"];
    const pieces: {
      x: number; y: number; r: number; d: number;
      color: string; tilt: number; tiltAngle: number; tiltAngleInc: number;
    }[] = [];

    for (let i = 0; i < 180; i++) {
      pieces.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height - canvas.height,
        r: Math.random() * 8 + 3,
        d: Math.random() * 80 + 20,
        color: colors[Math.floor(Math.random() * colors.length)],
        tilt: Math.random() * 10 - 10,
        tiltAngle: 0,
        tiltAngleInc: Math.random() * 0.07 + 0.05,
      });
    }

    let frame = 0;
    let running = true;

    const draw = () => {
      if (!running) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      frame++;

      pieces.forEach((p) => {
        p.tiltAngle += p.tiltAngleInc;
        p.y += (Math.cos(frame / 10 + p.d) + 3 + p.r / 2) * 0.8;
        p.tilt = Math.sin(p.tiltAngle - frame / 3) * 12;

        if (p.y > canvas.height) {
          p.x = Math.random() * canvas.width;
          p.y = -10;
        }

        ctx.beginPath();
        ctx.lineWidth = p.r / 2;
        ctx.strokeStyle = p.color;
        ctx.moveTo(p.x + p.tilt + p.r / 4, p.y);
        ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 4);
        ctx.stroke();
      });

      requestAnimationFrame(draw);
    };

    draw();
    return () => { running = false; };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed", inset: 0, zIndex: 9998,
        pointerEvents: "none",
        width: "100%", height: "100%",
      }}
    />
  );
}

// ─── Welcome messages per plan ────────────────────────────────────────────────

const WELCOME: Record<string, { headline: string; sub: string; features: string[] }> = {
  builder: {
    headline: "You're on Builder. Let's ship.",
    sub: "No more limits. Your AI Coach, full Break My Startup analysis, weekly strategy reports, and startup kit are all live. Now close a task.",
    features: [
      "Unlimited AI Coach — no daily caps",
      "Full Break My Startup analysis",
      "Weekly AI strategy report every Friday",
      "Startup kit: names, domains, branding",
    ],
  },
  venture: {
    headline: "You're on Venture. Full power.",
    sub: "Multi-project portfolio, pitch deck generator, compliance checklists, and priority support. Everything BuildMind has — yours.",
    features: [
      "Everything in Builder, unlimited",
      "Multi-project portfolio dashboard",
      "Investor pitch deck generator",
      "Priority support — 4 hour response",
    ],
  },
};

// ─── Main component ───────────────────────────────────────────────────────────

interface UpgradeCelebrationProps {
  plan: string;
  onDismiss: () => void;
}

export default function UpgradeCelebration({ plan, onDismiss }: UpgradeCelebrationProps) {
  const [visible, setVisible] = useState(true);
  const normalizedPlan = plan === "venture" ? "builder" : plan;
  const copy = WELCOME[normalizedPlan] ?? WELCOME.builder;

  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 400);
    }, 7000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  const dismiss = () => {
    setVisible(false);
    setTimeout(onDismiss, 400);
  };

  return (
    <AnimatePresence>
      {visible && (
        <>
          <Confetti />
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: "fixed", inset: 0, zIndex: 9999,
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: 20,
              background: "rgba(0,0,0,0.7)",
              backdropFilter: "blur(12px)",
              fontFamily: "system-ui,sans-serif",
              cursor: "pointer",
            }}
            onClick={dismiss}
          >
            <motion.div
              initial={{ opacity: 0, y: 32, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 280, damping: 26 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%", maxWidth: 440,
                background: "var(--bm-bg2, #0d0d0d)",
                border: "1px solid rgba(99,102,241,0.4)",
                borderRadius: 18,
                overflow: "hidden",
                boxShadow: "0 0 80px rgba(99,102,241,0.2), 0 32px 100px rgba(0,0,0,0.6)",
              }}
            >
              {/* Gradient top bar */}
              <div style={{ height: 4, background: "linear-gradient(90deg,#6366f1,#8b5cf6,#a78bfa,#4ade80)" }} />

              <div style={{ padding: "28px 28px 24px" }}>
                {/* Trophy emoji with bounce */}
                <motion.div
                  initial={{ scale: 0, rotate: -15 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 18, delay: 0.15 }}
                  style={{ fontSize: 48, textAlign: "center", marginBottom: 16, display: "block" }}
                >
                  🎉
                </motion.div>

                {/* Headline */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 }}
                  style={{ fontSize: 22, fontWeight: 700, color: "#fff", textAlign: "center", letterSpacing: "-0.02em", marginBottom: 10 }}
                >
                  {copy.headline}
                </motion.div>

                {/* Sub */}
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 }}
                  style={{ fontSize: 13, color: "var(--bm-text3, #666)", lineHeight: 1.65, textAlign: "center", marginBottom: 20 }}
                >
                  {copy.sub}
                </motion.div>

                {/* What's unlocked */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.45 }}
                  style={{
                    background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.15)",
                    borderRadius: 10, padding: "12px 14px", marginBottom: 20,
                  }}
                >
                  <div style={{ fontSize: 10, color: "#4ade80", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: "monospace" }}>
                    Now unlocked
                  </div>
                  {copy.features.map((f, i) => (
                    <motion.div
                      key={f}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.5 + i * 0.07 }}
                      style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--bm-text2, #aaa)", marginBottom: i < copy.features.length - 1 ? 5 : 0 }}
                    >
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.55 + i * 0.07, type: "spring", stiffness: 500 }}
                        style={{ color: "#4ade80", flexShrink: 0, fontSize: 11 }}
                      >✓</motion.span>
                      {f}
                    </motion.div>
                  ))}
                </motion.div>

                {/* CTA */}
                <motion.button
                  onClick={dismiss}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.7 }}
                  style={{
                    width: "100%", padding: "13px 0",
                    background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
                    color: "#fff", fontWeight: 700, fontSize: 14,
                    borderRadius: 10, border: "none", cursor: "pointer",
                    fontFamily: "inherit",
                    boxShadow: "0 0 24px rgba(99,102,241,0.3)",
                    marginBottom: 8,
                  }}
                >
                  Start building →
                </motion.button>

                <div style={{ fontSize: 11, color: "#222", textAlign: "center" }}>
                  Click anywhere to close
                </div>
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
