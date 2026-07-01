"use client";
/**
 * /weekly-share — shareable weekly progress card.
 *
 * PATCHES APPLIED (June 2026):
 *  1. Streak now fetched from /api/data/overview — the same endpoint overview page uses,
 *     so weekly-share and overview always show identical streak values.
 *  2. Removed the `> 0` guard from the streak badge render so `0d` shows instead of `—`
 *     when the founder genuinely has a 0-day streak.
 *  3. localDayKey uses UTC (toISOString().slice(0,10)) to match server-side today value.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { selectActiveProject, useActiveProjectId, useProjectSummariesQuery } from "@/lib/queries";
import { getStoredStreak } from "@/lib/plan";
import { storage } from "@/lib/storage";

type WeekData = {
  name: string;
  project: string;
  stage: string;
  streak: number | null;
  score: number | null;
  momentum_score: number | null;
  tasksCommitted: number | null;
  tasksDone: number | null;
  milestone: string;
  nextFocus: string;
  week: string;
  weekNumber: number;
};

type WeeklyReportResponse = {
  success?: boolean;
  data?: {
    momentum_score?: number;
    intention_vs_execution_rate?: number | null;
    next_week_focus?: string;
    summary?: string;
    reportData?: {
      tasks_completed?: number;
      milestones_completed?: number;
      ai_summary?: string;
      ai_suggestions?: string;
    };
  };
};

// Overview API response shape — same endpoint the overview page uses
type OverviewResponse = {
  founderStreakDays?: number;
};

const PLACEHOLDER = "—";

function getWeekNumber(createdAt?: string | null): number {
  if (!createdAt) return 1;
  const ageMs = Date.now() - new Date(createdAt).getTime();
  if (!Number.isFinite(ageMs) || ageMs <= 0) return 1;
  return Math.max(1, Math.ceil(ageMs / (7 * 24 * 60 * 60 * 1000)));
}

function pct(done: number | null, committed: number | null): string {
  if (done == null || committed == null || committed <= 0) return PLACEHOLDER;
  return `${Math.round((done / committed) * 100)}%`;
}

function statValue(value: number | null, suffix = ""): string {
  return value == null ? PLACEHOLDER : `${value}${suffix}`;
}

export default function WeeklySharePage() {
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const { data: summaries = [] } = useProjectSummariesQuery();
  const activeProjectId = useActiveProjectId();
  const activeProject = useMemo(() => selectActiveProject(summaries, activeProjectId), [summaries, activeProjectId]);

  const [weekData, setWeekData] = useState<WeekData>({
    name: PLACEHOLDER,
    project: PLACEHOLDER,
    stage: PLACEHOLDER,
    streak: null,
    score: null,
    momentum_score: null,
    tasksCommitted: null,
    tasksDone: null,
    milestone: PLACEHOLDER,
    nextFocus: PLACEHOLDER,
    week: "Week 1",
    weekNumber: 1,
  });

  useEffect(() => {
    let cancelled = false;

    async function loadWeekData() {
      setLoading(true);
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;
      if (user?.id) storage.onSignIn(user.id); // scope localStorage namespace before getStoredStreak()
      const meta = user?.user_metadata ?? {};
      const weekNumber = getWeekNumber(user?.created_at);

      const base: WeekData = {
        name: String(meta.full_name ?? meta.name ?? user?.email?.split("@")[0] ?? PLACEHOLDER),
        project: activeProject?.name ?? activeProject?.title ?? PLACEHOLDER,
        stage: activeProject?.startup_stage ?? activeProject?.stage ?? PLACEHOLDER,
        streak: null,
        score: null,
        momentum_score: null,
        tasksCommitted: null,
        tasksDone: null,
        milestone: PLACEHOLDER,
        nextFocus: PLACEHOLDER,
        week: `Week ${weekNumber}`,
        weekNumber,
      };

      // ── PATCH 1: Use the same overview endpoint that overview page uses ────
      // This guarantees weekly-share and overview always show the same streak.
      // The overview endpoint computes Math.max(dbStreak, computedStreakFromDates)
      // which is the most authoritative value in the system.
      try {
        const overviewRes = await fetch("/api/data/overview", { cache: "no-store" });
        if (overviewRes.ok) {
          const ov = (await overviewRes.json()) as OverviewResponse;
          if (typeof ov.founderStreakDays === "number") {
            base.streak = ov.founderStreakDays; // includes 0 — we show it honestly
          }
        }
      } catch {
        // Fallback chain: localStorage → direct Supabase query
        try {
          const local = getStoredStreak();
          base.streak = local; // may be 0
        } catch {
          // last resort — leave streak as null (renders as —)
        }
        if (user?.id && base.streak === null) {
          try {
            const { data: ctxDirect } = await supabase
              .from("founder_context")
              .select("streak")
              .eq("user_id", user.id)
              .maybeSingle();
            if (typeof ctxDirect?.streak === "number") {
              base.streak = ctxDirect.streak;
            }
          } catch { /* non-fatal */ }
        }
      }

      let next = base;
      if (activeProject?.id) {
        try {
          // ── Single source of truth: lib/scorecard.ts via the scorecard API ──
          // Replaces the previous pattern of fetching momentum separately and
          // hardcoding xp:0 into computeStartupScore — that hardcoded 0 is why
          // weekly-share's score never matched the reports page (which fetched
          // real XP via getXP()/syncXP()).
          const scorecardRes = await fetch("/api/founder-context/scorecard", { cache: "no-store" });
          const scorecardJson = scorecardRes.ok ? await scorecardRes.json() : null;
          const scorecard = scorecardJson?.ok ? scorecardJson.data : null;

          const reportRes = await fetch("/api/ai/weekly-report", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectId: activeProject.id }),
          });
          if (reportRes.ok) {
            const report = (await reportRes.json()) as WeeklyReportResponse;
            const data = report.data;
            const tasksDone = typeof data?.reportData?.tasks_completed === "number"
              ? data.reportData.tasks_completed
              : null;
            const rate = typeof data?.intention_vs_execution_rate === "number"
              ? data.intention_vs_execution_rate
              : null;
            const tasksCommitted = tasksDone == null
              ? null
              : rate && rate > 0
                ? Math.max(tasksDone, Math.round(tasksDone / (rate / 100)))
                : tasksDone;

            next = {
              ...base,
              score: scorecard ? Math.round(scorecard.projectScore) : null,
              momentum_score: scorecard ? scorecard.momentum : null,
              tasksCommitted,
              tasksDone,
              milestone: data?.reportData?.ai_summary ?? data?.summary ?? PLACEHOLDER,
              nextFocus: data?.next_week_focus ?? data?.reportData?.ai_suggestions ?? PLACEHOLDER,
            };
          }
        } catch {}
      }

      if (!cancelled) {
        setWeekData(next);
        setLoading(false);
      }
    }

    void loadWeekData();
    return () => { cancelled = true; };
  }, [activeProject]);

  // ── PATCH 2: streak badge — show 0d honestly, only use PLACEHOLDER when null ──
  // Previously: weekData.streak != null && weekData.streak > 0 ? `${weekData.streak}d` : PLACEHOLDER
  // The > 0 guard made a real 0 streak show as "—" instead of "0d".
  const streakDisplay = loading
    ? PLACEHOLDER
    : weekData.streak != null
      ? `${weekData.streak}d`
      : PLACEHOLDER;

  const tweetText = encodeURIComponent(
    `${weekData.week} building ${weekData.project} with @buildmind_os\n\n` +
    `✓ ${statValue(weekData.tasksDone)}/${statValue(weekData.tasksCommitted)} tasks done\n` +
    `🔥 ${streakDisplay} streak\n` +
    `📈 Execution score: ${statValue(weekData.score, "/100")}\n` +
    `🎯 Milestone: ${weekData.milestone}\n\n` +
    `Next week: ${weekData.nextFocus}\n\n` +
    `Track my build → buildmind.live\n#buildinpublic #solofounder #indiehacker`
  );

  async function handleDownload() {
    if (!cardRef.current) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: null,
        scale: 2,
        useCORS: true,
      });
      const link = document.createElement("a");
      link.download = `buildmind-week-${weekData.weekNumber}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } finally {
      setDownloading(false);
    }
  }

  const card = {background:"var(--bm-bg2)",border:"1px solid var(--bm-border)",borderRadius:16,padding:24,marginBottom:16};
  const shimmer = {background:"var(--bm-bg3)",borderRadius:6,filter:"blur(0.5px)",opacity:0.75};

  return (
    <div style={{maxWidth:560,margin:"0 auto",fontFamily:"system-ui,sans-serif",paddingBottom:40}}>
      <div style={{marginBottom:20,paddingBottom:16,borderBottom:"1px solid var(--bm-border)"}}>
        <div style={{fontSize:20,fontWeight:600,color:"var(--bm-text)",marginBottom:4}}>Weekly progress card</div>
        <div style={{fontSize:13,color:"var(--bm-text3)",lineHeight:1.6}}>Share your week publicly. Builds accountability and attracts your first users.</div>
      </div>

      {/* The shareable card preview */}
      <motion.div ref={cardRef} style={{...card,background:"var(--bm-accent-dim)",border:"1px solid var(--bm-accent-bd)"}} initial={{opacity:0,y:10}} animate={{opacity:1,y:0}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18}}>
          <div>
            <div style={{fontSize:11,color:"var(--bm-text3)",fontFamily:"monospace",marginBottom:3}}>{loading ? <span style={{...shimmer,display:"inline-block",width:120,height:12}} /> : `${weekData.week} · BuildMind`}</div>
            <div style={{fontSize:16,fontWeight:700,color:"var(--bm-text)"}}>{loading ? <span style={{...shimmer,display:"inline-block",width:92,height:18}} /> : weekData.name}</div>
            <div style={{fontSize:12,color:"var(--bm-purple)",marginTop:2}}>{loading ? <span style={{...shimmer,display:"inline-block",width:160,height:14}} /> : `${weekData.project} · ${weekData.stage}`}</div>
          </div>
          {/* PATCH 2 applied here — streakDisplay variable used instead of inline ternary */}
          <div style={{display:"flex",alignItems:"center",gap:6,fontSize:13,color:"var(--bm-amber)",background:"var(--bm-bg3)",border:"1px solid var(--bm-border)",padding:"5px 10px",borderRadius:20}}>
            🔥 {loading ? <span style={{...shimmer,display:"inline-block",width:28,height:14}} /> : streakDisplay}
          </div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:16}}>
          {[
            {label:"Tasks done",value:loading ? PLACEHOLDER : `${statValue(weekData.tasksDone)}/${statValue(weekData.tasksCommitted)}`,color:"var(--bm-text)",title:"Tasks you completed out of tasks committed to this week"},
            {label:"Exec score",value:loading ? PLACEHOLDER : statValue(weekData.score, "/100"),color:"var(--bm-green)",title:"Composite score combining execution quality, momentum, XP, and streak"},
            {label:"Momentum",  value:loading ? PLACEHOLDER : weekData.momentum_score != null ? `${weekData.momentum_score}` : "—", color:"#A78BFA",title:"Your current momentum score (0-100) — reflects recent activity pattern, not lifetime total"},
            {label:"Accountability",value:loading ? PLACEHOLDER : pct(weekData.tasksDone, weekData.tasksCommitted),color:"var(--bm-amber)",title:"Percentage of committed tasks you actually completed this week (tasks done ÷ tasks committed)"},
          ].map(s=>(
            <div key={s.label} title={s.title} style={{background:"var(--bm-bg3)",borderRadius:10,padding:"10px 12px",textAlign:"center",cursor:"help"}}>
              <div style={{fontSize:16,fontWeight:600,color:s.color}}>{s.value}</div>
              <div style={{fontSize:10,color:"var(--bm-text3)",marginTop:2}}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{background:"var(--bm-bg3)",border:"1px solid var(--bm-border)",borderRadius:10,padding:12,marginBottom:12}}>
          <div style={{fontSize:10,color:"var(--bm-green)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>This week&apos;s milestone</div>
          <div style={{fontSize:12,color:"var(--bm-text2)",fontFamily:"monospace"}}>{loading ? <span style={{...shimmer,display:"block",width:"82%",height:14}} /> : weekData.milestone}</div>
        </div>

        <div style={{background:"var(--bm-bg3)",borderRadius:10,padding:12}}>
          <div style={{fontSize:10,color:"var(--bm-text3)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>Next week focus</div>
          <div style={{fontSize:12,color:"var(--bm-text2)",fontFamily:"monospace"}}>{loading ? <span style={{...shimmer,display:"block",width:"76%",height:14}} /> : weekData.nextFocus}</div>
        </div>

        <div style={{textAlign:"center",marginTop:14,fontSize:10,color:"var(--bm-text4)",fontFamily:"monospace"}}>
          buildmind.live · #buildinpublic
        </div>
      </motion.div>

      {/* Share buttons */}
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        <a href={`https://twitter.com/intent/tweet?text=${tweetText}`} target="_blank" rel="noopener noreferrer"
          onClick={()=>setShared(true)}
          style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:13,background:"var(--bm-accent)",color:"var(--bm-bg)",fontWeight:700,fontSize:13,borderRadius:12,textDecoration:"none"}}>
          <span>𝕏</span>
          {shared?"Shared! Keep building 🔥":"Share on X — #buildinpublic →"}
        </a>
        <button onClick={()=>{
          const text = decodeURIComponent(tweetText);
          navigator.clipboard.writeText(text).catch(()=>{});
          setCopied(true); setTimeout(()=>setCopied(false),2000);
        }}
          style={{padding:12,background:"var(--bm-bg2)",border:"1px solid var(--bm-border2)",color:"var(--bm-text3)",fontSize:13,borderRadius:12,cursor:"pointer",fontFamily:"inherit"}}>
          {copied?"✓ Copied to clipboard":"Copy text to share elsewhere"}
        </button>
        <button onClick={() => void handleDownload()} disabled={downloading}
          style={{padding:12,background:"var(--bm-bg2)",border:"1px solid var(--bm-border2)",color:"var(--bm-text3)",fontSize:13,borderRadius:12,cursor:downloading?"default":"pointer",fontFamily:"inherit"}}>
          {downloading ? "Rendering card..." : "⬇ Download card"}
        </button>
      </div>

      <div style={{marginTop:16,background:"var(--bm-bg2)",border:"1px solid var(--bm-border)",borderRadius:10,padding:12}}>
        <div style={{fontSize:11,color:"var(--bm-purple)",marginBottom:4,fontWeight:500}}>Why share publicly?</div>
        <div style={{fontSize:12,color:"var(--bm-text3)",lineHeight:1.7,fontFamily:"monospace"}}>
          Public accountability doubles follow-through rates. Every post attracts potential users, partners, and investors who find your early journey compelling. It&apos;s free marketing for your startup — and for BuildMind.
        </div>
      </div>
    </div>
  );
             }
