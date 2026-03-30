"use client";
/**
 * /try — Anonymous experience. No login required.
 *
 * This is the most important page for conversion.
 * User lands here from the landing page CTA.
 * They answer 2 questions and see a REAL generated action.
 * Only AFTER they interact do we ask them to save progress (sign up).
 *
 * This page does NOT call the authenticated API.
 * It uses stage-based actions generated client-side.
 * The /auth/signup link passes stage + problem as query params
 * so onboarding can pre-fill and skip redundant questions.
 */

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";

const STAGES = ["Idea", "Validation", "Prototype", "MVP", "Launch", "Revenue"];

// Stage-based actions shown to anonymous users
const ANON_ACTIONS: Record<string, { action: string; why: string; message: string; time: string }> = {
  Idea: {
    action: "Talk to 5 people who have this problem before writing any code",
    why: "Every assumption you have about your user is probably wrong. Conversations cost nothing to invalidate them.",
    message: `Hey, quick question — what's your biggest challenge with [your problem area]? I'm researching it and would love 10 minutes.`,
    time: "2 hours",
  },
  Validation: {
    action: "Send this outreach message to 10 potential users today",
    why: "The Mom Test: ask about their life, not your idea. You'll get honest answers that way.",
    message: `Hey [name] — I'm building something for people who struggle with [problem]. What do you currently do when [problem] happens? Not pitching, just learning.`,
    time: "1-2 hours",
  },
  Prototype: {
    action: "Record a 3-minute Loom walkthrough and send it to 5 people today",
    why: "Dropbox got 75K signups from a demo video before writing any backend code. Ship something real.",
    message: `Hey — I've built a rough prototype for [problem]. Would you watch a 3-minute demo and tell me what confuses you most? Brutal honesty only.`,
    time: "Under 2 hours",
  },
  MVP: {
    action: "Send your working link to one warm contact before end of day",
    why: "The version they see today teaches you more than 3 more days of polishing. Ship it.",
    message: `Hey — I've been building [product] to solve [problem]. It's rough but working. Would you try it for 10 minutes and tell me what breaks? Here's the link: [link]`,
    time: "30 minutes",
  },
  Launch: {
    action: "Post on Product Hunt this week — imperfect listing beats no listing",
    why: "Notion's Product Hunt launch generated 10K users in 24 hours at zero ad spend. You don't need to be ready.",
    message: `We just launched [product] on Product Hunt — it [solves problem] for [target users]. Would love your support and brutal feedback: [link]`,
    time: "3 hours to prepare",
  },
  Revenue: {
    action: "Call one churned user today — not to win them back, to understand why they left",
    why: "Churn analysis conversations are the highest-leverage activity at revenue stage. Every answer is worth more than 10 feature ideas.",
    message: `Hey [name] — I noticed you stopped using [product]. No sales pitch. I just want to understand what didn't work so I can fix it. 10 minutes?`,
    time: "1 hour",
  },
};

type Step = "stage" | "problem" | "action";

