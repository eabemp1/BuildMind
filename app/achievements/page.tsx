"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion, useMotionValue, useSpring } from "framer-motion";
import {
  ACHIEVEMENTS, RARITY_COLORS, RARITY_LABELS, getUnlocked, getAchievementTracks, getTrackLevel,
  getProgressState, xpToLevel,
  type Achievement, type AchievementStats, type AchievementTrack,
} from "@/lib/achievements";
import { Trophy, Lock, EyeOff, Sparkles, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useFounderScorecardQuery } from "@/lib/queries";
import AchievementMascot from "@/components/achievements/AchievementMascot";
import ConfettiBurst from "@/components/achievements/ConfettiBurst";

const EMPTY_STATS: AchievementStats = {
  streak: 0, maxStreak: 0, checkInsDone: 0, aiMessages: 0, projectsCreated: 0,
  reflectionsLogged: 0, planUpgraded: false, venturesViewed: false,
  breakMyStartupUsed: false, reportViewed: false, shareUsed: false, daysActive: 0,
};

const CATEGORIES: { id: string; label: string }[] = [
  { id: "all", label: "All" },
  { id: "streak", label: "Streak" },
  { id: "tasks", label: "Tasks" },
  { id: "ai", label: "AI" },
  { id: "projects", label: "Projects" },
  { id: "explorer", label: "Explorer" },
  { id: "founder", label: "Founder" },
  { id: "social", label: "Social" },
];

/** Where to go to actually earn a category — turns the page from a trophy
 *  shelf into a to-do list. */
const CATEGORY_HREF: Record<string, string> = {
  streak: "/today", tasks: "/today", ai: "/ai-coach", projects: "/projects",
  explorer: "/ventures", founder: "/founder-mirror", social: "/today",
};

function timeAgo(iso?: string): string | null {
  if (!iso) return null;
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (Number.isNaN(d)) return null;
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 30) return `${d} days ago`;
  const mo = Math.floor(d / 30);
  return mo === 1 ? "1 month ago" : `${mo} months ago`;
}

/** Animates a number toward its target (e.g. XP ticking up after an unlock). */
function useCountUp(target: number, ms = 900): number {
  const reduce = useReducedMotion();
  const [v, setV] = useState(0);
  const cur = useRef(0);
  useEffect(() => {
    if (reduce) { cur.current = target; setV(target); return; }
    const from = cur.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      cur.current = Math.round(from + (target - from) * e);
      setV(cur.current);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, reduce]);
  return v;
}

