"use client";

/**
 * /my-ventures — PRIVATE ADMIN PAGE
 *
 * Only accessible when the logged-in user is marked is_admin in profiles
 * (verified server-side via /api/system/admin-check). Everyone else is
 * redirected to /today.
 *
 * This is NOT a feature for other BuildMind users.
 * Other users get their own venture roadmaps at /ventures (generated from
 * their own onboarding data). This page shows YOUR 4 private roadmaps.
 *
 * Setup: promote your user with an is_admin flag in Supabase.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { VENTURE_TRACKS, type VentureTrack, type VentureMilestone } from "@/lib/ventures";

// ─── Types ────────────────────────────────────────────────────────────────────
type DoneMap = Record<string, boolean>;

// ─── Milestone card ───────────────────────────────────────────────────────────
const TYPE_COLORS: Record<string, string> = {
  action: "#6366f1", research: "#8b5cf6", legal: "#f59e0b",
  money: "#10b981", security: "#ef4444",
};
const TYPE_LABELS: Record<string, string> = {
  action: "⚡ Action", research: "📚 Research", legal: "⚖️ Legal",
  money: "💰 Revenue", security: "🔒 Security",
};

function MilestoneCard({
  m, done, onToggle,
}: { m: VentureMilestone; done: DoneMap; onToggle: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const isDone = !!done[m.id];

  return (
    <div style={{
      borderRadius: 10, border: `1px solid ${isDone ? "rgba(16,185,129,0.2)" : "#1a1a1a"}`,
      background: isDone ? "rgba(16,185,129,0.03)" : "#0d0d0d",
      opacity: isDone ? 0.65 : 1, transition: "all 0.2s",
    }}>
      <div style={{ padding: "12px 14px", cursor: "pointer" }} onClick={() => setExpanded(!expanded)}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <button onClick={e => { e.stopPropagation(); onToggle(m.id); }}
            style={{
              width: 20, height: 20, borderRadius: "50%", flexShrink: 0, marginTop: 1,
              border: `1px solid ${isDone ? "#10b981" : TYPE_COLORS[m.type] ?? "#444"}`,
              background: isDone ? "#10b981" : "transparent",
              color: isDone ? "#fff" : "transparent",
              fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.15s",
            }}>
            {isDone ? "✓" : ""}
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
              <span style={{
                fontSize: 9, padding: "2px 7px", borderRadius: 99,
                background: `${TYPE_COLORS[m.type]}18`,
                border: `1px solid ${TYPE_COLORS[m.type]}30`,
                color: TYPE_COLORS[m.type],
              }}>{TYPE_LABELS[m.type] ?? m.type}</span>
              <span style={{ fontSize: 10, color:"var(--bm-text4)" }}>{m.week}</span>
            </div>
            <div style={{
              fontSize: 13, color: isDone ? "#555" : "#e5e5e5", fontWeight: 500,
              textDecoration: isDone ? "line-through" : "none", lineHeight: 1.4,
            }}>{m.task}</div>
          </div>
          <div style={{ fontSize: 10, color:"var(--bm-text4)", flexShrink: 0 }}>{expanded ? "▲" : "▼"}</div>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }}
            style={{ overflow: "hidden" }}>
            <div style={{ padding: "0 14px 14px 44px", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 12, color:"var(--bm-text2)", lineHeight: 1.6 }}>{m.detail}</div>
              <div style={{
                fontSize: 11, color: "#f59e0b", background: "rgba(245,158,11,0.06)",
                border: "1px solid rgba(245,158,11,0.15)", borderRadius: 7, padding: "8px 10px", lineHeight: 1.5,
              }}>
                <span style={{ fontWeight: 600 }}>Enforcement: </span>{m.enforcement}
              </div>
              {m.papers && m.papers.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, color:"var(--bm-text4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Read</div>
                  {m.papers.map((p, i) => (
                    <div key={i} style={{ fontSize: 11, color: "#8b5cf6", marginBottom: 3 }}>📄 {p}</div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Venture detail view ──────────────────────────────────────────────────────
function VentureDetail({
  venture, done, onToggle, onBack,
}: { venture: VentureTrack; done: DoneMap; onToggle: (vid: string, mid: string) => void; onBack: () => void }) {
  const allMilestones = venture.phases.flatMap(p => p.milestones);
  const completedCount = allMilestones.filter(m => done[m.id]).length;
  const pct = allMilestones.length > 0 ? Math.round((completedCount / allMilestones.length) * 100) : 0;

  return (
    <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{
          background: "transparent", border:"1px solid var(--bm-border2)", color:"var(--bm-text3)",
          fontSize: 12, padding: "5px 12px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit",
        }}>← Back</button>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: venture.color }} />
            <span style={{ fontSize: 16, fontWeight: 600, color: "#fff" }}>{venture.name}</span>
            <span style={{
              fontSize: 9, background: venture.status === "active" ? "rgba(16,185,129,0.1)" : "rgba(99,102,241,0.1)",
              color: venture.status === "active" ? "#34d399" : "#818cf8",
              border: `1px solid ${venture.status === "active" ? "rgba(16,185,129,0.2)" : "rgba(99,102,241,0.2)"}`,
              borderRadius: 99, padding: "2px 8px",
            }}>{venture.status}</span>
          </div>
          <div style={{ fontSize: 11, color:"var(--bm-text3)", marginTop: 2 }}>{venture.tagline}</div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ background:"var(--bm-bg2)", border:"1px solid var(--bm-border)", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 11, color:"var(--bm-text3)" }}>Milestone progress</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: venture.color }}>{pct}% · {completedCount}/{allMilestones.length}</span>
        </div>
        <div style={{ height: 4, background:"var(--bm-bg4)", borderRadius: 99, overflow: "hidden" }}>
          <motion.div
            initial={{ width: 0 }} animate={{ width: `${pct}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            style={{ height: "100%", background: venture.color, borderRadius: 99 }} />
        </div>
      </div>

      {/* Solo-first note */}
      <div style={{
        fontSize: 12, color:"var(--bm-text3)", background: "rgba(99,102,241,0.04)", border: "1px solid rgba(99,102,241,0.12)",
        borderRadius: 10, padding: "12px 14px", marginBottom: 16, lineHeight: 1.6,
      }}>{venture.soloFirstNote}</div>

      {/* Revenue model */}
      <div style={{ background:"var(--bm-bg2)", border:"1px solid var(--bm-border)", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
        <div style={{ fontSize: 10, color:"var(--bm-text4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Revenue model</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {venture.revenueModel.map((r, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color:"var(--bm-text3)" }}>{r.label}</span>
              <span style={{ color: "#10b981", fontWeight: 500 }}>{r.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Phases + milestones */}
      {venture.phases.map(phase => (
        <div key={phase.id} style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{ width: 3, height: 16, borderRadius: 99, background: phase.color }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color:"var(--bm-text)" }}>{phase.label}</div>
              <div style={{ fontSize: 10, color:"var(--bm-text4)" }}>{phase.weeks} · {phase.goal}</div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {phase.milestones.map(m => (
              <MilestoneCard key={m.id} m={m} done={done} onToggle={mid => onToggle(venture.id, mid)} />
            ))}
          </div>
        </div>
      ))}
    </motion.div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function MyVenturesPage() {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [selected, setSelected] = useState<VentureTrack | null>(null);
  const [done, setDone] = useState<DoneMap>({});

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch("/api/system/admin-check");
        const json = await res.json();
        if (!json.isAdmin) {
          router.replace("/today");
          return;
        }
      } catch {
        router.replace("/today");
        return;
      }
      setAuthed(true);

      // Load persisted done state
      if (typeof window !== "undefined") {
        try {
          const saved = localStorage.getItem("bm_my_ventures_done");
          if (saved) setDone(JSON.parse(saved) as DoneMap);
        } catch { /* ignore */ }
      }
    };
    void check();
  }, [router]);

  const toggleMilestone = (ventureId: string, milestoneId: string) => {
    setDone(prev => {
      const next = { ...prev, [milestoneId]: !prev[milestoneId] };
      if (typeof window !== "undefined") {
        localStorage.setItem("bm_my_ventures_done", JSON.stringify(next));
      }
      return next;
    });
  };

  if (!authed) {
    return <div style={{ minHeight: "100vh", background:"var(--bm-bg3)" }} />;
  }

  // Stats across all ventures
  const allMilestones = VENTURE_TRACKS.flatMap(v => v.phases.flatMap(p => p.milestones));
  const totalDone = allMilestones.filter(m => done[m.id]).length;
  const activeVenture = VENTURE_TRACKS.find(v => v.status === "active");
  const activeDone = activeVenture
    ? activeVenture.phases.flatMap(p => p.milestones).filter(m => done[m.id]).length
    : 0;
  const activeTotal = activeVenture
    ? activeVenture.phases.flatMap(p => p.milestones).length
    : 0;

  return (
    <div style={{
      minHeight: "100vh", background:"var(--bm-bg3)", fontFamily: "system-ui,sans-serif",
      color:"var(--bm-text)", padding: "24px 20px", maxWidth: 720, margin: "0 auto",
    }}>

      {/* Header */}
      <div style={{ marginBottom: 24, paddingBottom: 16, borderBottom: "1px solid #1c1c1c" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <div style={{ fontSize: 19, fontWeight: 600, color: "#fff", letterSpacing: "-0.02em" }}>My Ventures</div>
          <span style={{
            fontSize: 9, background: "rgba(239,68,68,0.1)", color: "#f87171",
            border: "1px solid rgba(239,68,68,0.2)", borderRadius: 99, padding: "2px 8px",
          }}>Private · Admin only</span>
        </div>
        <div style={{ fontSize: 12, color:"var(--bm-text4)" }}>Your personal execution roadmap. Not visible to any other BuildMind user.</div>
      </div>

      <AnimatePresence mode="wait">
        {selected ? (
          <VentureDetail
            key="detail"
            venture={selected}
            done={done}
            onToggle={toggleMilestone}
            onBack={() => setSelected(null)}
          />
        ) : (
          <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>

            {/* Summary stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 20 }}>
              {[
                { label: "Active venture", value: activeVenture?.name ?? "—", color:"var(--bm-text)" },
                { label: "Active progress", value: `${activeDone}/${activeTotal}`, color: "#10b981" },
                { label: "Total milestones done", value: String(totalDone), color: "#6366f1" },
              ].map(s => (
                <div key={s.label} style={{
                  background:"var(--bm-bg2)", border:"1px solid var(--bm-border)", borderRadius: 10,
                  padding: "12px 14px", textAlign: "center",
                }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 10, color:"var(--bm-text4)", marginTop: 3 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Venture cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {VENTURE_TRACKS.map(v => {
                const vMilestones = v.phases.flatMap(p => p.milestones);
                const vDone = vMilestones.filter(m => done[m.id]).length;
                const vPct = vMilestones.length > 0 ? Math.round((vDone / vMilestones.length) * 100) : 0;

                return (
                  <motion.div key={v.id}
                    whileHover={{ borderColor: v.status === "locked" ? "#1a1a1a" : "#333" }}
                    onClick={() => v.status !== "locked" && setSelected(v)}
                    style={{
                      background:"var(--bm-bg2)",
                      border:"1px solid var(--bm-border)",
                      borderRadius: 12, padding: "16px",
                      cursor: v.status === "locked" ? "default" : "pointer",
                      opacity: v.status === "locked" ? 0.5 : 1,
                      transition: "border-color 0.15s",
                    }}>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: v.color, flexShrink: 0 }} />
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>{v.name}</div>
                          <div style={{ fontSize: 10, color:"var(--bm-text3)", marginTop: 1 }}>{v.tag} · {v.month}</div>
                        </div>
                      </div>
                      <span style={{
                        fontSize: 9, borderRadius: 99, padding: "2px 8px",
                        background: v.status === "active" ? "rgba(16,185,129,0.1)" : v.status === "upcoming" ? "rgba(99,102,241,0.1)" : "rgba(255,255,255,0.04)",
                        color: v.status === "active" ? "#34d399" : v.status === "upcoming" ? "#818cf8" : "#444",
                        border: `1px solid ${v.status === "active" ? "rgba(16,185,129,0.2)" : v.status === "upcoming" ? "rgba(99,102,241,0.2)" : "#1c1c1c"}`,
                      }}>{v.status}</span>
                    </div>

                    <div style={{ fontSize: 11, color:"var(--bm-text3)", marginBottom: 12, lineHeight: 1.5 }}>{v.tagline}</div>

                    {/* Stats row */}
                    <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
                      {v.stats.map(s => (
                        <div key={s.label}>
                          <div style={{ fontSize: 12, fontWeight: 600, color:"var(--bm-text2)" }}>{s.value}</div>
                          <div style={{ fontSize: 10, color:"var(--bm-text4)" }}>{s.label}</div>
                        </div>
                      ))}
                    </div>

                    {/* Progress bar */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ flex: 1, height: 3, background:"var(--bm-bg4)", borderRadius: 99, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${vPct}%`, background: v.color, borderRadius: 99, transition: "width 0.4s ease" }} />
                      </div>
                      <span style={{ fontSize: 10, color:"var(--bm-text4)", flexShrink: 0 }}>{vDone}/{vMilestones.length} milestones</span>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Privacy note */}
            <div style={{ marginTop: 24, padding: "12px 14px", background: "rgba(239,68,68,0.03)", border: "1px solid rgba(239,68,68,0.08)", borderRadius: 8 }}>
              <div style={{ fontSize: 11, color:"var(--bm-text3)", lineHeight: 1.6 }}>
                This page is only accessible from your account. Other BuildMind users are redirected to /today if they try to access /my-ventures. Their venture roadmaps are generated from their own onboarding data at /ventures — completely separate from yours.
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
