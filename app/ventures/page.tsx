"use client";

/**
 * app/ventures/page.tsx — v7
 *
 * Playbook alignment (updated per v4 recommendations):
 *   - Ventures is a FEATURE under Builder — not a separate plan tier.
 *     The "Ventures" plan has been removed. Access = Builder subscription.
 *   - Blueprint is the hero (lands here by default)
 *   - Roadmap Tracks as side-by-side timeline columns (not stacked rows)
 *   - Purple/indigo palette throughout — distinct from core app green
 *   - Language: "decisions", "paths", "systems" — not "tasks", "milestones"
 *   - Blueprint gating: free gets preview ONCE, then full experience behind Builder paywall
 *   - Roadmap Tracks: Builder-only (playbook §6.1)
 *   - "Convert to 7-day plan" bridge to Today page
 *   - Future: venturesBlueprint engine (Month 3+ per Playbook) — currently manual/template
 */

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Suspense } from "react";
import { usePlan } from "@/lib/usePlan";
import { updateAchievementStats, checkAndUnlockAchievements } from "@/lib/achievements";
import { createClient } from "@/lib/supabase/client";
import BuildMindLoader from "@/components/BuildMindLoader";
import ExecutionSystems, { type ExecutionSystem } from "@/components/ExecutionSystem";
import { PLAN_PRICE_LABEL } from "@/lib/pricing";
import type { StartupBlueprint } from "@/lib/ventures/index";
import { storage } from "@/lib/storage";

// ── Design tokens — purple/indigo palette, distinct from core app ─────────────
const V = {
  bg:            "rgba(10,10,18,0.98)",
  card:          "rgba(16,16,28,0.95)",
  cardHover:     "rgba(22,22,38,0.95)",
  border:        "rgba(99,102,241,0.12)",
  borderActive:  "rgba(99,102,241,0.45)",
  borderSubtle:  "var(--bm-border)",
  indigo:        "var(--bm-accent)",
  violet:        "var(--bm-accent2)",
  indigoDim:     "rgba(99,102,241,0.08)",
  indigoBd:      "rgba(99,102,241,0.22)",
  text1:         "#f0f0f6",
  text2:         "#8888a8",
  text3:         "#44445a",
  rose:          "#f87171",
  emerald:       "#10b981",
  amber:         "#f59e0b",
};

// ── Roadmap track types ───────────────────────────────────────────────────────
interface UserDecision { id: string; week: string; task: string; detail: string; done: boolean; }
interface UserPath     { id: string; label: string; weeks: string; goal: string; decisions: UserDecision[]; }
interface UserTrack    { id: string; name: string; description: string; industry: string; stage: string; color: string; createdAt: number; paths: UserPath[]; }

const INDUSTRY_COLORS: Record<string, string> = {
  SaaS: "var(--bm-accent)", Marketplace: "var(--bm-accent2)", Mobile: "#a78bfa",
  Service: "#7c3aed", Custom: "#4f46e5",
};
const INDUSTRIES = ["SaaS", "Marketplace", "Mobile", "Service", "Custom"];