/** Scroll-reveal with a spring, plus a subtle 3D tilt and light sheen that follow a mouse pointer. */
function TiltCard({ index, children }: { index: number; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const srx = useSpring(rx, { stiffness: 220, damping: 18 });
  const sry = useSpring(ry, { stiffness: 220, damping: 18 });
  const onMove = (e: React.PointerEvent) => {
    if (reduce || e.pointerType !== "mouse" || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    ry.set((px - 0.5) * 9);
    rx.set(-(py - 0.5) * 9);
    ref.current.style.setProperty("--gx", `${px * 100}%`);
    ref.current.style.setProperty("--gy", `${py * 100}%`);
  };
  const onLeave = () => { rx.set(0); ry.set(0); };
  return (
    <motion.div
      ref={ref}
      className="ach-tilt"
      initial={reduce ? false : { opacity: 0, y: 26, scale: 0.95 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{ type: "spring", stiffness: 210, damping: 22, delay: (index % 3) * 0.07 }}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      style={{ rotateX: srx, rotateY: sry, transformPerspective: 900 }}
    >
      {children}
    </motion.div>
  );
}

function Bar({ pct, color = "var(--bm-accent)", h = 5 }: { pct: number; color?: string; h?: number }) {
  const reduce = useReducedMotion();
  return (
    <div style={{ height: h, borderRadius: 99, background: "var(--bm-bg3)", overflow: "hidden" }}>
      <motion.div
        initial={{ width: reduce ? `${pct}%` : 0 }}
        whileInView={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        viewport={{ once: true }}
        transition={{ duration: reduce ? 0 : 0.9, ease: "easeOut" }}
        style={{ height: "100%", borderRadius: 99, background: color, position: "relative", overflow: "hidden" }}
      >
        {pct > 0 && pct < 100 && <span className="ach-shimmer" />}
      </motion.div>
    </div>
  );
}

function Medal({ emoji, badgeImage, state, rarity, secretLocked }: {
  emoji: string; badgeImage?: string; state: "unlocked" | "progress" | "locked";
  rarity: Achievement["rarity"]; secretLocked?: boolean;
}) {
  const rc = RARITY_COLORS[rarity];
  const on = state === "unlocked";
  return (
    <div
      aria-hidden
      className={on ? `ach-medal ach-medal-on${rarity === "legendary" || rarity === "epic" ? " ach-aura" : ""}` : "ach-medal"}
      style={{
        ["--aura" as string]: rc.glow,
        width: 52, height: 52, minWidth: 52, borderRadius: 16, flexShrink: 0, overflow: "hidden",
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26,
        background: on ? rc.bg : "var(--bm-bg3)",
        border: `1px solid ${on ? rc.border : "var(--bm-border)"}`,
        boxShadow: on ? `0 0 18px ${rc.glow}` : "none",
        filter: state === "progress" ? "grayscale(0.7)" : undefined,
      }}
    >
      {on ? (
        badgeImage
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={badgeImage} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : emoji
      ) : secretLocked ? <EyeOff size={18} color="var(--bm-text4)" />
        : state === "progress" ? <span style={{ opacity: 0.55 }}>{emoji}</span>
        : <Lock size={17} color="var(--bm-text4)" />}
    </div>
  );
}

function RarityChip({ rarity, xp }: { rarity: Achievement["rarity"]; xp: number }) {
  const rc = RARITY_COLORS[rarity];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--bm-text3)" }}>
      <span style={{ width: 7, height: 7, borderRadius: 99, background: rc.text }} />
      {RARITY_LABELS[rarity]}
      <span className="bm-data" style={{ color: "var(--bm-text4)" }}>+{xp} XP</span>
    </span>
  );
}

function AchievementCard({ a, unlocked, unlockedAt, stats }: {
  a: Achievement; unlocked: boolean; unlockedAt?: string; stats: AchievementStats | null;
}) {
  const prog = !unlocked && stats && a.progress ? a.progress(stats) : null;
  const cardState = getProgressState(unlocked, prog);
  const near = cardState === "nearly_there";
  const secretLocked = !!a.secret && !unlocked;
  const ago = timeAgo(unlockedAt);
  const rc = RARITY_COLORS[a.rarity];
  return (
    <div
      className="ach-card"
      data-state={cardState}
      style={{
        borderColor: unlocked ? rc.border : near ? "var(--bm-amber, #d9a441)" : "var(--bm-border)",
        boxShadow: unlocked ? `inset 0 1px 0 ${rc.glow}` : "none",
      }}
    >
      <Medal emoji={a.emoji} badgeImage={a.badgeImage} rarity={a.rarity}
        state={unlocked ? "unlocked" : prog ? "progress" : "locked"} secretLocked={secretLocked} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: unlocked ? "var(--bm-text)" : "var(--bm-text2)" }}>
            {secretLocked ? "Secret achievement" : a.label}
          </h3>
          {unlocked && ago && <span style={{ fontSize: 11, color: "var(--bm-text4)", flexShrink: 0 }}>{ago}</span>}
        </div>
        <p style={{ fontSize: 13, color: "var(--bm-text3)", lineHeight: 1.5, margin: "3px 0 8px" }}>
          {secretLocked ? "Keep building. This one reveals itself when you earn it." : a.description}
        </p>
        {prog && !secretLocked && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5,
              color: near ? "var(--bm-amber, #d9a441)" : "var(--bm-text3)" }}>
              <span>{near ? "Almost there" : "In progress"}</span>
              <span className="bm-data">{Math.min(prog.current, prog.target)} / {prog.target}</span>
            </div>
            <Bar pct={(prog.current / prog.target) * 100} color={near ? "var(--bm-amber, #d9a441)" : "var(--grad-primary, var(--bm-accent))"} />
          </div>
        )}
        <RarityChip rarity={a.rarity} xp={a.xp} />
      </div>
    </div>
  );
}

