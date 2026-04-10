"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { BrandMark } from "@/components/layout/logo";

const TESTIMONIALS = [
  { name: "Dmitrii Malakhov", handle: "@malakhovdm", quote: "9/10. Half the graveyard of side projects wouldn't exist if founders validated distribution before writing a single line of code." },
  { name: "Adarsh Kumar", handle: "@firstadarsh", quote: "How can I access yours? I literally keep SESSION files manually to track my progress — BuildMind replaces exactly this." },
  { name: "Vladi", handle: "@xvld666", quote: "Break it down until the next step is stupidly obvious. Then do that. Repeat." },
  { name: "Mike Gustafson", handle: "@Mikejgustafson2", quote: "My task list distorts without user conversations. I have to be extremely diligent about that." },
];

const PLANS = [
  {
    name: "Starter", price: "$0", period: "forever",
    desc: "Get a feel for the engine",
    cta: "Start free", href: "/auth/signup", featured: false, badge: null,
    features: ["7 daily actions per week", "Basic streak tracking", "7-day history", "Break My Startup (limited)"],
    note: "No card required",
  },
  {
    name: "Builder", price: "$19", period: "/mo",
    desc: "For founders shipping seriously",
    cta: "Start Builder →", href: "/auth/signup?plan=builder", featured: true, badge: "Most popular",
    features: [
      "Personalized daily actions (your startup, your blocker)",
      "AI outcome analysis — learns from what you report",
      "Weekly strategy report every Friday",
      "Startup score + investor-ready metrics",
      "Unlimited AI co-founder questions",
      "Break My Startup — full analysis",
      "Full history + CSV export",
      "Startup kit generator",
    ],
    note: "Cancel anytime",
  },
];

