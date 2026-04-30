"use client";

/**
 * app/ventures/page.tsx — v5
 *
 * Two tabs:
 *   1. Blueprint — calls /api/ventures/generate (the Anthropic 8-layer engine)
 *      Free: Layer 1 preview only (blurred layers 2-8 + upgrade prompt)
 *      Builder/Venture: all 8 layers + code scaffold
 *   2. Roadmap Tracks — the existing 90-day canvas (unchanged)
 */

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Suspense } from "react";
import { usePlan } from "@/lib/usePlan";
import { updateAchievementStats, checkAndUnlockAchievements } from "@/lib/achievements";
import { createClient } from "@/lib/supabase/client";
import BuildMindLoader from "@/components/BuildMindLoader";
import { PLAN_PRICE_LABEL } from "@/lib/pricing";

// ─── Type imports from ventures engine ───────────────────────────────────────
import type { StartupBlueprint } from "@/lib/ventures/index";

// ── Roadmap track types ───────────────────────────────────────────────────────
interface UserMilestone { id: string; week: string; task: string; detail: string; done: boolean; }
interface UserPhase { id: string; label: string; weeks: string; goal: string; milestones: UserMilestone[]; }
interface UserTrack { id: string; name: string; description: string; industry: string; stage: string; color: string; createdAt: number; phases: UserPhase[]; }

const INDUSTRY_COLORS: Record<string, string> = {
  SaaS: "#6366f1", Marketplace: "#10b981", Mobile: "#f59e0b", Service: "#8b5cf6", Hardware: "#ef4444", Custom: "#3b82f6",
};
const INDUSTRIES = ["SaaS", "Marketplace", "Mobile", "Service", "Custom"];

