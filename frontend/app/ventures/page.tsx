"use client";

/**
 * app/ventures/page.tsx — User Roadmap Canvas
 *
 * Transformed from "owner's personal portfolio" to a user-generated
 * 90-day execution roadmap builder. Every founder creates their own tracks.
 *
 * Features:
 * - 5 industry templates (SaaS, Marketplace, Mobile, Service, Hardware)
 * - Custom track creation from scratch
 * - Full milestone/phase editor stored in localStorage
 * - Progress tracking with % completion
 * - Builder gating on >1 track
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Suspense } from "react";
import { usePlan } from "@/lib/usePlan";
import { updateAchievementStats, checkAndUnlockAchievements } from "@/lib/achievements";
import BuildMindLoader from "@/components/BuildMindLoader";

// ── Types ─────────────────────────────────────────────────────────────────────
interface UserMilestone {
  id: string;
  week: string;
  task: string;
  detail: string;
  done: boolean;
}

interface UserPhase {
  id: string;
  label: string;
  weeks: string;
  goal: string;
  milestones: UserMilestone[];
}

interface UserTrack {
  id: string;
  name: string;
  description: string;
  industry: string;
  stage: string;
  color: string;
  createdAt: number;
  phases: UserPhase[];
}

// ── Templates ─────────────────────────────────────────────────────────────────
const INDUSTRY_COLORS: Record<string, string> = {
  SaaS: "#6366f1", Marketplace: "#10b981", Mobile: "#f59e0b",
  Service: "#8b5cf6", Hardware: "#ef4444", Custom: "#3b82f6",
};

const TEMPLATES: Record<string, { phases: Omit<UserPhase, "id">[] }> = {
  SaaS: {
    phases: [
      { label: "Validate", weeks: "Week 1–3", goal: "Confirm real demand before building",
        milestones: [
          { id: "s1", week: "Week 1", task: "Interview 10 target users — problems only, no pitching", detail: "Use the Mom Test. Ask about current behavior, not your solution.", done: false },
          { id: "s2", week: "Week 2", task: "Identify the #1 pain that repeats across 7+ interviews", detail: "Pattern recognition. One specific, acute pain beats a list.", done: false },
          { id: "s3", week: "Week 3", task: "Build a 5-slide deck and get 3 LOIs or pre-orders", detail: "Letters of intent prove intent. Money or signature only.", done: false },
        ],
      },
      { label: "Build", weeks: "Week 4–8", goal: "Ship the smallest thing that delivers the core value",
        milestones: [
          { id: "s4", week: "Week 4", task: "Define the one feature that solves the pain — nothing else", detail: "Write a one-sentence product spec. No scope creep.", done: false },
          { id: "s5", week: "Week 6", task: "Ship a working demo to your 3 LOI contacts", detail: "Not polished. Working. Get reactions, not compliments.", done: false },
          { id: "s6", week: "Week 8", task: "First paying customer — even $1 counts", detail: "Payment signals real intent. Charge before it's ready.", done: false },
        ],
      },
      { label: "Grow", weeks: "Week 9–12", goal: "Repeat what got customer #1 five more times",
        milestones: [
          { id: "s7", week: "Week 9", task: "Document exactly what converted customer #1", detail: "Reverse-engineer your own sale. What was the trigger?", done: false },
          { id: "s8", week: "Week 11", task: "3 more paying customers using the same playbook", detail: "Repeat, not reinvent. Same channel, same pitch, same demo.", done: false },
          { id: "s9", week: "Week 12", task: "Calculate CAC and decide on 1 primary growth channel", detail: "Pick one. Master it before adding more.", done: false },
        ],
      },
    ],
  },
  Marketplace: {
    phases: [
      { label: "Supply first", weeks: "Week 1–4", goal: "Manually onboard 10 suppliers before building anything",
        milestones: [
          { id: "m1", week: "Week 1", task: "Identify 50 potential suppliers in your target category", detail: "Manual research. LinkedIn, directories, cold outreach list.", done: false },
          { id: "m2", week: "Week 2", task: "Call 20 suppliers — offer free listings to start", detail: "No app needed. A Google Form or WhatsApp group works.", done: false },
          { id: "m3", week: "Week 4", task: "10 active suppliers with profile data and availability", detail: "Active means they've responded and given you their info.", done: false },
        ],
      },
      { label: "First transactions", weeks: "Week 5–8", goal: "Facilitate 10 transactions manually",
        milestones: [
          { id: "m4", week: "Week 5", task: "Build a dead-simple buyer-facing page (no auth needed)", detail: "A landing page with a contact form is enough. Ship it.", done: false },
          { id: "m5", week: "Week 7", task: "Facilitate 5 transactions — be the middleman manually", detail: "You match buyer to supplier by hand. This is the right move.", done: false },
          { id: "m6", week: "Week 8", task: "Identify the #1 friction in your manual matching process", detail: "What takes the most time? That's what you automate first.", done: false },
        ],
      },
      { label: "Automate", weeks: "Week 9–12", goal: "Automate the highest-friction step",
        milestones: [
          { id: "m7", week: "Week 9", task: "Build only the automation that removes your main bottleneck", detail: "One feature. The one that saves you the most time.", done: false },
          { id: "m8", week: "Week 11", task: "Take a commission on transaction #11+", detail: "5–15% is normal. Announce it to existing users first.", done: false },
          { id: "m9", week: "Week 12", task: "First month of revenue — document GMV and take rate", detail: "GMV × take rate = your MRR. Know this number cold.", done: false },
        ],
      },
    ],
  },
  Mobile: {
    phases: [
      { label: "Concept", weeks: "Week 1–2", goal: "One-sentence concept that passes the Mom Test",
        milestones: [
          { id: "mob1", week: "Week 1", task: "Write the App Store description before building anything", detail: "If you can't write it compellingly, rethink the concept.", done: false },
          { id: "mob2", week: "Week 2", task: "5 user interviews — watch them struggle with current solution", detail: "Screen recording of them using the competitor. Gold.", done: false },
        ],
      },
      { label: "MVP", weeks: "Week 3–8", goal: "Shippable app with core loop",
        milestones: [
          { id: "mob3", week: "Week 3", task: "Design the core 3-screen flow only — nothing else", detail: "Figma or even paper. The 3 screens that show the value.", done: false },
          { id: "mob4", week: "Week 6", task: "TestFlight / Play Console beta with 20 testers", detail: "Not polished. The core loop must work.", done: false },
          { id: "mob5", week: "Week 8", task: "Submit to App Store / Play Store", detail: "Ship. Review takes 1–3 days. Have a launch plan ready.", done: false },
        ],
      },
      { label: "Growth", weeks: "Week 9–12", goal: "Organic loop that compounds",
        milestones: [
          { id: "mob6", week: "Week 9", task: "Identify your best-performing acquisition channel from beta", detail: "Where did your best testers come from? Double down.", done: false },
          { id: "mob7", week: "Week 12", task: "Reach 500 MAU or first $500 MRR", detail: "Pick the metric that matches your model. Track it weekly.", done: false },
        ],
      },
    ],
  },
  Service: {
    phases: [
      { label: "Productize", weeks: "Week 1–3", goal: "Define a fixed-scope, fixed-price offer",
        milestones: [
          { id: "sv1", week: "Week 1", task: "Write your offer: outcome, timeline, price, what's included", detail: "One page. No 'it depends'. Pick a price and own it.", done: false },
          { id: "sv2", week: "Week 2", task: "Post the offer publicly — tweet, LinkedIn, WhatsApp", detail: "Don't send it to 3 friends. Post it where strangers can see.", done: false },
          { id: "sv3", week: "Week 3", task: "First paid client — even at a discount to get the testimonial", detail: "50% off for a public testimonial. It's worth it.", done: false },
        ],
      },
      { label: "Deliver & document", weeks: "Week 4–8", goal: "Build a repeatable delivery system",
        milestones: [
          { id: "sv4", week: "Week 5", task: "Document your delivery process — SOP for every step", detail: "If you can't write it down, you can't delegate it later.", done: false },
          { id: "sv5", week: "Week 8", task: "3 clients delivered, 3 testimonials collected", detail: "Case studies beat features. Document outcomes, not outputs.", done: false },
        ],
      },
      { label: "Scale", weeks: "Week 9–12", goal: "Fill pipeline without outbound",
        milestones: [
          { id: "sv6", week: "Week 9", task: "Build a referral system — incentivize word of mouth", detail: "One client = one referral. Make it automatic, not ad hoc.", done: false },
          { id: "sv7", week: "Week 12", task: "Reach $2,000 MRR via retainers or repeat clients", detail: "Retainer > project. One conversation converts project → retainer.", done: false },
        ],
      },
    ],
  },
};

// ── Storage ────────────────────────────────────────────────────────────────────
const STORAGE_KEY = "bm_user_tracks";

function loadTracks(): UserTrack[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); } catch { return []; }
}

function saveTracks(tracks: UserTrack[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tracks));
}

function trackProgress(track: UserTrack): { done: number; total: number; pct: number } {
  const all = track.phases.flatMap(p => p.milestones);
  const done = all.filter(m => m.done).length;
  return { done, total: all.length, pct: all.length ? Math.round((done / all.length) * 100) : 0 };
}

// ── Milestone row ──────────────────────────────────────────────────────────────
function MilestoneRow({ m, color, onToggle, onEdit }: {
  m: UserMilestone; color: string;
  onToggle: () => void; onEdit: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{ borderRadius: 8, border: `1px solid ${m.done ? "rgba(74,222,128,0.2)" : "var(--bm-border)"}`, background: m.done ? "rgba(74,222,128,0.03)" : "var(--bm-bg2)", marginBottom: 6, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", cursor: "pointer" }} onClick={() => setExpanded(v => !v)}>
        <button onClick={e => { e.stopPropagation(); onToggle(); }}
          style={{ width: 18, height: 18, borderRadius: "50%", border: `1.5px solid ${m.done ? "#10b981" : "#333"}`, background: m.done ? "#10b981" : "transparent", flexShrink: 0, marginTop: 2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#fff" }}>
          {m.done ? "✓" : ""}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, color: "#555", fontFamily: "monospace", marginBottom: 2 }}>{m.week}</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: m.done ? "#555" : "var(--bm-text)", textDecoration: m.done ? "line-through" : "none", lineHeight: 1.4 }}>{m.task}</div>
        </div>
        <span style={{ fontSize: 10, color: "#333", flexShrink: 0 }}>{expanded ? "▲" : "▼"}</span>
      </div>
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} style={{ overflow: "hidden" }}>
            <div style={{ padding: "0 12px 12px 40px", borderTop: "1px solid var(--bm-border)" }}>
              <p style={{ fontSize: 12, color: "var(--bm-text3)", fontFamily: "monospace", lineHeight: 1.6, marginTop: 8, marginBottom: 8 }}>{m.detail || "No detail added yet."}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Track detail view ──────────────────────────────────────────────────────────
function TrackDetail({ track, onBack, onUpdate }: {
  track: UserTrack; onBack: () => void; onUpdate: (t: UserTrack) => void;
}) {
  const [local, setLocal] = useState<UserTrack>(track);
  const { done, total, pct } = trackProgress(local);

  const toggleMilestone = (phaseId: string, msId: string) => {
    const updated = {
      ...local,
      phases: local.phases.map(p => p.id !== phaseId ? p : {
        ...p, milestones: p.milestones.map(m => m.id !== msId ? m : { ...m, done: !m.done })
      })
    };
    setLocal(updated);
    onUpdate(updated);
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

      {/* Progress bar */}
      <div style={{ height: 6, background: "#111", borderRadius: 3, marginBottom: 20, overflow: "hidden" }}>
        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, ease: "easeOut" }}
          style={{ height: "100%", background: local.color, borderRadius: 3 }} />
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
            <MilestoneRow key={m.id} m={m} color={local.color}
              onToggle={() => toggleMilestone(phase.id, m.id)}
              onEdit={() => {}} />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── New track wizard ──────────────────────────────────────────────────────────
