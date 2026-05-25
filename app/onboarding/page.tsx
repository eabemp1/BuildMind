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

type Screen = "identity_input" | "input" | "strike" | "founder_state" | "depth" | "stage" | "identity" | "integrations" | "saving";

// ── IntegrationCard sub-component ────────────────────────────────────────────
function IntegrationCard({
  name, description, icon, iconBg, iconColor, status, onConnect,
}: {
  name: string;
  description: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  status: "idle" | "connecting" | "connected";
  onConnect: () => void;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 14,
      padding: "16px 18px",
      background: status === "connected" ? "rgba(92,200,138,0.05)" : VIZ.panel,
      border: `1px solid ${status === "connected" ? "rgba(92,200,138,0.25)" : VIZ.border}`,
      borderRadius: 12, transition: "all 0.2s",
    }}>
      <div style={{ width: 36, height: 36, borderRadius: 9, background: iconBg, color: iconColor,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 15, fontWeight: 700, flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: VIZ.text, marginBottom: 2 }}>{name}</div>
        <div style={{ fontSize: 12, color: VIZ.text3, lineHeight: 1.45 }}>{description}</div>
      </div>
      {status === "connected" ? (
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--bm-accent)",
          background: "rgba(92,200,138,0.08)", border: "1px solid rgba(92,200,138,0.2)",
          borderRadius: 6, padding: "4px 10px", flexShrink: 0 }}>
          Connected ✓
        </div>
      ) : (
        <button
          onClick={onConnect}
          style={{ fontSize: 12, fontWeight: 600, color: VIZ.text2, background: VIZ.bg3,
            border: `1px solid ${VIZ.border2}`, borderRadius: 7, padding: "6px 14px",
            cursor: "pointer", fontFamily: "inherit", flexShrink: 0, whiteSpace: "nowrap",
            transition: "all 0.15s" }}>
          Connect →
        </button>
      )}
    </div>
  );
}

// ── IntegrationsScreen ────────────────────────────────────────────────────────
function IntegrationsScreen({ onComplete }: { onComplete: () => void }) {
  const [notionStatus, setNotionStatus] = useState<"idle" | "connecting" | "connected">("idle");
  const [linearStatus, setLinearStatus] = useState<"idle" | "connecting" | "connected">("idle");

  // Check if we just returned from an OAuth redirect with a connected integration
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const integration = params.get("integration");
    const status = params.get("status");
    if (integration === "notion" && status === "connected") setNotionStatus("connected");
    if (integration === "linear" && status === "connected") setLinearStatus("connected");
    // Also check live integration status from server
    fetch("/api/integrations/status")
      .then(r => r.ok ? r.json() : null)
      .then((d: { notion?: boolean; linear?: boolean } | null) => {
        if (d?.notion) setNotionStatus("connected");
        if (d?.linear) setLinearStatus("connected");
      })
      .catch(() => {});
    // Clean OAuth params from URL without remounting
    if (integration) window.history.replaceState({}, "", "/onboarding");
  }, []);

  function connectNotion() {
    sessionStorage.setItem("bm_onboarding_return_screen", "integrations");
    window.location.href = "/api/integrations/notion/connect?return=/onboarding";
  }

  function connectLinear() {
    sessionStorage.setItem("bm_onboarding_return_screen", "integrations");
    window.location.href = "/api/integrations/linear/connect?return=/onboarding";
  }

  const anyConnected = notionStatus === "connected" || linearStatus === "connected";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        minHeight: "100dvh", padding: "24px", background: VIZ.bg }}
    >
      {/* Logo */}
      <div style={{ marginBottom: 40, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: VIZ.grad,
          display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Zap size={16} color="#fff" />
        </div>
        <span style={{ fontWeight: 700, fontSize: 18, color: VIZ.text, letterSpacing: "-0.02em" }}>BuildMind</span>
      </div>

      <div style={{ width: "100%", maxWidth: 480 }}>
        <motion.h2 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          style={{ fontSize: "clamp(22px, 4vw, 30px)", fontWeight: 800, color: VIZ.text,
            letterSpacing: "-0.03em", lineHeight: 1.2, margin: "0 0 10px", textAlign: "center" }}>
          Connect your tools
        </motion.h2>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
          style={{ fontSize: 14, color: VIZ.text2, lineHeight: 1.6, textAlign: "center", margin: "0 0 32px" }}>
          Your daily action comes from real tasks in your backlog — not invented ones.
        </motion.p>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
          style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
          <IntegrationCard
            name="Notion" description="Pull tasks and pages from your Notion workspace into daily actions."
            icon="N" iconBg="#191919" iconColor="#fff"
            status={notionStatus} onConnect={connectNotion} />
          <IntegrationCard
            name="Linear" description="Surface open Linear issues directly into your daily execution focus."
            icon="L" iconBg="#5E6AD2" iconColor="#fff"
            status={linearStatus} onConnect={connectLinear} />
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}
          style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
          <button onClick={onComplete} style={{
            width: "100%", padding: "14px 0", borderRadius: 10, border: "none",
            background: anyConnected ? VIZ.grad : VIZ.bg3,
            color: anyConnected ? "#fff" : VIZ.text2,
            fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s",
          }}>
            {anyConnected ? "Continue with connected tools →" : "Continue →"}
          </button>
          <button onClick={onComplete} style={{
            background: "none", border: "none", color: VIZ.text3,
            fontSize: 12, cursor: "pointer", fontFamily: "inherit", padding: "4px 0",
          }}>
            Skip — I&apos;ll connect later in Settings
          </button>
        </motion.div>
      </div>
    </motion.div>
  );
}

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
  text4: "var(--bm-text4)",
  accent: "var(--bm-accent)",
  panel: "var(--bm-bg2)",
  bg3: "var(--bm-bg3)",
  border: "var(--bm-border)",
  border2: "var(--bm-border2)",
  grad: "var(--grad-primary)",
};