const TEMPLATES: Record<string, { phases: Omit<UserPhase, "id">[] }> = {
  SaaS: { phases: [
    { label: "Validate", weeks: "Week 1–3", goal: "Confirm real demand before building", milestones: [
      { id: "s1", week: "Week 1", task: "Interview 10 target users — problems only, no pitching", detail: "Use the Mom Test. Ask about current behavior, not your solution.", done: false },
      { id: "s2", week: "Week 2", task: "Identify the #1 pain that repeats across 7+ interviews", detail: "Pattern recognition. One specific, acute pain beats a list.", done: false },
      { id: "s3", week: "Week 3", task: "Build a 5-slide deck and get 3 LOIs or pre-orders", detail: "Letters of intent prove intent. Money or signature only.", done: false },
    ]},
    { label: "Build", weeks: "Week 4–8", goal: "Ship the smallest thing that delivers the core value", milestones: [
      { id: "s4", week: "Week 4", task: "Define the one feature that solves the pain — nothing else", detail: "Write a one-sentence product spec. No scope creep.", done: false },
      { id: "s5", week: "Week 6", task: "Ship a working demo to your 3 LOI contacts", detail: "Not polished. Working. Get reactions, not compliments.", done: false },
      { id: "s6", week: "Week 8", task: "First paying customer — even $1 counts", detail: "Payment signals real intent. Charge before it's ready.", done: false },
    ]},
    { label: "Grow", weeks: "Week 9–12", goal: "Repeat what got customer #1 five more times", milestones: [
      { id: "s7", week: "Week 9", task: "Document exactly what converted customer #1", detail: "Reverse-engineer your own sale. What was the trigger?", done: false },
      { id: "s8", week: "Week 11", task: "3 more paying customers using the same playbook", detail: "Repeat, not reinvent. Same channel, same pitch, same demo.", done: false },
      { id: "s9", week: "Week 12", task: "Calculate CAC and decide on 1 primary growth channel", detail: "Pick one. Master it before adding more.", done: false },
    ]},
  ]},
  Marketplace: { phases: [
    { label: "Supply first", weeks: "Week 1–4", goal: "Recruit 10 supply-side participants before any demand", milestones: [
      { id: "m1", week: "Week 1", task: "Identify and contact 20 potential supply-side participants", detail: "Email personally. No blast campaigns. Explain value clearly.", done: false },
      { id: "m2", week: "Week 3", task: "Onboard 10 supply-side manually — no automation yet", detail: "Do it by hand. Learn every friction point.", done: false },
      { id: "m3", week: "Week 4", task: "Lock in listing quality standard with 3 examples", detail: "What does a great listing look like? Document it now.", done: false },
    ]},
    { label: "First transactions", weeks: "Week 5–9", goal: "Complete 5 real transactions manually", milestones: [
      { id: "m4", week: "Week 5", task: "Recruit first 20 demand-side users from personal network", detail: "Who do you know who needs this? Text them directly.", done: false },
      { id: "m5", week: "Week 7", task: "Facilitate 5 transactions — manually if needed", detail: "Don't automate. Watch every step of every transaction.", done: false },
      { id: "m6", week: "Week 9", task: "Calculate take rate and confirm unit economics work", detail: "What % makes this sustainable? Can you get there?", done: false },
    ]},
    { label: "Liquidity", weeks: "Week 10–12", goal: "Hit 3 transactions/week without your involvement", milestones: [
      { id: "m7", week: "Week 10", task: "Identify which supply-side participants drive most transactions", detail: "80/20 rule. Who are your power suppliers?", done: false },
      { id: "m8", week: "Week 12", task: "3 transactions/week happening without your involvement", detail: "This is the liquidity test. If it needs you, it's not a marketplace yet.", done: false },
    ]},
  ]},
  Mobile: { phases: [
    { label: "Core loop", weeks: "Week 1–4", goal: "One thing that users do every day", milestones: [
      { id: "mob1", week: "Week 1", task: "Define the 1 core action users will do daily", detail: "Streak, track, discover, connect — pick one.", done: false },
      { id: "mob2", week: "Week 3", task: "Prototype in Figma — 5 screens max", detail: "5 screens. Not 15. The core loop only.", done: false },
      { id: "mob3", week: "Week 4", task: "5 user tests of the prototype — record every reaction", detail: "Watch, don't explain. What breaks without you saying anything?", done: false },
    ]},
    { label: "Ship & retain", weeks: "Week 5–10", goal: "Day 7 retention > 25%", milestones: [
      { id: "mob4", week: "Week 6", task: "Ship TestFlight build to 20 beta users", detail: "Real device. Real users. Not simulators.", done: false },
      { id: "mob5", week: "Week 8", task: "Day 7 retention: measure and hit 25%+", detail: "If below 25%, fix before acquiring more users.", done: false },
      { id: "mob6", week: "Week 10", task: "Implement the 1 push notification that drives return", detail: "One notification that feels useful, not spammy.", done: false },
    ]},
    { label: "Growth", weeks: "Week 11–12", goal: "Organic referral loop working", milestones: [
      { id: "mob7", week: "Week 11", task: "Identify your most active 10% — interview them", detail: "What made them stay? What do they tell friends?", done: false },
      { id: "mob8", week: "Week 12", task: "One share mechanic that at least 10% of users trigger", detail: "Built-in sharing, not bolted on.", done: false },
    ]},
  ]},
  Service: { phases: [
    { label: "First client", weeks: "Week 1–3", goal: "Land paying client #1 from existing network", milestones: [
      { id: "sv1", week: "Week 1", task: "List 20 people who could hire you or refer you — message them all", detail: "Not a group blast. Personal messages. One per hour.", done: false },
      { id: "sv2", week: "Week 2", task: "Run 5 discovery calls — uncover the acute problem you can solve", detail: "Listen 80%, talk 20%. What are they avoiding?", done: false },
      { id: "sv3", week: "Week 3", task: "Close first paying client — even below your rate to get proof", detail: "Testimonial > margin at this stage.", done: false },
    ]},
    { label: "Systematize", weeks: "Week 4–8", goal: "Deliver so well that referrals happen naturally", milestones: [
      { id: "sv4", week: "Week 5", task: "Document your delivery process in a simple checklist", detail: "If you were hit by a bus, could someone else deliver this?", done: false },
      { id: "sv5", week: "Week 7", task: "Get a written testimonial from client #1", detail: "Ask specifically: what result did you get? How would you describe this to a colleague?", done: false },
      { id: "sv6", week: "Week 8", task: "Client #2 and #3 — ideally from referrals", detail: "Referrals = you delivered. Cold outreach = you're still proving yourself.", done: false },
    ]},
    { label: "Scale", weeks: "Week 9–12", goal: "2x revenue without 2x time", milestones: [
      { id: "sv7", week: "Week 10", task: "Raise your rate with new clients — test price elasticity", detail: "Charge 20-30% more. See who pushes back.", done: false },
      { id: "sv8", week: "Week 12", task: "Package your service into a defined scope — no more custom quoting", detail: "Package = faster sales, less scope creep, better margins.", done: false },
    ]},
  ]},
  Custom: { phases: [
    { label: "Phase 1", weeks: "Week 1–4", goal: "Define and validate your core assumption", milestones: [
      { id: "c1", week: "Week 1", task: "Write down your riskiest assumption in one sentence", detail: "The thing that, if wrong, makes everything else irrelevant.", done: false },
      { id: "c2", week: "Week 3", task: "Design the cheapest possible test of that assumption", detail: "Not code. Not a product. What's the fastest way to learn if it's true?", done: false },
      { id: "c3", week: "Week 4", task: "Run the test with at least 10 real people or data points", detail: "Real, not hypothetical. Behavior, not opinion.", done: false },
    ]},
    { label: "Phase 2", weeks: "Week 5–8", goal: "Build the minimum version", milestones: [
      { id: "c4", week: "Week 5", task: "Define what 'done' looks like for the minimum version", detail: "Write it down. If it takes more than 2 sentences, scope-creep is coming.", done: false },
      { id: "c5", week: "Week 8", task: "Ship the minimum version to 10 real users", detail: "Not family. Not friends who'll be nice. Real users.", done: false },
    ]},
    { label: "Phase 3", weeks: "Week 9–12", goal: "Iterate based on real feedback", milestones: [
      { id: "c6", week: "Week 10", task: "Identify the #1 thing breaking for most users", detail: "Not features. The thing that stops them from getting value.", done: false },
      { id: "c7", week: "Week 12", task: "Fix it and confirm the fix with 3 users", detail: "Ship → test → confirm. One loop.", done: false },
    ]},
  ]},
};

