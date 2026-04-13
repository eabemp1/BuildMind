"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { BrandMark } from "@/components/layout/logo";

function EmailCapture() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  const submit = async () => {
    if (!email.includes("@")) return;
    setStatus("loading");
    try {
      await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: "landing_footer" }),
      });
      setStatus("done");
    } catch {
      setStatus("error");
    }
  };

  if (status === "done") {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-2">
        <div className="text-2xl">✓</div>
        <div className="text-sm bm-text font-medium">You're on the list.</div>
        <div className="text-xs bm-text3">First issue lands this Friday.</div>
      </motion.div>
    );
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <input
        type="email" value={email} onChange={e => setEmail(e.target.value)}
        placeholder="your@email.com"
        onKeyDown={e => e.key === "Enter" && submit()}
        className="flex-1 rounded-xl border border-[var(--bm-border2)] bg-white/5 px-4 py-3 text-sm bm-text placeholder:text-zinc-500 outline-none focus:border-indigo-500/50"
      />
      <button onClick={submit} disabled={status === "loading" || !email.includes("@")}
        className="rounded-xl bg-white/10 border border-[var(--bm-border2)] px-5 py-3 text-sm font-medium bm-text hover:bg-white/15 transition disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ fontFamily: "inherit" }}>
        {status === "loading" ? "Subscribing…" : "Subscribe →"}
      </button>
    </div>
  );
}

const TESTIMONIALS = [
  { name: "Dmitrii Malakhov", handle: "@malakhovdm", quote: "Half the graveyard of side projects wouldn't exist if founders validated distribution before writing a single line of code. 9/10." },
  { name: "Adarsh Kumar", handle: "@firstadarsh", quote: "I literally keep SESSION files manually to track my progress — BuildMind replaces exactly this." },
  { name: "Vladi", handle: "@xvld666", quote: "Break it down until the next step is stupidly obvious. Then do that. Repeat." },
  { name: "Mike Gustafson", handle: "@Mikejgustafson2", quote: "My task list distorts without user conversations. I have to be extremely diligent about that." },
];

const PLANS = [
  {
    name: "Starter", price: "Free", period: "forever",
    desc: "Real tools. Real limits. No card.",
    cta: "Start building free →", href: "/auth/signup", featured: false,
    features: [
      "Projects + AI-generated milestone roadmap",
      "Daily action engine — tailored to your stage",
      "Task tracking with streak counter",
      "3 AI Coach messages per day",
      "Break My Startup — survival preview",
      "Public weekly share card (#buildinpublic)",
    ],
    note: "No card required. Ever.",
    limit: "3 AI messages/day · preview analysis only",
  },
  {
    name: "Builder", price: "GHS 290", period: "/mo (~$19)",
    desc: "For solo founders who need to ship this month.",
    cta: "Start Builder →", href: "/upgrade", featured: true, badge: "Most popular",
    features: [
      "Unlimited AI Coach — no daily caps",
      "Break My Startup — full analysis + live competitor scan",
      "Differentiation battle plan with named competitors",
      "Weekly AI strategy report every Friday",
      "Startup score + investor-ready signal metrics",
      "Startup kit: names, domains, brand colors",
      "90-day venture roadmap tracks",
      "Reflect causality engine",
      "Full project history + data export",
    ],
    note: "Cancel anytime. Takes 60 seconds.",
    limit: null,
  },
];

const STEPS = [
  { n: "01", title: "Tell BuildMind your startup", desc: "4 questions. Your idea, your users, your biggest blocker, your stage. 90 seconds." },
  { n: "02", title: "Get one personalized action", desc: "Every day: one specific, high-leverage task tailored to your startup and stage — not generic advice." },
  { n: "03", title: "Reflect. Adapt. Ship.", desc: "Log what happened. Get causality — why today's outcome shapes tomorrow. Your strategy adapts based on what you actually did." },
];