function TrackCard({ track, stats, unlocked }: { track: AchievementTrack; stats: AchievementStats | null; unlocked: Set<string> }) {
  const { level, isMaxed, next, progress } = getTrackLevel(track, stats ?? EMPTY_STATS, unlocked);
  const tiers = track.achievements;
  const shown = isMaxed ? tiers[tiers.length - 1] : next!;
  const heldTier = level > 0 ? tiers[level - 1] : null;
  const secretNext = !isMaxed && !!next?.secret;
  const near = !isMaxed && progress ? progress.current / progress.target >= 0.8 : false;
  const rc = RARITY_COLORS[(heldTier ?? shown).rarity];
  return (
    <div
      className="ach-card ach-track"
      data-state={isMaxed ? "unlocked" : near ? "nearly_there" : level > 0 ? "in_progress" : "locked"}
      style={{ borderColor: level > 0 ? rc.border : near ? "var(--bm-amber, #d9a441)" : "var(--bm-border)" }}
    >
      <div style={{ display: "flex", gap: 14 }}>
        <Medal emoji={(heldTier ?? shown).emoji} badgeImage={heldTier?.badgeImage} rarity={(heldTier ?? shown).rarity}
          state={level > 0 ? "unlocked" : progress ? "progress" : "locked"} secretLocked={level === 0 && secretNext} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: level > 0 ? "var(--bm-text)" : "var(--bm-text2)" }}>
              {isMaxed ? shown.label : secretNext ? "Secret tier" : shown.label}
            </h3>
            <span className="bm-data" style={{ fontSize: 12, color: "var(--bm-text3)", flexShrink: 0 }}>
              Level {level}/{tiers.length}
            </span>
          </div>
          <p style={{ fontSize: 13, color: "var(--bm-text3)", lineHeight: 1.5, margin: "3px 0 8px" }}>
            {secretNext ? "The final tier stays hidden until you reach it." : shown.description}
          </p>
        </div>
      </div>

      {/* Tier ladder: every step visible, earned ones filled */}
      <div style={{ display: "flex", gap: 4, margin: "2px 0 10px" }} aria-label={`${level} of ${tiers.length} tiers earned`}>
        {tiers.map((t, ti) => (
          <div key={t.id} title={t.secret && !unlocked.has(t.id) ? "Secret" : t.label}
            style={{ flex: 1, height: 5, borderRadius: 99, background: "var(--bm-bg3)", overflow: "hidden" }}>
            {unlocked.has(t.id) && (
              <motion.div
                initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.2 + ti * 0.15, ease: "easeOut" }}
                style={{ height: "100%", background: RARITY_COLORS[t.rarity].text, transformOrigin: "left" }} />
            )}
          </div>
        ))}
      </div>

      {progress && !isMaxed && !secretNext && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5,
            color: near ? "var(--bm-amber, #d9a441)" : "var(--bm-text3)" }}>
            <span>{near ? "Almost there" : "Next tier"}</span>
            <span className="bm-data">{Math.min(progress.current, progress.target)} / {progress.target}</span>
          </div>
          <Bar pct={(progress.current / progress.target) * 100} color={near ? "var(--bm-amber, #d9a441)" : "var(--grad-primary, var(--bm-accent))"} />
        </div>
      )}
      {isMaxed
        ? <span style={{ fontSize: 12, color: "var(--bm-accent)", fontWeight: 600 }}>Track complete</span>
        : <RarityChip rarity={shown.rarity} xp={shown.xp} />}
    </div>
  );
}