// Templates use "decisions" + "paths" language per playbook positioning
const TEMPLATES: Record<string, { paths: Omit<UserPath, "id">[] }> = {
  SaaS: { paths: [
    { label: "Validate", weeks: "Week 1–3", goal: "Confirm real demand before building", decisions: [
      { id: "s1", week: "Week 1", task: "Interview 10 target users — problems only, no pitching", detail: "Use the Mom Test. Ask about current behavior, not your solution.", done: false },
      { id: "s2", week: "Week 2", task: "Identify the #1 pain that repeats across 7+ interviews", detail: "Pattern recognition. One specific, acute pain beats a list.", done: false },
      { id: "s3", week: "Week 3", task: "Build a 5-slide deck and get 3 LOIs or pre-orders", detail: "Letters of intent prove intent. Money or signature only.", done: false },
    ]},
    { label: "Build", weeks: "Week 4–8", goal: "Ship the smallest thing that delivers the core value", decisions: [
      { id: "s4", week: "Week 4", task: "Define the one feature that solves the pain — nothing else", detail: "Write a one-sentence product spec. No scope creep.", done: false },
      { id: "s5", week: "Week 6", task: "Ship a working demo to your 3 LOI contacts", detail: "Not polished. Working. Get reactions, not compliments.", done: false },
      { id: "s6", week: "Week 8", task: "First paying customer — even $1 counts", detail: "Payment signals real intent. Charge before it's ready.", done: false },
    ]},
    { label: "Grow", weeks: "Week 9–12", goal: "Repeat what got customer #1 five more times", decisions: [
      { id: "s7", week: "Week 9", task: "Document exactly what converted customer #1", detail: "Reverse-engineer your own sale. What was the trigger?", done: false },
      { id: "s8", week: "Week 11", task: "3 more paying customers using the same playbook", detail: "Repeat, not reinvent. Same channel, same pitch, same demo.", done: false },
      { id: "s9", week: "Week 12", task: "Calculate CAC and decide on 1 primary growth channel", detail: "Pick one. Master it before adding more.", done: false },
    ]},
  ]},
  Marketplace: { paths: [
    { label: "Supply first", weeks: "Week 1–4", goal: "Recruit 10 supply-side participants before any demand", decisions: [
      { id: "m1", week: "Week 1", task: "Identify and contact 20 potential supply-side participants", detail: "Email personally. No blast campaigns.", done: false },
      { id: "m2", week: "Week 3", task: "Onboard 10 supply-side manually — no automation yet", detail: "Do it by hand. Learn every friction point.", done: false },
      { id: "m3", week: "Week 4", task: "Lock in listing quality standard with 3 examples", detail: "What does a great listing look like? Document it now.", done: false },
    ]},
    { label: "First transactions", weeks: "Week 5–9", goal: "Complete 5 real transactions manually", decisions: [
      { id: "m4", week: "Week 5", task: "Recruit first 20 demand-side users from personal network", detail: "Who do you know who needs this? Text them directly.", done: false },
      { id: "m5", week: "Week 7", task: "Facilitate 5 transactions — manually if needed", detail: "Watch every step of every transaction.", done: false },
      { id: "m6", week: "Week 9", task: "Calculate take rate and confirm unit economics work", detail: "What % makes this sustainable?", done: false },
    ]},
    { label: "Liquidity", weeks: "Week 10–12", goal: "Hit 3 transactions/week without your involvement", decisions: [
      { id: "m7", week: "Week 10", task: "Identify which supply-side participants drive most transactions", detail: "80/20 rule. Who are your power suppliers?", done: false },
      { id: "m8", week: "Week 12", task: "3 transactions/week happening without your involvement", detail: "This is the liquidity test.", done: false },
    ]},
  ]},
  Mobile: { paths: [
    { label: "Core loop", weeks: "Week 1–4", goal: "One thing that users do every day", decisions: [
      { id: "mob1", week: "Week 1", task: "Define the 1 core action users will do daily", detail: "Streak, track, discover, connect — pick one.", done: false },
      { id: "mob2", week: "Week 3", task: "Prototype in Figma — 5 screens max", detail: "5 screens. Not 15. The core loop only.", done: false },
      { id: "mob3", week: "Week 4", task: "5 user tests of the prototype — record every reaction", detail: "Watch, don't explain.", done: false },
    ]},
    { label: "Ship & retain", weeks: "Week 5–10", goal: "Day 7 retention > 25%", decisions: [
      { id: "mob4", week: "Week 6", task: "Ship TestFlight build to 20 beta users", detail: "Real device. Real users.", done: false },
      { id: "mob5", week: "Week 8", task: "Day 7 retention: measure and hit 25%+", detail: "If below 25%, fix before acquiring more users.", done: false },
      { id: "mob6", week: "Week 10", task: "Implement the 1 push notification that drives return", detail: "One notification that feels useful, not spammy.", done: false },
    ]},
    { label: "Growth", weeks: "Week 11–12", goal: "Organic referral loop working", decisions: [
      { id: "mob7", week: "Week 11", task: "Identify your most active 10% — interview them", detail: "What made them stay?", done: false },
      { id: "mob8", week: "Week 12", task: "One share mechanic that at least 10% of users trigger", detail: "Built-in sharing, not bolted on.", done: false },
    ]},
  ]},
  Service: { paths: [
    { label: "First client", weeks: "Week 1–3", goal: "Land paying client #1 from existing network", decisions: [
      { id: "sv1", week: "Week 1", task: "List 20 people who could hire or refer you — message them all", detail: "Personal messages. One per hour.", done: false },
      { id: "sv2", week: "Week 2", task: "Run 5 discovery calls — uncover the acute problem you can solve", detail: "Listen 80%, talk 20%.", done: false },
      { id: "sv3", week: "Week 3", task: "Close first paying client — even below your rate to get proof", detail: "Testimonial > margin at this stage.", done: false },
    ]},
    { label: "Systematise", weeks: "Week 4–8", goal: "Deliver so well that referrals happen naturally", decisions: [
      { id: "sv4", week: "Week 5", task: "Document your delivery process in a simple checklist", detail: "If you were hit by a bus, could someone else deliver this?", done: false },
      { id: "sv5", week: "Week 7", task: "Get a written testimonial from client #1", detail: "Ask: what result did you get?", done: false },
      { id: "sv6", week: "Week 8", task: "Client #2 and #3 — ideally from referrals", detail: "Referrals = you delivered.", done: false },
    ]},
    { label: "Scale", weeks: "Week 9–12", goal: "2x revenue without 2x time", decisions: [
      { id: "sv7", week: "Week 10", task: "Raise your rate with new clients — test price elasticity", detail: "Charge 20-30% more. See who pushes back.", done: false },
      { id: "sv8", week: "Week 12", task: "Package your service into a defined scope", detail: "Package = faster sales, less scope creep, better margins.", done: false },
    ]},
  ]},
  Custom: { paths: [
    { label: "Assumption", weeks: "Week 1–4", goal: "Define and validate your core assumption", decisions: [
      { id: "c1", week: "Week 1", task: "Write down your riskiest assumption in one sentence", detail: "The thing that, if wrong, makes everything else irrelevant.", done: false },
      { id: "c2", week: "Week 3", task: "Design the cheapest possible test of that assumption", detail: "Not code. Not a product. What's the fastest way to learn?", done: false },
      { id: "c3", week: "Week 4", task: "Run the test with at least 10 real people or data points", detail: "Real, not hypothetical. Behavior, not opinion.", done: false },
    ]},
    { label: "Build", weeks: "Week 5–8", goal: "Build the minimum version", decisions: [
      { id: "c4", week: "Week 5", task: "Define what 'done' looks like for the minimum version", detail: "Write it down. If it takes more than 2 sentences, scope-creep is coming.", done: false },
      { id: "c5", week: "Week 8", task: "Ship the minimum version to 10 real users", detail: "Not family. Not friends who'll be nice. Real users.", done: false },
    ]},
    { label: "Iterate", weeks: "Week 9–12", goal: "Iterate based on real feedback", decisions: [
      { id: "c6", week: "Week 10", task: "Identify the #1 thing breaking for most users", detail: "Not features. The thing that stops them from getting value.", done: false },
      { id: "c7", week: "Week 12", task: "Fix it and confirm the fix with 3 users", detail: "Ship → test → confirm. One loop.", done: false },
    ]},
  ]},
};

