"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ACHIEVEMENTS, getUnlocked, type Achievement } from "@/lib/achievements";
import { Trophy, Lock, Star, Zap, Flame, Brain, FolderKanban, Users, Target, Check } from "lucide-react";

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div style={{ height: 4, borderRadius: 99, background: "var(--bm-bg3)", overflow: "hidden", marginTop: 8 }}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        style={{ height: "100%", borderRadius: 99, background: pct === 100 ? "var(--bm-accent)" : "var(--grad-primary)" }}
      />
    </div>
  );
}

function AchievementCard({ a, unlocked, unlockedAt, selected, onSelect }: { a: Achievement; unlocked: boolean; unlockedAt?: string; selected?: boolean; onSelect?: () => void }) {
  const timeAgo = unlockedAt ? (() => {
    const diff = Date.now() - new Date(unlockedAt).getTime();
    const d = Math.floor(diff / 86400000);
    if (d === 0) return "today";
    if (d === 1) return "yesterday";
    if (d < 30) return `${d} days ago`;
    const mo = Math.floor(d / 30);
    return mo === 1 ? "1 month ago" : `${mo} months ago`;
  })() : null;
  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ duration: 0.15 }}
      onClick={onSelect}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onKeyDown={(e) => { if (onSelect && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onSelect(); } }}
      style={{
        background: "var(--bm-bg2)",
        border: `1px solid ${selected ? "var(--bm-accent)" : unlocked ? "var(--bm-accent-bd)" : "var(--bm-border)"}`,
        borderRadius: 14,
        // Consistent padding — no horizontal overflow on small screens
        padding: "14px",
        opacity: unlocked ? 1 : 0.55,
        position: "relative",
        overflow: "hidden", cursor: onSelect ? "pointer" : "default",
        // Ensure card never overflows its grid cell
        minWidth: 0,
        boxSizing: "border-box",
      }}
    >
      {/* Top accent bar */}
      {unlocked && (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "var(--grad-primary)", borderRadius: "14px 14px 0 0" }} />
      )}

      {/* Icon + content — stacked on very narrow cells, row on wider */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        {/* Icon box — fixed size so it never shrinks */}
        <motion.div animate={unlocked ? { boxShadow: ["0 0 0 rgba(232,160,32,0)", "0 0 14px rgba(232,160,32,0.22)", "0 0 0 rgba(232,160,32,0)"] } : undefined} transition={{ duration: 2.8, repeat: Infinity }} style={{
          width: 42, height: 42, minWidth: 42,
          borderRadius: 12, flexShrink: 0,
          background: unlocked ? "var(--bm-accent-dim)" : "var(--bm-bg3)",
          border: `1px solid ${unlocked ? "var(--bm-accent-bd)" : "var(--bm-border)"}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 22,
          filter: unlocked ? "none" : "grayscale(1)",
        }}>
          {unlocked ? ({ streak: <Flame size={21} />, tasks: <Check size={21} />, ai: <Brain size={21} />, projects: <FolderKanban size={21} />, explorer: <Target size={21} />, founder: <Star size={21} />, social: <Users size={21} /> }[a.category] ?? <Trophy size={21} />) : <Lock size={16} color="var(--bm-text3)" />}
        </motion.div>

        {/* Text block — minWidth:0 prevents overflow beyond card edge */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Label row */}
          <div style={{
            display: "flex", flexWrap: "wrap", alignItems: "center",
            gap: "4px 8px", marginBottom: 4,
          }}>
            <div style={{
              fontSize: 12, fontWeight: 700,
              color: unlocked ? "var(--bm-text)" : "var(--bm-text3)",
              // Prevent long label from overflowing
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              maxWidth: "100%",
            }}>
              {a.label}
            </div>
            {unlocked && (
              <span style={{
                fontSize: 8, padding: "2px 6px", borderRadius: 20, flexShrink: 0,
                background: "var(--bm-accent-dim)", color: "var(--bm-accent)",
                border: "1px solid var(--bm-accent-bd)", fontWeight: 700,
                letterSpacing: "0.04em",
              }}>
                UNLOCKED
              </span>
            )}
          </div>
          {/* Description — always wraps, never hides */}
          <div style={{ fontSize: 11, color: "var(--bm-text3)", lineHeight: 1.5, wordBreak: "break-word" }}>
            {a.description}
          </div>
          {/* Unlock timestamp */}
          {unlocked && timeAgo && (
            <div style={{ fontSize: 10, color: "var(--bm-text4)", marginTop: 5 }}>
              Unlocked {timeAgo}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

const CATEGORIES = [
  { id: "all",      label: "All" },
  { id: "streak",   label: "Streak",   icon: <Flame size={11} /> },
  { id: "tasks",    label: "Tasks",    icon: <Zap size={11} /> },
  { id: "ai",       label: "AI",       icon: <Star size={11} /> },
  { id: "projects", label: "Projects", icon: <Trophy size={11} /> },
  { id: "explorer", label: "Explorer", icon: <Trophy size={11} /> },
  { id: "founder",  label: "Founder",  icon: <Trophy size={11} /> },
  { id: "social",   label: "Social",   icon: <Trophy size={11} /> },
];

export default function AchievementsPage() {
  const [all, setAll] = useState<Achievement[]>([]);
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const [unlockedTimestamps, setUnlockedTimestamps] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    setAll(ACHIEVEMENTS);
    // 1. Load from localStorage immediately for instant render
    const local = new Set(getUnlocked().map((a) => a.id));
    setUnlocked(local);

    // 2. Hydrate from server — cross-device truth.
    // FIX: this used to union local into the final displayed set
    // (new Set([...local, ...data.ids])), so a forged localStorage entry
    // (open devtools, write a fake achievement id) would display as
    // unlocked forever, even after real server data arrived — the union
    // never removes anything local that the server doesn't confirm. Server
    // data now REPLACES local once it's in; local is only for the instant
    // optimistic first render before this fetch resolves.
    fetch("/api/achievements")
      .then((r) => r.ok ? r.json() : null)
      .then((data: { ids?: string[]; records?: { achievement_id: string; unlocked_at: string }[] } | null) => {
        if (!data?.ids) return;
        setUnlocked(new Set(data.ids));
        // Store timestamps for display
        const ts: Record<string, string> = {};
        (data.records ?? []).forEach((r) => { ts[r.achievement_id] = r.unlocked_at; });
        setUnlockedTimestamps(ts);
      })
      .catch(() => {});
  }, []);

  const displayed = filter === "all" ? all : all.filter((a) => a.category === filter);
  const unlockedCount = all.filter((a) => unlocked.has(a.id)).length;
  const nextAchievement = all.find((a) => !unlocked.has(a.id));

  return (
    <div style={{ maxWidth: 840, margin: "0 auto", padding: "20px 16px" }}>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 20 }}>
        <div style={{
          display: "flex", alignItems: "flex-start",
          justifyContent: "space-between", gap: 12,
          // Wrap on mobile so counter doesn't crush the title
          flexWrap: "wrap",
        }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--bm-text)", letterSpacing: "-0.03em", margin: "0 0 4px" }}>
              Achievements
            </h1>
            <p style={{ fontSize: 12, color: "var(--bm-text3)", margin: 0 }}>
              Every badge is earned by actually doing the work.
            </p>
          </div>
          <div style={{
            background: "var(--bm-bg2)", border: "1px solid var(--bm-border)",
            borderRadius: 12, padding: "12px 18px", textAlign: "center", flexShrink: 0,
          }}>
            <div style={{ fontSize: 24, fontWeight: 900, color: "var(--bm-accent)", lineHeight: 1 }}>
              {unlockedCount}
              <span style={{ fontSize: 13, color: "var(--bm-text3)", fontWeight: 400 }}>/{all.length}</span>
            </div>
            <div style={{ fontSize: 10, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 4 }}>
              Unlocked
            </div>
          </div>
        </div>
      </motion.div>

      {/* Overall progress */}
      <div style={{
        background: "var(--bm-bg2)", border: "1px solid var(--bm-border)",
        borderRadius: 12, padding: "14px 16px", marginBottom: 16,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: "var(--bm-text2)", fontWeight: 600 }}>Overall Progress</span>
          <span style={{ fontSize: 12, color: "var(--bm-accent)", fontWeight: 700 }}>
            {all.length > 0 ? Math.round((unlockedCount / all.length) * 100) : 0}%
          </span>
        </div>
        <div style={{ height: 6, borderRadius: 99, background: "var(--bm-bg3)", overflow: "hidden" }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${all.length > 0 ? (unlockedCount / all.length) * 100 : 0}%` }}
            transition={{ duration: 1, ease: "easeOut", delay: 0.3 }}
            style={{ height: "100%", borderRadius: 99, background: "var(--grad-primary)" }}
          />
        </div>
      </div>

      {nextAchievement && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16, padding: "14px 16px", border: "1px solid var(--bm-accent-bd)", borderRadius: 10, background: "linear-gradient(90deg, var(--bm-accent-dim), var(--bm-bg2))" }}>
          <motion.div animate={{ scale: [1, 1.06, 1] }} transition={{ duration: 2.4, repeat: Infinity }} style={{ width: 42, height: 42, borderRadius: 10, display: "grid", placeItems: "center", background: "var(--bm-bg3)", color: "var(--bm-accent)", flexShrink: 0 }}><Target size={21} /></motion.div>
          <div style={{ minWidth: 0, flex: 1 }}><span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "var(--bm-accent)", textTransform: "uppercase", letterSpacing: ".08em" }}>Recommended next achievement</span><div style={{ marginTop: 4, fontSize: 14, fontWeight: 700, color: "var(--bm-text)" }}>{nextAchievement.label}</div><div style={{ marginTop: 3, fontSize: 11, color: "var(--bm-text3)" }}>{nextAchievement.description}</div></div>
          <button onClick={() => { setFilter(nextAchievement.category); setSelectedId(nextAchievement.id); }} style={{ flexShrink: 0, border: "1px solid var(--bm-accent-bd)", borderRadius: 6, padding: "7px 10px", background: "var(--bm-accent-dim)", color: "var(--bm-accent)", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>View path →</button>
        </motion.div>
      )}

      {/* Category filters — horizontal scroll on mobile, no wrap clutter */}
      <div style={{
        display: "flex", gap: 6, marginBottom: 16,
        overflowX: "auto", paddingBottom: 4,
        // Hide scrollbar visually but keep scroll functionality
        scrollbarWidth: "none",
        WebkitOverflowScrolling: "touch",
      } as React.CSSProperties}>
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setFilter(cat.id)}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "6px 12px", borderRadius: 20, flexShrink: 0,
              border: `1px solid ${filter === cat.id ? "var(--bm-accent-bd)" : "var(--bm-border)"}`,
              background: filter === cat.id ? "var(--bm-accent-dim)" : "transparent",
              color: filter === cat.id ? "var(--bm-accent)" : "var(--bm-text3)",
              fontSize: 12, fontWeight: filter === cat.id ? 600 : 400,
              cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
              whiteSpace: "nowrap",
            }}
          >
            {cat.icon}
            {cat.label}
          </button>
        ))}
      </div>

      {/* Achievement grid
          - Mobile (<480px): 1 column
          - Tablet+ (≥480px): 2 columns
          CSS grid auto-fit handles this without a JS breakpoint hook.
      */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        gap: 10,
      }}>
        {displayed.map((a, i) => (
          <motion.div
            key={a.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
          >
            <AchievementCard a={a} unlocked={unlocked.has(a.id)} unlockedAt={unlockedTimestamps[a.id]} selected={selectedId === a.id} onSelect={() => setSelectedId(selectedId === a.id ? null : a.id)} />
          </motion.div>
        ))}
      </div>

      {selectedId && (() => { const a = all.find((item) => item.id === selectedId); if (!a) return null; const isUnlocked = unlocked.has(a.id); return (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: 16, padding: "16px 18px", border: "1px solid var(--bm-accent-bd)", borderRadius: 10, background: "var(--bm-bg2)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}><div><span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "var(--bm-accent)", textTransform: "uppercase" }}>{isUnlocked ? "Achievement unlocked" : "Next milestone"}</span><h3 style={{ margin: "6px 0 4px", color: "var(--bm-text)", fontSize: 17 }}>{a.label}</h3><p style={{ margin: 0, color: "var(--bm-text3)", fontSize: 12, lineHeight: 1.5 }}>{a.description}</p></div><button aria-label="Close details" onClick={() => setSelectedId(null)} style={{ border: 0, background: "transparent", color: "var(--bm-text3)", cursor: "pointer", fontSize: 18 }}>×</button></div>
          <div style={{ marginTop: 12, color: "var(--bm-text2)", fontSize: 12 }}>{isUnlocked ? `Earned ${a.xp} XP and added to your founder record.` : "Keep completing real work to unlock this achievement."}</div>
        </motion.div>
      ); })()}

      {displayed.length === 0 && (
        <div style={{ textAlign: "center", padding: "50px 0" }}>
          <Trophy size={30} color="var(--bm-text3)" style={{ margin: "0 auto 12px", display: "block" }} />
          <div style={{ fontSize: 14, color: "var(--bm-text2)", fontWeight: 600, marginBottom: 6 }}>
            No achievements in this category
          </div>
          <div style={{ fontSize: 12, color: "var(--bm-text3)" }}>Try "All" to see everything</div>
        </div>
      )}

      {/* Hide scrollbar on filter row */}
      <style>{`
        div[style*="overflowX: auto"]::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
  }
