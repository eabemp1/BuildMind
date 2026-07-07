"use client";

import { useState } from "react";
import Link from "next/link";
import { BrandMark } from "@/components/layout/logo";

type Archetype = "A" | "B" | "C" | "D";

const QUESTIONS: { q: string; options: { text: string; type: Archetype }[] }[] = [
  {
    q: "When you wake up, how do you decide what to work on?",
    options: [
      { text: "Whatever feels most urgent", type: "A" },
      { text: "I check yesterday's leftover list", type: "B" },
      { text: "I have a system that tells me", type: "C" },
      { text: "I open my laptop and see what's on fire", type: "D" },
    ],
  },
  {
    q: "What happens when you miss a day of work?",
    options: [
      { text: "I feel behind but recover fast", type: "A" },
      { text: "I spiral and lose the week", type: "B" },
      { text: "Nothing — my system catches me up", type: "C" },
      { text: "I don't really track \"days\"", type: "D" },
    ],
  },
  {
    q: "How do you know if this week was productive?",
    options: [
      { text: "Gut feeling", type: "A" },
      { text: "I don't, honestly", type: "B" },
      { text: "I look at actual metrics", type: "C" },
      { text: "If I shipped something visible", type: "D" },
    ],
  },
  {
    q: "How often do you change direction on what matters most?",
    options: [
      { text: "Rarely — I stay the course", type: "A" },
      { text: "Constantly, based on mood or last conversation", type: "B" },
      { text: "When data tells me to", type: "C" },
      { text: "Whenever something urgent comes up", type: "D" },
    ],
  },
  {
    q: "What's your relationship with tracking progress?",
    options: [
      { text: "I've tried tools but abandoned them", type: "A" },
      { text: "I don't track anything", type: "B" },
      { text: "I track religiously", type: "C" },
      { text: "I track in my head", type: "D" },
    ],
  },
  {
    q: "If you disappeared for a week, what would happen to your momentum?",
    options: [
      { text: "It'd mostly hold", type: "A" },
      { text: "It'd completely fall apart", type: "B" },
      { text: "A system would keep things moving", type: "C" },
      { text: "Hard to say — momentum is vibes", type: "D" },
    ],
  },
];

const ARCHETYPES: Record<Archetype, { name: string; desc: string }> = {
  A: {
    name: "Steady but Stalling",
    desc: "You have discipline. You're missing leverage — consistent effort with no compounding system means you're working just as hard next year as today.",
  },
  B: {
    name: "Reactive Sprinter",
    desc: "High energy, low structure. You're moving, but you genuinely can't tell if you're moving forward or just staying busy.",
  },
  C: {
    name: "Systematic Builder",
    desc: "You already think in systems. You're the closest to where this needs to go — the next step is automating what you're already doing manually.",
  },
  D: {
    name: "Silent Drifter",
    desc: "You don't have a productivity problem. You have a visibility problem — no clear signal on what's working until it's already too late.",
  },
};

