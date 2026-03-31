"use client";

import Link from "next/link";
import { BrandMark } from "@/components/layout/logo";

const TESTIMONIALS = [
  {
    name: "Dmitrii Malakhov",
    handle: "@malakhovdm",
    quote:
      "9/10. Half the graveyard of side projects wouldn't exist if founders validated distribution before writing a single line of code.",
  },
  {
    name: "Adarsh Kumar",
    handle: "@firstadarsh",
    quote:
      "How can I access yours? I literally keep SESSION files manually to track my progress — BuildMind replaces exactly this.",
  },
  {
    name: "Vladi",
    handle: "@xvld666",
    quote: "Break it down until the next step is stupidly obvious. Then do that. Repeat.",
  },
  {
    name: "Mike Gustafson",
    handle: "@Mikejgustafson2",
    quote: "My task list distorts without user conversations. I have to be extremely diligent about that.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#07080c] text-zinc-100">
      <nav className="sticky top-0 z-50 border-b border-white/5 bg-[#07080c]/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <BrandMark size={26} href="/" />
            <div className="leading-tight">
              <p className="text-sm font-semibold">BuildMind</p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Founder OS</p>
            </div>
          </div>
          <div className="hidden items-center gap-4 text-sm text-zinc-400 md:flex">
            <a href="#proof" className="transition hover:text-zinc-200">Proof</a>
            <a href="#pricing" className="transition hover:text-zinc-200">Pricing</a>
            <Link href="/auth/login" className="transition hover:text-zinc-200">Login</Link>
            <Link
              href="/try"
              className="rounded-lg bg-gradient-to-r from-indigo-500 to-purple-500 px-4 py-2 text-xs font-semibold text-white"
            >
              Try it now →
            </Link>
          </div>
        </div>
      </nav>

      <main className="mx-auto flex max-w-3xl flex-col items-center px-6 pb-20 pt-16 text-center">
        <span className="mb-6 rounded-full border border-white/10 bg-white/5 px-4 py-1 text-[10px] uppercase tracking-[0.35em] text-zinc-400">
          Founder OS · v4
        </span>
        <h1 className="text-balance text-4xl font-semibold leading-tight sm:text-5xl">
          One action.
          <br />
          Every day.
          <br />
          Already decided.
        </h1>
        <p className="mt-4 max-w-xl text-sm text-zinc-400 sm:text-base">
          BuildMind gives solo founders the single most important thing to do right now — based on their startup stage.
          No dashboards. No complexity.
        </p>

        <div className="mt-10 w-full max-w-xl rounded-2xl border border-white/10 bg-[#0c0d12] p-5 text-left">
          <div className="mb-3 flex items-center gap-2 text-xs text-zinc-400">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-zinc-300">
              ⚡ MVP Stage
            </span>
          </div>
          <p className="text-sm font-semibold text-zinc-100">Send your working link to one warm contact before end of day.</p>
          <div className="mt-4 rounded-xl border border-white/10 bg-black/40 p-4 text-xs text-zinc-300">
            “Hey — I’ve been building BuildMind to solve [problem]. Would you try it for 10 minutes and tell me what breaks?”
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-zinc-300">Product Hunt</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-zinc-300">Twitter</span>
          </div>
        </div>

        <div className="mt-8 flex w-full max-w-xl flex-col gap-3">
          <Link
            href="/auth/signup"
            className="flex w-full items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Start for free →
          </Link>
          <Link
            href="/try"
            className="flex w-full items-center justify-center rounded-xl border border-white/10 bg-transparent px-4 py-3 text-sm text-zinc-300 transition hover:bg-white/5"
          >
            Try without account
          </Link>
          <p className="text-xs text-zinc-500">Already have an account? <Link className="underline" href="/auth/login">Sign in</Link></p>
        </div>
        <section id="proof" className="mt-16 w-full max-w-4xl text-left">
          <h2 className="text-lg font-semibold text-zinc-100">Proof</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Real founder feedback collected before building anything more.
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {TESTIMONIALS.map((t) => (
              <div key={t.handle} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm text-zinc-200">“{t.quote}”</p>
                <p className="mt-3 text-xs text-zinc-500">
                  {t.name} · {t.handle}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section id="pricing" className="mt-12 w-full max-w-4xl text-left">
          <h2 className="text-lg font-semibold text-zinc-100">Pricing</h2>
          <p className="mt-2 text-sm text-zinc-400">Free to start. Upgrade when you’re ready for daily accountability.</p>
          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-6">
            <div className="text-3xl font-semibold text-white">$10</div>
            <p className="text-sm text-zinc-400">per month · all features · cancel anytime</p>
            <ul className="mt-4 space-y-2 text-sm text-zinc-300">
              <li>Daily action engine</li>
              <li>Execution score + streak tracking</li>
              <li>AI Coach + Break My Startup</li>
              <li>Stage-aware roadmap</li>
            </ul>
            <Link
              href="/auth/signup"
              className="mt-5 inline-flex items-center justify-center rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black"
            >
              Continue building →
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