// ── Roadmap storage ───────────────────────────────────────────────────────────
const TRACKS_KEY = "bm_venture_tracks";
function loadTracks(): UserTrack[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(TRACKS_KEY) ?? "[]"); } catch { return []; }
}
function saveTracks(t: UserTrack[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(TRACKS_KEY, JSON.stringify(t));
}
function trackProgress(t: UserTrack) {
  const milestones = t.phases.flatMap(p => p.milestones);
  const done = milestones.filter(m => m.done).length;
  const total = milestones.length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

// ── Blueprint storage ─────────────────────────────────────────────────────────
const BLUEPRINTS_KEY = "bm_blueprints";
function loadBlueprints(): StartupBlueprint[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(BLUEPRINTS_KEY) ?? "[]"); } catch { return []; }
}
function saveBlueprint(bp: StartupBlueprint) {
  if (typeof window === "undefined") return;
  const existing = loadBlueprints();
  const updated = [bp, ...existing].slice(0, 20); // keep last 20
  localStorage.setItem(BLUEPRINTS_KEY, JSON.stringify(updated));
}

// ─── Design tokens ────────────────────────────────────────────────────────────
const VIZ = {
  bg: "rgba(10,10,16,0.98)",
  card: "rgba(18,18,28,0.95)",
  border: "rgba(255,255,255,0.07)",
  borderActive: "rgba(99,102,241,0.5)",
  text1: "#f0f0f5",
  text2: "#8888a0",
  text3: "#404055",
  indigo: "#6366f1",
  violet: "#8b5cf6",
  emerald: "#10b981",
  amber: "#f59e0b",
  rose: "#f87171",
};

// ─── Blueprint Generator UI ───────────────────────────────────────────────────

const LAYER_LABELS = [
  "Product Interpretation",
  "System Design",
  "MVP Construction",
  "Execution Plan",
  "Founder Fit",
  "Market Intelligence",
  "Risk Register",
  "CoFounder Handoff",
];

const GEN_STEPS = [
  "Parsing your idea…",
  "Identifying target user and value prop…",
  "Designing system architecture…",
  "Building execution plan…",
  "Running founder fit analysis…",
  "Scanning market intelligence…",
  "Assembling risk register…",
  "Finalising CoFounder handoff…",
];

