"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const CHECKOUT_URL = process.env.NEXT_PUBLIC_CHECKOUT_URL ?? "#";

// Features with Duolingo-style XP unlock feel
const FEATURES: { emoji: string; title: string; desc: string; delay: number }[] = [
  { emoji: "⚡", title: "Daily action engine", desc: "One obvious task generated every morning. Already decided.", delay: 0.1 },
  { emoji: "📊", title: "Execution score", desc: "Real progress tracking from your actual tasks and milestones.", delay: 0.18 },
  { emoji: "🤖", title: "BuildMini AI Coach", desc: "Reads your real data before every response. No generic advice.", delay: 0.26 },
  { emoji: "🔥", title: "Break My Startup", desc: "Honest failure analysis before it's too late to pivot.", delay: 0.34 },
  { emoji: "🪞", title: "Weekly honest mirror", desc: "Intention vs action gap. Every Friday. No hiding.", delay: 0.42 },
  { emoji: "🗺️", title: "Stage-aware roadmap", desc: "Proven actions for your exact stage. Not generic advice.", delay: 0.50 },
  { emoji: "🏁", title: "Milestone tracker", desc: "Keep momentum visible. Hold yourself accountable.", delay: 0.58 },
];

// Duolingo-style XP bar component
function XPBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="h-3 bg-[#1a1a1a] rounded-full overflow-hidden">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
        className="h-full rounded-full"
        style={{ background: "linear-gradient(90deg,#6366f1,#8b5cf6)" }}
      />
    </div>
  );
}

// Feature row with Duolingo bounce-in + checkmark
function FeatureRow({ emoji, title, desc, delay }: { emoji: string; title: string; desc: string; delay: number }) {
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setChecked(true), delay * 1000 + 400);
    return () => clearTimeout(t);
  }, [delay]);

  return (
    <motion.div
      initial={{ opacity: 0, x: -16, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ delay, type: "spring", stiffness: 300, damping: 24 }}
      className="flex items-start gap-3">

      {/* Duolingo-style animated checkmark */}
      <motion.div
        animate={checked ? { scale: [1, 1.4, 1], backgroundColor: ["#1a1a1a", "#16a34a", "#16a34a"] } : {}}
        transition={{ duration: 0.4, delay: 0.1, type: "spring", stiffness: 400 }}
        className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ background: checked ? "#16a34a" : "#1a1a1a", border: checked ? "none" : "1px solid #222" }}>
        <AnimatePresence>
          {checked && (
            <motion.span
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 20 }}
              className="text-white text-[11px]">✓</motion.span>
          )}
        </AnimatePresence>
      </motion.div>

      <div>
        <div className="flex items-center gap-1.5">
          <span className="text-sm">{emoji}</span>
          <span className="text-[13px] font-semibold text-[#f1f5f9]">{title}</span>
        </div>
        <div className="text-[11px] text-[#555] mt-0.5 leading-relaxed">{desc}</div>
      </div>
    </motion.div>
  );
}

const BrandMark = ({ size = 24 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width={size} height={size} style={{ flexShrink: 0 }}>
    <defs>
      <linearGradient id="up-node" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#C4B5FD" /><stop offset="100%" stopColor="#7C3AED" />
      </linearGradient>
      <filter id="up-glow">
        <feGaussianBlur stdDeviation="0.8" result="b" />
        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </defs>
    <rect width="32" height="32" rx="7" fill="#09090B" />
    <rect width="32" height="32" rx="7" fill="none" stroke="rgba(139,92,246,0.4)" strokeWidth="0.8" />
    <circle cx="6"  cy="16" r="2.2" fill="url(#up-node)" filter="url(#up-glow)" />
    <circle cx="16" cy="14" r="2.4" fill="#A78BFA" filter="url(#up-glow)" />
    <circle cx="26" cy="16" r="2.2" fill="#C4B5FD" filter="url(#up-glow)" />
  </svg>
);

function UpgradeContent() {
  const params = useSearchParams();
  const tasksCompleted = Number(params.get("tasks") ?? "2");
  const streak = Number(params.get("streak") ?? "1");

  // XP = tasks * 15, max 100
  const xp = Math.min(tasksCompleted * 15, 100);

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-start px-4 py-8 overflow-x-hidden"
      style={{ fontFamily: "system-ui,sans-serif" }}>

      {/* Logo */}
      <div className="flex items-center gap-2 mb-8">
        <BrandMark size={24} />
        <span className="text-[14px] font-medium text-[#fafafa]">BuildMind</span>
      </div>

      <div className="w-full max-w-md space-y-4">

        {/* Momentum banner — Duolingo "you're on a streak" style */}
        <motion.div initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 24 }}
          className="border border-green-400/20 bg-green-400/[0.06] rounded-2xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <motion.span
              animate={{ scale: [1, 1.25, 1], rotate: [0, 8, -8, 0] }}
              transition={{ duration: 1, repeat: 2, delay: 0.5 }}
              className="text-2xl">🔥</motion.span>
            <div>
              <div className="text-[14px] font-semibold text-[#f1f5f9]">You&apos;re making progress.</div>
              <div className="text-[11px] text-[#888] mt-0.5">
                {tasksCompleted} task{tasksCompleted !== 1 ? "s" : ""} done · {streak} day streak. Don&apos;t break it.
              </div>
            </div>
          </div>
          {/* XP bar */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[#555] whitespace-nowrap">XP {xp}/100</span>
            <XPBar value={xp} />
            <span className="text-[10px] text-indigo-400 whitespace-nowrap">Level up →</span>
          </div>
        </motion.div>

        {/* Plan card */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
          className="rounded-2xl p-5"
          style={{ background: "linear-gradient(135deg,rgba(99,102,241,0.12),rgba(139,92,246,0.08))", border: "1px solid rgba(129,140,248,0.35)" }}>

          {/* Price */}
          <div className="flex items-baseline gap-1.5 mb-1">
            <span className="text-4xl font-medium text-[#f1f5f9] tracking-tight">$10</span>
            <span className="text-[14px] text-[#555]">/month</span>
          </div>
          <p className="text-[12px] text-[#888] mb-5">Everything you need to ship your startup</p>

          {/* Duolingo-style feature list */}
          <div className="space-y-3.5 mb-6">
            {FEATURES.map(f => <FeatureRow key={f.title} {...f} />)}
          </div>

          {/* CTA */}
          <motion.a
            href={CHECKOUT_URL === "#" ? "/settings" : CHECKOUT_URL}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="block py-3.5 text-center text-white font-semibold text-[14px] rounded-xl no-underline"
            style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", boxShadow: "0 0 24px rgba(99,102,241,0.35)" }}>
            Continue building →
          </motion.a>

          {CHECKOUT_URL === "#" && (
            <p className="text-[11px] text-red-400 text-center mt-2">
              Payment not yet configured — set NEXT_PUBLIC_CHECKOUT_URL
            </p>
          )}

          <p className="text-[11px] text-[#334155] text-center mt-2.5">Cancel anytime. No questions asked.</p>
        </motion.div>

        <div className="text-center">
          <Link href="/dashboard" className="text-[12px] text-[#444] no-underline hover:text-[#666] transition-colors">
            Continue with free access during beta →
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function UpgradePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black" />}>
      <UpgradeContent />
    </Suspense>
  );
}