export default function TryPage() {
  const [step, setStep] = useState<Step>("stage");
  const [stage, setStage] = useState("MVP");
  const [problem, setProblem] = useState("");
  const [copied, setCopied] = useState(false);
  const [done, setDone] = useState(false);

  const action = ANON_ACTIONS[stage] ?? ANON_ACTIONS["MVP"];
  // Personalise with their problem if entered
  const personalizedMessage = problem.trim()
    ? action.message
        .replace(/\[your problem area\]/g, problem)
        .replace(/\[problem\]/g, problem)
        .replace(/\[problem area\]/g, problem)
    : action.message;

  const copy = () => {
    navigator.clipboard.writeText(personalizedMessage).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0f1117", fontFamily: "'DM Sans',system-ui,sans-serif", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px" }}>

      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 32 }}>
        <Image src="/brand/bui.svg" alt="BuildMind" width={36} height={36} style={{ objectFit: "contain", borderRadius: 7 }} />
        <div style={{ fontWeight: 900, fontSize: 18, background: "linear-gradient(135deg,#cc44ff,#7755ff,#44aaff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", letterSpacing: "-0.02em" }}>BuildMind</div>
      </div>

      {/* STEP 1 — What stage are you at? */}
      {step === "stage" && (
        <div style={{ width: "100%", maxWidth: 480 }}>
          <div style={{ background: "#f8f7f4", borderRadius: 20, padding: 28, color: "#1a1a2e" }}>
            <div style={{ fontSize: 10, color: "#94a3b8", textAlign: "center", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Step 1 of 2</div>
            <h2 style={{ fontSize: 22, fontWeight: 900, color: "#0f172a", textAlign: "center", marginBottom: 6, letterSpacing: "-0.02em" }}>What stage are you at?</h2>
            <p style={{ fontSize: 13, color: "#64748b", textAlign: "center", marginBottom: 24, lineHeight: 1.55 }}>BuildMind generates a different action for each stage. Be honest.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 20 }}>
              {STAGES.map(s => (
                <button key={s} onClick={() => setStage(s)} style={{ padding: "11px 8px", borderRadius: 10, fontSize: 13, fontWeight: 600, border: `1px solid ${stage === s ? "#6366f1" : "rgba(0,0,0,0.12)"}`, background: stage === s ? "rgba(99,102,241,0.1)" : "white", color: stage === s ? "#6366f1" : "#64748b", cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>{s}</button>
              ))}
            </div>
            <button onClick={() => setStep("problem")} style={{ width: "100%", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "white", fontSize: 14, fontWeight: 700, padding: 13, borderRadius: 11, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
              Next: What are you building? →
            </button>
            <p style={{ fontSize: 11, color: "#94a3b8", textAlign: "center", marginTop: 12 }}>No signup required</p>
          </div>
        </div>
      )}

      {/* STEP 2 — What problem? */}
      {step === "problem" && (
        <div style={{ width: "100%", maxWidth: 480 }}>
          <div style={{ background: "#f8f7f4", borderRadius: 20, padding: 28, color: "#1a1a2e" }}>
            <div style={{ fontSize: 10, color: "#94a3b8", textAlign: "center", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Step 2 of 2</div>
            <h2 style={{ fontSize: 22, fontWeight: 900, color: "#0f172a", textAlign: "center", marginBottom: 6, letterSpacing: "-0.02em" }}>What problem are you solving?</h2>
            <p style={{ fontSize: 13, color: "#64748b", textAlign: "center", marginBottom: 20, lineHeight: 1.55 }}>One sentence is enough. BuildMind personalises your action with this.</p>
            <input
              value={problem}
              onChange={e => setProblem(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && problem.trim()) setStep("action"); }}
              placeholder="e.g. founders don't know what to do next"
              autoFocus
              style={{ width: "100%", background: "white", border: "1px solid rgba(0,0,0,0.13)", borderRadius: 11, padding: "12px 14px", fontSize: 14, color: "#1e293b", outline: "none", fontFamily: "inherit", marginBottom: 12, boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", gap: 9 }}>
              <button onClick={() => setStep("stage")} style={{ flex: 1, background: "rgba(0,0,0,0.06)", border: "none", color: "#64748b", fontSize: 13, fontWeight: 600, padding: 12, borderRadius: 10, cursor: "pointer", fontFamily: "inherit" }}>← Back</button>
              <button onClick={() => setStep("action")} style={{ flex: 2, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "white", fontSize: 14, fontWeight: 700, padding: 12, borderRadius: 10, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                Generate my action →
              </button>
            </div>
            <button onClick={() => { setProblem(""); setStep("action"); }} style={{ width: "100%", background: "none", border: "none", color: "#94a3b8", fontSize: 12, marginTop: 10, cursor: "pointer", fontFamily: "inherit" }}>
              Skip — show me a generic action
            </button>
          </div>
        </div>
      )}

      {/* ACTION — the main value moment */}
      {step === "action" && (
        <div style={{ width: "100%", maxWidth: 520 }}>
          {/* The white card */}
          <div style={{ background: "#f8f7f4", borderRadius: 20, padding: 28, color: "#1a1a2e", marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: "#64748b", textAlign: "center", marginBottom: 18, paddingBottom: 16, borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
              You are in: <strong style={{ color: "#1e293b" }}>{stage} Stage</strong>
              {problem && <span style={{ marginLeft: 6, color: "#94a3b8", fontSize: 10 }}>• {problem.slice(0, 30)}{problem.length > 30 ? "..." : ""}</span>}
            </div>

            <div style={{ fontSize: 20, fontWeight: 900, color: "#0f172a", marginBottom: 7, letterSpacing: "-0.02em" }}>DO THIS NOW:</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", marginBottom: 18, lineHeight: 1.45 }}>{action.action}</div>

            <div style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: 12, padding: 16, marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
              <div style={{ fontSize: 13, color: "#1e293b", lineHeight: 1.6, flex: 1, fontStyle: "italic" }}>"{personalizedMessage}"</div>
              <button onClick={copy} style={{ width: 32, height: 32, background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, fontSize: 13, fontFamily: "inherit" }}>{copied ? "✓" : "📋"}</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              <button onClick={copy} style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)", color: "#4338ca", fontSize: 13, fontWeight: 600, padding: 12, borderRadius: 10, cursor: "pointer", fontFamily: "inherit" }}>📋 Copy message</button>
              <button onClick={() => setDone(true)} style={{ background: done ? "#15803d" : "#16a34a", color: "white", fontSize: 13, fontWeight: 700, padding: 12, borderRadius: 10, border: "none", cursor: "pointer", fontFamily: "inherit", transition: "background 0.2s" }}>
                {done ? "✓ Done!" : "✓ Done"}
              </button>
            </div>

            <div style={{ fontSize: 11, color: "#94a3b8", textAlign: "center", marginBottom: 18 }}>WHY: {action.why}</div>

            <div style={{ borderTop: "1px solid rgba(0,0,0,0.08)", paddingTop: 16 }}>
              <div style={{ display: "flex", gap: 14, padding: "7px 0" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", width: 72, flexShrink: 0 }}>How long</div>
                <div style={{ width: 1, background: "rgba(0,0,0,0.1)", flexShrink: 0 }} />
                <div style={{ fontSize: 12, color: "#475569" }}>{action.time}</div>
              </div>
            </div>
          </div>

          {/* MICRO-COMMITMENT → signup trigger */}
          {/* This is where we ask for account AFTER they've felt the product */}
          <div style={{ background: "linear-gradient(135deg,rgba(99,102,241,0.12),rgba(139,92,246,0.08))", border: "1px solid rgba(129,140,248,0.3)", borderRadius: 16, padding: 24, textAlign: "center" }}>
            <div style={{ fontSize: 20, marginBottom: 10 }}>🔒</div>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: "#f1f5f9", marginBottom: 8 }}>Save your progress to continue</h3>
            <p style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6, marginBottom: 20 }}>
              BuildMind will remember this action, track whether you complete it, and generate your next one tomorrow. Free to start.
            </p>
            <Link
              href={`/auth/signup?stage=${stage}&problem=${encodeURIComponent(problem)}`}
              style={{ display: "block", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "white", fontWeight: 700, fontSize: 14, padding: "13px", borderRadius: 11, textDecoration: "none", boxShadow: "0 0 20px rgba(99,102,241,0.3)", marginBottom: 10 }}
            >
              Save progress — it's free →
            </Link>
            <Link href="/auth/login" style={{ fontSize: 12, color: "#64748b", textDecoration: "none" }}>Already have an account? Sign in</Link>
          </div>

          {/* Back / restart */}
          <div style={{ textAlign: "center", marginTop: 14 }}>
            <button onClick={() => setStep("stage")} style={{ fontSize: 12, color: "#475569", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
              ← Try a different stage
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