// ── Storage ───────────────────────────────────────────────────────────────────
// Strategy: localStorage is the instant read/write cache for UI responsiveness.
// The server is the source of truth — loaded on mount, written on every change.
// This means progress survives new devices and browser clears, consistent with
// how streak, XP, and score history are already handled across the app.

const TRACKS_KEY     = "bm_venture_tracks";
const BLUEPRINTS_KEY = "bm_blueprints";
const BLUEPRINT_USED_KEY = "bm_blueprint_first_used";

// ── Local cache helpers (sync, instant) ──────────────────────────────────────

function loadTracks(): UserTrack[] {
  return storage.getJSON<UserTrack[]>(TRACKS_KEY, []);
}
function cacheTracksLocally(t: UserTrack[]) {
  storage.setJSON(TRACKS_KEY, t);
}
function loadBlueprints(): StartupBlueprint[] {
  return storage.getJSON<StartupBlueprint[]>(BLUEPRINTS_KEY, []);
}
function cacheBlueprint(bp: StartupBlueprint) {
  const existing = loadBlueprints();
  storage.setJSON(BLUEPRINTS_KEY, [bp, ...existing].slice(0, 20));
}
async function syncBlueprintsFromServer(): Promise<StartupBlueprint[]> {
  try {
    const res = await fetch("/api/ventures/blueprints", { cache: "no-store" });
    if (!res.ok) return loadBlueprints();
    const { blueprints } = await res.json();
    if (Array.isArray(blueprints)) {
      storage.setJSON(BLUEPRINTS_KEY, blueprints);
      return blueprints;
    }
  } catch {}
  return loadBlueprints();
}

// ── Server sync helpers (async, fire-and-forget on write) ────────────────────

/** Fetch all tracks from the server, populate local cache, return them. */
async function syncTracksFromServer(): Promise<UserTrack[]> {
  try {
    const res = await fetch("/api/ventures/tracks", { cache: "no-store" });
    if (!res.ok) return loadTracks(); // fall back to cache on error
    const { tracks } = await res.json();
    if (Array.isArray(tracks)) {
      cacheTracksLocally(tracks);
      return tracks;
    }
  } catch {}
  return loadTracks();
}

/** Persist a single track to the server (upsert). Non-blocking. */
function persistTrack(track: UserTrack): void {
  fetch("/api/ventures/tracks", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(track),
  }).catch(() => {}); // local cache is already updated; server failure is silent
}

