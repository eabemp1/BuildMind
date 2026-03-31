"use client";

import { useState } from "react";
import Link from "next/link";
import { BrandMark } from "@/components/layout/logo";

const STAGES = ["MVP", "Idea", "Validation", "Launch"];

const ACTIONS: Record<string, { action: string; message: string }> = {
  MVP: {
    action: "Send your working link to one warm contact before end of day.",
    message:
      "Hey — I’ve been building something that solves [problem]. It’s rough but working. Would you try it for 10 minutes and tell me what breaks?",
  },
  Idea: {
    action: "Talk to 5 people with this problem before writing any code.",
    message:
      "Hey — quick question. What’s your biggest challenge with [problem]? I’m researching it and would love 10 minutes.",
  },
  Validation: {
    action: "Send this outreach message to 10 potential users today.",
    message:
      "Hey — I’m building something for people who struggle with [problem]. What do you currently do when that happens?",
  },
  Launch: {
    action: "Post your launch and ask for feedback today.",
    message:
      "We just launched [product] — it helps [target] solve [problem]. I’d love your honest feedback: [link]",
  },
};

export default function TryPage() {
  const [stage, setStage] = useState("MVP");
  const [copied, setCopied] = useState(false);

  const payload = ACTIONS[stage] ?? ACTIONS.MVP;

  const copy = () => {
    navigator.clipboard.writeText(payload.message).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="min-h-screen bg-[#07080c] text-zinc-100">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-3">
          <BrandMark size={24} href="/" />
          <div className="text-sm font-semibold">BuildMind</div>
        </div>
        <Link
          href="/auth/signup"
          className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-white/10"
        >
          Create account
        </Link>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 pb-20 pt-6">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Try without an account</p>
          <h1 className="mt-2 text-2xl font-semibold">What stage are you at?</h1>
          <div className="mt-4 flex flex-wrap gap-2">
            {STAGES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStage(s)}
                className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
                  stage === s
                    ? "border-indigo-400 bg-indigo-500/10 text-indigo-200"
                    : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <section className="rounded-2xl border border-white/10 bg-[#0c0d12] p-6">
          <div className="mb-4 text-xs uppercase tracking-[0.25em] text-zinc-500">Your action for today</div>
          <h2 className="text-lg font-semibold text-zinc-100">{payload.action}</h2>
          <div className="mt-4 flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-black/40 p-4 text-xs text-zinc-300">
            <p>“{payload.message}”</p>
            <button
              onClick={copy}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-zinc-100"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4 text-center">
            <p className="text-xs text-zinc-400">Save your progress + get daily actions</p>
            <Link
              href="/auth/signup"
              className="mt-3 inline-flex items-center justify-center rounded-lg border border-white/10 bg-white px-4 py-2 text-xs font-semibold text-black"
            >
              Create free account →
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
