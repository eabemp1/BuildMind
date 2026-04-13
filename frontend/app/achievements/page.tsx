"use client";

/**
 * app/achievements/page.tsx — Badge Collection Page
 *
 * Duolingo × Free Fire styled achievement showcase.
 * Shows locked/unlocked state, XP, level, rarity tiers.
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  ACHIEVEMENTS, getUnlocked, getTotalXP, getAchievementStats, xpToLevel,
  RARITY_COLORS, RARITY_LABELS,
  type Achievement, type AchievementRarity, type AchievementCategory,
} from "@/lib/achievements";

const CATEGORY_LABELS: Record<AchievementCategory, string> = {
  streak: "🔥 Streak", tasks: "✅ Tasks", ai: "🤖 AI Coach", projects: "📁 Projects",
  social: "📣 Social", explorer: "🧭 Explorer", founder: "👑 Founder",
};

const RARITY_ORDER: AchievementRarity[] = ["legendary", "epic", "rare", "common"];

function BadgeCard({ achievement, unlocked, unlockedAt }: {
  achievement: Achievement;
  unlocked: boolean;
  unlockedAt?: number;
}) {
  const [hovered, setHovered] = useState(false);
  const colors = RARITY_COLORS[achievement.rarity];
  const isSecret = achievement.secret && !unlocked;

  return (
    <motion.div
      whileHover={{ scale: 1.04, y: -2 }}
      whileTap={{ scale: 0.97 }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      style={{
        position: "relative",
        background: unlocked ? colors.bg : "#0a0a0a",
        border: `1.5px solid ${unlocked ? colors.border : "#1a1a1a"}`,
        borderRadius: 14,
        padding: "16px 14px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        cursor: "default",
        overflow: "hidden",
        opacity: unlocked ? 1 : 0.45,
        transition: "all 0.2s",
        boxShadow: unlocked && hovered ? `0 8px 24px ${colors.glow}` : "none",
      }}
    >
      {/* Rarity stripe at top */}
      {unlocked && (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: colors.border, opacity: 0.8 }} />
      )}

      {/* Rarity badge */}
      <div style={{
        position: "absolute", top: 8, right: 8,
        fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em",
        color: unlocked ? colors.text : "#333",
        padding: "2px 5px", borderRadius: 4,
        background: unlocked ? `${colors.border}40` : "transparent",
      }}>
        {RARITY_LABELS[achievement.rarity]}
      </div>

      {/* Emoji */}
      <motion.div
        animate={unlocked ? { scale: [1, 1.12, 1] } : {}}
        transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
        style={{
          fontSize: isSecret ? 28 : 32,
          filter: isSecret ? "blur(6px) grayscale(1)" : (unlocked ? "none" : "grayscale(1) brightness(0.3)"),
          lineHeight: 1,
        }}
      >
        {isSecret ? "❓" : achievement.emoji}
      </motion.div>

      {/* Name */}
      <div style={{
        fontSize: 12, fontWeight: 600, textAlign: "center", lineHeight: 1.3,
        color: unlocked ? "#fff" : "#333",
      }}>
        {isSecret ? "???" : achievement.label}
      </div>

      {/* Desc */}
      <div style={{
        fontSize: 10, textAlign: "center", lineHeight: 1.4,
        color: unlocked ? "#888" : "#222",
      }}>
        {isSecret ? "Keep playing to discover this" : achievement.description}
      </div>

      {/* XP badge */}
      <div style={{
        fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 20,
        background: unlocked ? `${colors.border}30` : "#111",
        color: unlocked ? colors.text : "#333",
        marginTop: 2,
      }}>
        {unlocked ? `+${achievement.xp} XP` : `${achievement.xp} XP`}
      </div>

      {/* Unlocked date */}
      {unlocked && unlockedAt && (
        <div style={{ fontSize: 9, color: "#444", marginTop: -4 }}>
          {new Date(unlockedAt).toLocaleDateString()}
        </div>
      )}
    </motion.div>
  );
}

function XPBar({ xp, level, title, progress, nextXp }: { xp: number; level: number; title: string; progress: number; nextXp: number }) {
  return (
    <div style={{ background: "#0f0f0f", border: "1px solid #1e1e1e", borderRadius: 16, padding: "20px 24px", marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10, background: "#1a0f3d",
              border: "2px solid #7c3aed", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, fontWeight: 800, color: "#a78bfa",
            }}>
              {level}
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{title}</div>
              <div style={{ fontSize: 11, color: "#666" }}>Level {level} Founder</div>
            </div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#a78bfa" }}>{xp.toLocaleString()} XP</div>
          <div style={{ fontSize: 11, color: "#555" }}>→ {nextXp.toLocaleString()} XP for Lv.{level + 1}</div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 8, background: "#1a1a1a", borderRadius: 4, overflow: "hidden" }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 1, ease: "easeOut", delay: 0.3 }}
          style={{ height: "100%", background: "linear-gradient(90deg, #6366f1, #a78bfa)", borderRadius: 4 }}
        />
      </div>
      <div style={{ fontSize: 10, color: "#555", marginTop: 4, textAlign: "right" }}>{progress}%</div>
    </div>
  );
}