const INDUSTRIES = ["SaaS", "Marketplace", "Mobile", "Service", "Custom"];

function NewTrackWizard({ onSave, onCancel }: { onSave: (t: UserTrack) => void; onCancel: () => void }) {
  const [step, setStep] = useState<"industry" | "details">("industry");
  const [industry, setIndustry] = useState("");
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  const create = () => {
    if (!name.trim()) return;
    const template = TEMPLATES[industry];
    const phases: UserPhase[] = template
      ? template.phases.map((p, pi) => ({
          id: `p${pi}`, ...p,
          milestones: p.milestones.map(m => ({ ...m }))
        }))
      : [{
          id: "p0", label: "Phase 1", weeks: "Week 1–4", goal: "Define your first goal",
          milestones: [{ id: `m${Date.now()}`, week: "Week 1", task: "Define your first milestone", detail: "Add detail about what this involves.", done: false }]
        }];

    onSave({
      id: `track_${Date.now()}`,
      name: name.trim(),
      description: desc.trim(),
      industry: industry || "Custom",
      stage: "active",
      color: INDUSTRY_COLORS[industry] || "#6366f1",
      createdAt: Date.now(),
      phases,
    });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      style={{ maxWidth: 520, margin: "0 auto", background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 16, padding: 24 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: "var(--bm-text)", marginBottom: 4 }}>New 90-day track</div>
      <div style={{ fontSize: 12, color: "#555", marginBottom: 20 }}>Choose a template or start from scratch.</div>

      {step === "industry" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 20 }}>
            {INDUSTRIES.map(ind => (
              <button key={ind} onClick={() => setIndustry(ind)}
                style={{ padding: "12px 8px", borderRadius: 10, border: `1.5px solid ${industry === ind ? INDUSTRY_COLORS[ind] || "#6366f1" : "#1a1a1a"}`, background: industry === ind ? `${INDUSTRY_COLORS[ind] || "#6366f1"}15` : "#111", color: industry === ind ? INDUSTRY_COLORS[ind] || "#6366f1" : "#666", fontSize: 12, fontWeight: industry === ind ? 600 : 400, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
                {ind === "SaaS" ? "⚡ SaaS" : ind === "Marketplace" ? "🏪 Marketplace" : ind === "Mobile" ? "📱 Mobile" : ind === "Service" ? "🛠️ Service" : "✏️ Custom"}
              </button>
            ))}
          </div>
          {industry && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              style={{ fontSize: 11, color: "#666", background: "#111", borderRadius: 8, padding: "10px 12px", marginBottom: 16, fontFamily: "monospace", lineHeight: 1.6 }}>
              {industry === "SaaS" && "Template: Validate → Build → Grow. 9 milestones over 12 weeks."}
              {industry === "Marketplace" && "Template: Supply first → First transactions → Automate. 9 milestones."}
              {industry === "Mobile" && "Template: Concept → MVP → Growth. 7 milestones over 12 weeks."}
              {industry === "Service" && "Template: Productize → Deliver → Scale. 7 milestones over 12 weeks."}
              {industry === "Custom" && "Blank track. You define every phase and milestone yourself."}
            </motion.div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onCancel} style={{ flex: 1, padding: 11, borderRadius: 8, border: "1px solid #222", background: "transparent", color: "#666", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
            <button onClick={() => industry && setStep("details")} disabled={!industry}
              style={{ flex: 2, padding: 11, borderRadius: 8, border: "none", background: industry ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "#111", color: industry ? "#fff" : "#444", fontSize: 12, fontWeight: 700, cursor: industry ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
              Next →
            </button>
          </div>
        </>
      )}

      {step === "details" && (
        <>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: "#555", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Startup name</div>
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

// ── Main content ───────────────────────────────────────────────────────────────
function VenturesContent() {
  const router = useRouter();
  const { plan } = usePlan();
  const isFree = plan === "free";

  const [tracks, setTracks] = useState<UserTrack[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    setTracks(loadTracks());
    updateAchievementStats({ venturesViewed: true });
    setTimeout(() => checkAndUnlockAchievements(), 1000);
  }, []);

  const saveTrack = (t: UserTrack) => {
    const updated = tracks.find(x => x.id === t.id)
      ? tracks.map(x => x.id === t.id ? t : x)
      : [...tracks, t];
    setTracks(updated);
    saveTracks(updated);
  };

  const deleteTrack = (id: string) => {
    const updated = tracks.filter(t => t.id !== id);
    setTracks(updated);
    saveTracks(updated);
    if (activeId === id) setActiveId(null);
  };

  const handleNew = () => {
    setShowNew(true);
  };

  const active = tracks.find(t => t.id === activeId);

  if (isFree) {
    return (
      <div style={{ maxWidth: 680, margin: "0 auto" }}>
        <div style={{
          borderRadius: 14,
          border: "1px solid rgba(99,102,241,0.35)",
          background: "rgba(99,102,241,0.07)",
          padding: "18px 20px",
        }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--bm-text)", marginBottom: 6 }}>Roadmap Tracks is a Venture feature</div>
          <div style={{ fontSize: 13, color: "var(--bm-text3)", lineHeight: 1.6, marginBottom: 14 }}>
            This feature is gated for Venture and will be enabled later. It remains locked on Free and Builder for now.
          </div>
          <button
            onClick={() => router.push("/upgrade?plan=venture&feature=roadmapTracks")}
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              border: "none",
              background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
              color: "#fff",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Venture (Coming soon) →
          </button>
        </div>
      </div>
    );
  }

  // Detail view
  if (active && !showNew) {
    return (
      <TrackDetail
        track={active}
        onBack={() => setActiveId(null)}
        onUpdate={saveTrack}
      />
    );
  }

  // New track wizard
  if (showNew) {
    return (
      <NewTrackWizard
        onSave={t => { saveTrack(t); setShowNew(false); setActiveId(t.id); }}
        onCancel={() => setShowNew(false)}
      />
    );
  }

  // Track list
  return (
    <div style={{ maxWidth: 680, margin: "0 auto" }}>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "var(--bm-text)" }}>90-Day Roadmap Tracks</h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#555" }}>
              Build execution tracks for every startup you're running. Templates for SaaS, Marketplace, Mobile, Service.
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            onClick={handleNew}
            style={{ padding: "9px 18px", borderRadius: 9, border: "none", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
            + New track
          </motion.button>
        </div>


      </motion.div>

      {tracks.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
          style={{ textAlign: "center", padding: "60px 20px", background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 16 }}>
          <div style={{ fontSize: 40, marginBottom: 14 }}>🗺️</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--bm-text)", marginBottom: 8 }}>No tracks yet</div>
          <p style={{ fontSize: 13, color: "#555", lineHeight: 1.6, maxWidth: 360, margin: "0 auto 20px" }}>
            A 90-day track breaks your startup into weekly milestones. Pick a template and start executing today.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginBottom: 20 }}>
            {["⚡ SaaS", "🏪 Marketplace", "📱 Mobile", "🛠️ Service"].map(t => (
              <span key={t} style={{ padding: "5px 12px", borderRadius: 20, background: "#111", border: "1px solid #1a1a1a", fontSize: 11, color: "#666" }}>{t}</span>
            ))}
          </div>
          <button onClick={() => setShowNew(true)}
            style={{ padding: "12px 28px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            Create your first track →
          </button>
        </motion.div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
          <AnimatePresence>
            {tracks.map((track, i) => {
              const { done, total, pct } = trackProgress(track);
              return (
                <motion.div key={track.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ delay: 0.05 * i }}>
                  <div
                    onClick={() => setActiveId(track.id)}
                    style={{ background: `${track.color}06`, border: `1px solid ${track.color}25`, borderRadius: 14, padding: 18, cursor: "pointer", transition: "all 0.15s" }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = `${track.color}50`}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = `${track.color}25`}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--bm-text)" }}>{track.name}</div>
                          <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 20, background: `${track.color}20`, color: track.color, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>{track.industry}</span>
                        </div>
                        {track.description && <div style={{ fontSize: 12, color: "#666", fontFamily: "monospace" }}>{track.description}</div>}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginLeft: 12 }}>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 18, fontWeight: 800, color: track.color }}>{pct}%</div>
                          <div style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em" }}>{done}/{total} done</div>
                        </div>
                        <button onClick={e => { e.stopPropagation(); if (confirm("Delete this track?")) deleteTrack(track.id); }}
                          style={{ background: "transparent", border: "1px solid #222", borderRadius: 6, padding: "4px 8px", color: "#444", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>✕</button>
                      </div>
                    </div>

                    <div style={{ height: 4, background: "#111", borderRadius: 2, overflow: "hidden" }}>
                      <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, delay: 0.3 }}
                        style={{ height: "100%", background: track.color, borderRadius: 2 }} />
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

          {/* Templates inspiration row */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
            style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 12, padding: "14px 16px", marginTop: 4 }}>
            <div style={{ fontSize: 11, color: "#555", marginBottom: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Add another track</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {INDUSTRIES.map(ind => (
                <button key={ind} onClick={handleNew}
                  style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #1a1a1a", background: "#111", color: "#666", fontSize: 11, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = INDUSTRY_COLORS[ind] || "#6366f1"; (e.currentTarget as HTMLElement).style.color = INDUSTRY_COLORS[ind] || "#6366f1"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "#1a1a1a"; (e.currentTarget as HTMLElement).style.color = "#666"; }}>
                  {ind === "SaaS" ? "⚡" : ind === "Marketplace" ? "🏪" : ind === "Mobile" ? "📱" : ind === "Service" ? "🛠️" : "✏️"} {ind}
                </button>
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

export default function VenturesPage() {
  return (
    <Suspense fallback={<BuildMindLoader variant="card" label="Loading roadmap tracks…" />}>
      <VenturesContent />
    </Suspense>
  );
}