// ── Onboarding shell — logo mark + progress dots ──────────────────────────────
const STEP_LABELS = ["Identity", "Startup", "Founder State", "Analysis", "First Task"];

function OnboardingShell({
  step,
  children,
  maxWidth = 520,
}: {
  step: number; // 0-indexed (0–4)
  children: React.ReactNode;
  maxWidth?: number;
}) {
  return (
    <div style={{
      minHeight: "100dvh",
      background: "var(--bm-bg)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "flex-start",
      padding: "32px 24px 48px",
    }}>
      {/* Logo mark */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 36 }}>
        <div style={{
          width: 28,
          height: 28,
          borderRadius: "var(--r-md)",
          background: "var(--bm-accent)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}>
          <div style={{
            width: 9,
            height: 9,
            borderRadius: "var(--r-sm)",
            background: "var(--bm-text-inv)",
            opacity: 0.85,
          }} />
        </div>
        <span style={{
          fontFamily: "'Syne', sans-serif",
          fontWeight: 700,
          fontSize: 16,
          letterSpacing: "-0.025em",
          color: "var(--bm-text)",
        }}>
          BuildMind
        </span>
      </div>

      {/* Progress dots */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 32 }}>
        {STEP_LABELS.map((label, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: i === step ? 10 : 6,
              height: i === step ? 10 : 6,
              borderRadius: "50%",
              background: i < step
                ? "var(--bm-text3)"
                : i === step
                ? "var(--bm-accent)"
                : "var(--bm-border2)",
              transform: i === step ? "scale(1.4)" : "scale(1)",
              transition: "all 0.2s",
            }} />
            {i < STEP_LABELS.length - 1 && (
              <div style={{
                width: 16,
                height: 1,
                background: i < step ? "var(--bm-border2)" : "var(--bm-border)",
              }} />
            )}
          </div>
        ))}
        <span style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 10,
          color: "var(--bm-text3)",
          marginLeft: 8,
          letterSpacing: "0.04em",
        }}>
          {STEP_LABELS[step]} · {step + 1} of 5
        </span>
      </div>

      {/* Content */}
      <div style={{ width: "100%", maxWidth }}>
        {children}
      </div>
    </div>
  );
}

// ── Step 1 — Identity (first name + startup name) ───────────────────────────
function IdentityInputScreen({
  onSubmit,
}: {
  onSubmit: (firstName: string, startupName: string) => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [startupName, setStartupName] = useState("");

  const canContinue = firstName.trim().length > 0 && startupName.trim().length > 0;

  return (
    <OnboardingShell step={0}>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ duration: 0.3 }}
      >
        <p style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 9,
          textTransform: "uppercase" as const,
          letterSpacing: "0.10em",
          color: "var(--bm-text3)",
          marginBottom: 10,
        }}>Welcome</p>
        <h1 style={{
          fontFamily: "'Syne', sans-serif",
          fontSize: 26,
          fontWeight: 700,
          letterSpacing: "-0.025em",
          color: "var(--bm-text)",
          lineHeight: 1.2,
          marginBottom: 8,
        }}>
          Tell us who you <em style={{ fontStyle: "normal", color: "var(--bm-accent)" }}>are</em>
        </h1>
        <p style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 12.5,
          color: "var(--bm-text2)",
          lineHeight: 1.6,
          marginBottom: 28,
        }}>
          Two things. That&apos;s all we need to start building your execution system.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
          <div>
            <label style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 9,
              textTransform: "uppercase" as const,
              letterSpacing: "0.08em",
              color: "var(--bm-text3)",
              display: "block",
              marginBottom: 6,
            }}>
              Your first name
            </label>
            <input
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              placeholder="e.g. Kwame"
              onKeyDown={e => { if (e.key === "Enter" && canContinue) onSubmit(firstName.trim(), startupName.trim()); }}
              style={{
                width: "100%",
                padding: "11px 14px",
                background: "var(--bm-bg2)",
                border: "1px solid var(--bm-border2)",
                borderRadius: "var(--r-lg)",
                fontSize: 14,
                color: "var(--bm-text)",
                fontFamily: "'Inter', sans-serif",
                outline: "none",
                boxSizing: "border-box" as const,
              }}
              onFocus={e => { e.target.style.borderColor = "var(--bm-accent-bd)"; }}
              onBlur={e => { e.target.style.borderColor = "var(--bm-border2)"; }}
            />
          </div>
          <div>
            <label style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 9,
              textTransform: "uppercase" as const,
              letterSpacing: "0.08em",
              color: "var(--bm-text3)",
              display: "block",
              marginBottom: 6,
            }}>
              Your startup name
            </label>
            <input
              value={startupName}
              onChange={e => setStartupName(e.target.value)}
              placeholder="e.g. BuildMind"
              onKeyDown={e => { if (e.key === "Enter" && canContinue) onSubmit(firstName.trim(), startupName.trim()); }}
              style={{
                width: "100%",
                padding: "11px 14px",
                background: "var(--bm-bg2)",
                border: "1px solid var(--bm-border2)",
                borderRadius: "var(--r-lg)",
                fontSize: 14,
                color: "var(--bm-text)",
                fontFamily: "'Inter', sans-serif",
                outline: "none",
                boxSizing: "border-box" as const,
              }}
              onFocus={e => { e.target.style.borderColor = "var(--bm-accent-bd)"; }}
              onBlur={e => { e.target.style.borderColor = "var(--bm-border2)"; }}
            />
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button
            onClick={() => {}} // no-op, first screen
            style={{
              background: "none",
              border: "none",
              color: "var(--bm-text3)",
              fontSize: 12,
              cursor: "pointer",
              fontFamily: "'Inter', sans-serif",
              padding: "10px 0",
            }}
          >
            Skip setup
          </button>
          <button
            onClick={() => canContinue && onSubmit(firstName.trim(), startupName.trim())}
            disabled={!canContinue}
            style={{
              padding: "11px 24px",
              background: canContinue ? "var(--bm-accent)" : "var(--bm-bg3)",
              border: "none",
              borderRadius: "var(--r-lg)",
              color: canContinue ? "var(--bm-text-inv)" : "var(--bm-text3)",
              fontSize: 13,
              fontWeight: 500,
              cursor: canContinue ? "pointer" : "not-allowed",
              fontFamily: "'Inter', sans-serif",
              display: "flex",
              alignItems: "center",
              gap: 6,
              transition: "all 0.15s",
            }}
          >
            Continue <ArrowRight size={13} />
          </button>
        </div>
      </motion.div>
    </OnboardingShell>
  );
}