export default function AchievementsPage() {
  const router = useRouter();
  const [unlockedMap, setUnlockedMap] = useState<Map<string, number>>(new Map());
  const [filter, setFilter] = useState<AchievementCategory | "all">("all");
  const [rarityFilter, setRarityFilter] = useState<AchievementRarity | "all">("all");
  const [xp, setXp] = useState(0);
  const [levelInfo, setLevelInfo] = useState({ level: 1, title: "Aspiring Founder", nextXp: 200, progress: 0 });

  useEffect(() => {
    const unlocked = getUnlocked();
    const map = new Map(unlocked.map(u => [u.id, u.unlockedAt]));
    setUnlockedMap(map);
    const totalXp = getTotalXP();
    setXp(totalXp);
    setLevelInfo(xpToLevel(totalXp));
  }, []);

  const categories = ["all", ...Object.keys(CATEGORY_LABELS)] as (AchievementCategory | "all")[];
  const rarities: (AchievementRarity | "all")[] = ["all", ...RARITY_ORDER];

  const filtered = ACHIEVEMENTS.filter(a => {
    if (filter !== "all" && a.category !== filter) return false;
    if (rarityFilter !== "all" && a.rarity !== rarityFilter) return false;
    return true;
  });

  // Sort: unlocked first, then by rarity (legendary > epic > rare > common)
  const sorted = [...filtered].sort((a, b) => {
    const aUnlocked = unlockedMap.has(a.id) ? 1 : 0;
    const bUnlocked = unlockedMap.has(b.id) ? 1 : 0;
    if (aUnlocked !== bUnlocked) return bUnlocked - aUnlocked;
    return RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity);
  });

  const unlockedCount = ACHIEVEMENTS.filter(a => unlockedMap.has(a.id)).length;
  const stats = getAchievementStats();

  return (
    <div style={{ minHeight: "100vh", background: "var(--bm-bg)", color: "var(--bm-text)", fontFamily: "system-ui, sans-serif", padding: "24px 16px", maxWidth: 800, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button onClick={() => router.back()}
          style={{ background: "transparent", border: "1px solid #222", borderRadius: 8, padding: "6px 12px", color: "#666", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
          ← Back
        </button>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#fff" }}>🏆 Achievements</h1>
          <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{unlockedCount} / {ACHIEVEMENTS.length} unlocked</div>
        </div>
      </div>

      {/* XP bar */}
      <XPBar xp={xp} {...levelInfo} />

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 24 }}>
        {[
          { label: "Streak", value: `${stats.streak}d 🔥` },
          { label: "Actions", value: stats.tasksDone },
          { label: "Badges", value: `${unlockedCount}/${ACHIEVEMENTS.length}` },
        ].map(s => (
          <div key={s.label} style={{ background: "#0f0f0f", border: "1px solid #1e1e1e", borderRadius: 12, padding: "12px", textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>{s.value}</div>
            <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Rarity filter */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {rarities.map(r => {
          const c = r !== "all" ? RARITY_COLORS[r] : null;
          const active = rarityFilter === r;
          return (
            <button key={r} onClick={() => setRarityFilter(r)}
              style={{
                padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer",
                fontFamily: "inherit", transition: "all 0.15s",
                background: active ? (c?.border ?? "#333") : "#111",
                border: `1px solid ${active ? (c?.border ?? "#444") : "#222"}`,
                color: active ? (c?.text ?? "#fff") : "#555",
              }}>
              {r === "all" ? "All Rarity" : RARITY_LABELS[r]}
            </button>
          );
        })}
      </div>

      {/* Category filter */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
        {categories.map(cat => (
          <button key={cat} onClick={() => setFilter(cat)}
            style={{
              padding: "5px 12px", borderRadius: 20, fontSize: 11, cursor: "pointer",
              fontFamily: "inherit", transition: "all 0.15s",
              background: filter === cat ? "#1a1a3a" : "#111",
              border: `1px solid ${filter === cat ? "#3b3b7a" : "#222"}`,
              color: filter === cat ? "#a78bfa" : "#555",
              fontWeight: filter === cat ? 600 : 400,
            }}>
            {cat === "all" ? "🎯 All" : CATEGORY_LABELS[cat as AchievementCategory]}
          </button>
        ))}
      </div>

      {/* Badge grid */}
      <motion.div layout style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
        <AnimatePresence>
          {sorted.map(a => (
            <motion.div key={a.id} layout initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.85 }}>
              <BadgeCard
                achievement={a}
                unlocked={unlockedMap.has(a.id)}
                unlockedAt={unlockedMap.get(a.id)}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>

      {filtered.length === 0 && (
        <div style={{ textAlign: "center", color: "#333", padding: "40px 0" }}>No badges in this category yet.</div>
      )}
    </div>
  );
}