export default function QuizPage() {
  const [stage, setStage] = useState<"intro" | "quiz" | "result">("intro");
  const [current, setCurrent] = useState(0);
  const [scores, setScores] = useState<Record<Archetype, number>>({ A: 0, B: 0, C: 0, D: 0 });
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const winner = (Object.keys(scores) as Archetype[]).reduce((a, b) =>
    scores[a] >= scores[b] ? a : b,
  );

  function selectOption(type: Archetype) {
    setScores((prev) => ({ ...prev, [type]: prev[type] + 1 }));
    if (current + 1 < QUESTIONS.length) {
      setCurrent(current + 1);
    } else {
      setStage("result");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await fetch("/api/quiz/precommit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, archetype: ARCHETYPES[winner].name }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Something went wrong.");
      }
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at 20% 0%, rgba(99,102,241,0.15), transparent 50%), radial-gradient(circle at 80% 100%, rgba(139,92,246,0.12), transparent 50%), var(--bm-bg, #0a0e1a)",
        color: "var(--bm-text, #e8eaf0)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          background: "var(--bm-bg2, #131829)",
          border: "1px solid var(--bm-border, #232a3d)",
          borderRadius: 20,
          padding: 40,
          maxWidth: 560,
          width: "100%",
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 28 }}>
          <BrandMark size={22} href="/" />
          <div style={{ fontSize: 14, fontWeight: 600 }}>BuildMind</div>
        </div>

        {stage === "intro" && (
          <>
            <div
              style={{
                color: "var(--bm-accent, #6366f1)",
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                marginBottom: 12,
              }}
            >
              Free · 90 seconds
            </div>
            <h1 style={{ fontSize: 28, lineHeight: 1.25, marginBottom: 12 }}>
              What&apos;s Actually Killing Your Execution Momentum?
            </h1>
            <p style={{ color: "var(--bm-text2, #8b93a8)", fontSize: 15, marginBottom: 28, lineHeight: 1.5 }}>
              A quick diagnostic built for solo founders in their first 6 months. You&apos;re not
              lazy — you probably just don&apos;t have visibility into whether this week actually
              moved you forward.
            </p>
            <button
              onClick={() => setStage("quiz")}
              style={{
                width: "100%",
                background: "var(--bm-accent, #6366f1)",
                border: "none",
                color: "white",
                fontWeight: 700,
                fontSize: 14.5,
                padding: 14,
                borderRadius: 10,
                cursor: "pointer",
              }}
            >
              Take the Quiz →
            </button>
          </>
        )}

        {stage === "quiz" && (
          <>
            <div
              style={{
                height: 4,
                background: "var(--bm-border, #232a3d)",
                borderRadius: 2,
                marginBottom: 28,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${(current / QUESTIONS.length) * 100}%`,
                  background: "var(--bm-accent, #6366f1)",
                  borderRadius: 2,
                  transition: "width 0.3s ease",
                }}
              />
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 18 }}>
              {QUESTIONS[current].q}
            </div>
            {QUESTIONS[current].options.map((opt) => (
              <button
                key={opt.text}
                onClick={() => selectOption(opt.type)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid var(--bm-border, #232a3d)",
                  color: "var(--bm-text, #e8eaf0)",
                  padding: "14px 16px",
                  borderRadius: 12,
                  marginBottom: 10,
                  fontSize: 14.5,
                  cursor: "pointer",
                }}
              >
                {opt.text}
              </button>
            ))}
          </>
        )}

        {stage === "result" && (
          <>
            <div
              style={{
                display: "inline-block",
                background: "rgba(99,102,241,0.15)",
                color: "var(--bm-accent, #6366f1)",
                fontWeight: 700,
                padding: "6px 14px",
                borderRadius: 999,
                fontSize: 14,
                marginBottom: 16,
              }}
            >
              {ARCHETYPES[winner].name}
            </div>
            <p style={{ fontSize: 15, color: "var(--bm-text2, #8b93a8)", lineHeight: 1.6, marginBottom: 24 }}>
              {ARCHETYPES[winner].desc}
            </p>

            {!submitted ? (
              <div
                style={{
                  background: "rgba(99,102,241,0.08)",
                  border: "1px solid rgba(99,102,241,0.25)",
                  borderRadius: 14,
                  padding: 20,
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>
                  Join the BuildMind Founding Cohort
                </div>
                <p style={{ fontSize: 14, color: "var(--bm-text2, #8b93a8)", marginBottom: 16, lineHeight: 1.5 }}>
                  BuildMind is live now — daily AI-coached priorities and real momentum tracking for
                  solo founders. Lock in your spot below and we&apos;ll set you up with lifetime founding
                  pricing and a direct line to shape the roadmap the moment you create your account.
                </p>
                <form onSubmit={handleSubmit}>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@startup.com"
                    style={{
                      width: "100%",
                      padding: "13px 14px",
                      borderRadius: 10,
                      border: "1px solid var(--bm-border, #232a3d)",
                      background: "#0d1220",
                      color: "var(--bm-text, #e8eaf0)",
                      fontSize: 14,
                      marginBottom: 10,
                    }}
                  />
                  <button
                    type="submit"
                    disabled={submitting}
                    style={{
                      width: "100%",
                      padding: 14,
                      borderRadius: 10,
                      border: "none",
                      background: "var(--bm-accent, #6366f1)",
                      color: "white",
                      fontWeight: 700,
                      fontSize: 14.5,
                      cursor: submitting ? "default" : "pointer",
                      opacity: submitting ? 0.7 : 1,
                    }}
                  >
                    {submitting ? "Locking in..." : "Lock in my spot"}
                  </button>
                </form>
                {submitError && (
                  <p style={{ color: "#f87171", fontSize: 13, marginTop: 10 }}>{submitError}</p>
                )}
                <p style={{ fontSize: 12, color: "var(--bm-text3, #6b7385)", textAlign: "center", marginTop: 10 }}>
                  No card required now. Founding pricing locks in automatically when you sign up.
                </p>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <h2 style={{ fontSize: 20, marginBottom: 8 }}>You&apos;re on the list 🎉</h2>
                <p style={{ color: "var(--bm-text2, #8b93a8)", fontSize: 14, marginBottom: 20 }}>
                  Create your account now and founding pricing applies automatically — no code needed.
                </p>
                <Link
                  href="/auth/signup"
                  style={{
                    display: "inline-block",
                    background: "var(--bm-accent, #6366f1)",
                    color: "white",
                    fontWeight: 700,
                    fontSize: 14.5,
                    padding: "14px 28px",
                    borderRadius: 10,
                    textDecoration: "none",
                  }}
                >
                  Create my account →
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