const STEPS = [
  { n: "01", title: "Tell BuildMind your startup", desc: "4 questions. Your idea, your users, your biggest blocker, your stage. 90 seconds." },
  { n: "02", title: "Get one personalized action", desc: "Every morning: one specific, high-leverage task tailored to your startup and blocker — not generic advice." },
  { n: "03", title: "Report what happened", desc: "Your outcome trains the engine. Strategy adapts every week based on what you actually did — not what you planned." },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bm-bg bm-text" style={{ fontFamily: "system-ui,sans-serif" }}>

      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-[var(--bm-border)] bg-[#07080c]/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <BrandMark size={26} href="/" />
            <div className="leading-tight">
              <p className="text-sm font-semibold">BuildMind</p>
              <p className="text-[10px] uppercase tracking-[0.2em] bm-text3">Founder OS · v2</p>
            </div>
          </div>
          <div className="hidden items-center gap-5 text-sm bm-text2 md:flex">
            <a href="#how" className="transition hover:text-zinc-200">How it works</a>
            <a href="#pricing" className="transition hover:text-zinc-200">Pricing</a>
            <Link href="/auth/login" className="transition hover:text-zinc-200">Login</Link>
            <Link href="/auth/signup" className="rounded-lg bg-gradient-to-r from-indigo-500 to-purple-500 px-4 py-2 text-xs font-semibold bm-text transition hover:opacity-90">
              Start free →
            </Link>
          </div>
        </div>
      </nav>

      <main className="mx-auto flex max-w-3xl flex-col items-center px-6 pb-24 pt-16 text-center">

        {/* Hero */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <span className="mb-6 inline-block rounded-full border border-[var(--bm-border2)] bg-white/5 px-4 py-1 text-[10px] uppercase tracking-[0.35em] bm-text2">
            Founder OS · Daily execution engine
          </span>
          <h1 className="text-balance text-4xl font-semibold leading-tight sm:text-5xl">
            Stop planning.{" "}
            <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              Start executing.
            </span>
          </h1>
          <p className="mt-5 max-w-xl text-sm leading-relaxed bm-text2 sm:text-base">
            BuildMind turns your startup idea into a personalized daily execution engine.
            Actions that adapt to your stage, your blocker, and what you actually did yesterday —
            with weekly feedback loops that keep you shipping instead of spiraling.
          </p>
        </motion.div>

        {/* Live preview card */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.15 }}
          className="mt-10 w-full max-w-xl rounded-2xl border border-[var(--bm-border2)] bm-bg2 p-5 text-left">
          <div className="mb-3 flex items-center justify-between">
            <span className="inline-flex items-center gap-2 rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-teal-300">
              ⚡ SafeRemit · Validation Stage
            </span>
            <span className="text-[10px] bm-text3 font-mono">Day 4 / 90</span>
          </div>
          <p className="text-sm font-semibold leading-relaxed bm-text">
            Interview 5 migrant workers in Accra about their remittance pain — what goes wrong, not your solution.
          </p>
          <div className="mt-4 rounded-xl border border-[var(--bm-border2)] bg-black/40 p-4 text-xs leading-relaxed bm-text2 font-mono">
            "Hey, I'm researching how people send money home. What's the most frustrating part of your current method? Not pitching anything — just learning."
          </div>
          <div className="mt-3 flex items-center gap-4 text-[11px] bm-text3 font-mono">
            <span>⏱ 2–3 hrs</span><span>·</span><span>📍 Accra</span><span>·</span><span className="text-green-400">High leverage</span>
          </div>
          <div className="mt-4 flex gap-2">
            {["✓ Done", "↳ Reflect", "Skip"].map((l, i) => (
              <div key={l} className={`flex-1 rounded-lg border border-[var(--bm-border2)] px-3 py-2 text-center text-xs ${i === 0 ? "bm-text bg-white/5" : "bm-text3"}`}>{l}</div>
            ))}
          </div>
        </motion.div>

        {/* CTAs */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
          className="mt-8 flex w-full max-w-xl flex-col gap-3">
          <Link href="/auth/signup" className="flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 px-4 py-3.5 text-sm font-semibold bm-text transition hover:opacity-90">
            Start for free — no card needed →
          </Link>
          <Link href="/try" className="flex w-full items-center justify-center rounded-xl border border-[var(--bm-border2)] bg-transparent px-4 py-3 text-sm bm-text2 transition hover:bg-white/5">
            Try without account
          </Link>
          <p className="text-xs bm-text3">
            Already have an account? <Link className="underline hover:text-zinc-300" href="/auth/login">Sign in</Link>
          </p>
        </motion.div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-xs bm-text3">
          <span>🔥 247 founders active this week</span>
          <span>·</span><span>⚡ 1,840 actions completed</span>
          <span>·</span><span>🌍 Ghana · Nigeria · UK · US</span>
        </div>

        {/* Social proof */}
        <section id="proof" className="mt-20 w-full max-w-4xl text-left">
          <h2 className="text-lg font-semibold bm-text">What founders say</h2>
          <p className="mt-1 text-sm bm-text3">Collected before building anything more.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {TESTIMONIALS.map((t) => (
              <div key={t.handle} className="rounded-xl border border-[var(--bm-border2)] bg-white/5 p-4">
                <p className="text-sm leading-relaxed bm-text">"{t.quote}"</p>
                <p className="mt-3 text-xs bm-text3">{t.name} · {t.handle}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="mt-20 w-full max-w-4xl text-left">
          <h2 className="text-lg font-semibold bm-text">How it works</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="rounded-xl border border-[var(--bm-border2)] bg-white/[0.03] p-4">
                <div className="mb-2 font-mono text-xs bm-text3">{s.n}</div>
                <div className="mb-1 text-sm font-semibold bm-text">{s.title}</div>
                <div className="text-xs leading-relaxed bm-text2">{s.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="mt-20 w-full max-w-4xl text-left">
          <h2 className="text-lg font-semibold bm-text">Simple pricing</h2>
          <p className="mt-1 text-sm bm-text3">Start free. Upgrade when BuildMind is earning its keep.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {PLANS.map((plan) => (
              <div key={plan.name} className={`flex flex-col rounded-2xl border p-5 ${plan.featured ? "border-indigo-500/40 bg-gradient-to-b from-indigo-500/10 to-purple-500/5" : "border-[var(--bm-border2)] bg-white/[0.03]"}`}>
                {plan.badge && (
                  <span className="mb-3 self-start rounded-full border border-indigo-500/30 bg-indigo-500/20 px-2.5 py-0.5 text-[10px] uppercase tracking-wider text-indigo-300">{plan.badge}</span>
                )}
                <div className="mb-0.5 text-xs bm-text3">{plan.name}</div>
                <div className="mb-1 flex items-baseline gap-1">
                  <span className="text-2xl font-semibold bm-text">{plan.price}</span>
                  <span className="text-xs bm-text3">{plan.period}</span>
                </div>
                <p className="mb-4 text-xs bm-text3">{plan.desc}</p>
                <ul className="mb-5 flex-1 space-y-2">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs leading-relaxed bm-text2">
                      <span className="mt-0.5 flex-shrink-0 text-indigo-400">+</span>{f}
                    </li>
                  ))}
                </ul>
                <p className="mb-3 text-[10px] bm-text3">{plan.note}</p>
                <Link href={plan.href} className={`block w-full rounded-xl py-2.5 text-center text-xs font-semibold transition ${plan.featured ? "bg-gradient-to-r from-indigo-500 to-purple-500 bm-text hover:opacity-90" : "border border-[var(--bm-border2)] bg-white/5 bm-text hover:bg-white/10"}`}>
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
          <p className="mt-3 text-center text-xs bm-text3">Annual plans save 40% — coming soon. Cancel monthly anytime.</p>
        </section>

        {/* Final CTA */}
        <div className="mt-20 w-full max-w-xl">
          <div className="rounded-2xl border border-indigo-500/20 bg-gradient-to-b from-indigo-500/10 to-transparent p-8 text-center">
            <div className="mb-3 text-2xl font-semibold bm-text">Ready to actually ship?</div>
            <p className="mb-6 text-sm bm-text2">Join 247 founders who wake up knowing exactly what to do next.</p>
            <Link href="/auth/signup" className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 px-8 py-3.5 text-sm font-semibold bm-text transition hover:opacity-90">
              Start free — takes 2 minutes →
            </Link>
          </div>
        </div>

      </main>
    </div>
  );
}
