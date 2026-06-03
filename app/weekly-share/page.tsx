"use client";
/**
 * /weekly-share — shareable weekly progress card.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { selectActiveProject, useActiveProjectId, useProjectSummariesQuery } from "@/lib/queries";

type WeekData = {
  name: string;
  project: string;
  stage: string;
  streak: number | null;
  score: number | null;
  tasksCommitted: number | null;
  tasksDone: number | null;
  milestone: string;
  nextFocus: string;
  week: string;
  weekNumber: number;
};

type FounderContextResponse = {
  ok?: boolean;
  data?: {
    streak?: number | null;
  } | null;
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
      const meta = user?.user_metadata ?? {};
      const weekNumber = getWeekNumber(user?.created_at);

      const base: WeekData = {
        name: String(meta.full_name ?? meta.name ?? user?.email?.split("@")[0] ?? PLACEHOLDER),
        project: activeProject?.name ?? activeProject?.title ?? PLACEHOLDER,
        stage: activeProject?.startup_stage ?? activeProject?.stage ?? PLACEHOLDER,
        streak: null,
        score: null,
        tasksCommitted: null,
        tasksDone: null,
        milestone: PLACEHOLDER,
        nextFocus: PLACEHOLDER,
        week: `Week ${weekNumber}`,
        weekNumber,
      };

      try {
        const contextRes = await fetch("/api/founder-context", { cache: "no-store" });
        if (contextRes.ok) {
          const context = (await contextRes.json()) as FounderContextResponse;
          if (typeof context.data?.streak === "number") base.streak = context.data.streak;
        }
      } catch {}

      let next = base;
      if (activeProject?.id) {
        try {
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
              score: typeof data?.momentum_score === "number" ? Math.round(data.momentum_score) : null,
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

  const tweetText = encodeURIComponent(
    `${weekData.week} building ${weekData.project} with @buildmind_os\n\n` +
    `✓ ${statValue(weekData.tasksDone)}/${statValue(weekData.tasksCommitted)} tasks done\n` +
    `🔥 ${statValue(weekData.streak)} day streak\n` +
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
          <div style={{display:"flex",alignItems:"center",gap:6,fontSize:13,color:"var(--bm-amber)",background:"var(--bm-bg3)",border:"1px solid var(--bm-border)",padding:"5px 10px",borderRadius:20}}>
            🔥 {loading ? PLACEHOLDER : statValue(weekData.streak)}d
          </div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:16}}>
          {[
            {label:"Tasks done",value:loading ? PLACEHOLDER : `${statValue(weekData.tasksDone)}/${statValue(weekData.tasksCommitted)}`,color:"var(--bm-text)"},
            {label:"Exec score",value:loading ? PLACEHOLDER : statValue(weekData.score, "/100"),color:"var(--bm-green)"},
            {label:"Accountability",value:loading ? PLACEHOLDER : pct(weekData.tasksDone, weekData.tasksCommitted),color:"var(--bm-amber)"},
          ].map(s=>(
            <div key={s.label} style={{background:"var(--bm-bg3)",borderRadius:10,padding:"10px 12px",textAlign:"center"}}>
              <div style={{fontSize:16,fontWeight:600,color:s.color}}>{s.value}</div>
              <div style={{fontSize:10,color:"var(--bm-text3)",marginTop:2}}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{background:"var(--bm-bg3)",border:"1px solid var(--bm-border)",borderRadius:10,padding:12,marginBottom:12}}>
          <div style={{fontSize:10,color:"var(--bm-green)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>This week's milestone</div>
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
          Public accountability doubles follow-through rates. Every post attracts potential users, partners, and investors who find your early journey compelling. It's free marketing for your startup — and for BuildMind.
        </div>
      </div>
    </div>
  );
}
