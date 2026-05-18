"use client";

/**
 * app/onboarding/page.tsx — Onboarding v2 (Playbook §2.1)
 *
 * Screen 1: One sentence input. Nothing else.
 * Screen 2: Reflexion Strike — market gap + first task in ~15 seconds.
 * Screen 3: Identity begins. Momentum Score appears. Founder is inside the product.
 *
 * RULE: Value before explanation. The founder feels BuildMind before they understand it.
 */

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { createProjectWithRoadmap, getCurrentUser, getOnboardingStatus } from "@/lib/buildmind";
import { createClient } from "@/lib/supabase/client";
import { identifyUser } from "@/lib/analytics";
import { trackFunnelStep } from "@/lib/onboarding-analytics";
import BuildMindLoader from "@/components/BuildMindLoader";
import { ArrowRight, Loader2, Zap } from "lucide-react";
import { Suspense } from "react";

type Screen = "input" | "strike" | "depth" | "identity" | "saving";

// ── Depth screen answers ──────────────────────────────────────────────────────
interface DepthAnswers {
  avoidance: string;
  revenueModel: string;
  targetUsers: string;
}

interface StrikeResult {
  marketGap: string;
  firstTask: string;
  rationale: string;
}

// ── Shared visual tokens ──────────────────────────────────────────────────────
const VIZ = {
  bg: "var(--bm-bg)",
  text: "var(--bm-text)",
  text2: "var(--bm-text2)",
  text3: "var(--bm-text3)",
  accent: "var(--bm-accent)",
  panel: "var(--bm-bg2)",
  border: "var(--bm-border)",
  grad: "var(--grad-primary)",
};

