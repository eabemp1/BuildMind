"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ACHIEVEMENTS, getUnlocked, type Achievement } from "@/lib/achievements";
import { Trophy, Lock, Star, Zap, Flame } from "lucide-react";

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div style={{ height: 4, borderRadius: 99, background: "var(--bm-bg3)", overflow: "hidden", marginTop: 8 }}>
      <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, ease: "easeOut" }}
        style={{ height: "100%", borderRadius: 99, background: pct === 100 ? "var(--bm-accent)" : "var(--grad-primary)" }} />
    </div>
  );
}

function AchievementCard({ a, unlocked }: { a: Achievement; unlocked: boolean }) {
  return (
    <motion.div whileHover={{ y: -2 }} transition={{ duration: 0.15 }}
      style={{
        background: unlocked ? "var(--bm-bg2)" : "var(--bm-bg2)",
        border: `1px solid ${unlocked ? "var(--bm-accent-bd)" : "var(--bm-border)"}`,
        borderRadius: 16, padding: "20px",
        opacity: unlocked ? 1 : 0.55,
        position: "relative", overflow: "hidden",
      }}>
      {unlocked && (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "var(--grad-primary)", borderRadius: "16px 16px 0 0" }} />
      )}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 14, flexShrink: 0,
          background: unlocked ? "var(--bm-accent-dim)" : "var(--bm-bg3)",
          border: `1px solid ${unlocked ? "var(--bm-accent-bd)" : "var(--bm-border)"}`,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24,
          filter: unlocked ? "none" : "grayscale(1)",
        }}>
          {unlocked ? a.emoji : <Lock size={18} color="var(--bm-text3)" />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: unlocked ? "var(--bm-text)" : "var(--bm-text3)" }}>{a.label}</div>
            {unlocked && (
              <span style={{ fontSize: 9, padding: "1px 7px", borderRadius: 20, background: "var(--bm-accent-dim)", color: "var(--bm-accent)", border: "1px solid var(--bm-accent-bd)", fontWeight: 700 }}>UNLOCKED</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: "var(--bm-text3)", lineHeight: 1.5 }}>{a.description}</div>
        </div>
      </div>
    </motion.div>
  );
}

const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "streak", label: "Streak", icon: <Flame size={11} /> },
  { id: "tasks", label: "Tasks", icon: <Zap size={11} /> },
  { id: "ai", label: "AI", icon: <Star size={11} /> },
  { id: "projects", label: "Projects", icon: <Trophy size={11} /> },
  { id: "explorer", label: "Explorer", icon: <Trophy size={11} /> },
  { id: "founder", label: "Founder", icon: <Trophy size={11} /> },
  { id: "social", label: "Social", icon: <Trophy size={11} /> },
];

export default function AchievementsPage() {
  const [all, setAll] = useState<Achievement[]>([]);
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    setAll(ACHIEVEMENTS);
    setUnlocked(new Set(getUnlocked().map(a => a.id)));
  }, []);

  const displayed = filter === "all" ? all : all.filter(a => a.category === filter);
  const unlockedCount = all.filter(a => unlocked.has(a.id)).length;

  return (
    <div style={{ maxWidth: 840, margin: "0 auto", padding: "28px 24px" }}>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--bm-text)", letterSpacing: "-0.03em", margin: "0 0 4px" }}>Achievements</h1>
            <p style={{ fontSize: 12, color: "var(--bm-text3)", margin: 0 }}>Every badge is earned by actually doing the work.</p>
          </div>
          <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 14, padding: "14px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 26, fontWeight: 900, color: "var(--bm-accent)", lineHeight: 1 }}>{unlockedCount}<span style={{ fontSize: 14, color: "var(--bm-text3)", fontWeight: 400 }}>/{all.length}</span></div>
            <div style={{ fontSize: 10, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 4 }}>Unlocked</div>
          </div>
        </div>
      </motion.div>

      {/* Progress bar */}
      <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 14, padding: "16px 20px", marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: "var(--bm-text2)", fontWeight: 600 }}>Overall Progress</span>
          <span style={{ fontSize: 12, color: "var(--bm-accent)", fontWeight: 700 }}>{all.length > 0 ? Math.round((unlockedCount / all.length) * 100) : 0}%</span>
        </div>
        <div style={{ height: 6, borderRadius: 99, background: "var(--bm-bg3)", overflow: "hidden" }}>
          <motion.div initial={{ width: 0 }} animate={{ width: `${all.length > 0 ? (unlockedCount / all.length) * 100 : 0}%` }} transition={{ duration: 1, ease: "easeOut", delay: 0.3 }}
            style={{ height: "100%", borderRadius: 99, background: "var(--grad-primary)" }} />
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        {CATEGORIES.map(cat => (
          <button key={cat.id} onClick={() => setFilter(cat.id)}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 14px", borderRadius: 20, border: `1px solid ${filter === cat.id ? "var(--bm-accent-bd)" : "var(--bm-border)"}`, background: filter === cat.id ? "var(--bm-accent-dim)" : "transparent", color: filter === cat.id ? "var(--bm-accent)" : "var(--bm-text3)", fontSize: 12, fontWeight: filter === cat.id ? 600 : 400, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
            {cat.icon}
            {cat.label}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
        {displayed.map((a, i) => (
          <motion.div key={a.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <AchievementCard a={a} unlocked={unlocked.has(a.id)} />
          </motion.div>
        ))}
      </div>

      {displayed.length === 0 && (
        <div style={{ textAlign: "center", padding: "50px 0" }}>
          <Trophy size={30} color="var(--bm-text3)" style={{ margin: "0 auto 12px", display: "block" }} />
          <div style={{ fontSize: 14, color: "var(--bm-text2)", fontWeight: 600, marginBottom: 6 }}>No achievements in this category</div>
          <div style={{ fontSize: 12, color: "var(--bm-text3)" }}>Try "All" to see everything</div>
        </div>
      )}
    </div>
  );
}