export default function AchievementsPage() {
  const reduce = useReducedMotion();
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const [timestamps, setTimestamps] = useState<Record<string, string>>({});
  const [stats, setStats] = useState<AchievementStats | null>(null);
  const [filter, setFilter] = useState("all");
  const [justUnlocked, setJustUnlocked] = useState<Achievement[]>([]);
  const [mascotSize, setMascotSize] = useState(132);
  useEffect(() => {
    const q = window.matchMedia("(max-width: 560px)");
    const apply = () => setMascotSize(q.matches ? 96 : 132);
    apply();
    q.addEventListener("change", apply);
    return () => q.removeEventListener("change", apply);
  }, []);
  const [cheerKey, setCheerKey] = useState(0);
  const [confettiKey, setConfettiKey] = useState(0);
  const [ringPulse, setRingPulse] = useState(0);
  const [serverReady, setServerReady] = useState(false);
  const { data: scorecard } = useFounderScorecardQuery();
  const [levelUp, setLevelUp] = useState<{ level: number; title: string } | null>(null);
  const prevLevel = useRef<number | null>(null);
  const [tapLine, setTapLine] = useState<string | null>(null);

  useEffect(() => {
    // Instant optimistic render from local, then server replaces it (a forged
    // local entry can never survive the server response).
    setUnlocked(new Set(getUnlocked().map((a) => a.id)));
    fetch("/api/achievements")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { ids?: string[]; records?: { achievement_id: string; unlocked_at: string }[]; stats?: AchievementStats } | null) => {
        if (!data?.ids) return;
        setUnlocked(new Set(data.ids));
        const ts: Record<string, string> = {};
        (data.records ?? []).forEach((r) => { ts[r.achievement_id] = r.unlocked_at; });
        setTimestamps(ts);
        if (data.stats) setStats(data.stats);
        setServerReady(true);
      })
      .catch(() => {});

    let timer: ReturnType<typeof setTimeout> | undefined;
    const onUnlock = (e: Event) => {
      const fresh = (e as CustomEvent<{ newlyUnlocked?: Achievement[] }>).detail?.newlyUnlocked ?? [];
      if (fresh.length === 0) return;
      setUnlocked((prev) => new Set([...prev, ...fresh.map((a) => a.id)]));
      setJustUnlocked(fresh);
      setCheerKey((k) => k + 1);
      setConfettiKey((k) => k + 1);
      setRingPulse((k) => k + 1);
      clearTimeout(timer);
      timer = setTimeout(() => setJustUnlocked([]), 6000);
    };
    window.addEventListener("bm_achievement_unlocked", onUnlock);
    return () => { window.removeEventListener("bm_achievement_unlocked", onUnlock); clearTimeout(timer); };
  }, []);

  const { tracks, standalone } = useMemo(() => getAchievementTracks(), []);
  const total = ACHIEVEMENTS.length;
  const unlockedCount = ACHIEVEMENTS.filter((a) => unlocked.has(a.id)).length;
  // XP derived from the unlocked set (the server grants exactly a.xp per
  // unlock), so the level shown matches what was actually earned.
  // Server XP also includes task completions, so prefer it: the same number the
  // Overview, Reports and Today show. The achievement-only sum is the fallback.
  const achievementXp = ACHIEVEMENTS.reduce((s, a) => s + (unlocked.has(a.id) ? a.xp : 0), 0);
  const xp = typeof scorecard?.xp === "number" ? scorecard.xp : achievementXp;
  const lvl = xpToLevel(xp);
  const cUnlocked = useCountUp(unlockedCount);
  const cXp = useCountUp(xp, 1100);
  const cStreak = useCountUp(stats?.maxStreak ?? 0);

  // A real level-up (only after server data is in, so the first load never fires it).
  useEffect(() => {
    if (!serverReady) return;
    if (prevLevel.current === null) { prevLevel.current = lvl.level; return; }
    if (lvl.level > prevLevel.current) {
      setLevelUp({ level: lvl.level, title: lvl.title });
      setConfettiKey((k) => k + 1);
    }
    prevLevel.current = lvl.level;
  }, [lvl.level, lvl.title, serverReady]);
  useEffect(() => {
    if (!levelUp) return;
    const t = setTimeout(() => setLevelUp(null), 7000);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setLevelUp(null); };
    window.addEventListener("keydown", onKey);
    return () => { clearTimeout(t); window.removeEventListener("keydown", onKey); };
  }, [levelUp]);

  const countFor = (cat: string) => {
    const list = cat === "all" ? ACHIEVEMENTS : ACHIEVEMENTS.filter((a) => a.category === cat);
    return { done: list.filter((a) => unlocked.has(a.id)).length, all: list.length };
  };

  // Closest-to-unlocking, real progress only, secrets excluded.
  const upNext = useMemo(() => {
    const s = stats ?? EMPTY_STATS;
    return ACHIEVEMENTS
      .filter((a) => !unlocked.has(a.id) && !a.secret && a.progress)
      .map((a) => {
        const p = a.progress!(s);
        return { a, p, ratio: p.target > 0 ? p.current / p.target : 0 };
      })
      // within a track only the lowest open tier is "next"
      .filter(({ a }) => {
        if (!a.track) return true;
        const t = tracks.find((x) => x.track === a.track);
        return t ? t.achievements.find((x) => !unlocked.has(x.id))?.id === a.id : true;
      })
      .filter((x) => x.ratio > 0 && x.ratio < 1)
      .sort((x, y) => y.ratio - x.ratio)
      .slice(0, 3);
  }, [stats, unlocked, tracks]);

  const mascotLine = justUnlocked.length > 0
    ? `${justUnlocked[0].label}. You earned it!`
    : tapLine
      ?? (unlockedCount === 0
        ? "Your first badge is one check-in away."
        : upNext[0] && upNext[0].ratio >= 0.8
          ? `So close. ${upNext[0].p.target - upNext[0].p.current} more for ${upNext[0].a.label}.`
          : `${unlockedCount} badge${unlockedCount === 1 ? "" : "s"} earned. Keep going.`);
  const TAP_LINES = ["Hi!", "Ha, that tickles.", "Go finish today's action.", "You are doing the work.", "One more badge?", "Show me a streak."];

  const dispTracks = filter === "all" ? tracks : tracks.filter((t) => t.category === filter);
  const dispStandalone = filter === "all" ? standalone : standalone.filter((a) => a.category === filter);
  const secretsLeft = ACHIEVEMENTS.filter((a) => a.secret && !unlocked.has(a.id)).length;

  return (
    <div className="ach-wrap">
      <style>{`
        .ach-wrap{max-width:960px;margin:0 auto;padding:24px 16px 80px;box-sizing:border-box}
        .ach-stage{display:flex;align-items:center;gap:6px;margin-bottom:6px;padding:0 4px}
        .ach-bubble{position:relative;padding:12px 16px;border-radius:18px;background:var(--bm-bg2);border:1px solid var(--bm-border2);
          font-size:15px;line-height:1.45;color:var(--bm-text);max-width:380px}
        .ach-bubble::before{content:"";position:absolute;left:-7px;top:50%;width:12px;height:12px;background:var(--bm-bg2);
          border-left:1px solid var(--bm-border2);border-bottom:1px solid var(--bm-border2);transform:translateY(-50%) rotate(45deg)}
        .ach-hero{display:grid;grid-template-columns:auto 1fr;gap:22px;align-items:center;padding:22px;border-radius:20px;
          background:radial-gradient(380px circle at var(--mx,18%) var(--my,0%),rgba(232,197,71,.10),transparent 65%),linear-gradient(135deg,var(--bm-bg2),var(--bm-bg));border:1px solid var(--bm-border);margin-bottom:18px;position:relative;overflow:hidden}
        .ach-ring{width:108px;height:108px;position:relative;flex-shrink:0}
        .ach-ring svg{transform:rotate(-90deg)}
        .ach-ring-in{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
        .ach-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:16px}
        .ach-stat{padding:10px 12px;border-radius:12px;background:var(--bm-bg3);min-width:0}
        .ach-next{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px;margin-bottom:22px}
        .ach-nextcard{padding:14px;border-radius:14px;background:var(--bm-bg2);border:1px solid var(--bm-border);display:flex;gap:12px;align-items:center;min-width:0}
        .ach-filters{display:flex;gap:6px;overflow-x:auto;padding:2px 0 6px;margin-bottom:14px;scrollbar-width:none}
        .ach-filters::-webkit-scrollbar{display:none}
        .ach-pill{display:inline-flex;align-items:center;gap:7px;padding:8px 14px;border-radius:99px;border:1px solid var(--bm-border);
          background:transparent;color:var(--bm-text3);font:inherit;font-size:13px;cursor:pointer;white-space:nowrap;flex-shrink:0;transition:background .15s,color .15s,border-color .15s}
        .ach-pill:hover{color:var(--bm-text)}
        .ach-pill[aria-pressed="true"]{background:var(--bm-accent-dim);border-color:var(--bm-accent-bd);color:var(--bm-accent);font-weight:600}
        .ach-pill:focus-visible,.ach-wrap a:focus-visible{outline:2px solid var(--bm-accent);outline-offset:2px}
        .ach-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
        .ach-card{position:relative;overflow:hidden;display:flex;gap:14px;padding:16px;border-radius:16px;background:var(--bm-bg2);border:1px solid var(--bm-border);min-width:0;box-sizing:border-box;}
        .ach-card[data-state="locked"]{opacity:.72}
        .ach-track{flex-direction:column;gap:0}
        .ach-tilt{transform-style:preserve-3d;min-width:0}
        .ach-card::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;opacity:0;transition:opacity .2s;
          background:radial-gradient(240px circle at var(--gx,50%) var(--gy,0%),rgba(255,255,255,.09),transparent 60%)}
        .ach-tilt:hover .ach-card::after{opacity:1}
        .ach-medal{transition:transform .25s cubic-bezier(.3,1.6,.5,1)}
        .ach-shimmer{position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.35),transparent);transform:translateX(-100%)}
        @media (prefers-reduced-motion:no-preference){
          .ach-tilt:hover .ach-medal-on{transform:scale(1.1) rotate(-5deg)}
          .ach-medal-on{position:relative}
          .ach-medal-on::after{content:"";position:absolute;top:-20%;bottom:-20%;width:38%;left:-60%;transform:skewX(-20deg);
            background:linear-gradient(100deg,transparent,rgba(255,255,255,.5),transparent);animation:ach-shine 5.5s ease-in-out infinite}
          .ach-aura{animation:ach-aura 2.6s ease-in-out infinite}
          .ach-shimmer{animation:ach-bar 2.2s ease-in-out infinite}
          .ach-card[data-state="nearly_there"]{animation:ach-near 2.4s ease-in-out infinite}
          .ach-nextcard{transition:transform .2s,border-color .2s}
          .ach-nextcard:hover{transform:translateY(-3px);border-color:var(--bm-accent-bd)}
          @keyframes ach-shine{0%,55%{left:-60%}100%{left:140%}}
          @keyframes ach-aura{0%,100%{box-shadow:0 0 10px var(--aura)}50%{box-shadow:0 0 26px var(--aura),0 0 4px var(--aura)}}
          @keyframes ach-bar{0%{transform:translateX(-100%)}60%,100%{transform:translateX(100%)}}
          @keyframes ach-near{0%,100%{box-shadow:0 0 0 0 rgba(217,164,65,0)}50%{box-shadow:0 0 0 4px rgba(217,164,65,.14)}}
        }
        @media (max-width:560px){
          .ach-wrap{padding:14px 12px 72px}
          .ach-stage{gap:2px}
          .ach-bubble{font-size:13.5px;padding:9px 12px;border-radius:14px}
          .ach-hero{grid-template-columns:1fr;justify-items:center;text-align:center;padding:16px 12px;gap:12px;border-radius:16px}
          .ach-ring{width:88px;height:88px}
          .ach-ring svg{width:88px;height:88px}
          .ach-hero h1{font-size:22px !important}
          .ach-hero p{font-size:13px !important}
          .ach-stats{width:100%;gap:8px;margin-top:12px}
          .ach-stat{padding:8px 6px}
          .ach-stat .bm-data{font-size:17px !important}
          .ach-stat div:last-child{font-size:11px !important}
          .ach-grid{grid-template-columns:1fr;gap:10px}
          .ach-card{padding:12px;gap:10px;border-radius:14px}
          .ach-card h3{font-size:14px !important}
          .ach-card p{font-size:12.5px !important}
          .ach-medal{width:44px !important;height:44px !important;min-width:44px !important;font-size:22px !important;border-radius:13px !important}
          .ach-pill{padding:7px 12px;font-size:12.5px}
          .ach-nextcard{padding:11px}
        }
        @media (max-width:560px){ .ach-ring-in span:last-child{font-size:28px !important} }
      `}</style>

      <AnimatePresence>
        {justUnlocked.length > 0 && (
          <motion.div
            role="status"
            initial={reduce ? false : { opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            onClick={() => setJustUnlocked([])}
            style={{ marginBottom: 16, padding: "14px 16px", borderRadius: 16, cursor: "pointer", display: "flex", gap: 12, alignItems: "center",
              background: "var(--bm-accent-dim)", border: "1px solid var(--bm-accent-bd)" }}
          >
            <div style={{ fontSize: 28 }}>{justUnlocked[0].emoji}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--bm-text)" }}>
                {justUnlocked.length === 1 ? `${justUnlocked[0].label} unlocked` : `${justUnlocked.length} achievements unlocked`}
              </div>
              <div style={{ fontSize: 13, color: "var(--bm-text3)" }}>
                +{justUnlocked.reduce((s, a) => s + a.xp, 0)} XP
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfettiBurst burstKey={confettiKey} />
      <AnimatePresence>
        {levelUp && (
          <motion.div
            key="levelup" role="dialog" aria-label={`Level ${levelUp.level} reached`}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setLevelUp(null)}
            style={{ position: "fixed", inset: 0, zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.65)", padding: 16 }}
          >
            <motion.div
              initial={{ scale: 0.7, y: 30 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 18 }}
              style={{ textAlign: "center", padding: "26px 28px 24px", borderRadius: 24, background: "var(--bm-bg2)", border: "1px solid var(--bm-accent-bd)", maxWidth: 360, width: "100%", boxShadow: "0 0 60px rgba(232,197,71,0.18)" }}
            >
              <div style={{ display: "flex", justifyContent: "center" }}><AchievementMascot size={mascotSize + 40} levelUpKey={1} /></div>
              <div style={{ fontSize: 14, color: "var(--bm-text3)", marginTop: 6 }}>Level up</div>
              <div style={{ fontFamily: "Syne, var(--font-syne), sans-serif", fontSize: 30, fontWeight: 800, color: "var(--bm-text)", letterSpacing: "-0.02em" }}>
                Level {levelUp.level}
              </div>
              <div style={{ fontSize: 18, color: "var(--bm-accent)", fontWeight: 600, marginTop: 2 }}>{levelUp.title}</div>
              <button onClick={() => setLevelUp(null)} autoFocus
                style={{ marginTop: 18, padding: "12px 28px", borderRadius: 12, border: 0, background: "var(--bm-accent)", color: "#15130a", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
                Keep going
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mascot stage: tap it, it reacts; a real unlock makes it celebrate */}
      <section className="ach-stage" aria-label="Mascot">
        <AchievementMascot size={mascotSize} celebrateKey={cheerKey} onTap={() => { setTapLine(TAP_LINES[Math.floor(Math.random() * TAP_LINES.length)]); setTimeout(() => setTapLine(null), 4000); }} />
        <div className="ach-bubble" role="status">{mascotLine}</div>
      </section>

      {/* Hero: founder level is the one memorable thing on the page */}
      <section
        className="ach-hero"
        aria-label="Founder level"
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
          e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
        }}
      >
        <motion.div key={ringPulse} className="ach-ring" animate={reduce ? undefined : { scale: [1, 1.14, 1] }} transition={{ duration: 0.7 }}>
          <svg width="108" height="108" viewBox="0 0 108 108" aria-hidden>
            <circle cx="54" cy="54" r="47" fill="none" stroke="var(--bm-bg3)" strokeWidth="8" />
            <motion.circle cx="54" cy="54" r="47" fill="none" stroke="var(--bm-accent)" strokeWidth="8" strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 47}
              initial={{ strokeDashoffset: 2 * Math.PI * 47 }}
              animate={{ strokeDashoffset: 2 * Math.PI * 47 * (1 - lvl.progress / 100) }}
              transition={{ duration: reduce ? 0 : 1, ease: "easeOut" }} />
          </svg>
          <div className="ach-ring-in">
            <span style={{ fontSize: 12, color: "var(--bm-text3)" }}>Level</span>
            <span style={{ fontFamily: "Syne, var(--font-syne), sans-serif", fontSize: 34, fontWeight: 800, lineHeight: 1, color: "var(--bm-text)" }}>{lvl.level}</span>
          </div>
        </motion.div>
        <div style={{ minWidth: 0, width: "100%" }}>
          <h1 style={{ fontFamily: "Syne, var(--font-syne), sans-serif", fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em", margin: 0, color: "var(--bm-text)" }}>
            {lvl.title}
          </h1>
          <p style={{ fontSize: 14, color: "var(--bm-text3)", margin: "4px 0 0" }}>
            {lvl.level >= 10
              ? "Top level reached."
              : <><span className="bm-data">{Math.max(0, lvl.nextXp - xp).toLocaleString()}</span> XP to the next level. Every badge is earned by doing the work.</>}
          </p>
          <div className="ach-stats">
            <div className="ach-stat">
              <div className="bm-data" style={{ fontSize: 20, fontWeight: 700, color: "var(--bm-accent)" }}>{cUnlocked}<span style={{ fontSize: 13, color: "var(--bm-text3)", fontWeight: 400 }}>/{total}</span></div>
              <div style={{ fontSize: 12, color: "var(--bm-text3)" }}>Unlocked</div>
            </div>
            <div className="ach-stat">
              <div className="bm-data" style={{ fontSize: 20, fontWeight: 700, color: "var(--bm-text)" }}>{cXp.toLocaleString()}</div>
              <div style={{ fontSize: 12, color: "var(--bm-text3)" }}>Total XP</div>
            </div>
            <div className="ach-stat">
              <div className="bm-data" style={{ fontSize: 20, fontWeight: 700, color: "var(--bm-text)" }}>{cStreak}</div>
              <div style={{ fontSize: 12, color: "var(--bm-text3)" }}>Best streak</div>
            </div>
          </div>
        </div>
      </section>

      {upNext.length > 0 && (
        <section aria-label="Closest to unlocking" style={{ marginBottom: 6 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 10px", color: "var(--bm-text)", display: "flex", alignItems: "center", gap: 7 }}>
            <Sparkles size={15} color="var(--bm-accent)" /> Closest to unlocking
          </h2>
          <div className="ach-next">
            {upNext.map(({ a, p, ratio }) => (
              <Link key={a.id} href={CATEGORY_HREF[a.category] ?? "/today"} className="ach-nextcard" style={{ textDecoration: "none", color: "inherit" }}>
                <Medal emoji={a.emoji} rarity={a.rarity} state="progress" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "var(--bm-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.label}</span>
                    <ArrowUpRight size={14} color="var(--bm-text3)" style={{ flexShrink: 0 }} />
                  </div>
                  <div style={{ fontSize: 12, color: "var(--bm-text3)", margin: "2px 0 7px" }}>
                    <span className="bm-data">{Math.min(p.current, p.target)}/{p.target}</span> · +{a.xp} XP
                  </div>
                  <Bar pct={ratio * 100} color={ratio >= 0.8 ? "var(--bm-amber, #d9a441)" : "var(--bm-accent)"} h={4} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="ach-filters" role="group" aria-label="Filter by category" style={{ marginTop: 18 }}>
        {CATEGORIES.map((c) => {
          const n = countFor(c.id);
          return (
            <button key={c.id} className="ach-pill" aria-pressed={filter === c.id} onClick={() => setFilter(c.id)}>
              {c.label}
              <span className="bm-data" style={{ fontSize: 11, opacity: 0.75 }}>{n.done}/{n.all}</span>
            </button>
          );
        })}
      </div>

      <div key={filter} className="ach-grid">
        {dispTracks.map((t, i) => <TiltCard key={t.track} index={i}><TrackCard track={t} stats={stats} unlocked={unlocked} /></TiltCard>)}
        {dispStandalone.map((a, i) => (
          <TiltCard key={a.id} index={dispTracks.length + i}>
            <AchievementCard a={a} unlocked={unlocked.has(a.id)} unlockedAt={timestamps[a.id]} stats={stats} />
          </TiltCard>
        ))}
      </div>

      {dispTracks.length === 0 && dispStandalone.length === 0 && (
        <div style={{ textAlign: "center", padding: "56px 0" }}>
          <Trophy size={30} color="var(--bm-text3)" style={{ margin: "0 auto 12px", display: "block" }} />
          <div style={{ fontSize: 15, color: "var(--bm-text2)", fontWeight: 600, marginBottom: 6 }}>Nothing in this category yet</div>
          <button className="ach-pill" onClick={() => setFilter("all")}>Show all achievements</button>
        </div>
      )}

      {secretsLeft > 0 && filter === "all" && (
        <p style={{ textAlign: "center", fontSize: 13, color: "var(--bm-text4)", marginTop: 26 }}>
          {secretsLeft} secret {secretsLeft === 1 ? "achievement is" : "achievements are"} still hidden.
        </p>
      )}
    </div>
  );
                        }