/** Delete a track from the server. Non-blocking. */
function deleteTrackFromServer(id: string): void {
  fetch(`/api/ventures/tracks?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  }).catch(() => {});
}

/** Save all tracks: update local cache + persist every changed track to server. */
function saveTracks(updated: UserTrack[], previous: UserTrack[]): void {
  cacheTracksLocally(updated);
  // Only sync tracks that changed or are new — avoids unnecessary writes
  const prevMap = new Map(previous.map(t => [t.id, JSON.stringify(t)]));
  for (const track of updated) {
    if (prevMap.get(track.id) !== JSON.stringify(track)) {
      persistTrack(track);
    }
  }
}

function trackProgress(t: UserTrack) {
  const decisions = t.paths.flatMap(p => p.decisions);
  const done = decisions.filter(d => d.done).length;
  const total = decisions.length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

// ── Blueprint first-used gate ─────────────────────────────────────────────────
// Previously localStorage-only → a free user on a new device got a second free
// blueprint. Now the flag is persisted server-side; localStorage is just a cache.

function hasUsedFirstBlueprintLocally(): boolean {
  return storage.get(BLUEPRINT_USED_KEY) === "true";
}

async function hasUsedFirstBlueprint(): Promise<boolean> {
  // Fast path: already confirmed locally
  if (hasUsedFirstBlueprintLocally()) return true;
  try {
    const res = await fetch("/api/ventures/blueprint-used", { cache: "no-store" });
    if (!res.ok) return hasUsedFirstBlueprintLocally();
    const { used } = await res.json();
    if (used) {
      storage.set(BLUEPRINT_USED_KEY, "true"); // warm local cache
    }
    return used;
  } catch {
    return hasUsedFirstBlueprintLocally();
  }
}

function markFirstBlueprintUsed(): void {
  storage.set(BLUEPRINT_USED_KEY, "true");
  fetch("/api/ventures/blueprint-used", { method: "POST" }).catch(() => {});
}

function saveBlueprint(bp: StartupBlueprint, description?: string): void {
  cacheBlueprint(bp);
  fetch("/api/ventures/blueprints", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blueprint: bp, description }),
  }).catch(() => {});
}

// ── Layer labels ──────────────────────────────────────────────────────────────
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

// ── Blueprint layer renderer — prose, not JSON ────────────────────────────────
function renderLayerContent(data: unknown): React.ReactNode {
  if (!data || typeof data !== "object") return <p style={{ color: V.text2, fontSize: 13 }}>No data available.</p>;

  const entries = Object.entries(data as Record<string, unknown>);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {entries.map(([key, val]) => {
        const label = key.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase());
        if (Array.isArray(val)) {
          return (
            <div key={key}>
              <div style={{ fontSize: 10, fontWeight: 700, color: V.indigo, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>{label}</div>
              <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 3 }}>
                {val.map((item, i) => (
                  <li key={i} style={{ fontSize: 13, color: V.text2, lineHeight: 1.5 }}>
                    {typeof item === "object" ? JSON.stringify(item) : String(item)}
                  </li>
                ))}
              </ul>
            </div>
          );
        }
        if (typeof val === "string" || typeof val === "number") {
          return (
            <div key={key}>
              <div style={{ fontSize: 10, fontWeight: 700, color: V.indigo, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>{label}</div>
              <p style={{ margin: 0, fontSize: 13, color: V.text2, lineHeight: 1.6 }}>{String(val)}</p>
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

// ── Blueprint layer card ──────────────────────────────────────────────────────
function BlueprintLayerCard({ label, data, locked, isFirstBlueprint }: {
  label: string; data: unknown; locked: boolean; isFirstBlueprint: boolean;
}) {
  const [open, setOpen] = useState(false);
  const isDraft = locked && !isFirstBlueprint;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      style={{ border: `1px solid ${locked ? V.border : V.borderActive}`, borderRadius: 12, overflow: "hidden", marginBottom: 8, position: "relative", background: V.card }}
    >
      {/* Draft blur overlay for non-first blueprints */}
      {isDraft && (
        <div style={{
          position: "absolute", inset: 0, backdropFilter: "blur(5px)",
          background: "rgba(10,10,18,0.65)", zIndex: 2,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: V.text1 }}>Draft — Builder unlocks this</div>
          <div style={{ fontSize: 11, color: V.text2 }}>The strategy engine has done the work</div>
        </div>
      )}
      <button
        onClick={() => !locked && setOpen(v => !v)}
        style={{
          width: "100%", background: "transparent", border: "none",
          cursor: locked ? "default" : "pointer",
          padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between",
          color: V.text1, fontFamily: "inherit", textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 6, height: 6, borderRadius: "50%",
            background: locked ? V.text3 : V.indigo,
            boxShadow: locked ? "none" : `0 0 6px ${V.indigo}`,
          }} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
        </div>
        {!locked && <span style={{ fontSize: 11, color: V.text2 }}>{open ? "▲" : "▼"}</span>}
        {isDraft && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: V.indigoDim, color: V.indigo, border: `1px solid ${V.indigoBd}`, fontWeight: 600 }}>Draft</span>}
      </button>
      <AnimatePresence>
        {open && !locked && (
          <motion.div key="content" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: "hidden" }}>
            <div style={{ padding: "0 16px 16px" }}>
              {renderLayerContent(data)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Blueprint result ──────────────────────────────────────────────────────────
function BlueprintResult({ bp, plan, onNew, isFirstBlueprint }: {
  bp: StartupBlueprint; plan: string; onNew: () => void; isFirstBlueprint: boolean;
}) {
  const router = useRouter();
  const isFull = plan !== "free" || isFirstBlueprint;
  const pi = bp.productInterpretation;

  const layers: { label: string; key: keyof StartupBlueprint; locked: boolean }[] = [
    { label: LAYER_LABELS[0], key: "productInterpretation", locked: false },
    { label: LAYER_LABELS[1], key: "systemDesign",          locked: !isFull },
    { label: LAYER_LABELS[2], key: "mvpConstruction",       locked: !isFull },
    { label: LAYER_LABELS[3], key: "executionPlan",         locked: !isFull },
    { label: LAYER_LABELS[4], key: "founderFit",            locked: !isFull },
    { label: LAYER_LABELS[5], key: "marketIntelligence",    locked: !isFull },
    { label: LAYER_LABELS[6], key: "riskRegister",          locked: !isFull },
    { label: LAYER_LABELS[7], key: "cofounderHandoff",      locked: !isFull },
  ];

  function handleConvertTo7Days() {
    // Push blueprint summary to scoped local cache for Today page to pick up
    const summary = {
      blueprintId: bp.id,
      category: pi?.appCategory,
      intent: pi?.intentSummary ?? pi?.problemStatement,
      createdAt: Date.now(),
    };
    storage.setJSON("bm_blueprint_to_7day", summary);
    router.push("/today?from=blueprint");
  }

  return (
    <div style={{ maxWidth: 680, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: V.indigo, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Strategy Blueprint</div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: V.text1 }}>
            {pi?.appCategory?.toUpperCase() ?? "BLUEPRINT"}
          </h2>
          <p style={{ margin: "5px 0 0", fontSize: 13, color: V.text2, maxWidth: 480, lineHeight: 1.5 }}>
            {pi?.intentSummary ?? pi?.problemStatement ?? "Blueprint generated."}
          </p>
        </div>
        <button onClick={onNew} style={{
          padding: "7px 14px", borderRadius: 8, border: `1px solid ${V.border}`,
          background: "transparent", color: V.text2, fontSize: 11, cursor: "pointer",
          fontFamily: "inherit", flexShrink: 0,
        }}>
          New blueprint
        </button>
      </div>

      {/* Quick stats */}
      {pi && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
          {[
            { label: "Category", val: pi.appCategory },
            { label: "Target", val: pi.targetUser?.slice(0, 40) },
            { label: "Features", val: `${pi.detectedFeatures?.length ?? 0} detected` },
          ].filter(s => s.val).map(s => (
            <span key={s.label} style={{
              fontSize: 11, padding: "4px 10px", borderRadius: 20,
              background: V.indigoDim, border: `1px solid ${V.indigoBd}`, color: V.text2,
            }}>
              {s.label}: <strong style={{ color: V.text1 }}>{s.val}</strong>
            </span>
          ))}
        </div>
      )}

      {/* Action buttons — the bridge to core app */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        <button onClick={handleConvertTo7Days} style={{
          flex: 1, minWidth: 160, padding: "10px 16px", borderRadius: 10, border: "none",
          background: "var(--grad-primary)",
          color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
        }}>
          Convert to 7-day plan →
        </button>
        <button onClick={() => {
          storage.set("bm_stress_test_idea", pi?.problemStatement ?? "");
          window.location.href = "/break-my-startup";
        }} style={{
          padding: "10px 16px", borderRadius: 10, border: `1px solid ${V.borderActive}`,
          background: V.indigoDim, color: V.indigo, fontSize: 12, fontWeight: 700,
          cursor: "pointer", fontFamily: "inherit",
        }}>
          Stress test this idea
        </button>
      </div>

      {/* Layer cards */}
      {layers.map(l => (
        <BlueprintLayerCard
          key={l.key}
          label={l.label}
          data={bp[l.key]}
          locked={l.locked || !bp[l.key]}
          isFirstBlueprint={isFirstBlueprint}
        />
      ))}

      {/* Upgrade prompt — only for non-first blueprints on free */}
      {plan === "free" && !isFirstBlueprint && (
        <div style={{
          marginTop: 16, padding: "18px 20px", borderRadius: 14,
          border: `1px solid ${V.borderActive}`, background: V.indigoDim, textAlign: "center",
        }}>
          <div style={{ fontSize: 14, color: V.text1, fontWeight: 700, marginBottom: 6 }}>
            The strategy engine has done the work
          </div>
          <div style={{ fontSize: 13, color: V.text2, marginBottom: 14, lineHeight: 1.6 }}>
            Layers 2–8 are drafted and waiting. Builder unlocks them — plus unlimited blueprints, roadmap tracks, and your 7-day execution plan.
          </div>
          <a href="/upgrade?feature=ventures" style={{
            display: "inline-block", padding: "10px 24px", borderRadius: 10, border: "none",
            background: "var(--grad-primary)",
            color: "#fff", fontSize: 13, fontWeight: 700, textDecoration: "none",
          }}>
            Upgrade to Builder →
          </a>
        </div>
      )}
    </div>
  );
}

// ── Blueprint generator ───────────────────────────────────────────────────────
function BlueprintGenerator({ plan, planLoading = false }: { plan: string; planLoading?: boolean }) {
  const isFull = !planLoading && plan !== "free";
  const [input, setInput]           = useState("");
  const [loading, setLoading]       = useState(false);
  const [stepIndex, setStepIndex]   = useState(0);
  const [blueprint, setBlueprint]   = useState<StartupBlueprint | null>(null);
  const [history, setHistory]       = useState<StartupBlueprint[]>([]);
  const [error, setError]           = useState<string | null>(null);
  const [isFirstBp, setIsFirstBp]   = useState(false);
  const stepTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setHistory(loadBlueprints());
    syncBlueprintsFromServer().then(setHistory).catch(() => {});
  }, []);

  async function generate() {
    if (!input.trim() || loading) return;
    // hasUsedFirstBlueprint is now async — it checks server-side so the free
    // preview gate survives across devices (previously only in localStorage).
    const firstBlueprint = !(await hasUsedFirstBlueprint());
    setIsFirstBp(firstBlueprint);
    setLoading(true);
    setError(null);
    setStepIndex(0);

    stepTimer.current = setInterval(() => {
      setStepIndex(i => Math.min(i + 1, GEN_STEPS.length - 1));
    }, 900);

    try {
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;
      if (!userId) throw new Error("Not authenticated. Please sign in.");

      const grantFull = isFull || firstBlueprint;
      const res = await fetch("/api/ventures/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          inputType: "text",
          textDescription: input.trim(),
          fullBlueprint: grantFull,
          includeSystemDesign: grantFull,
          includeExecutionPlan: grantFull,
          includeCodeScaffold: false,
          includeFounderFit: grantFull,
          includeMarketIntel: grantFull,
          includeRiskRegister: grantFull,
          includeCofounderHandoff: grantFull,
        }),
      });

      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Blueprint generation failed");

      if (firstBlueprint) markFirstBlueprintUsed();
      const rawBlueprint = (body.blueprint ?? body) as StartupBlueprint & { generatedAt?: string };
      const bp = {
        ...rawBlueprint,
        id: rawBlueprint.id ?? crypto.randomUUID(),
        createdAt: rawBlueprint.createdAt ?? rawBlueprint.generatedAt ?? new Date().toISOString(),
      } as StartupBlueprint;
      setBlueprint(bp);
      saveBlueprint(bp, input.trim());
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
        isFirstBlueprint={isFirstBp}
      />
    );
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 700, color: V.text1 }}>
          Strategy Blueprint
        </h1>
        <p style={{ margin: "0 0 22px", fontSize: 13, color: V.text2, lineHeight: 1.6 }}>
          Describe your startup. The 8-layer intelligence engine will map your product, system, execution path, market, risks, and founder fit.
          {!isFull && " You get the full blueprint free — once."}
        </p>

        {/* Fix #7 — Guided first-venture onboarding: 3-step guide shown when no blueprints exist */}
        {history.length === 0 && !blueprint && (
          <div style={{ marginBottom: 20, padding: "16px 18px", background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.18)", borderRadius: 14 }}>
            <p style={{ margin: "0 0 12px", fontSize: 12, fontWeight: 700, color: V.indigo, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              How it works — your first blueprint
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { n: "1", title: "Describe your startup", desc: "One paragraph: what it does, who it’s for, what problem it solves." },
                { n: "2", title: "8-layer AI analysis", desc: "Product, GTM, execution path, market, risks, competitor moat, founder fit, and 7-day action plan." },
                { n: "3", title: "Your strategy blueprint", desc: "A structured playbook specific to your startup — download, share, or iterate." },
              ].map(step => (
                <div key={step.n} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: "rgba(99,102,241,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: V.indigo, flexShrink: 0 }}>
                    {step.n}
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: V.text1 }}>{step.title}</p>
                    <p style={{ margin: "2px 0 0", fontSize: 11, color: V.text3, lineHeight: 1.5 }}>{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && e.metaKey) void generate(); }}
          placeholder="e.g. A mobile app that helps Ghanaian market traders track daily inventory and credit advanced by suppliers, with SMS reminders when payments are due…"
          rows={5}
          style={{
            width: "100%", background: V.card,
            border: `1px solid ${input ? V.borderActive : V.border}`,
            borderRadius: 12, padding: "12px 14px", fontSize: 13, color: V.text1,
            outline: "none", fontFamily: "inherit", resize: "vertical",
            lineHeight: 1.6, transition: "border-color 0.15s", boxSizing: "border-box",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
          <span style={{ fontSize: 11, color: V.text3 }}>
            {isFull ? "8-layer blueprint · Builder plan" : "Full 8-layer blueprint · free once"}
          </span>
          <motion.button
            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            onClick={generate}
            disabled={!input.trim() || loading}
            style={{
              padding: "10px 22px", borderRadius: 10, border: "none",
              background: input.trim() && !loading
                ? "var(--bm-accent)"
                : "var(--bm-border)",
              color: input.trim() && !loading ? "#fff" : V.text3,
              fontSize: 13, fontWeight: 700,
              cursor: input.trim() && !loading ? "pointer" : "not-allowed",
              fontFamily: "inherit",
            }}
          >
            {loading ? GEN_STEPS[stepIndex] : "Generate blueprint →"}
          </motion.button>
        </div>

        {error && (
          <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 10, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)", fontSize: 12, color: V.rose }}>
            {error}
          </div>
        )}

        {/* Past blueprints */}
        {history.length > 0 && (
          <div style={{ marginTop: 28 }}>
            <div style={{ fontSize: 11, color: V.text3, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>
              Past blueprints
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {history.slice(0, 5).map(bp => (
                <button key={bp.id} onClick={() => { setBlueprint(bp); setIsFirstBp(false); }}
                  style={{
                    background: V.card, border: `1px solid ${V.border}`, borderRadius: 10,
                    padding: "10px 14px", cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    transition: "border-color 0.15s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = V.borderActive)}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = V.border)}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: V.text1 }}>
                      {bp.productInterpretation?.appCategory?.toUpperCase() ?? "Blueprint"}
                    </div>
                    <div style={{ fontSize: 11, color: V.text2, marginTop: 2 }}>
                      {bp.productInterpretation?.problemStatement?.slice(0, 70) ?? bp.id}
                    </div>
                  </div>
                  <span style={{ fontSize: 10, color: V.text3, flexShrink: 0, marginLeft: 12 }}>
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

// ── Roadmap: timeline column view ─────────────────────────────────────────────
function DecisionCard({ d, color, onToggle }: { d: UserDecision; color: string; onToggle: () => void }) {
  return (
    <motion.div
      onClick={onToggle}
      whileHover={{ y: -2 }}
      style={{
        background: d.done ? `${color}10` : V.card,
        border: `1px solid ${d.done ? color + "40" : V.borderSubtle}`,
        borderRadius: 10, padding: "12px 13px", cursor: "pointer",
        transition: "all 0.15s", marginBottom: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
        <div style={{
          width: 14, height: 14, borderRadius: 4, flexShrink: 0, marginTop: 1,
          border: `1.5px solid ${d.done ? color : V.text3}`,
          background: d.done ? color : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {d.done && <span style={{ fontSize: 8, color: "#fff", fontWeight: 700 }}>✓</span>}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: d.done ? V.text3 : V.text1, lineHeight: 1.45, textDecoration: d.done ? "line-through" : "none" }}>
            {d.task}
          </div>
          <div style={{ fontSize: 10, color: V.text3, marginTop: 3 }}>{d.week}</div>
        </div>
      </div>
    </motion.div>
  );
}

function TrackTimeline({ track, onBack, onUpdate }: { track: UserTrack; onBack: () => void; onUpdate: (t: UserTrack) => void }) {
  const [local, setLocal] = useState<UserTrack>(track);
  const { done, total, pct } = trackProgress(local);

  const toggleDecision = (pathId: string, dId: string) => {
    const updated = {
      ...local,
      paths: local.paths.map(p => p.id !== pathId ? p : {
        ...p,
        decisions: p.decisions.map(d => d.id !== dId ? d : { ...d, done: !d.done }),
      }),
    };
    setLocal(updated);
    onUpdate(updated);
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button onClick={onBack} style={{
          background: "transparent", border: `1px solid ${V.border}`, borderRadius: 8,
          padding: "6px 12px", color: V.text2, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
        }}>← Systems</button>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: V.text1 }}>{local.name}</h1>
          <div style={{ fontSize: 11, color: V.text2, marginTop: 2 }}>{local.industry} · {done}/{total} decisions made</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: V.indigo }}>{pct}%</div>
          <div style={{ fontSize: 9, color: V.text3, textTransform: "uppercase", letterSpacing: "0.08em" }}>complete</div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 4, background: "var(--bm-border)", borderRadius: 2, marginBottom: 28, overflow: "hidden" }}>
        <motion.div
          initial={{ width: 0 }} animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          style={{ height: "100%", background: "var(--bm-accent)", borderRadius: 2 }}
        />
      </div>

      {/* Timeline columns — the key visual differentiator */}
      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(${local.paths.length}, 1fr)`,
        gap: 12,
        alignItems: "start",
      }}>
        {local.paths.map((path, i) => {
          const pathDone = path.decisions.filter(d => d.done).length;
          const pathTotal = path.decisions.length;
          return (
            <div key={path.id} style={{
              background: V.card, border: `1px solid ${V.border}`,
              borderRadius: 14, padding: "16px 14px", minWidth: 0,
            }}>
              {/* Path header */}
              <div style={{
                display: "flex", alignItems: "center", gap: 8, marginBottom: 6,
                paddingBottom: 10, borderBottom: `1px solid ${V.borderSubtle}`,
              }}>
                <div style={{
                  width: 24, height: 24, borderRadius: 8, flexShrink: 0,
                  background: V.indigoDim, border: `1px solid ${V.indigoBd}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 700, color: V.indigo,
                }}>
                  {i + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: V.text1, lineHeight: 1.2 }}>{path.label}</div>
                  <div style={{ fontSize: 10, color: V.text3, marginTop: 1 }}>{path.weeks}</div>
                </div>
              </div>
              <div style={{ fontSize: 11, color: V.text2, marginBottom: 10, lineHeight: 1.4 }}>{path.goal}</div>
              <div style={{ fontSize: 10, color: pathDone === pathTotal ? V.indigo : V.text3, marginBottom: 10, fontWeight: 600 }}>
                {pathDone}/{pathTotal} decisions
              </div>

              {/* Decision cards */}
              {path.decisions.map(d => (
                <DecisionCard key={d.id} d={d} color={V.indigo} onToggle={() => toggleDecision(path.id, d.id)} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── New track wizard ──────────────────────────────────────────────────────────
function NewSystemWizard({ onSave, onCancel }: { onSave: (t: UserTrack) => void; onCancel: () => void }) {
  const [step, setStep] = useState<"industry" | "details">("industry");
  const [industry, setIndustry] = useState("");
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  const create = () => {
    if (!name.trim()) return;
    const template = TEMPLATES[industry];
    const paths: UserPath[] = template
      ? template.paths.map((p, pi) => ({
          id: `p${pi}`,
          ...p,
          decisions: p.decisions.map(d => ({ ...d, id: `${pi}_${d.id}_${Date.now()}` })),
        }))
      : [{ id: "p0", label: "Path 1", weeks: "Week 1–4", goal: "Define your first path", decisions: [] }];

    onSave({
      id: `t_${Date.now()}`,
      name: name.trim(),
      description: desc.trim(),
      industry,
      stage: "Idea",
      color: INDUSTRY_COLORS[industry] ?? V.indigo,
      createdAt: Date.now(),
      paths,
    });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      style={{ maxWidth: 480, margin: "0 auto", background: V.card, border: `1px solid ${V.border}`, borderRadius: 16, padding: "24px 22px" }}>
      {step === "industry" ? (
        <>
          <div style={{ fontSize: 10, fontWeight: 700, color: V.indigo, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>New System</div>
          <h2 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 700, color: V.text1 }}>Choose your system type</h2>
          <p style={{ margin: "0 0 18px", fontSize: 13, color: V.text2 }}>We'll generate a 90-day execution system with proven decision paths.</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
            {INDUSTRIES.map(ind => (
              <button key={ind} onClick={() => { setIndustry(ind); setStep("details"); }}
                style={{
                  padding: "12px 10px", borderRadius: 10,
                  border: `1.5px solid ${industry === ind ? V.borderActive : V.border}`,
                  background: industry === ind ? V.indigoDim : "transparent",
                  color: industry === ind ? V.indigo : V.text2,
                  fontSize: 13, cursor: "pointer", fontFamily: "inherit", fontWeight: 600, transition: "all 0.15s",
                }}>
                {ind === "SaaS" ? "⚡" : ind === "Marketplace" ? "🏪" : ind === "Mobile" ? "📱" : ind === "Service" ? "🛠️" : "✏️"} {ind}
              </button>
            ))}
          </div>
          <button onClick={onCancel} style={{ width: "100%", padding: 11, borderRadius: 8, border: `1px solid ${V.border}`, background: "transparent", color: V.text2, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
        </>
      ) : (
        <>
          <div style={{ fontSize: 10, fontWeight: 700, color: V.indigo, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>{industry} System</div>
          <h2 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 700, color: V.text1 }}>Name your system</h2>
          <p style={{ margin: "0 0 16px", fontSize: 13, color: V.text2 }}>Give it a name and a one-line description.</p>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: V.text2, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>System name</div>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. SafeRemit, HealthTrack, CreatorOS…"
              style={{ width: "100%", background: "var(--bm-border)", border: `1px solid ${V.border}`, borderRadius: 8, padding: "10px 12px", fontSize: 13, color: V.text1, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
          </div>
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, color: V.text2, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>One-line description</div>
            <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="e.g. Mobile remittance for migrant workers in Ghana"
              style={{ width: "100%", background: "var(--bm-border)", border: `1px solid ${V.border}`, borderRadius: 8, padding: "10px 12px", fontSize: 13, color: V.text1, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setStep("industry")} style={{ flex: 1, padding: 11, borderRadius: 8, border: `1px solid ${V.border}`, background: "transparent", color: V.text2, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>← Back</button>
            <button onClick={create} disabled={!name.trim()}
              style={{ flex: 2, padding: 11, borderRadius: 8, border: "none", background: name.trim() ? `linear-gradient(135deg,${V.indigo},${V.violet})` : "var(--bm-border)", color: name.trim() ? "#fff" : V.text3, fontSize: 12, fontWeight: 700, cursor: name.trim() ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
              Create system →
            </button>
          </div>
        </>
      )}
    </motion.div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
function VenturesContent() {
  const router = useRouter();
  const { plan, isLoading: planLoading } = usePlan();
  const isFree = !planLoading && plan === "free";

  const [tab, setTab]         = useState<"blueprint" | "systems">("blueprint");
  const [tracks, setTracks]   = useState<UserTrack[]>([]);
  const [execSystems, setExecSystems] = useState<ExecutionSystem[]>([]);
  const [execLoading, setExecLoading] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    // Show cached tracks instantly, then hydrate from server in the background.
    // This gives immediate UI render (no flash) while guaranteeing the server
    // version wins if it differs (new device, browser clear, etc).
    setTracks(loadTracks());
    syncTracksFromServer().then(serverTracks => {
      setTracks(serverTracks);
    });
    updateAchievementStats({ venturesViewed: true });
    setTimeout(() => checkAndUnlockAchievements(), 1000);
  }, []);

  const saveTrack = (t: UserTrack) => {
    const updated = tracks.find(x => x.id === t.id)
      ? tracks.map(x => x.id === t.id ? t : x)
      : [...tracks, t];
    setTracks(updated);
    saveTracks(updated, tracks);
  };
  const deleteTrack = (id: string) => {
    const updated = tracks.filter(t => t.id !== id);
    setTracks(updated);
    saveTracks(updated, tracks);
    deleteTrackFromServer(id);
    if (activeId === id) setActiveId(null);
  };

  const active = tracks.find(t => t.id === activeId);

  async function handleGenerateExecutionSystems() {
    const latestBlueprint = (await syncBlueprintsFromServer())[0];
    const description =
      latestBlueprint
        ? JSON.stringify(latestBlueprint).slice(0, 3000)
        : tracks[0]?.description || tracks[0]?.name || "Early-stage startup seeking distribution, validation, and revenue systems.";

    setExecLoading(true);
    try {
      const res = await fetch("/api/ventures/execution-systems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, stage: tracks[0]?.stage ?? "Idea" }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) setExecSystems(data.systems ?? []);
    } finally {
      setExecLoading(false);
    }
  }

  if (tab === "systems" && active && !showNew) {
    return <TrackTimeline track={active} onBack={() => setActiveId(null)} onUpdate={saveTrack} />;
  }
  if (tab === "systems" && showNew) {
    return (
      <NewSystemWizard
        onSave={t => { saveTrack(t); setShowNew(false); setActiveId(t.id); }}
        onCancel={() => setShowNew(false)}
      />
    );
  }

  return (
    <div style={{ maxWidth: 780, margin: "0 auto" }}>

      {/* Mode header — signals strategy mode to user */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: V.indigo, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4 }}>
          Strategy Mode
        </div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: V.text1 }}>Ventures</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: V.text2 }}>Design systems. Make decisions. Build deliberately.</p>
      </div>

      {/* Tab switcher */}
      <div style={{
        display: "flex", gap: 4, marginBottom: 28,
        background: "var(--bm-border)", borderRadius: 12,
        padding: 4, border: `1px solid ${V.borderSubtle}`,
      }}>
        {([
          { id: "blueprint", label: "✦ Strategy Blueprint" },
          { id: "systems",   label: "⬡ Execution Systems" },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              flex: 1, padding: "9px 0", borderRadius: 9, border: "none",
              background: tab === t.id
                ? "var(--bm-accent)"
                : "transparent",
              color: tab === t.id ? "#fff" : V.text2,
              fontSize: 12, fontWeight: 700, cursor: "pointer",
              fontFamily: "inherit", letterSpacing: "0.04em", transition: "all 0.15s",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Blueprint tab */}
      {tab === "blueprint" && <BlueprintGenerator plan={plan} planLoading={planLoading} />}

      {/* Systems tab */}
      {tab === "systems" && (
        isFree ? (
          <div style={{
            textAlign: "center", padding: "48px 24px",
            background: V.indigoDim, border: `1px solid ${V.borderActive}`, borderRadius: 16,
          }}>
            <div style={{ fontSize: 32, marginBottom: 14 }}>⬡</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: V.text1, marginBottom: 8 }}>
              90-Day Execution Systems
            </div>
            <p style={{ fontSize: 13, color: V.text2, lineHeight: 1.6, maxWidth: 380, margin: "0 auto 18px" }}>
              Build structured 90-day systems with proven decision paths for SaaS, Marketplace, Mobile, and Service startups. Builder plan unlocks unlimited systems.
            </p>
            <a href="/upgrade?feature=ventures" style={{
              display: "inline-block", padding: "10px 24px", borderRadius: 10, border: "none",
              background: "var(--grad-primary)",
              color: "#fff", fontSize: 13, fontWeight: 700, textDecoration: "none",
            }}>
              Unlock with Builder →
            </a>
          </div>
        ) : (
          <div>
            <ExecutionSystems
              systems={execSystems}
              isLoading={execLoading}
              onRun={(id) => setExecSystems(prev => prev.map(s => s.id === id ? { ...s, status: "running" } : s))}
              onToggle={(id) => setExecSystems(prev =>
                prev.map(s => s.id === id ? { ...s, status: s.status === "paused" ? "active" : "paused" } : s)
              )}
            />
            {execSystems.length === 0 && !execLoading && (
              <button onClick={handleGenerateExecutionSystems} style={{
                marginTop: 16,
                padding: "11px 22px", borderRadius: 10, border: "none",
                background: "var(--grad-primary)",
                color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              }}>
                Generate Execution Systems
              </button>
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
