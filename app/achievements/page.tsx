"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  ACHIEVEMENTS, RARITY_COLORS, RARITY_LABELS, getUnlocked, getAchievementTracks, getTrackLevel,
  getProgressState, xpToLevel,
  type Achievement, type AchievementStats, type AchievementTrack,
} from "@/lib/achievements";
import { Trophy, Lock, EyeOff, Sparkles, ArrowUpRight } from "lucide-react";
import Link from "next/link";

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

function Bar({ pct, color = "var(--bm-accent)", h = 5 }: { pct: number; color?: string; h?: number }) {
  const reduce = useReducedMotion();
  return (
    <div style={{ height: h, borderRadius: 99, background: "var(--bm-bg3)", overflow: "hidden" }}>
      <motion.div
        initial={{ width: reduce ? `${pct}%` : 0 }}
        animate={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        transition={{ duration: reduce ? 0 : 0.8, ease: "easeOut" }}
        style={{ height: "100%", borderRadius: 99, background: color }}
      />
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
      style={{
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
        {tiers.map((t) => (
          <div key={t.id} title={t.secret && !unlocked.has(t.id) ? "Secret" : t.label}
            style={{
              flex: 1, height: 5, borderRadius: 99,
              background: unlocked.has(t.id) ? RARITY_COLORS[t.rarity].text : "var(--bm-bg3)",
            }} />
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
      })
      .catch(() => {});

    let timer: ReturnType<typeof setTimeout> | undefined;
    const onUnlock = (e: Event) => {
      const fresh = (e as CustomEvent<{ newlyUnlocked?: Achievement[] }>).detail?.newlyUnlocked ?? [];
      if (fresh.length === 0) return;
      setUnlocked((prev) => new Set([...prev, ...fresh.map((a) => a.id)]));
      setJustUnlocked(fresh);
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
  const xp = ACHIEVEMENTS.reduce((s, a) => s + (unlocked.has(a.id) ? a.xp : 0), 0);
  const lvl = xpToLevel(xp);

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

  const dispTracks = filter === "all" ? tracks : tracks.filter((t) => t.category === filter);
  const dispStandalone = filter === "all" ? standalone : standalone.filter((a) => a.category === filter);
  const secretsLeft = ACHIEVEMENTS.filter((a) => a.secret && !unlocked.has(a.id)).length;

  return (
    <div className="ach-wrap">
      <style>{`
        .ach-wrap{max-width:960px;margin:0 auto;padding:24px 16px 80px;box-sizing:border-box}
        .ach-hero{display:grid;grid-template-columns:auto 1fr;gap:22px;align-items:center;padding:22px;border-radius:20px;
          background:linear-gradient(135deg,var(--bm-bg2),var(--bm-bg));border:1px solid var(--bm-border);margin-bottom:18px}
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
        .ach-card{display:flex;gap:14px;padding:16px;border-radius:16px;background:var(--bm-bg2);border:1px solid var(--bm-border);min-width:0;box-sizing:border-box;transition:transform .15s}
        .ach-card:hover{transform:translateY(-2px)}
        .ach-card[data-state="locked"]{opacity:.72}
        .ach-track{flex-direction:column;gap:0}
        @media (max-width:560px){
          .ach-hero{grid-template-columns:1fr;justify-items:center;text-align:center;padding:20px 16px}
          .ach-grid{grid-template-columns:1fr}
          .ach-stats{width:100%}
        }
        @media (prefers-reduced-motion:reduce){.ach-card{transition:none}.ach-card:hover{transform:none}}
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

      {/* Hero: founder level is the one memorable thing on the page */}
      <section className="ach-hero" aria-label="Founder level">
        <div className="ach-ring">
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
        </div>
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
              <div className="bm-data" style={{ fontSize: 20, fontWeight: 700, color: "var(--bm-accent)" }}>{unlockedCount}<span style={{ fontSize: 13, color: "var(--bm-text3)", fontWeight: 400 }}>/{total}</span></div>
              <div style={{ fontSize: 12, color: "var(--bm-text3)" }}>Unlocked</div>
            </div>
            <div className="ach-stat">
              <div className="bm-data" style={{ fontSize: 20, fontWeight: 700, color: "var(--bm-text)" }}>{xp.toLocaleString()}</div>
              <div style={{ fontSize: 12, color: "var(--bm-text3)" }}>Total XP</div>
            </div>
            <div className="ach-stat">
              <div className="bm-data" style={{ fontSize: 20, fontWeight: 700, color: "var(--bm-text)" }}>{stats?.maxStreak ?? 0}</div>
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

      <div className="ach-grid">
        {dispTracks.map((t) => <TrackCard key={t.track} track={t} stats={stats} unlocked={unlocked} />)}
        {dispStandalone.map((a) => (
          <AchievementCard key={a.id} a={a} unlocked={unlocked.has(a.id)} unlockedAt={timestamps[a.id]} stats={stats} />
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