const FEATURES_SNAPSHOT = [
  { emoji: "⚡", label: "Today", sub: "One action. Specific to your startup." },
  { emoji: "🧠", label: "Reflect", sub: "Close the learning loop daily." },
  { emoji: "💀", label: "Break My Startup", sub: "Stress-test. Find kill reasons." },
  { emoji: "📋", label: "Weekly Report", sub: "Intention vs action. Every Friday." },
  { emoji: "🗺️", label: "Roadmap", sub: "90-day execution tracks." },
  { emoji: "🤖", label: "AI Coach", sub: "Unlimited. Grounded in your project." },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bm-bg bm-text" style={{ fontFamily: "system-ui,sans-serif" }}>

      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-[var(--bm-border)] bg-[#07080c]/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <BrandMark size={26} href="/" />
            <p className="text-sm font-semibold">BuildMind</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden items-center gap-5 text-sm bm-text2 md:flex">
              <a href="#how" className="transition hover:text-zinc-200">How it works</a>
              <Link href="/overview" className="transition hover:text-zinc-200">Features</Link>
              <a href="#pricing" className="transition hover:text-zinc-200">Pricing</a>
              <Link href="/auth/login" className="transition hover:text-zinc-200">Login</Link>
            </div>
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
            Daily execution engine for founders
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
            &quot;Hey, I&apos;m researching how people send money home. What&apos;s the most frustrating part of your current method? Not pitching anything — just learning.&quot;
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
          <Link href="/overview" className="flex w-full items-center justify-center rounded-xl border border-[var(--bm-border2)] bg-transparent px-4 py-3 text-sm bm-text2 transition hover:bg-white/5">
            See all features →
          </Link>
          <p className="text-xs bm-text3">
            Already have an account? <Link className="underline hover:text-zinc-300" href="/auth/login">Sign in</Link>
          </p>
        </motion.div>

        {/* Feature snapshot */}
        <section className="mt-20 w-full max-w-4xl text-left">
          <h2 className="text-lg font-semibold bm-text">Six tools. One execution system.</h2>
          <p className="mt-1 text-sm bm-text3 mb-5">Everything you need to go from idea to shipping — without a co-founder, an agency, or a $500/mo tool stack.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {FEATURES_SNAPSHOT.map(f => (
              <div key={f.label} className="rounded-xl border border-[var(--bm-border2)] bg-white/[0.03] p-4">
                <div className="text-lg mb-1">{f.emoji}</div>
                <div className="text-sm font-semibold bm-text mb-0.5">{f.label}</div>
                <div className="text-xs bm-text3 leading-relaxed">{f.sub}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 text-center">
            <Link href="/overview" className="text-xs bm-text3 underline hover:text-zinc-300">Full feature breakdown →</Link>
          </div>
        </section>

        {/* Social proof */}
        <section id="proof" className="mt-20 w-full max-w-4xl text-left">
          <h2 className="text-lg font-semibold bm-text">What founders say</h2>
          <p className="mt-1 text-sm bm-text3">Collected from real conversations before we built anything.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {TESTIMONIALS.map((t) => (
              <div key={t.handle} className="rounded-xl border border-[var(--bm-border2)] bg-white/5 p-4">
                <p className="text-sm leading-relaxed bm-text">&quot;{t.quote}&quot;</p>
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
          <p className="mt-1 text-sm bm-text3">Free plan is real — not crippled. Builder removes every limit and adds five more power features.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {PLANS.map((plan) => (
              <div key={plan.name} className={`flex flex-col rounded-2xl border p-5 ${plan.featured ? "border-indigo-500/40 bg-gradient-to-b from-indigo-500/10 to-purple-500/5" : "border-[var(--bm-border2)] bg-white/[0.03]"}`}>
                {"badge" in plan && plan.badge && (
                  <span className="mb-3 self-start rounded-full border border-indigo-500/30 bg-indigo-500/20 px-2.5 py-0.5 text-[10px] uppercase tracking-wider text-indigo-300">{plan.badge}</span>
                )}
                <div className="mb-0.5 text-xs bm-text3">{plan.name}</div>
                <div className="mb-1 flex items-baseline gap-1">
                  <span className="text-2xl font-semibold bm-text">{plan.price}</span>
                  <span className="text-xs bm-text3">{plan.period}</span>
                </div>
                <p className="mb-4 text-xs bm-text3">{plan.desc}</p>
                <ul className="mb-4 flex-1 space-y-2">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs leading-relaxed bm-text2">
                      <span className="mt-0.5 flex-shrink-0 text-indigo-400">✓</span>{f}
                    </li>
                  ))}
                </ul>
                {plan.limit && (
                  <p className="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[10px] text-amber-400/80 font-mono">{plan.limit}</p>
                )}
                <p className="mb-3 text-[10px] bm-text3">{plan.note}</p>
                <Link href={plan.href} className={`block w-full rounded-xl py-2.5 text-center text-xs font-semibold transition ${plan.featured ? "bg-gradient-to-r from-indigo-500 to-purple-500 bm-text hover:opacity-90" : "border border-[var(--bm-border2)] bg-white/5 bm-text hover:bg-white/10"}`}>
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
          <p className="mt-3 text-center text-xs bm-text3">Annual plans — coming soon. Cancel monthly anytime.</p>
        </section>

        {/* Who this is for — beachhead positioning */}
        <section className="mt-20 w-full max-w-4xl text-left">
          <h2 className="text-lg font-semibold bm-text">Built for solo founders who are actually building</h2>
          <p className="mt-1 text-sm bm-text3 mb-5">Not for teams. Not for idea people. For one person executing on one startup.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { label: "You have an idea and a stage", desc: "Idea, validation, MVP, launch, or revenue — BuildMind calibrates your daily action to where you actually are." },
              { label: "You work alone or mostly alone", desc: "No co-founder, no daily standup. BuildMind is your accountability system, execution coach, and weekly analyst." },
              { label: "You want to ship, not plan", desc: "BuildMind removes planning paralysis by making the next decision for you. One action. Already decided." },
            ].map(f => (
              <div key={f.label} className="rounded-xl border border-[var(--bm-border2)] bg-white/[0.03] p-4">
                <div className="text-sm font-semibold bm-text mb-1.5">{f.label}</div>
                <div className="text-xs bm-text3 leading-relaxed">{f.desc}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <p className="text-xs text-amber-400/80">
              <strong className="text-amber-400">BuildMind is not for you if:</strong> you want a project management tool, you have a team that needs coordination, or you're looking for a co-founder. This is a solo execution engine.
            </p>
          </div>
        </section>

        {/* Email capture — warm leads who won't sign up today */}
        <section className="mt-20 w-full max-w-xl">
          <div className="rounded-2xl border border-[var(--bm-border2)] bg-white/[0.03] p-8 text-center">
            <div className="mb-2 text-base font-semibold bm-text">Not ready to sign up yet?</div>
            <p className="mb-5 text-sm bm-text3 leading-relaxed">Get one founder insight per week — pulled from real execution data. No fluff. Unsubscribe anytime.</p>
            <EmailCapture />
          </div>
        </section>

        {/* Final CTA */}
        <div className="mt-12 w-full max-w-xl">
          <div className="rounded-2xl border border-indigo-500/20 bg-gradient-to-b from-indigo-500/10 to-transparent p-8 text-center">
            <div className="mb-3 text-2xl font-semibold bm-text">Ready to actually ship?</div>
            <p className="mb-6 text-sm bm-text2">Wake up tomorrow knowing exactly what to do next.</p>
            <Link href="/auth/signup" className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 px-8 py-3.5 text-sm font-semibold bm-text transition hover:opacity-90">
              Start free — takes 2 minutes →
            </Link>
          </div>
        </div>

      </main>
    </div>
  );
}