function BlueprintLayerCard({ label, data, locked }: { label: string; data: unknown; locked: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        border: `1px solid ${locked ? VIZ.border : VIZ.borderActive}`,
        borderRadius: 12,
        overflow: "hidden",
        marginBottom: 10,
        background: VIZ.card,
        position: "relative",
      }}
    >
      {locked && (
        <div style={{
          position: "absolute", inset: 0, backdropFilter: "blur(6px)",
          background: "rgba(10,10,16,0.7)", zIndex: 2, display: "flex",
          flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
        }}>
          <span style={{ fontSize: 20 }}>🔒</span>
          <span style={{ fontSize: 12, color: VIZ.text2 }}>Builder or Venture plan</span>
        </div>
      )}
      <button
        onClick={() => !locked && setOpen(v => !v)}
        style={{
          width: "100%", background: "transparent", border: "none", cursor: locked ? "default" : "pointer",
          padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between",
          color: VIZ.text1, fontFamily: "inherit", textAlign: "left",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
        {!locked && <span style={{ fontSize: 12, color: VIZ.text2 }}>{open ? "▲" : "▼"}</span>}
      </button>
      <AnimatePresence>
        {open && !locked && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: "hidden" }}
          >
            <pre style={{
              margin: 0, padding: "0 16px 16px", fontSize: 11, color: VIZ.text2,
              whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.7,
            }}>
              {JSON.stringify(data, null, 2)}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function BlueprintResult({ bp, plan, onNew }: { bp: StartupBlueprint; plan: string; onNew: () => void }) {
  const isFull = plan !== "free";
  const layers: { label: string; key: keyof StartupBlueprint; locked: boolean }[] = [
    { label: LAYER_LABELS[0], key: "productInterpretation", locked: false },
    { label: LAYER_LABELS[1], key: "systemDesign", locked: !isFull },
    { label: LAYER_LABELS[2], key: "mvpConstruction", locked: !isFull },
    { label: LAYER_LABELS[3], key: "executionPlan", locked: !isFull },
    { label: LAYER_LABELS[4], key: "founderFit", locked: !isFull },
    { label: LAYER_LABELS[5], key: "marketIntelligence", locked: !isFull },
    { label: LAYER_LABELS[6], key: "riskRegister", locked: !isFull },
    { label: LAYER_LABELS[7], key: "cofounderHandoff", locked: !isFull },
  ];

  const pi = bp.productInterpretation;

  return (
    <div style={{ maxWidth: 680, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: VIZ.text1 }}>
            {pi?.appCategory?.toUpperCase() ?? "BLUEPRINT"}
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: VIZ.text2, maxWidth: 480, lineHeight: 1.5 }}>
            {pi?.intentSummary ?? pi?.problemStatement ?? "Blueprint generated."}
          </p>
        </div>
        <button onClick={onNew} style={{
          padding: "8px 14px", borderRadius: 8, border: `1px solid ${VIZ.border}`,
          background: "transparent", color: VIZ.text2, fontSize: 11, cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
        }}>
          New blueprint
        </button>
      </div>

      {/* Quick stats from Layer 1 */}
      {pi && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
          {[
            { label: "Category", val: pi.appCategory },
            { label: "Target", val: pi.targetUser?.slice(0, 40) },
            { label: "Features", val: `${pi.detectedFeatures?.length ?? 0} detected` },
          ].map(s => s.val && (
            <span key={s.label} style={{
              fontSize: 11, padding: "4px 10px", borderRadius: 20,
              background: `${VIZ.indigo}15`, border: `1px solid ${VIZ.indigo}30`, color: VIZ.text2,
            }}>
              {s.label}: <strong style={{ color: VIZ.text1 }}>{s.val}</strong>
            </span>
          ))}
        </div>
      )}

      {/* Layer cards */}
      {layers.map(l => (
        <BlueprintLayerCard
          key={l.key}
          label={l.label}
          data={bp[l.key]}
          locked={l.locked || !bp[l.key]}
        />
      ))}

      {!isFull && (
        <div style={{
          marginTop: 12, padding: "14px 18px", borderRadius: 12,
          border: `1px solid ${VIZ.indigo}40`, background: `${VIZ.indigo}08`,
          textAlign: "center",
        }}>
          <div style={{ fontSize: 13, color: VIZ.text1, fontWeight: 600, marginBottom: 4 }}>
            Unlock 7 more layers — system design, execution plan, market intel, risks + more
          </div>
          <div style={{ fontSize: 12, color: VIZ.text2, marginBottom: 12 }}>
            Builder plan ({PLAN_PRICE_LABEL.builder}) gives you all 8 layers and code scaffold.
          </div>
          <a href="/upgrade?feature=ventures" style={{
            display: "inline-block", padding: "9px 20px", borderRadius: 8, border: "none",
            background: `linear-gradient(135deg,${VIZ.indigo},${VIZ.violet})`,
            color: "#fff", fontSize: 12, fontWeight: 700, textDecoration: "none",
          }}>
            Upgrade to Builder →
          </a>
        </div>
      )}
    </div>
  );
}

