"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ACHIEVEMENTS, getUnlocked, getAchievementTracks, getTrackLevel, getProgressState,
  type Achievement, type AchievementStats, type AchievementTrack,
} from "@/lib/achievements";
import { Trophy, Lock, Star, Zap, Flame } from "lucide-react";

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

function AchievementCard({ a, unlocked, unlockedAt, stats }: { a: Achievement; unlocked: boolean; unlockedAt?: string; stats: AchievementStats | null }) {
  const timeAgo = unlockedAt ? (() => {
    const diff = Date.now() - new Date(unlockedAt).getTime();
    const d = Math.floor(diff / 86400000);
    if (d === 0) return "today";
    if (d === 1) return "yesterday";
    if (d < 30) return `${d} days ago`;
    const mo = Math.floor(d / 30);
    return mo === 1 ? "1 month ago" : `${mo} months ago`;
  })() : null;
  const prog = !unlocked && stats && a.progress ? a.progress(stats) : null;
  const cardState = getProgressState(unlocked, prog);
  const isNearlyThere = cardState === "nearly_there";
  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ duration: 0.15 }}
      style={{
        background: "var(--bm-bg2)",
        border: `1px solid ${unlocked ? "var(--bm-accent-bd)" : isNearlyThere ? "var(--bm-amber, #d9a441)" : "var(--bm-border)"}`,
        borderRadius: 14,
        // Consistent padding — no horizontal overflow on small screens
        padding: "14px",
        opacity: unlocked ? 1 : isNearlyThere ? 0.85 : 0.55,
        position: "relative",
        overflow: "hidden",
        // Ensure card never overflows its grid cell
        minWidth: 0,
        boxSizing: "border-box",
      }}
    >
      {/* Top accent bar */}
      {unlocked && (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "var(--grad-primary)", borderRadius: "14px 14px 0 0" }} />
      )}
      {isNearlyThere && (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "var(--bm-amber, #d9a441)", borderRadius: "14px 14px 0 0" }} />
      )}

      {/* Icon + content — stacked on very narrow cells, row on wider */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        {/* Icon box — fixed size so it never shrinks. Uses real badge
            artwork once badgeImage is set on an achievement; emoji is the
            fallback for every achievement that doesn't have one yet. */}
        <div style={{
          width: 42, height: 42, minWidth: 42,
          borderRadius: 12, flexShrink: 0,
          background: unlocked ? "var(--bm-accent-dim)" : "var(--bm-bg3)",
          border: `1px solid ${unlocked ? "var(--bm-accent-bd)" : "var(--bm-border)"}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 22, overflow: "hidden",
          filter: unlocked ? "none" : "grayscale(1)",
        }}>
          {unlocked
            ? (a.badgeImage
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={a.badgeImage} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : a.emoji)
            : <Lock size={16} color="var(--bm-text3)" />}
        </div>

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
          {/* Real progress toward this achievement — only for locked
              achievements with a numeric threshold; one-off actions (no
              progress accessor) stay a plain lock, no fake bar. */}
          {prog && (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: isNearlyThere ? "var(--bm-amber, #d9a441)" : "var(--bm-text4)", marginBottom: 2 }}>
                <span>{isNearlyThere ? "Almost there!" : "Progress"}</span>
                <span className="bm-data">{Math.min(prog.current, prog.target)}/{prog.target}</span>
              </div>
              <ProgressBar value={prog.current} max={prog.target} />
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/** One leveled card for a whole track (e.g. all 6 streak_* achievements) —
 *  "Level 3 of 6", a progress bar toward the next tier, and what that next
 *  tier actually requires. Replaces N separate cards with one that reads
 *  the way Founder Mirror's skill levels already do, for consistency. */
function TrackCard({ track, stats, unlocked }: { track: AchievementTrack; stats: AchievementStats | null; unlocked: Set<string> }) {
  const { level, isMaxed, next, progress } = getTrackLevel(track, stats ?? EMPTY_STATS, unlocked);
  const top = track.achievements[track.achievements.length - 1];
  const display = isMaxed ? top : next!;
  const isNearlyThere = !isMaxed && progress ? progress.current / progress.target >= 0.8 : false;

  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ duration: 0.15 }}
      style={{
        background: "var(--bm-bg2)",
        border: `1px solid ${level > 0 ? "var(--bm-accent-bd)" : isNearlyThere ? "var(--bm-amber, #d9a441)" : "var(--bm-border)"}`,
        borderRadius: 14, padding: "14px", position: "relative", overflow: "hidden", minWidth: 0, boxSizing: "border-box",
      }}
    >
      {level > 0 && (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "var(--grad-primary)", borderRadius: "14px 14px 0 0" }} />
      )}
      {level === 0 && isNearlyThere && (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "var(--bm-amber, #d9a441)", borderRadius: "14px 14px 0 0" }} />
      )}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{
          width: 42, height: 42, minWidth: 42, borderRadius: 12, flexShrink: 0,
          background: level > 0 ? "var(--bm-accent-dim)" : "var(--bm-bg3)",
          border: `1px solid ${level > 0 ? "var(--bm-accent-bd)" : "var(--bm-border)"}`,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
          filter: level > 0 ? "none" : "grayscale(1)",
        }}>
          {level > 0 ? track.achievements[level - 1].emoji : <Lock size={16} color="var(--bm-text3)" />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 8px", marginBottom: 4 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: level > 0 ? "var(--bm-text)" : "var(--bm-text3)" }}>
              {display.label}
            </div>
            <span style={{
              fontSize: 8, padding: "2px 6px", borderRadius: 20, flexShrink: 0,
              background: "var(--bm-bg3)", color: "var(--bm-text3)",
              border: "1px solid var(--bm-border)", fontWeight: 700, letterSpacing: "0.04em",
            }}>
              LEVEL {level} / {track.achievements.length}
            </span>
          </div>
          <div style={{ fontSize: 11, color: "var(--bm-text3)", lineHeight: 1.5 }}>
            {display.description}
          </div>
          {progress && !isMaxed && (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: isNearlyThere ? "var(--bm-amber, #d9a441)" : "var(--bm-text4)", marginBottom: 2 }}>
                <span>{isNearlyThere ? `Almost there! Next: ${next!.label}` : `Next: ${next!.label}`}</span>
                <span className="bm-data">{Math.min(progress.current, progress.target)}/{progress.target}</span>
              </div>
              <ProgressBar value={progress.current} max={progress.target} />
            </div>
          )}
          {isMaxed && (
            <div style={{ fontSize: 10, color: "var(--bm-accent)", marginTop: 6, fontWeight: 700 }}>Track complete</div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

const EMPTY_STATS: AchievementStats = {
  streak: 0, maxStreak: 0, checkInsDone: 0, aiMessages: 0, projectsCreated: 0,
  reflectionsLogged: 0, planUpgraded: false, venturesViewed: false,
  breakMyStartupUsed: false, reportViewed: false, shareUsed: false, daysActive: 0,
};

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
  const [stats, setStats] = useState<AchievementStats | null>(null);
  const [filter, setFilter] = useState("all");
  // "Level Up!" celebration — the 5th real card state. Driven by the
  // bm_achievement_unlocked event lib/achievements.ts already dispatches
  // from Today/Reflect/AI Coach/Break My Startup/Ventures/Owner — nothing
  // was ever listening for it anywhere in the app before this.
  const [justUnlocked, setJustUnlocked] = useState<Achievement[]>([]);

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
      .then((data: { ids?: string[]; records?: { achievement_id: string; unlocked_at: string }[]; stats?: AchievementStats } | null) => {
        if (!data?.ids) return;
        setUnlocked(new Set(data.ids));
        // Store timestamps for display
        const ts: Record<string, string> = {};
        (data.records ?? []).forEach((r) => { ts[r.achievement_id] = r.unlocked_at; });
        setUnlockedTimestamps(ts);
        if (data.stats) setStats(data.stats);
      })
      .catch(() => {});

    const onUnlock = (e: Event) => {
      const detail = (e as CustomEvent<{ newlyUnlocked?: Achievement[] }>).detail;
      const fresh = detail?.newlyUnlocked ?? [];
      if (fresh.length === 0) return;
      setUnlocked((prev) => new Set([...prev, ...fresh.map((a) => a.id)]));
      setJustUnlocked(fresh);
      setTimeout(() => setJustUnlocked([]), 5000);
    };
    window.addEventListener("bm_achievement_unlocked", onUnlock);
    return () => window.removeEventListener("bm_achievement_unlocked", onUnlock);
  }, []);

  const { tracks, standalone } = getAchievementTracks();
  const displayedTracks = filter === "all" ? tracks : tracks.filter((t) => t.category === filter);
  const displayedStandalone = filter === "all" ? standalone : standalone.filter((a) => a.category === filter);
  const unlockedCount = all.filter((a) => unlocked.has(a.id)).length;

  return (
    <div style={{ maxWidth: 840, margin: "0 auto", padding: "20px 16px" }}>

      {/* "Level Up!" — the 5th real card state, only rendered when a real
          unlock event fires while this page is open. Auto-dismisses after
          5s; also just tapable to dismiss early. */}
      <AnimatePresence>
        {justUnlocked.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            onClick={() => setJustUnlocked([])}
            style={{
              marginBottom: 16, padding: "14px 16px", borderRadius: 14, cursor: "pointer",
              background: "var(--bm-accent-dim, rgba(232,197,71,0.08))",
              border: "1px solid var(--bm-accent-bd, rgba(232,197,71,0.3))",
              display: "flex", alignItems: "center", gap: 12,
            }}
          >
            <div style={{ fontSize: 24, flexShrink: 0 }}>{justUnlocked[0].emoji}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "var(--bm-accent)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Level up!
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--bm-text)" }}>
                {justUnlocked.map((a) => a.label).join(", ")}
              </div>
              <div style={{ fontSize: 11, color: "var(--bm-text3)" }}>
                {justUnlocked.length === 1 ? justUnlocked[0].description : `${justUnlocked.length} achievements unlocked`}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
          Tracks (mini-achievement ladders, e.g. all streak tiers) render as
          one leveled card each; everything else renders standalone as before.
      */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        gap: 10,
      }}>
        {displayedTracks.map((t, i) => (
          <motion.div
            key={t.track}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
          >
            <TrackCard track={t} stats={stats} unlocked={unlocked} />
          </motion.div>
        ))}
        {displayedStandalone.map((a, i) => (
          <motion.div
            key={a.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: (displayedTracks.length + i) * 0.04 }}
          >
            <AchievementCard a={a} unlocked={unlocked.has(a.id)} unlockedAt={unlockedTimestamps[a.id]} stats={stats} />
          </motion.div>
        ))}
      </div>

      {displayedTracks.length === 0 && displayedStandalone.length === 0 && (
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