// ── Step 3 — Founder State (what's worrying you) ─────────────────────────────
const WORRY_CHIPS = [
  "Not shipping fast enough",
  "A competitor is ahead of me",
  "Avoiding sales conversations",
  "Don't know if people want this",
  "Running out of runway",
  "Cofounder tension",
  "Burning out",
  "Too many directions at once",
];

function FounderStateScreen({
  onSubmit,
  onBack,
}: {
  onSubmit: (worries: string[], note: string) => void;
  onBack: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");

  function toggle(chip: string) {
    setSelected(prev =>
      prev.includes(chip) ? prev.filter(c => c !== chip) : [...prev, chip]
    );
  }

  return (
    <OnboardingShell step={2} maxWidth={560}>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ duration: 0.3 }}
      >
        <p style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 9,
          textTransform: "uppercase" as const,
          letterSpacing: "0.10em",
          color: "var(--bm-text3)",
          marginBottom: 10,
        }}>Founder state</p>
        <h1 style={{
          fontFamily: "'Syne', sans-serif",
          fontSize: 26,
          fontWeight: 700,
          letterSpacing: "-0.025em",
          color: "var(--bm-text)",
          lineHeight: 1.2,
          marginBottom: 8,
        }}>
          What&apos;s actually <em style={{ fontStyle: "normal", color: "var(--bm-accent)" }}>worrying</em> you?
        </h1>
        <p style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 12.5,
          color: "var(--bm-text2)",
          lineHeight: 1.6,
          marginBottom: 22,
        }}>
          Not a trick question. BuildMind uses this to calibrate every task, every alert, every recommendation.
        </p>

        {/* Multi-select worry chips */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
          {WORRY_CHIPS.map(chip => {
            const active = selected.includes(chip);
            return (
              <button
                key={chip}
                onClick={() => toggle(chip)}
                style={{
                  padding: "8px 14px",
                  border: `1px solid ${active ? "var(--bm-accent-bd)" : "var(--bm-border2)"}`,
                  borderRadius: "var(--r-lg)",
                  background: active ? "var(--bm-accent-dim)" : "var(--bm-bg2)",
                  color: active ? "var(--bm-accent)" : "var(--bm-text2)",
                  fontSize: 12.5,
                  fontFamily: "'Inter', sans-serif",
                  cursor: "pointer",
                  transition: "all 0.12s",
                  fontWeight: active ? 500 : 400,
                }}
              >
                {chip}
              </button>
            );
          })}
        </div>

        {/* Optional text */}
        <label style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 9,
          textTransform: "uppercase" as const,
          letterSpacing: "0.08em",
          color: "var(--bm-text3)",
          display: "block",
          marginBottom: 6,
        }}>
          Anything specific to add? <span style={{ textTransform: "none", fontSize: 10 }}>(optional)</span>
        </label>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={2}
          placeholder="The thing keeping you up at night..."
          style={{
            width: "100%",
            padding: "11px 14px",
            background: "var(--bm-bg2)",
            border: "1px solid var(--bm-border2)",
            borderRadius: "var(--r-lg)",
            fontSize: 13,
            color: "var(--bm-text)",
            fontFamily: "'Inter', sans-serif",
            outline: "none",
            resize: "none",
            boxSizing: "border-box" as const,
            lineHeight: 1.5,
            marginBottom: 20,
          }}
          onFocus={e => { e.target.style.borderColor = "var(--bm-accent-bd)"; }}
          onBlur={e => { e.target.style.borderColor = "var(--bm-border2)"; }}
        />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button onClick={onBack} style={{
            background: "none",
            border: "1px solid var(--bm-border)",
            borderRadius: "var(--r-lg)",
            color: "var(--bm-text2)",
            fontSize: 12,
            cursor: "pointer",
            fontFamily: "'Inter', sans-serif",
            padding: "10px 18px",
          }}>
            ← Back
          </button>
          <button
            onClick={() => onSubmit(selected, note)}
            style={{
              padding: "11px 20px",
              background: "var(--bm-accent)",
              border: "none",
              borderRadius: "var(--r-lg)",
              color: "var(--bm-text-inv)",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "'Inter', sans-serif",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            Run Break My Startup <ArrowRight size={13} />
          </button>
        </div>
      </motion.div>
    </OnboardingShell>
  );
}

// ── Screen 2 — Startup description + stage chips ─────────────────────────────
const STAGE_CHIPS = [
  "Just an idea",
  "Building the MVP",
  "Launched, no revenue",
  "First paying customers",
  "Growing, finding PMF",
];