function BlueprintGenerator({ plan }: { plan: string }) {
  const isFull = plan !== "free";
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [blueprint, setBlueprint] = useState<StartupBlueprint | null>(null);
  const [history, setHistory] = useState<StartupBlueprint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const stepTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setHistory(loadBlueprints());
  }, []);

  async function generate() {
    if (!input.trim() || loading) return;
    setLoading(true);
    setError(null);
    setStepIndex(0);

    // Animate through steps while waiting
    stepTimer.current = setInterval(() => {
      setStepIndex(i => Math.min(i + 1, GEN_STEPS.length - 1));
    }, 900);

    try {
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;
      if (!userId) throw new Error("Not authenticated. Please sign in.");

      const res = await fetch("/api/ventures/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          inputType: "text",
          textDescription: input.trim(),
          fullBlueprint: isFull,
          includeSystemDesign: isFull,
          includeExecutionPlan: isFull,
          includeCodeScaffold: false, // avoid cost for now; gate behind venture
          includeFounderFit: isFull,
          includeMarketIntel: isFull,
          includeRiskRegister: isFull,
          includeCofounderHandoff: isFull,
        }),
      });

      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Blueprint generation failed");

      const bp = body as StartupBlueprint;
      setBlueprint(bp);
      saveBlueprint(bp);
      setHistory(loadBlueprints());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      if (stepTimer.current) clearInterval(stepTimer.current);
      setLoading(false);
    }
  }

  if (blueprint) {
    return (
      <BlueprintResult
        bp={blueprint}
        plan={plan}
        onNew={() => { setBlueprint(null); setInput(""); }}
      />
    );
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 700, color: VIZ.text1 }}>
          Ventures Blueprint
        </h1>
        <p style={{ margin: "0 0 22px", fontSize: 13, color: VIZ.text2, lineHeight: 1.6 }}>
          Describe your startup idea. BuildMind will generate a complete executable blueprint
          across {isFull ? "8 intelligence layers" : "Layer 1 for free (7 more layers on Builder+)"}.
        </p>

        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && e.metaKey) void generate(); }}
          placeholder="e.g. A mobile app that helps Ghanaian market traders track daily inventory and credit advanced by suppliers, with SMS reminders when payments are due..."
          rows={5}
          style={{
            width: "100%", background: VIZ.card, border: `1px solid ${input ? VIZ.borderActive : VIZ.border}`,
            borderRadius: 12, padding: "12px 14px", fontSize: 13, color: VIZ.text1,
            outline: "none", fontFamily: "inherit", resize: "vertical", lineHeight: 1.6,
            transition: "border-color 0.15s", boxSizing: "border-box",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
          <span style={{ fontSize: 11, color: VIZ.text3 }}>
            {isFull ? "8-layer blueprint · powered by Claude" : "Layer 1 preview · upgrade for full blueprint"}
          </span>
          <motion.button
            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            onClick={generate}
            disabled={!input.trim() || loading}
            style={{
              padding: "10px 22px", borderRadius: 10, border: "none",
              background: input.trim() && !loading ? `linear-gradient(135deg,${VIZ.indigo},${VIZ.violet})` : "#1a1a2e",
              color: input.trim() && !loading ? "#fff" : VIZ.text3,
              fontSize: 13, fontWeight: 700, cursor: input.trim() && !loading ? "pointer" : "not-allowed",
              fontFamily: "inherit",
            }}
          >
            {loading ? GEN_STEPS[stepIndex] : "Generate blueprint →"}
          </motion.button>
        </div>

        {error && (
          <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 10, background: `${VIZ.rose}10`, border: `1px solid ${VIZ.rose}30`, fontSize: 12, color: VIZ.rose }}>
            {error}
          </div>
        )}

        {/* Past blueprints */}
        {history.length > 0 && (
          <div style={{ marginTop: 28 }}>
            <div style={{ fontSize: 11, color: VIZ.text3, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>
              Past blueprints
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {history.slice(0, 5).map(bp => (
                <button
                  key={bp.id}
                  onClick={() => setBlueprint(bp)}
                  style={{
                    background: VIZ.card, border: `1px solid ${VIZ.border}`, borderRadius: 10,
                    padding: "10px 14px", cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    transition: "border-color 0.15s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = VIZ.borderActive)}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = VIZ.border)}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: VIZ.text1 }}>
                      {bp.productInterpretation?.appCategory?.toUpperCase() ?? "Blueprint"}
                    </div>
                    <div style={{ fontSize: 11, color: VIZ.text2, marginTop: 2 }}>
                      {bp.productInterpretation?.problemStatement?.slice(0, 70) ?? bp.id}
                    </div>
                  </div>
                  <span style={{ fontSize: 10, color: VIZ.text3, flexShrink: 0, marginLeft: 12 }}>
                    {new Date(bp.createdAt).toLocaleDateString()}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

// ─── Roadmap Track Components (unchanged from v4) ─────────────────────────────

function MilestoneRow({ m, color, onToggle }: { m: UserMilestone; color: string; onToggle: () => void }) {
  return (
    <div
      onClick={onToggle}
      style={{
        display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 12px",
        background: m.done ? `${color}08` : "var(--bm-bg2)",
        border: `1px solid ${m.done ? color + "30" : "var(--bm-border)"}`,
        borderRadius: 10, marginBottom: 6, cursor: "pointer", transition: "all 0.15s",
      }}
    >
      <div style={{
        width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${m.done ? color : "#333"}`,
        background: m.done ? color : "transparent", flexShrink: 0, marginTop: 2,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {m.done && <span style={{ fontSize: 9, color: "#fff", fontWeight: 700 }}>✓</span>}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, color: m.done ? "#666" : "var(--bm-text)", textDecoration: m.done ? "line-through" : "none", lineHeight: 1.4 }}>{m.task}</div>
        <div style={{ fontSize: 11, color: "#555", marginTop: 3 }}>{m.week} · {m.detail}</div>
      </div>
    </div>
  );
}

function TrackDetail({ track, onBack, onUpdate }: { track: UserTrack; onBack: () => void; onUpdate: (t: UserTrack) => void }) {
  const [local, setLocal] = useState<UserTrack>(track);
  const { done, total, pct } = trackProgress(local);
  const toggleMilestone = (phaseId: string, msId: string) => {
    const updated = { ...local, phases: local.phases.map(p => p.id !== phaseId ? p : { ...p, milestones: p.milestones.map(m => m.id !== msId ? m : { ...m, done: !m.done }) }) };
    setLocal(updated); onUpdate(updated);
  };
  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{ background: "transparent", border: "1px solid #222", borderRadius: 8, padding: "6px 12px", color: "#666", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>← Back</button>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--bm-text)" }}>{local.name}</h1>
          <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{local.industry} · {done}/{total} milestones</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: local.color }}>{pct}%</div>
          <div style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em" }}>complete</div>
        </div>
      </div>
      <div style={{ height: 6, background: "#111", borderRadius: 3, marginBottom: 20, overflow: "hidden" }}>
        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, ease: "easeOut" }} style={{ height: "100%", background: local.color, borderRadius: 3 }} />
      </div>
      {local.phases.map(phase => (
        <div key={phase.id} style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{ width: 3, height: 32, background: local.color, borderRadius: 2, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--bm-text)" }}>{phase.label}</div>
              <div style={{ fontSize: 11, color: "#555" }}>{phase.weeks} · {phase.goal}</div>
            </div>
          </div>
          {phase.milestones.map(m => (
            <MilestoneRow key={m.id} m={m} color={local.color} onToggle={() => toggleMilestone(phase.id, m.id)} />
          ))}
        </div>
      ))}
    </div>
  );
}

function NewTrackWizard({ onSave, onCancel }: { onSave: (t: UserTrack) => void; onCancel: () => void }) {
  const [step, setStep] = useState<"industry" | "details">("industry");
  const [industry, setIndustry] = useState("");
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const create = () => {
    if (!name.trim()) return;
    const template = TEMPLATES[industry];
    const phases: UserPhase[] = template
      ? template.phases.map((p, pi) => ({ id: `p${pi}`, ...p, milestones: p.milestones.map(m => ({ ...m, id: `${pi}_${m.id}_${Date.now()}` })) }))
      : [{ id: "p0", label: "Phase 1", weeks: "Week 1–4", goal: "Define your first goal", milestones: [] }];
    onSave({ id: `t_${Date.now()}`, name: name.trim(), description: desc.trim(), industry, stage: "Idea", color: INDUSTRY_COLORS[industry] ?? "#6366f1", createdAt: Date.now(), phases });
  };
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ maxWidth: 480, margin: "0 auto", background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 16, padding: "24px 22px" }}>
      {step === "industry" ? (
        <>
          <h2 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 700, color: "var(--bm-text)" }}>Choose your track type</h2>
          <p style={{ margin: "0 0 18px", fontSize: 13, color: "#555" }}>We'll generate a 90-day roadmap with proven milestones.</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
            {INDUSTRIES.map(ind => (
              <button key={ind} onClick={() => { setIndustry(ind); setStep("details"); }}
                style={{ padding: "12px 10px", borderRadius: 10, border: `1.5px solid ${industry === ind ? (INDUSTRY_COLORS[ind] ?? "#6366f1") : "#1a1a1a"}`, background: "#0d0d0d", color: industry === ind ? (INDUSTRY_COLORS[ind] ?? "#6366f1") : "#888", fontSize: 13, cursor: "pointer", fontFamily: "inherit", fontWeight: 600, transition: "all 0.15s" }}>
                {ind === "SaaS" ? "⚡" : ind === "Marketplace" ? "🏪" : ind === "Mobile" ? "📱" : ind === "Service" ? "🛠️" : "✏️"} {ind}
              </button>
            ))}
          </div>
          <button onClick={onCancel} style={{ width: "100%", padding: 11, borderRadius: 8, border: "1px solid #222", background: "transparent", color: "#666", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
        </>
      ) : (
        <>
          <h2 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 700, color: "var(--bm-text)" }}>{industry} track details</h2>
          <p style={{ margin: "0 0 16px", fontSize: 13, color: "#555" }}>Name your startup and describe it in one line.</p>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: "#555", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Track name</div>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. SafeRemit, HealthTrack, CreatorOS..."
              style={{ width: "100%", background: "#111", border: "1px solid #2a2a2a", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "var(--bm-text)", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
          </div>
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, color: "#555", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>One-line description</div>
            <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="e.g. Mobile remittance for migrant workers in Ghana"
              style={{ width: "100%", background: "#111", border: "1px solid #2a2a2a", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "var(--bm-text)", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setStep("industry")} style={{ flex: 1, padding: 11, borderRadius: 8, border: "1px solid #222", background: "transparent", color: "#666", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>← Back</button>
            <button onClick={create} disabled={!name.trim()}
              style={{ flex: 2, padding: 11, borderRadius: 8, border: "none", background: name.trim() ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "#111", color: name.trim() ? "#fff" : "#444", fontSize: 12, fontWeight: 700, cursor: name.trim() ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
              Create track →
            </button>
          </div>
        </>
      )}
    </motion.div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function VenturesContent() {
  const router = useRouter();
  const { plan } = usePlan();
  const isFree = plan === "free";
  const [tab, setTab] = useState<"blueprint" | "roadmap">("blueprint");

  // Roadmap state
  const [tracks, setTracks] = useState<UserTrack[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    setTracks(loadTracks());
    updateAchievementStats({ venturesViewed: true });
    setTimeout(() => checkAndUnlockAchievements(), 1000);
  }, []);

  const saveTrack = (t: UserTrack) => {
    const updated = tracks.find(x => x.id === t.id) ? tracks.map(x => x.id === t.id ? t : x) : [...tracks, t];
    setTracks(updated); saveTracks(updated);
  };
  const deleteTrack = (id: string) => {
    const updated = tracks.filter(t => t.id !== id);
    setTracks(updated); saveTracks(updated);
    if (activeId === id) setActiveId(null);
  };

  const active = tracks.find(t => t.id === activeId);

  // Roadmap detail / wizard bypass tab
  if (tab === "roadmap" && active && !showNew) {
    return <TrackDetail track={active} onBack={() => setActiveId(null)} onUpdate={saveTrack} />;
  }
  if (tab === "roadmap" && showNew) {
    return <NewTrackWizard onSave={t => { saveTrack(t); setShowNew(false); setActiveId(t.id); }} onCancel={() => setShowNew(false)} />;
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      {/* Tab switcher */}
      <div style={{ display: "flex", gap: 6, marginBottom: 24, background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 4, border: "1px solid rgba(255,255,255,0.06)" }}>
        {(["blueprint", "roadmap"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1, padding: "9px 0", borderRadius: 9, border: "none",
              background: tab === t ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "transparent",
              color: tab === t ? "#fff" : "#666",
              fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              textTransform: "uppercase", letterSpacing: "0.06em", transition: "all 0.15s",
            }}
          >
            {t === "blueprint" ? "✦ Blueprint Generator" : "🗺️ Roadmap Tracks"}
          </button>
        ))}
      </div>

      {/* Blueprint tab */}
      {tab === "blueprint" && <BlueprintGenerator plan={plan} />}

      {/* Roadmap tab */}
      {tab === "roadmap" && (
        isFree ? (
          <div style={{ textAlign: "center", padding: "40px 20px", background: "rgba(99,102,241,0.05)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 16 }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🗺️</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--bm-text)", marginBottom: 8 }}>90-Day Roadmap Tracks</div>
            <p style={{ fontSize: 13, color: "#555", lineHeight: 1.6, maxWidth: 380, margin: "0 auto 18px" }}>
              Build structured 90-day execution tracks with proven milestones for SaaS, Marketplace, Mobile, and Service startups.
            </p>
            <button onClick={() => router.push("/upgrade?feature=roadmapTracks")} style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              Unlock with Builder →
            </button>
          </div>
        ) : (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--bm-text)" }}>90-Day Roadmap Tracks</h1>
                <p style={{ margin: "3px 0 0", fontSize: 12, color: "#555" }}>Templates for SaaS, Marketplace, Mobile, Service.</p>
              </div>
              <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={() => setShowNew(true)}
                style={{ padding: "8px 16px", borderRadius: 9, border: "none", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                + New track
              </motion.button>
            </div>

            {tracks.length === 0 ? (
              <div style={{ textAlign: "center", padding: "50px 20px", background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 16 }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>🗺️</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--bm-text)", marginBottom: 8 }}>No tracks yet</div>
                <p style={{ fontSize: 13, color: "#555", lineHeight: 1.6, maxWidth: 340, margin: "0 auto 18px" }}>A 90-day track breaks your startup into weekly milestones. Pick a template and start executing.</p>
                <button onClick={() => setShowNew(true)} style={{ padding: "11px 26px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                  Create your first track →
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <AnimatePresence>
                  {tracks.map((track, i) => {
                    const { done, total, pct } = trackProgress(track);
                    return (
                      <motion.div key={track.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ delay: 0.05 * i }}>
                        <div onClick={() => setActiveId(track.id)}
                          style={{ background: `${track.color}06`, border: `1px solid ${track.color}25`, borderRadius: 14, padding: 18, cursor: "pointer", transition: "all 0.15s" }}
                          onMouseEnter={e => (e.currentTarget.style.borderColor = `${track.color}50`)}
                          onMouseLeave={e => (e.currentTarget.style.borderColor = `${track.color}25`)}
                        >
                          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
                            <div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--bm-text)" }}>{track.name}</div>
                                <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 20, background: `${track.color}20`, color: track.color, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>{track.industry}</span>
                              </div>
                              {track.description && <div style={{ fontSize: 12, color: "#666" }}>{track.description}</div>}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginLeft: 12 }}>
                              <div style={{ textAlign: "right" }}>
                                <div style={{ fontSize: 18, fontWeight: 800, color: track.color }}>{pct}%</div>
                                <div style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em" }}>{done}/{total}</div>
                              </div>
                              <button onClick={e => { e.stopPropagation(); if (confirm("Delete this track?")) deleteTrack(track.id); }}
                                style={{ background: "transparent", border: "1px solid #222", borderRadius: 6, padding: "4px 8px", color: "#444", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>✕</button>
                            </div>
                          </div>
                          <div style={{ height: 4, background: "#111", borderRadius: 2, overflow: "hidden" }}>
                            <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, delay: 0.3 }} style={{ height: "100%", background: track.color, borderRadius: 2 }} />
                          </div>
                          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                            {track.phases.map(p => (
                              <span key={p.id} style={{ fontSize: 9, padding: "2px 8px", borderRadius: 10, background: "#111", border: "1px solid #1a1a1a", color: "#555" }}>
                                {p.label}: {p.milestones.filter(m => m.done).length}/{p.milestones.length}
                              </span>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
}

export default function VenturesPage() {
  return (
    <Suspense fallback={<BuildMindLoader variant="card" label="Loading Ventures…" />}>
      <VenturesContent />
    </Suspense>
  );
}
