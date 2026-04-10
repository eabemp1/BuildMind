"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Suspense } from "react";
import Link from "next/link";
import { VENTURE_TRACKS, VENTURE_TIMELINE, COMBINED_REVENUE, type VentureMilestone, type VentureTrack } from "@/lib/ventures";
import { getPlan, canAccess } from "@/lib/plan";

// ─── Type colours ────────────────────────────────────────────────
const TYPE_COLORS: Record<string, string> = {
  action: "#6366f1", research: "#8b5cf6", legal: "#f59e0b", money: "#10b981", security: "#ef4444",
};
const TYPE_LABELS: Record<string, string> = {
  action: "⚡ Action", research: "📚 Research", legal: "⚖️ Legal", money: "💰 Revenue", security: "🔒 Security",
};

// ─── Milestone card ───────────────────────────────────────────────
function MilestoneCard({ m, done, onToggle }: { m: VentureMilestone; done: Set<string>; onToggle: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const isDone = done.has(m.id);

  return (
    <div className={`rounded-xl border transition-all ${isDone ? "border-green-500/20 bg-green-500/5 opacity-70" : "border-[var(--bm-border)] bm-bg2"}`}>
      <div className="p-4 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-start gap-3">
          <button onClick={(e) => { e.stopPropagation(); onToggle(m.id); }}
            className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 mt-0.5 text-[10px] transition-all cursor-pointer ${isDone ? "bg-green-500 border-green-500 bm-text" : "border-white/20 text-transparent hover:border-white/40"}`}
            style={{ background: isDone ? "#10b981" : "transparent" }}>✓</button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium font-mono"
                style={{ background: `${TYPE_COLORS[m.type]}20`, color: TYPE_COLORS[m.type] }}>{TYPE_LABELS[m.type]}</span>
              <span className="text-[10px] bm-text3 font-mono">{m.week}</span>
            </div>
            <div className={`text-[13px] font-semibold leading-snug ${isDone ? "bm-text3 line-through" : "bm-text"}`}>{m.task}</div>
          </div>
          <span className="bm-text3 text-xs flex-shrink-0 ml-2">{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} style={{ overflow: "hidden" }}>
            <div className="px-4 pb-4 border-t border-[var(--bm-border)] pt-3 space-y-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider bm-text3 mb-1.5 font-mono">What to do</div>
                <p className="text-[12px] bm-text2 leading-relaxed font-mono">{m.detail}</p>
              </div>
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                <div className="text-[10px] uppercase tracking-wider text-amber-400 mb-1 font-mono">🔒 Enforcement</div>
                <p className="text-[11px] bm-text2 leading-relaxed font-mono">{m.enforcement}</p>
              </div>
              {m.papers && m.papers.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider bm-text3 mb-1.5 font-mono">📚 Research to read</div>
                  {m.papers.map((p) => (
                    <div key={p} className="flex items-start gap-2 text-[11px] text-indigo-400 font-mono py-0.5">
                      <span className="flex-shrink-0 mt-0.5">→</span><span>{p}</span>
                    </div>
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

// ─── Venture Detail ────────────────────────────────────────────────
function VentureDetail({ venture, done, onToggle, onBack }: {
  venture: VentureTrack; done: Set<string>; onToggle: (id: string) => void; onBack: () => void;
}) {
  const [activePhase, setActivePhase] = useState(venture.phases[0]?.id ?? "");
  const allMs = venture.phases.flatMap((p) => p.milestones);
  const doneCount = allMs.filter((m) => done.has(m.id)).length;
  const totalMs = allMs.length;
  const pct = totalMs ? Math.round((doneCount / totalMs) * 100) : 0;
  const phase = venture.phases.find((p) => p.id === activePhase);

  if (venture.phases.length === 0) {
    return (
      <div>
        <button onClick={onBack} className="bm-text3 hover:text-zinc-300 text-sm transition mb-4 flex items-center gap-2 bg-transparent border-none cursor-pointer font-mono" style={{ fontFamily: "inherit" }}>← Back</button>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-bold bm-text mb-2">{venture.name}</h1>
          <p className="text-sm bm-text2 leading-relaxed font-mono mb-4">{venture.tagline}</p>
          <div className="rounded-xl border border-[var(--bm-border)] bm-bg2 p-5 mb-4">
            <div className="text-[10px] uppercase tracking-wider bm-text3 mb-3 font-mono">Coming {venture.month}</div>
            <p className="text-[12px] bm-text2 leading-relaxed font-mono mb-4">{venture.soloFirstNote}</p>
            <div className="text-[10px] uppercase tracking-wider bm-text3 mb-2 font-mono">💰 Revenue model</div>
            <div className="space-y-1">
              {venture.revenueModel.map((r) => (
                <div key={r.label} className="flex justify-between text-[11px] font-mono border-b border-[var(--bm-border)] pb-1.5">
                  <span className="bm-text3">{r.label}</span>
                  <span className="bm-text font-semibold">{r.value}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="text-[11px] bm-text3 font-mono">This track unlocks automatically when you complete the previous venture's Month 3 milestones. Focus on SafeRemit first.</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#080808]/95 backdrop-blur border-b border-[var(--bm-border)] -mx-4 px-4 py-3 mb-4">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="bm-text3 hover:text-zinc-300 text-sm transition bg-transparent border-none cursor-pointer font-mono" style={{ fontFamily: "inherit" }}>← Back</button>
            <div className="w-px h-4 bg-white/10" />
            <div>
              <div className="text-sm font-semibold">{venture.name}</div>
              <div className="text-[10px] bm-text3 font-mono">{venture.month} · {doneCount}/{totalMs} done</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-[10px] text-indigo-400 font-mono">{pct}%</div>
            <div className="w-20 h-1.5 bg-white/5 rounded-full overflow-hidden">
              <motion.div className="h-full rounded-full" style={{ background: venture.color }} animate={{ width: `${pct}%` }} transition={{ duration: 0.5 }} />
            </div>
          </div>
        </div>
      </div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        {/* Solo-first note */}
        <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4 mb-5">
          <div className="text-[10px] uppercase tracking-wider font-mono mb-1.5" style={{ color: venture.color }}>🚀 Solo-first strategy</div>
          <p className="text-[12px] bm-text2 leading-relaxed font-mono">{venture.soloFirstNote}</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 mb-5">
          {venture.stats.map((s) => (
            <div key={s.label} className="rounded-lg border border-[var(--bm-border)] bm-bg2 p-3 text-center">
              <div className="text-lg font-bold mb-0.5" style={{ color: venture.color }}>{s.value}</div>
              <div className="text-[10px] bm-text3 font-mono">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Phase tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 mb-4">
          {venture.phases.map((p) => {
            const pd = p.milestones.filter((m) => done.has(m.id)).length;
            const isA = activePhase === p.id;
            return (
              <button key={p.id} onClick={() => setActivePhase(p.id)}
                className="flex-shrink-0 rounded-lg px-3 py-2 text-[11px] font-semibold transition-all border cursor-pointer"
                style={{
                  background: isA ? `${p.color}30` : "transparent",
                  borderColor: isA ? `${p.color}50` : "rgba(255,255,255,0.08)",
                  color: isA ? p.color : "#71717a",
                  fontFamily: "inherit",
                }}>
                <div>{p.label}</div>
                <div className="text-[9px] font-normal opacity-70 mt-0.5">{p.weeks} · {pd}/{p.milestones.length}</div>
              </button>
            );
          })}
        </div>

        {/* Phase milestones */}
        <AnimatePresence mode="wait">
          {phase && (
            <motion.div key={phase.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="text-[11px] bm-text3 mb-3 font-mono">{phase.label} — {phase.goal}</div>
              <div className="space-y-3">
                {phase.milestones.map((m) => (
                  <MilestoneCard key={m.id} m={m} done={done} onToggle={onToggle} />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Revenue model */}
        <div className="mt-6 rounded-xl border border-green-500/20 bg-green-500/5 p-5">
          <div className="text-[10px] uppercase tracking-wider text-green-400 font-semibold mb-3 font-mono">💰 Revenue model</div>
          <div className="space-y-1.5">
            {venture.revenueModel.map((r) => (
              <div key={r.label} className="flex justify-between text-xs font-mono border-b border-[var(--bm-border)] pb-2">
                <span className="bm-text3">{r.label}</span>
                <span className="bm-text font-semibold">{r.value}</span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────
function VenturesContent() {
  const router = useRouter();
  const params = useSearchParams();
  const plan = getPlan();
  const hasAccess = canAccess("ventures", plan);
  const [activeVenture, setActiveVenture] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());

  const toggle = (id: string) => setDone((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const venture = VENTURE_TRACKS.find((v) => v.id === activeVenture);

  if (!hasAccess) {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="text-4xl mb-4">🗺️</div>
          <h1 className="text-xl font-bold bm-text mb-3">Venture Tracks — Builder Plan</h1>
          <p className="text-sm bm-text2 leading-relaxed mb-6 font-mono">
            Four 90-day execution roadmaps for SafeRemit, MediChain, SkillLedger, and EldercareOS.
            Daily actions, enforcement checkpoints, research papers, and revenue milestones.
            All designed to be started solo — no partnerships needed.
          </p>
          <div className="space-y-2 mb-6 text-left">
            {["SafeRemit — $800B remittance market, fraud-proof delivery", "MediChain — 3.8B unlinked patients, free passport tool first", "SkillLedger — $5/credential, no employer partnership needed", "EldercareOS — diaspora families, $19/mo subscription"].map((f) => (
              <div key={f} className="flex items-start gap-2 text-sm bm-text2 font-mono">
                <span className="text-teal-400 flex-shrink-0 mt-0.5">+</span>{f}
              </div>
            ))}
          </div>
          <button onClick={() => router.push("/upgrade?plan=builder")}
            className="w-full py-3 rounded-xl text-sm font-bold bm-text cursor-pointer border-none"
            style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", fontFamily: "inherit" }}>
            Upgrade to Builder — $19/mo →
          </button>
          <button onClick={() => router.push("/upgrade?plan=builder")}
            className="mt-3 w-full py-3 rounded-xl text-xs bm-text3 cursor-pointer border border-[var(--bm-border2)] bg-transparent font-mono"
            style={{ fontFamily: "inherit" }}>
            Preview tracks in dev mode →
          </button>
        </motion.div>
      </div>
    );
  }

  if (venture) {
    return (
      <div className="max-w-2xl mx-auto">
        <VentureDetail venture={venture} done={done} onToggle={toggle} onBack={() => setActiveVenture(null)} />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <h1 className="text-2xl font-bold bm-text mb-2">Venture Portfolio</h1>
        <p className="text-sm bm-text2 leading-relaxed font-mono max-w-xl">
          Four high-impact startups. One by one. Each solo-first — no partnerships needed to start. Each one funds the next.
          Combined MRR target: <span className="bm-text font-semibold">$6,440/month by Month 10.</span>
        </p>
      </motion.div>

      {/* MRR Projection */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
        className="rounded-xl border border-[var(--bm-border)] bm-bg2 p-4 mb-5">
        <div className="text-[10px] uppercase tracking-wider bm-text3 mb-3 font-mono">Combined MRR projection</div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] font-mono" style={{ minWidth: 400 }}>
            <thead>
              <tr>
                {["Month", "SafeRemit", "MediChain", "SkillLedger", "EldercareOS", "Total"].map((h, i) => (
                  <th key={h} className={`pb-2 text-left font-medium ${i === 0 ? "bm-text3" : i === 5 ? "bm-text" : "bm-text3"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMBINED_REVENUE.map((row) => (
                <tr key={row.month} className="border-t border-[var(--bm-border)]">
                  <td className="py-2 bm-text3">{row.month}</td>
                  <td className="py-2" style={{ color: "#5dd4c8" }}>{row.saferemit}</td>
                  <td className="py-2" style={{ color: "#a080f0" }}>{row.medichain}</td>
                  <td className="py-2" style={{ color: "#e0b84a" }}>{row.skillledger}</td>
                  <td className="py-2" style={{ color: "#5dd4c8" }}>{row.eldercareos}</td>
                  <td className="py-2 font-bold bm-text">{row.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Track cards */}
      <div className="space-y-3 mb-6">
        {VENTURE_TRACKS.map((v, i) => {
          const pct = v.status === "active" ? Math.round((v.dayN / v.totalDays) * 100) : 0;
          const allMs = v.phases.flatMap((p) => p.milestones);
          const doneCount = allMs.filter((m) => done.has(m.id)).length;

          return (
            <motion.div key={v.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }}>
              <div
                className={`rounded-2xl border p-5 cursor-pointer transition-all hover:border-opacity-60 ${v.status === "locked" ? "opacity-45 cursor-default" : ""}`}
                style={{
                  background: `${v.color}06`,
                  borderColor: v.status === "active" ? `${v.color}30` : "rgba(255,255,255,0.06)",
                }}
                onClick={() => v.status !== "locked" && setActiveVenture(v.id)}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-base font-bold bm-text">{v.name}</span>
                      <span className={`text-[9px] px-2 py-0.5 rounded-full font-mono font-semibold ${v.status === "active" ? "bg-green-500/20 text-green-400" : v.status === "upcoming" ? "bg-indigo-500/20 text-indigo-400" : "bg-white/5 bm-text3"}`}>
                        {v.status === "active" ? `Active · Day ${v.dayN}/${v.totalDays}` : v.status === "upcoming" ? `${v.month} · Upcoming` : `${v.month} · Locked`}
                      </span>
                    </div>
                    <div className="text-[10px] uppercase tracking-wider bm-text3 font-mono mb-1">{v.tag}</div>
                    <div className="text-[13px] bm-text2 font-mono">{v.tagline}</div>
                  </div>
                  {v.status !== "locked" && <span className="bm-text3 text-sm ml-4 flex-shrink-0">→</span>}
                </div>

                <div className="flex gap-4 mb-3">
                  {v.stats.map((s) => (
                    <div key={s.label}>
                      <div className="text-[13px] font-bold mb-0.5" style={{ color: v.color }}>{s.value}</div>
                      <div className="text-[10px] bm-text3 font-mono">{s.label}</div>
                    </div>
                  ))}
                </div>

                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <motion.div className="h-full rounded-full" style={{ background: v.color }}
                    initial={{ width: 0 }} animate={{ width: v.status === "active" ? `${pct}%` : "0%" }}
                    transition={{ duration: 0.8, delay: 0.3 + i * 0.05 }} />
                </div>
                {v.status === "active" && allMs.length > 0 && (
                  <div className="text-[10px] bm-text3 mt-1 font-mono">
                    Day {v.dayN}/{v.totalDays} · {doneCount}/{allMs.length} milestones checked
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Timeline */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
        className="rounded-xl border border-[var(--bm-border)] bm-bg2 p-5 mb-5">
        <div className="text-[10px] uppercase tracking-wider bm-text3 mb-4 font-mono">Execution timeline</div>
        <div className="relative pl-5">
          <div className="absolute left-2 top-0 bottom-0 w-px bg-white/8" />
          <div className="space-y-5">
            {VENTURE_TIMELINE.map((t, i) => (
              <div key={t.month} className="relative">
                <div className="absolute -left-3 top-1.5 w-3 h-3 rounded-full border-2 flex-shrink-0"
                  style={{ borderColor: t.color, background: i === 0 ? t.color : "#0a0a0a" }} />
                <div className="text-[9px] font-mono bm-text3 mb-0.5">{t.month}</div>
                <div className="text-[13px] font-semibold mb-0.5" style={{ color: t.color }}>{t.name}</div>
                <div className="text-[11px] bm-text3 leading-relaxed font-mono">{t.focus}</div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Venture-plan locked features */}
      {plan === "builder" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }}
          className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-5 mb-5">
          <div className="flex items-center justify-between mb-4">
            <div className="text-[10px] uppercase tracking-wider text-purple-400 font-semibold font-mono">✦ Venture Plan — unlock more</div>
            <button onClick={() => router.push("/upgrade?plan=venture")}
              className="text-[10px] text-purple-400 border border-purple-500/30 rounded-full px-3 py-1 font-mono cursor-pointer bg-transparent hover:bg-purple-500/10 transition">
              Upgrade — $49/mo →
            </button>
          </div>
          <div className="space-y-3">
            {[
              { icon: "🗂️", title: "Multi-project portfolio dashboard", desc: "Run all four ventures from a single command centre. Cross-project metrics, resource allocation, and combined MRR view." },
              { icon: "📑", title: "Investor pitch deck generator", desc: "AI-generated, data-driven pitch deck from your actual project milestones, scores, and metrics. Export-ready PDF." },
            ].map((f) => (
              <div key={f.title} className="flex items-start gap-3 rounded-lg border border-purple-500/10 bg-black/20 p-3">
                <span className="text-lg flex-shrink-0">{f.icon}</span>
                <div>
                  <div className="text-[12px] font-semibold bm-text2 flex items-center gap-2">
                    {f.title}
                    <span className="text-[9px] text-purple-400 border border-purple-500/30 rounded-full px-2 py-0.5 font-mono">Venture only</span>
                  </div>
                  <div className="text-[11px] bm-text3 mt-0.5 font-mono leading-relaxed">{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Solo-first rules */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
        className="rounded-xl border border-[var(--bm-border)] bm-bg2 p-5">
        <div className="text-[10px] uppercase tracking-wider bm-text3 mb-4 font-mono">The solo-first rules</div>
        <div className="space-y-3">
          {[
            { rule: "Users before institutions", detail: "You earn partnerships by showing up with 50–500 users. Not a pitch deck." },
            { rule: "One venture at a time", detail: "Complete Month 1–2 of SafeRemit before touching MediChain. Context-switching kills solo founders." },
            { rule: "BuildMind tracks enforcement", detail: "Every milestone has a proof requirement. No fake 'done' — upload the evidence." },
            { rule: "Revenue from Day 1 thinking", detail: "Every venture monetizes before you have a single institutional partner." },
          ].map((p) => (
            <div key={p.rule} className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0 mt-1.5" />
              <div>
                <div className="text-[12px] font-semibold bm-text">{p.rule}</div>
                <div className="text-[11px] bm-text3 mt-0.5 leading-relaxed font-mono">{p.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

export default function VenturesPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-60"><div className="text-sm bm-text3 font-mono">Loading ventures...</div></div>}>
      <VenturesContent />
    </Suspense>
  );
}