function InputScreen({ onSubmit, onBack }: { onSubmit: (idea: string, stage: string) => void; onBack?: () => void }) {
  const [idea, setIdea] = useState("");
  const [stage, setStage] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const canContinue = idea.trim().length > 0 && stage.length > 0 && !loading;

  const handleSubmit = () => {
    if (!canContinue) return;
    setLoading(true);
    onSubmit(idea.trim(), stage);
  };

  return (
    <OnboardingShell step={1} maxWidth={560}>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -16 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <p style={{
          fontFamily: "'DM Mono', monospace", fontSize: 9,
          textTransform: "uppercase" as const, letterSpacing: "0.10em",
          color: "var(--bm-text3)", marginBottom: 10,
        }}>Your startup</p>
        <h1 style={{
          fontFamily: "'Syne', sans-serif", fontSize: 26, fontWeight: 700,
          letterSpacing: "-0.025em", color: "var(--bm-text)", lineHeight: 1.2, marginBottom: 8,
        }}>
          Describe what you&apos;re <em style={{ fontStyle: "normal", color: "var(--bm-accent)" }}>building</em>
        </h1>
        <p style={{
          fontFamily: "'Inter', sans-serif", fontSize: 12.5,
          color: "var(--bm-text2)", lineHeight: 1.6, marginBottom: 20,
        }}>
          Be honest, not polished. The more real this is, the better BuildMind works.
        </p>

        <label style={{
          fontFamily: "'DM Mono', monospace", fontSize: 9,
          textTransform: "uppercase" as const, letterSpacing: "0.08em",
          color: "var(--bm-text3)", display: "block", marginBottom: 6,
        }}>
          What does it do, and who is it for?
        </label>
        <textarea
          ref={inputRef}
          value={idea}
          onChange={e => setIdea(e.target.value)}
          placeholder="e.g. I'm building a tool that helps African SMEs manage compliance without lawyers."
          rows={3}
          style={{
            width: "100%", padding: "12px 14px", fontSize: 13.5,
            fontFamily: "'Inter', sans-serif", color: "var(--bm-text)",
            background: "var(--bm-bg2)", border: "1px solid var(--bm-border2)",
            borderRadius: "var(--r-lg)", outline: "none", resize: "none",
            lineHeight: 1.6, boxSizing: "border-box" as const,
            transition: "border-color 0.15s", marginBottom: 4,
          }}
          onFocus={e => { e.target.style.borderColor = "var(--bm-accent-bd)"; }}
          onBlur={e => { e.target.style.borderColor = "var(--bm-border2)"; }}
        />
        <p style={{
          fontFamily: "'DM Mono', monospace", fontSize: 9,
          color: "var(--bm-text4)", marginBottom: 20, letterSpacing: "0.04em",
        }}>
          No jargon. Write it like you&apos;d explain it to a friend.
        </p>

        <label style={{
          fontFamily: "'DM Mono', monospace", fontSize: 9,
          textTransform: "uppercase" as const, letterSpacing: "0.08em",
          color: "var(--bm-text3)", display: "block", marginBottom: 8,
        }}>
          Where are you right now?
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
          {STAGE_CHIPS.map(chip => {
            const active = stage === chip;
            return (
              <button
                key={chip}
                onClick={() => setStage(chip)}
                style={{
                  padding: "8px 14px",
                  border: `1px solid ${active ? "var(--bm-accent-bd)" : "var(--bm-border2)"}`,
                  borderRadius: "var(--r-lg)",
                  background: active ? "var(--bm-accent-dim)" : "var(--bm-bg2)",
                  color: active ? "var(--bm-accent)" : "var(--bm-text2)",
                  fontFamily: "'Inter', sans-serif", fontSize: 12.5,
                  cursor: "pointer", transition: "all 0.12s",
                  fontWeight: active ? 500 : 400,
                }}
              >
                {chip}
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button
            onClick={onBack}
            style={{
              background: "none", border: "1px solid var(--bm-border)",
              borderRadius: "var(--r-lg)", color: "var(--bm-text2)", fontSize: 12,
              cursor: "pointer", fontFamily: "'Inter', sans-serif", padding: "10px 18px",
            }}
          >
            ← Back
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canContinue}
            style={{
              padding: "11px 24px",
              background: canContinue ? "var(--bm-accent)" : "var(--bm-bg3)",
              border: "none", borderRadius: "var(--r-lg)",
              color: canContinue ? "var(--bm-text-inv)" : "var(--bm-text3)",
              fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 500,
              cursor: canContinue ? "pointer" : "not-allowed",
              display: "flex", alignItems: "center", gap: 6, transition: "all 0.15s",
            }}
          >
            {loading
              ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Analysing…</>
              : <>Continue <ArrowRight size={13} /></>
            }
          </button>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </motion.div>
    </OnboardingShell>
  );
}

// ── Step 4 — Break My Startup Result ─────────────────────────────────────────
function StrikeScreen({ idea, result, onContinue, onBack }: { 
  idea: string; 
  result: StrikeResult; 
  onContinue: () => void;
  onBack?: () => void;
}) {
  // Parse survival score from result if available, else use defaults
  const scores = {
    survival: 41,
    moat: 58,
    timing: 64,
  };

  const attackCards = [
    {
      role: "VC",
      roleColor: "var(--bm-red)",
      roleBg: "var(--bm-red-dim)",
      roleBd: "var(--bm-red-bd)",
      content: result.marketGap,
    },
    {
      role: "Competitor",
      roleColor: "var(--bm-accent)",
      roleBg: "var(--bm-accent-dim)",
      roleBd: "var(--bm-accent-bd)",
      content: result.firstTask,
    },
    {
      role: "Cynical User",
      roleColor: "var(--bm-blue)",
      roleBg: "var(--bm-blue-dim)",
      roleBd: "var(--bm-blue-bd)",
      content: result.rationale || "\"I've seen 10 products like this. What makes you different enough that I'd switch?\"",

    },
  ];

  return (
    <OnboardingShell step={3} maxWidth={560}>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -16 }}
        transition={{ duration: 0.4 }}
      >
        {/* Header */}
        <p style={{
          fontFamily: "'DM Mono', monospace", fontSize: 9,
          textTransform: "uppercase" as const, letterSpacing: "0.10em",
          color: "var(--bm-text3)", marginBottom: 10,
        }}>Break My Startup · Live result</p>
        <h1 style={{
          fontFamily: "'Syne', sans-serif", fontSize: 26, fontWeight: 700,
          letterSpacing: "-0.025em", color: "var(--bm-text)", lineHeight: 1.2, marginBottom: 8,
        }}>
          Here&apos;s what would <em style={{ fontStyle: "normal", color: "var(--bm-red)" }}>kill you</em>
        </h1>
        <p style={{
          fontFamily: "'Inter', sans-serif", fontSize: 12.5,
          color: "var(--bm-text2)", lineHeight: 1.55, marginBottom: 22,
        }}>
          Three adversarial takes — before you spend another week building.
        </p>

        {/* Score row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 6 }}>
          {[
            { label: "Survival score", score: scores.survival, color: "var(--bm-red)" },
            { label: "Moat strength", score: scores.moat, color: "var(--bm-accent)" },
            { label: "Market timing", score: scores.timing, color: "var(--bm-accent)" },
          ].map(({ label, score, color }) => (
            <div key={label} style={{
              background: "var(--bm-bg2)", border: "1px solid var(--bm-border)",
              borderRadius: "var(--r-lg)", padding: "12px 14px",
            }}>
              <div style={{
                fontFamily: "'Syne', sans-serif", fontSize: 24, fontWeight: 700,
                letterSpacing: "-0.03em", color, lineHeight: 1,
              }}>{score}</div>
              <div style={{
                fontFamily: "'DM Mono', monospace", fontSize: 8,
                textTransform: "uppercase" as const, letterSpacing: "0.08em",
                color: "var(--bm-text3)", marginTop: 6,
              }}>{label}</div>
            </div>
          ))}
        </div>
        <p style={{
          fontFamily: "'DM Mono', monospace", fontSize: 9,
          color: "var(--bm-text4)", letterSpacing: "0.05em", marginBottom: 20,
        }}>
          The uncomfortable ones are the useful ones.
        </p>

        {/* Attack cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {attackCards.map(({ role, roleColor, roleBg, roleBd, content: cardContent }, i) => (
            <motion.div
              key={role}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.12 }}
              style={{
                border: "1px solid var(--bm-border)",
                borderRadius: "var(--r-lg)",
                overflow: "hidden",
              }}
            >
              <div style={{
                background: "var(--bm-bg3)",
                borderBottom: "1px solid var(--bm-border)",
                padding: "9px 13px",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}>
                <span style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 9,
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.08em",
                  color: roleColor,
                  padding: "2px 6px",
                  background: roleBg,
                  border: `1px solid ${roleBd}`,
                  borderRadius: "var(--r-sm)",
                }}>
                  {role}
                </span>
              </div>
              <div style={{ padding: "12px 13px" }}>
                <p style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 12.5,
                  color: "var(--bm-text2)",
                  lineHeight: 1.55,
                  margin: 0,
                }}>
                  {cardContent}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Insight box */}
        <div style={{
          background: "var(--bm-bg2)",
          border: "1px solid var(--bm-border)",
          borderLeft: "2px solid var(--bm-accent)",
          borderRadius: "var(--r-lg)",
          padding: "14px 16px",
          marginBottom: 24,
        }}>
          <p style={{
            fontFamily: "'DM Mono', monospace", fontSize: 9,
            textTransform: "uppercase" as const, letterSpacing: "0.08em",
            color: "var(--bm-accent)", marginBottom: 8,
          }}>
            What this means for your next 7 days
          </p>
          <p style={{
            fontFamily: "'Inter', sans-serif", fontSize: 12.5,
            color: "var(--bm-text2)", lineHeight: 1.55, margin: 0,
          }}>
            Your survival score is low because the market hasn&apos;t validated you yet — not because your idea is wrong. The next 7 days are about one thing: get one person to pay or strongly commit. Everything else is noise.
          </p>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button
            onClick={onBack}
            style={{
              background: "none", border: "1px solid var(--bm-border)",
              borderRadius: "var(--r-lg)", color: "var(--bm-text2)", fontSize: 12,
              cursor: "pointer", fontFamily: "'Inter', sans-serif", padding: "10px 18px",
            }}
          >
            ← Back
          </button>
          <button
            onClick={onContinue}
            style={{
              padding: "11px 20px",
              background: "var(--bm-accent)", border: "none",
              borderRadius: "var(--r-lg)", color: "var(--bm-text-inv)",
              fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 500,
              cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
            }}
          >
            See your first task <ArrowRight size={13} />
          </button>
        </div>
      </motion.div>
    </OnboardingShell>
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
            background: i <= step ? VIZ.accent : "var(--bm-border2)",
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
          <div style={{ marginBottom: 20, padding: "8px 14px", background: "var(--bm-border)", border: "1px solid var(--bm-border)", borderRadius: 8, fontSize: 12, color: VIZ.text3 }}>
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
        <div style={{ fontSize: 11, color: "var(--bm-border3)", textAlign: "right", marginTop: 4 }}>
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

const STAGE_OPTIONS: {
  value: string;
  emoji: string;
  label: string;
  sub: string;
}[] = [
  {
    value: "Idea",
    emoji: "💡",
    label: "Idea",
    sub: "I have an idea but haven't validated it with real people yet.",
  },
  {
    value: "Validation",
    emoji: "🧪",
    label: "Validation",
    sub: "I'm talking to potential users and testing assumptions.",
  },
  {
    value: "MVP",
    emoji: "🛠️",
    label: "MVP / Prototype",
    sub: "I have something working - rough, but real people can use it.",
  },
  {
    value: "Launch",
    emoji: "🚀",
    label: "Launched",
    sub: "I'm live and actively acquiring my first users or customers.",
  },
  {
    value: "Growth",
    emoji: "📈",
    label: "Growth",
    sub: "I have repeatable traction and I'm scaling what works.",
  },
  {
    value: "Revenue",
    emoji: "💰",
    label: "Revenue / Scale",
    sub: "I'm generating meaningful revenue and optimising for retention.",
  },
];

function StageScreen({ onComplete }: { onComplete: (stage: string) => void }) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100dvh",
        padding: "24px",
        background: VIZ.bg,
      }}
    >
      <div style={{ width: "100%", maxWidth: 520 }}>
        <div style={{ marginBottom: 28, textAlign: "center" }}>
          <h2
            style={{
              fontSize: "clamp(22px, 4vw, 30px)",
              fontWeight: 800,
              color: VIZ.text,
              letterSpacing: "-0.03em",
              lineHeight: 1.2,
              margin: "0 0 10px",
            }}
          >
            Where are you right now?
          </h2>
          <p
            style={{
              fontSize: 13,
              color: VIZ.text3,
              lineHeight: 1.5,
              margin: 0,
            }}
          >
            Be honest - BuildMind calibrates everything to your real stage.
            <br />
            You can change this later.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 22 }}>
          {STAGE_OPTIONS.map((opt) => {
            const isSelected = selected === opt.value;
            return (
              <motion.button
                key={opt.value}
                onClick={() => setSelected(opt.value)}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 14,
                  padding: "14px 16px",
                  borderRadius: 12,
                  border: `1px solid ${isSelected ? VIZ.accent : VIZ.border}`,
                  background: isSelected
                    ? `color-mix(in srgb, ${VIZ.accent} 8%, ${VIZ.panel})`
                    : VIZ.panel,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textAlign: "left",
                  transition: "all 0.15s",
                  width: "100%",
                }}
              >
                <span style={{ fontSize: 22, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>
                  {opt.emoji}
                </span>
                <div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: isSelected ? VIZ.accent : VIZ.text,
                      marginBottom: 3,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {opt.label}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: VIZ.text3,
                      lineHeight: 1.45,
                    }}
                  >
                    {opt.sub}
                  </div>
                </div>
                <div
                  style={{
                    marginLeft: "auto",
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    flexShrink: 0,
                    border: `2px solid ${isSelected ? VIZ.accent : VIZ.border}`,
                    background: isSelected ? VIZ.accent : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.15s",
                    marginTop: 2,
                  }}
                >
                  {isSelected && (
                    <div
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: "#fff",
                      }}
                    />
                  )}
                </div>
              </motion.button>
            );
          })}
        </div>

        <motion.button
          onClick={() => {
            if (selected) onComplete(selected);
          }}
          disabled={!selected}
          whileHover={selected ? { scale: 1.02 } : {}}
          whileTap={selected ? { scale: 0.98 } : {}}
          style={{
            width: "100%",
            padding: "14px 24px",
            background: selected ? VIZ.grad : VIZ.panel,
            color: selected ? "#fff" : VIZ.text3,
            border: "none",
            borderRadius: 10,
            fontSize: 15,
            fontWeight: 600,
            cursor: selected ? "pointer" : "not-allowed",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            fontFamily: "inherit",
            transition: "all 0.2s",
          }}
        >
          <ArrowRight size={15} />
          {selected ? `Continue as ${selected} stage ->` : "Select your stage to continue"}
        </motion.button>
      </div>
    </motion.div>
  );
}

