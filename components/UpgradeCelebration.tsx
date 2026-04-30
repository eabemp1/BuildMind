"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

function Confetti() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const colors = ["#6FCF97","#52B87A","#F0B429","#F06C6C","#56C9C0","#EDF0F5","#6BA5F0"];
    const pieces = Array.from({ length: 160 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      r: Math.random() * 7 + 2,
      d: Math.random() * 80 + 20,
      color: colors[Math.floor(Math.random() * colors.length)],
      tilt: Math.random() * 10 - 10,
      tiltAngle: 0,
      tiltAngleInc: Math.random() * 0.07 + 0.04,
    }));
    let frame = 0, running = true;
    const draw = () => {
      if (!running) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      frame++;
      pieces.forEach(p => {
        p.tiltAngle += p.tiltAngleInc;
        p.y += (Math.cos(frame / 10 + p.d) + 2.5 + p.r / 2) * 0.7;
        p.tilt = Math.sin(p.tiltAngle - frame / 3) * 12;
        if (p.y > canvas.height) { p.x = Math.random() * canvas.width; p.y = -10; }
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
  return <canvas ref={canvasRef} style={{ position: "fixed", inset: 0, zIndex: 9998, pointerEvents: "none", width: "100%", height: "100%" }} />;
}

const WELCOME: Record<string, { headline: string; sub: string; features: string[] }> = {
  builder: {
    headline: "You're on Builder. Let's ship.",
    sub: "No more limits. Your AI Coach, full Break My Startup analysis, and weekly strategy reports are all live. Now close a task.",
    features: ["Unlimited AI Coach — no daily caps", "Full Break My Startup analysis", "Weekly AI strategy report every Friday"],
  },
  venture: {
    headline: "You're on Venture. Full power.",
    sub: "Multi-project portfolio, pitch deck generator, compliance checklists, and priority support.",
    features: ["Everything in Builder, unlimited", "Multi-project portfolio dashboard", "Investor pitch deck generator", "Priority support — 4 hour response"],
  },
};

export default function UpgradeCelebration({ plan, onDismiss }: { plan: string; onDismiss: () => void }) {
  const [visible, setVisible] = useState(true);
  const copy = WELCOME[plan] ?? WELCOME.builder;

  useEffect(() => {
    const t = setTimeout(() => { setVisible(false); setTimeout(onDismiss, 400); }, 7000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  const dismiss = () => { setVisible(false); setTimeout(onDismiss, 400); };

  return (
    <AnimatePresence>
      {visible && (
        <>
          <Confetti />
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{
              position: "fixed", inset: 0, zIndex: 9999,
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: 20, background: "rgba(12,13,15,0.75)",
              backdropFilter: "blur(14px)", cursor: "pointer", fontFamily: "inherit",
            }}
            onClick={dismiss}
          >
            <motion.div
              initial={{ opacity: 0, y: 28, scale: 0.93 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 280, damping: 26 }}
              onClick={e => e.stopPropagation()}
              style={{
                width: "100%", maxWidth: 440,
                background: "var(--bm-bg2)",
                border: "1px solid var(--bm-accent-bd)",
                borderRadius: 20, overflow: "hidden",
                boxShadow: "0 0 80px rgba(111,207,151,0.12), 0 32px 100px rgba(0,0,0,0.6)",
              }}
            >
              {/* Top stripe */}
              <div style={{ height: 3, background: "var(--bm-accent)" }} />

              <div style={{ padding: "28px 28px 24px" }}>
                <motion.div
                  initial={{ scale: 0, rotate: -12 }} animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 18, delay: 0.15 }}
                  style={{ fontSize: 48, textAlign: "center", marginBottom: 18, display: "block" }}
                >
                  🎉
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
                  style={{ fontSize: 22, fontWeight: 700, color: "var(--bm-text)", textAlign: "center", letterSpacing: "-0.02em", marginBottom: 10 }}>
                  {copy.headline}
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
                  style={{ fontSize: 13, color: "var(--bm-text3)", lineHeight: 1.65, textAlign: "center", marginBottom: 22 }}>
                  {copy.sub}
                </motion.div>

                {/* Unlocked features */}
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}
                  style={{ background: "var(--bm-accent-dim)", border: "1px solid var(--bm-accent-bd)", borderRadius: 10, padding: "12px 14px", marginBottom: 22 }}>
                  <div style={{ fontSize: 9, color: "var(--bm-accent)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10, fontWeight: 600 }}>
                    Now unlocked
                  </div>
                  {copy.features.map((f, i) => (
                    <motion.div key={f}
                      initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.5 + i * 0.07 }}
                      style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--bm-text2)", marginBottom: i < copy.features.length - 1 ? 6 : 0 }}>
                      <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.55 + i * 0.07, type: "spring", stiffness: 500 }}
                        style={{ color: "var(--bm-accent)", flexShrink: 0, fontSize: 11, fontWeight: 700 }}>✓</motion.span>
                      {f}
                    </motion.div>
                  ))}
                </motion.div>

                <motion.button
                  onClick={dismiss} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
                  style={{
                    width: "100%", padding: "13px 0",
                    background: "var(--bm-accent)", color: "var(--bm-text-inv)",
                    fontWeight: 700, fontSize: 14, borderRadius: 10, border: "none",
                    cursor: "pointer", fontFamily: "inherit", marginBottom: 8,
                  }}
                >
                  Start building →
                </motion.button>
                <div style={{ fontSize: 11, color: "var(--bm-text4)", textAlign: "center" }}>Click anywhere to close</div>
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