// ── Screen 1 — The Only Question That Matters ─────────────────────────────────
function InputScreen({ onSubmit }: { onSubmit: (idea: string) => void }) {
  const [idea, setIdea] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSubmit = () => {
    if (!idea.trim() || loading) return;
    setLoading(true);
    onSubmit(idea.trim());
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100dvh", padding: "24px", background: VIZ.bg }}
    >
      {/* Logo */}
      <div style={{ marginBottom: 48, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: VIZ.grad, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Zap size={16} color="#fff" />
        </div>
        <span style={{ fontWeight: 700, fontSize: 18, color: VIZ.text, letterSpacing: "-0.02em" }}>BuildMind</span>
      </div>

      <div style={{ width: "100%", maxWidth: 560 }}>
        {/* The only question */}
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          style={{ fontSize: "clamp(26px, 5vw, 38px)", fontWeight: 800, color: VIZ.text, letterSpacing: "-0.03em", lineHeight: 1.15, margin: "0 0 32px", textAlign: "center" }}
        >
          Describe your startup<br />in one sentence.
        </motion.h1>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
          <textarea
            ref={inputRef}
            value={idea}
            onChange={e => setIdea(e.target.value)}
            onKeyDown={handleKey}
            placeholder="e.g. I'm building a tool that helps African SMEs manage compliance without lawyers."
            rows={3}
            style={{
              width: "100%",
              padding: "16px 18px",
              fontSize: 15,
              fontFamily: "inherit",
              color: VIZ.text,
              background: VIZ.panel,
              border: `1px solid ${VIZ.border}`,
              borderRadius: 12,
              outline: "none",
              resize: "none",
              lineHeight: 1.5,
              boxSizing: "border-box",
              transition: "border-color 0.2s",
            }}
            onFocus={e => { e.target.style.borderColor = VIZ.accent; }}
            onBlur={e => { e.target.style.borderColor = VIZ.border; }}
          />

          <motion.button
            onClick={handleSubmit}
            disabled={!idea.trim() || loading}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            style={{
              width: "100%",
              marginTop: 14,
              padding: "14px 24px",
              background: idea.trim() && !loading ? VIZ.grad : VIZ.panel,
              color: idea.trim() && !loading ? "#fff" : VIZ.text3,
              border: "none",
              borderRadius: 10,
              fontSize: 15,
              fontWeight: 600,
              cursor: idea.trim() && !loading ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              transition: "all 0.2s",
              fontFamily: "inherit",
            }}
          >
            {loading
              ? <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Analysing your market...</>
              : <><ArrowRight size={16} /> Run the analysis</>
            }
          </motion.button>

          <p style={{ textAlign: "center", fontSize: 12, color: VIZ.text3, marginTop: 12 }}>
            15 seconds. No email. No tour. Just your market gap and first task.
          </p>
        </motion.div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </motion.div>
  );
}

// ── Screen 2 — The Reflexion Strike ──────────────────────────────────────────
function StrikeScreen({ idea, result, onContinue }: { idea: string; result: StrikeResult; onContinue: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.4 }}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100dvh", padding: "24px", background: VIZ.bg }}
    >
      <div style={{ width: "100%", maxWidth: 560 }}>
        {/* What they said */}
        <p style={{ fontSize: 13, color: VIZ.text3, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>Your idea</p>
        <p style={{ fontSize: 15, color: VIZ.text2, marginBottom: 32, lineHeight: 1.5, fontStyle: "italic" }}>"{idea}"</p>

        {/* Market gap */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          style={{ background: VIZ.panel, border: `1px solid ${VIZ.border}`, borderTop: `2px solid ${VIZ.accent}`, borderRadius: 12, padding: "18px 20px", marginBottom: 14 }}
        >
          <p style={{ fontSize: 11, fontWeight: 700, color: VIZ.accent, textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 8px" }}>Market gap</p>
          <p style={{ fontSize: 15, color: VIZ.text, lineHeight: 1.55, margin: 0 }}>{result.marketGap}</p>
        </motion.div>

        {/* First task */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          style={{ background: VIZ.panel, border: `1px solid ${VIZ.border}`, borderTop: "2px solid #22c55e", borderRadius: 12, padding: "18px 20px", marginBottom: 14 }}
        >
          <p style={{ fontSize: 11, fontWeight: 700, color: "#22c55e", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 8px" }}>Your first task — right now</p>
          <p style={{ fontSize: 15, color: VIZ.text, lineHeight: 1.55, margin: 0, fontWeight: 500 }}>{result.firstTask}</p>
        </motion.div>

        {/* Rationale */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.45 }}
          style={{ marginBottom: 28 }}
        >
          <p style={{ fontSize: 13, color: VIZ.text3, lineHeight: 1.5, fontStyle: "italic", margin: 0 }}>
            {result.rationale}
          </p>
        </motion.div>

        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.55 }}
          onClick={onContinue}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          style={{
            width: "100%",
            padding: "14px 24px",
            background: VIZ.grad,
            color: "#fff",
            border: "none",
            borderRadius: 10,
            fontSize: 15,
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            fontFamily: "inherit",
          }}
        >
          <Zap size={15} /> Start operating like this every day
        </motion.button>
      </div>
    </motion.div>
  );
}

// ── Screen 3 — Richer Depth (Product Improvement #6) ─────────────────────────
// Conversational 3-question screen. Feels like a chat, not a form.
// All questions optional — skippable — but "30 points" nudge encourages completion.
function DepthScreen({ onComplete }: { onComplete: (answers: DepthAnswers) => void }) {
  const [avoidance,    setAvoidance]    = useState("");
  const [revenueModel, setRevenueModel] = useState("");
  const [targetUsers,  setTargetUsers]  = useState("");
  const [step,         setStep]         = useState<0|1|2>(0);

  const questions = [
    {
      emoji:       "🚫",
      heading:     "What kind of work do you keep putting off?",
      sub:         "Sales calls? Writing? Talking to users? Be honest — AI uses this to call you out.",
      placeholder: "I avoid…",
      value:       avoidance,
      onChange:    setAvoidance,
    },
    {
      emoji:       "💰",
      heading:     "How do you plan to charge?",
      sub:         "Subscription, one-time, usage-based, freemium, B2B deals? Even \"not sure yet\" is useful.",
      placeholder: "We'll charge by…",
      value:       revenueModel,
      onChange:    setRevenueModel,
    },
    {
      emoji:       "🎯",
      heading:     "Who exactly are you building this for?",
      sub:         "Job title, frustration, situation. The more specific, the better your AI advice.",
      placeholder: "Founders who are…",
      value:       targetUsers,
      onChange:    setTargetUsers,
    },
  ] as const;

  const q = questions[step];
  const totalFilled = [avoidance, revenueModel, targetUsers].filter(s => s.trim()).length;
  const pointsUnlocked = totalFilled * 10; // rough nudge: each answer = 10 quality pts

  const handleNext = () => {
    if (step < 2) { setStep((step + 1) as 1 | 2); }
    else          { onComplete({ avoidance, revenueModel, targetUsers }); }
  };

  const handleSkip = () => {
    if (step < 2) { setStep((step + 1) as 1 | 2); }
    else          { onComplete({ avoidance, revenueModel, targetUsers }); }
  };

  return (
    <motion.div
      key={`depth-${step}`}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100dvh", padding: "24px", background: VIZ.bg }}
    >
      {/* Progress dots */}
      <div style={{ display: "flex", gap: 6, marginBottom: 40 }}>
        {[0,1,2].map(i => (
          <div key={i} style={{
            width: i === step ? 20 : 6, height: 6, borderRadius: 3,
            background: i <= step ? VIZ.accent : "rgba(255,255,255,0.1)",
            transition: "all 0.3s",
          }} />
        ))}
      </div>

      <div style={{ width: "100%", maxWidth: 520 }}>
        {/* Quality nudge */}
        {pointsUnlocked > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              marginBottom: 20, padding: "8px 14px",
              background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)",
              borderRadius: 8, fontSize: 12, color: "#10b981",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <Zap size={11} /> AI advice quality +{pointsUnlocked} points so far
          </motion.div>
        )}
        {pointsUnlocked === 0 && step === 0 && (
          <div style={{ marginBottom: 20, padding: "8px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, fontSize: 12, color: VIZ.text3 }}>
            <Zap size={11} style={{ display: "inline", marginRight: 5 }} />
            These 3 questions improve your AI advice quality by up to 30 points
          </div>
        )}

        <div style={{ fontSize: 32, marginBottom: 14 }}>{q.emoji}</div>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: VIZ.text, letterSpacing: "-0.03em", margin: "0 0 8px", lineHeight: 1.25 }}>
          {q.heading}
        </h2>
        <p style={{ fontSize: 13, color: VIZ.text3, margin: "0 0 24px", lineHeight: 1.5 }}>{q.sub}</p>

        <input
          value={q.value}
          onChange={e => q.onChange(e.target.value.slice(0, 80))}
          placeholder={q.placeholder}
          maxLength={80}
          autoFocus
          onKeyDown={e => { if (e.key === "Enter") handleNext(); }}
          style={{
            width: "100%", background: VIZ.panel, border: `1px solid ${VIZ.border}`,
            borderRadius: 10, padding: "14px 16px", fontSize: 16, color: VIZ.text,
            outline: "none", fontFamily: "inherit", boxSizing: "border-box",
            transition: "border-color 0.15s",
          }}
          onFocus={e => { e.target.style.borderColor = VIZ.accent; }}
          onBlur={e => { e.target.style.borderColor = VIZ.border; }}
        />
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", textAlign: "right", marginTop: 4 }}>
          {q.value.length}/80
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleNext}
            style={{
              flex: 1, padding: "13px 20px", background: VIZ.grad, color: "#fff",
              border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
            }}
          >
            {step < 2 ? "Next →" : "Start building →"}
          </motion.button>
          <button
            onClick={handleSkip}
            style={{
              padding: "13px 16px", background: "transparent", color: VIZ.text3,
              border: `1px solid ${VIZ.border}`, borderRadius: 10, fontSize: 13,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Skip
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ── Screen 4 — Identity Begins ────────────────────────────────────────────────
function IdentityScreen({ onComplete }: { onComplete: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100dvh", padding: "24px", background: VIZ.bg, textAlign: "center" }}
    >
      {/* Momentum score appears */}
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.2, type: "spring", stiffness: 200, damping: 15 }}
        style={{ width: 96, height: 96, borderRadius: "50%", background: VIZ.grad, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24, boxShadow: `0 0 40px ${VIZ.accent}44` }}
      >
        <span style={{ fontSize: 28, fontWeight: 800, color: "#fff" }}>50</span>
      </motion.div>

      <motion.h2
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        style={{ fontSize: 22, fontWeight: 800, color: VIZ.text, letterSpacing: "-0.03em", margin: "0 0 12px" }}
      >
        You are now operating like<br />a high-execution founder.
      </motion.h2>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.55 }}
        style={{ fontSize: 14, color: VIZ.text2, lineHeight: 1.55, maxWidth: 380, margin: "0 0 32px" }}
      >
        Your Momentum Score starts at 50. Every task you complete pushes it higher.
        Every day you don't act, it decays slowly — but never breaks completely.
        BuildMind already knows what you should do next.
      </motion.p>

      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
        onClick={onComplete}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        style={{
          padding: "14px 36px",
          background: VIZ.grad,
          color: "#fff",
          border: "none",
          borderRadius: 10,
          fontSize: 15,
          fontWeight: 600,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontFamily: "inherit",
        }}
      >
        <ArrowRight size={15} /> See today&apos;s action
      </motion.button>
    </motion.div>
  );
}

// ── Main Onboarding Component ─────────────────────────────────────────────────
function OnboardingInner() {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>("input");
  const [idea, setIdea] = useState("");
  const [strikeResult, setStrikeResult] = useState<StrikeResult | null>(null);
  const [depthAnswers, setDepthAnswers] = useState<DepthAnswers>({ avoidance: "", revenueModel: "", targetUsers: "" });
  const [error, setError] = useState<string | null>(null);

  // Redirect if already onboarded
  useEffect(() => {
    getCurrentUser().then(user => {
      if (!user) { router.replace("/auth"); return; }
      getOnboardingStatus(user.id).then(status => {
        if (status?.completed) router.replace("/today");
      });
    });
  }, [router]);

  const handleIdeaSubmit = async (submittedIdea: string) => {
    setIdea(submittedIdea);
    setError(null);

    try {
      trackFunnelStep("reflexion_strike_started");
      const res = await fetch("/api/ai/reflexion-strike", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startupDescription: submittedIdea, stage: "Idea" }),
      });
      const data = await res.json();
      if (data.ok && data.data) {
        setStrikeResult(data.data);
        setScreen("strike");
        trackFunnelStep("reflexion_strike_shown");
      } else {
        throw new Error("Strike failed");
      }
    } catch {
      // Graceful fallback — never show an error to a new user
      setStrikeResult({
        marketGap: "The crowded part of this market is generic solutions. The gap nobody has claimed yet is serving your exact type of user with deep specificity.",
        firstTask: "Find one person who has this problem. Send them a message in the next 30 minutes asking what they currently do about it.",
        rationale: "Because talking to one real person beats a week of planning every time.",
      });
      setScreen("strike");
      trackFunnelStep("reflexion_strike_fallback");
    }
  };

  const handleStrikeContinue = () => {
    setScreen("depth");
    trackFunnelStep("reflexion_strike_accepted");
  };

  const handleDepthComplete = (answers: DepthAnswers) => {
    setDepthAnswers(answers);
    setScreen("identity");
    trackFunnelStep("depth_questions_answered");
  };

  const handleIdentityComplete = async () => {
    setScreen("saving");
    try {
      const user = await getCurrentUser();
      if (!user) { router.replace("/auth"); return; }

      // Map onboarding v2 fields to createProjectWithRoadmap's expected params.
      // project_name: first ≤60 chars of the idea sentence, title-cased
      // idea_description: the full one-sentence idea from screen 1
      // problem: the market gap surfaced by the Reflexion Strike (screen 2)
      // target_users: the AI will refine this via the coach; "founders" is the
      //   default fallback so the context object is never empty on day 1
      const projectName = idea.slice(0, 60).replace(/[.!?]+$/, "").trim();
      await createProjectWithRoadmap({
        project_name: projectName,
        idea_description: idea,
        // Use depth screen answer if provided, else sensible default
        target_users: depthAnswers.targetUsers.trim() || "founders",
        problem: strikeResult?.marketGap ?? idea,
        startup_stage: "Idea",
      });

      identifyUser(user.id, { onboarding_v2: true });
      trackFunnelStep("onboarding_complete");

      // Persist depth-screen answers into founder_memory.avoidance_zones
      // and startup context (best-effort, non-blocking)
      if (depthAnswers.avoidance.trim() || depthAnswers.revenueModel.trim()) {
        fetch("/api/onboarding/depth-answers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(depthAnswers),
        }).catch(() => {});
      }

      // Stamp onboarding_completed into JWT metadata so middleware never
      // runs the slow DB project-count query again for this user (W6 fix).
      const supabase = createClient();
      await supabase.auth.updateUser({ data: { onboarding_completed: true } });

      // Fire welcome email — best-effort, never blocks navigation
      fetch("/api/user/welcome-email", { method: "POST" }).catch(() => {});

      router.push("/today?first_session=true");
    } catch {
      setError("Something went wrong saving your project. Please try again.");
      setScreen("identity");
    }
  };

  if (screen === "saving") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100dvh", background: VIZ.bg }}>
        <BuildMindLoader />
        <p style={{ color: VIZ.text2, marginTop: 16, fontSize: 14 }}>Setting up your execution system...</p>
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      {screen === "input" && (
        <InputScreen key="input" onSubmit={handleIdeaSubmit} />
      )}
      {screen === "strike" && strikeResult && (
        <StrikeScreen key="strike" idea={idea} result={strikeResult} onContinue={handleStrikeContinue} />
      )}
      {screen === "depth" && (
        <DepthScreen key="depth" onComplete={handleDepthComplete} />
      )}
      {screen === "identity" && (
        <IdentityScreen key="identity" onComplete={handleIdentityComplete} />
      )}
    </AnimatePresence>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100dvh" }}>
        <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    }>
      <OnboardingInner />
    </Suspense>
  );
}