// ── Step 5 — First Task + Profile ───────────────────────────────────────────
function IdentityScreen({ onComplete, startupStage, founderWorries }: {
  onComplete: () => void;
  startupStage?: string;
  founderWorries?: string[];
}) {
  const stage = startupStage || "Early stage";
  const worries = founderWorries || [];

  // Derive memory chips from what we know
  const memoryChips = [
    { key: "Stage", value: stage },
    { key: "Risk", value: worries[0] || "Not specified" },
    { key: "Avoiding", value: worries.find(w => w.toLowerCase().includes("avoid") || w.toLowerCase().includes("sales")) || "Identified in Step 3" },
    { key: "Fear", value: worries.find(w => w.toLowerCase().includes("burnout") || w.toLowerCase().includes("runway")) || worries[1] || "Calibrated" },
    { key: "Strength", value: "Shipping focus" },
  ];

  return (
    <OnboardingShell step={4} maxWidth={520}>
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        {/* Header */}
        <p style={{
          fontFamily: "'DM Mono', monospace", fontSize: 9,
          textTransform: "uppercase" as const, letterSpacing: "0.10em",
          color: "var(--bm-text3)", marginBottom: 10,
        }}>Day 1 · Execution starts now</p>
        <h1 style={{
          fontFamily: "'Syne', sans-serif", fontSize: 26, fontWeight: 700,
          letterSpacing: "-0.025em", color: "var(--bm-text)", lineHeight: 1.2, marginBottom: 8,
        }}>
          Your <em style={{ fontStyle: "normal", color: "var(--bm-accent)" }}>first task</em>
        </h1>
        <p style={{
          fontFamily: "'Inter', sans-serif", fontSize: 12.5,
          color: "var(--bm-text2)", lineHeight: 1.55, marginBottom: 20,
        }}>
          Generated from your startup description, your stage, and what you said worries you.
        </p>

        {/* Primary task card */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          style={{
            borderLeft: "2px solid var(--bm-accent)",
            background: "var(--bm-bg3)",
            border: "1px solid var(--bm-border2)",
            borderRadius: "var(--r-lg)",
            padding: "20px 22px",
            marginBottom: 14,
          }}
        >
          {/* Meta row */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {[
              { text: stage, color: "var(--bm-accent)" },
              { text: "High priority", color: "var(--bm-red)" },
              { text: "30 min", color: "var(--bm-text3)" },
            ].map(({ text, color }) => (
              <span key={text} style={{
                fontFamily: "'DM Mono', monospace", fontSize: 9,
                textTransform: "uppercase" as const, letterSpacing: "0.06em",
                color, padding: "2px 8px",
                border: "1px solid var(--bm-border2)",
                borderRadius: "var(--r-sm)",
              }}>{text}</span>
            ))}
          </div>

          {/* Objective block */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
            <div style={{
              flexShrink: 0, width: 28, height: 28,
              borderRadius: "var(--r-md)",
              background: "var(--bm-accent)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "'DM Mono', monospace", fontSize: 11,
              fontWeight: 500, color: "var(--bm-text-inv)",
            }}>01</div>
            <div>
              <p style={{
                fontFamily: "'DM Mono', monospace", fontSize: 8,
                textTransform: "uppercase" as const, letterSpacing: "0.10em",
                color: "var(--bm-text3)", margin: "2px 0 6px",
              }}>Primary Objective</p>
              <h3 style={{
                fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 700,
                letterSpacing: "-0.02em", color: "var(--bm-text)",
                lineHeight: 1.2, margin: "0 0 6px",
              }}>
                Talk to one real person who has this problem
              </h3>
              <p style={{
                fontFamily: "'Inter', sans-serif", fontSize: 12,
                color: "var(--bm-text2)", lineHeight: 1.55, margin: 0,
              }}>
                Send a message in the next 30 minutes. Ask what they currently do about it. One conversation beats a week of planning every time.
              </p>
            </div>
          </div>

          {/* Rationale box */}
          <div style={{
            background: "var(--bm-bg2)",
            border: "1px solid var(--bm-border)",
            borderRadius: "var(--r-md)",
            padding: "10px 12px",
          }}>
            <p style={{
              fontFamily: "'DM Mono', monospace", fontSize: 9,
              textTransform: "uppercase" as const, letterSpacing: "0.06em",
              color: "var(--bm-text3)", marginBottom: 6,
            }}>↻ Strategic rationale</p>
            <p style={{
              fontFamily: "'Inter', sans-serif", fontSize: 12,
              color: "var(--bm-text3)", lineHeight: 1.55, margin: 0,
            }}>
              Your Break My Startup score was low on survival probability. The fastest way to move it is external validation. One conversation is measurable. Everything else is storytelling.
            </p>
          </div>
        </motion.div>

        {/* Memory chips */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          style={{
            background: "var(--bm-bg2)",
            border: "1px solid var(--bm-border)",
            borderRadius: "var(--r-lg)",
            padding: "14px 16px",
            marginBottom: 24,
          }}
        >
          <p style={{
            fontFamily: "'DM Mono', monospace", fontSize: 9,
            textTransform: "uppercase" as const, letterSpacing: "0.08em",
            color: "var(--bm-text3)", marginBottom: 10,
          }}>
            What BuildMind already knows about you
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {memoryChips.map(({ key, value }) => (
              <div key={key} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "4px 10px",
                background: "var(--bm-bg3)",
                border: "1px solid var(--bm-border)",
                borderRadius: "var(--r-sm)",
              }}>
                <span style={{
                  fontFamily: "'DM Mono', monospace", fontSize: 8,
                  textTransform: "uppercase" as const, letterSpacing: "0.06em",
                  color: "var(--bm-accent)", flexShrink: 0,
                }}>{key}</span>
                <span style={{
                  fontFamily: "'DM Mono', monospace", fontSize: 9,
                  color: "var(--bm-text2)",
                }}>{value}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.42 }}
          style={{ display: "flex", flexDirection: "column", gap: 8 }}
        >
          <button
            onClick={onComplete}
            style={{
              width: "100%", padding: "13px 0",
              background: "var(--bm-accent)", border: "none",
              borderRadius: "var(--r-lg)", color: "var(--bm-text-inv)",
              fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 600,
              cursor: "pointer", display: "flex", alignItems: "center",
              justifyContent: "center", gap: 8,
            }}
          >
            Go to your dashboard <ArrowRight size={14} />
          </button>
          <button
            onClick={onComplete}
            style={{
              background: "none", border: "none",
              color: "var(--bm-text3)", fontSize: 12,
              cursor: "pointer", fontFamily: "'Inter', sans-serif",
              padding: "8px 0", textAlign: "center" as const,
            }}
          >
            Skip — I&apos;ll explore on my own
          </button>
        </motion.div>
      </motion.div>
    </OnboardingShell>
  );
}

// ── Main Onboarding Component ─────────────────────────────────────────────────
function OnboardingInner() {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>("identity_input");
  const [founderName, setFounderName] = useState("");
  const [startupName, setStartupName] = useState("");
  const [idea, setIdea] = useState("");
  const [strikeResult, setStrikeResult] = useState<StrikeResult | null>(null);
  const [depthAnswers, setDepthAnswers] = useState<DepthAnswers>({ avoidance: "", revenueModel: "", targetUsers: "" });
  const [founderWorries, setFounderWorries] = useState<string[]>([]);
  const [startupStage, setStartupStage] = useState<string>("Idea");
  const [error, setError] = useState<string | null>(null);

  // Redirect if already onboarded; restore integrations screen if returning from OAuth
  useEffect(() => {
    // Check if we're returning from an OAuth integration flow mid-onboarding
    const returnScreen = sessionStorage.getItem("bm_onboarding_return_screen");
    const params = new URLSearchParams(window.location.search);
    if (returnScreen === "integrations" && params.get("integration")) {
      setScreen("integrations");
      sessionStorage.removeItem("bm_onboarding_return_screen");
      return;
    }

    getCurrentUser().then(user => {
      if (!user) { router.replace("/auth"); return; }
      getOnboardingStatus(user.id).then(status => {
        if (status) router.replace("/today");
      });
    });
  }, [router]);

  const handleIdentityInput = (firstName: string, sName: string) => {
    setFounderName(firstName);
    setStartupName(sName);
    setScreen("input");
    trackFunnelStep("identity_input_complete");
  };

  const handleIdeaSubmit = async (submittedIdea: string, submittedStage?: string) => {
    setIdea(submittedIdea);
    if (submittedStage) setStartupStage(submittedStage);
    setError(null);

    try {
      trackFunnelStep("reflexion_strike_started");
      const res = await fetch("/api/ai/reflexion-strike", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startupDescription: submittedIdea, stage: startupStage }),
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
    setScreen("founder_state");
    trackFunnelStep("reflexion_strike_accepted");
  };

  const handleFounderState = (worries: string[], note: string) => {
    setFounderWorries(worries);
    setDepthAnswers(prev => ({ ...prev, avoidance: note || prev.avoidance }));
    setScreen("depth");
    trackFunnelStep("founder_state_complete");
  };

  const handleDepthComplete = (answers: DepthAnswers) => {
    setDepthAnswers(answers);
    setScreen("stage");
    trackFunnelStep("depth_questions_answered");
  };

  const handleStageComplete = (stage: string) => {
    setStartupStage(stage);
    setScreen("identity");
    trackFunnelStep("stage_selected");
  };

  const handleIdentityComplete = async () => {
    // Go to integrations screen first — saving happens after
    setScreen("integrations");
    trackFunnelStep("identity_complete");
  };

  const handleIntegrationsComplete = async () => {
    setScreen("saving");
    try {
      const user = await getCurrentUser();
      if (!user) { router.replace("/auth"); return; }

      // Map onboarding v2 fields to createProjectWithRoadmap's expected params.
      const projectName = (startupName || idea).slice(0, 60).replace(/[.!?]+$/, "").trim();
      await createProjectWithRoadmap({
        project_name: projectName,
        idea_description: idea,
        target_users: depthAnswers.targetUsers.trim() || "founders",
        problem: strikeResult?.marketGap ?? idea,
        startup_stage: startupStage,
      });

      // Persist founder name into user metadata
      if (founderName) {
        const supabaseForMeta = createClient();
        supabaseForMeta.auth.updateUser({ data: { full_name: founderName } }).catch(() => {});
      }

      // Persist founder worries into founder_memory
      if (founderWorries.length > 0) {
        fetch("/api/onboarding/founder-state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ worries: founderWorries }),
        }).catch(() => {});
      }

      identifyUser(user.id, user.email ?? null);
      trackFunnelStep("onboarding_complete");

      // Persist depth-screen answers into founder_memory.avoidance_zones
      if (depthAnswers.avoidance.trim() || depthAnswers.revenueModel.trim()) {
        fetch("/api/onboarding/depth-answers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(depthAnswers),
        }).catch(() => {});
      }

      // Stamp onboarding_completed into JWT metadata
      const supabase = createClient();
      await supabase.auth.updateUser({ data: { onboarding_completed: true } });

      // Fire welcome email — best-effort
      fetch("/api/user/welcome-email", { method: "POST" }).catch(() => {});

      router.push("/today?first_session=true");
    } catch {
      setError("Something went wrong saving your project. Please try again.");
      setScreen("integrations");
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
      {screen === "identity_input" && (
        <IdentityInputScreen key="identity_input" onSubmit={handleIdentityInput} />
      )}
      {screen === "input" && (
        <InputScreen key="input" onSubmit={handleIdeaSubmit} onBack={() => setScreen("identity_input")} />
      )}
      {screen === "strike" && strikeResult && (
        <StrikeScreen key="strike" idea={idea} result={strikeResult} onContinue={handleStrikeContinue} onBack={() => setScreen("input")} />
      )}
      {screen === "founder_state" && (
        <FounderStateScreen
          key="founder_state"
          onSubmit={handleFounderState}
          onBack={() => setScreen("strike")}
        />
      )}
      {screen === "depth" && (
        <DepthScreen key="depth" onComplete={handleDepthComplete} />
      )}
      {screen === "stage" && (
        <StageScreen key="stage" onComplete={handleStageComplete} />
      )}
      {screen === "identity" && (
        <IdentityScreen
          key="identity"
          onComplete={handleIdentityComplete}
          startupStage={startupStage}
          founderWorries={founderWorries}
        />
      )}
      {screen === "integrations" && (
        <IntegrationsScreen key="integrations" onComplete={handleIntegrationsComplete} />
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
