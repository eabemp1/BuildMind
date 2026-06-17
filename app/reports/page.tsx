"use client";

/**
 * app/reports/page.tsx
 *
 * PATCHES APPLIED (June 2026):
 *  1. DotCalendar component — 4-week activity heatmap using activeDays from reports data.
 *  2. DayBars — date labels added (e.g. "Mon 2") instead of just "M".
 *  3. Week-over-week sentence — static, always-accurate, server-data-derived comparison
 *     shown at the top of the BuildMind Analysis section (no spinner, never blank).
 *  4. Cadence score tile added to the hero row alongside Tasks / Streak / Execution Rate.
 *  5. Score delta now reflects real previousScore from score_history (no fake positives).
 */

import { useEffect, useRef, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { selectActiveProject, useActiveProjectId, useProjectSummariesQuery, useWeeklyReportMetricsQuery } from "@/lib/queries";
import { computeStartupScore } from "@/lib/buildmind";
import { getScoreHistory, getXP, syncScoreHistory, syncXP } from "@/lib/scoring";
import { getStoredStreak, syncStreakFromServer } from "@/lib/plan";
import PaywallGate from "@/components/PaywallGate";
import { usePlan } from "@/lib/usePlan";
import {
  Download, FileText, Image as ImageIcon, Table2,
  TrendingUp, TrendingDown, Minus,
  CheckCircle2, Target, Flame, BarChart3, Zap,
  ChevronDown, Star, Activity,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";

function useIsMobile() {
  const [m, setM] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(max-width: 767px)");
    const up = () => setM(q.matches);
    up(); q.addEventListener("change", up);
    return () => q.removeEventListener("change", up);
  }, []);
  return m;
}

function ScoreArc({ value, size = 120 }: { value: number; size?: number }) {
  const r = size * 0.38;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  const col = value >= 60 ? "var(--bm-green)" : value >= 30 ? "var(--bm-amber)" : "var(--bm-red)";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--bm-bg3)" strokeWidth={size*0.09} />
      <motion.circle
        cx={size/2} cy={size/2} r={r} fill="none"
        stroke={col} strokeWidth={size*0.09} strokeLinecap="round"
        strokeDasharray={circ}
        initial={{ strokeDashoffset: circ }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 1.2, ease: "easeOut" }}
        transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ filter: `drop-shadow(0 0 ${size*0.05}px ${col}88)` }}
      />
      <text x={size/2} y={size/2+size*0.06} textAnchor="middle" fill={col}
        style={{ fontSize: size*0.26, fontWeight: 800, fontFamily: "inherit" }}>{value}</text>
      <text x={size/2} y={size/2+size*0.22} textAnchor="middle" fill="var(--bm-text3)"
        style={{ fontSize: size*0.09, fontWeight: 600, fontFamily: "inherit", textTransform: "uppercase", letterSpacing: "0.1em" }}>score</text>
    </svg>
  );
}

function Sparkline({ data, color, w = 100, h = 36 }: { data: number[]; color: string; w?: number; h?: number }) {
  // Only plot non-zero points so gaps show as gaps
  const pts = data.map((v, i) => ({ x: (i/(data.length-1))*w, y: v, idx: i })).filter(p => p.y > 0);
  if (pts.length < 2) return null;
  const min = Math.min(...pts.map(p => p.y));
  const max = Math.max(...pts.map(p => p.y));
  const range = max - min || 1;
  const pointStr = pts.map(p => `${p.x},${h-((p.y-min)/range)*(h-6)-3}`).join(" ");
  const id = "spk" + color.replace(/[^a-z0-9]/gi,"");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <polyline points={pointStr} fill="none" stroke={color} strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round"
        style={{ filter: `drop-shadow(0 0 4px ${color}66)`}}/>
    </svg>
  );
}

// ── PATCH 2: DayBars with date labels ────────────────────────────────────────
function DayBars({ data, color, weekStart }: { data: number[]; color: string; weekStart: Date }) {
  const max = Math.max(...data, 1);
  const dayNames = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  return (
    <div style={{ display: "flex", gap: 5, alignItems: "flex-end", height: 68 }}>
      {data.map((v, i) => {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        const dateNum = d.getDate();
        const isToday = d.toLocaleDateString("en-CA") === new Date().toLocaleDateString("en-CA");
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <motion.div
              initial={{ scaleY: 0 }} animate={{ scaleY: 1 }}
              transition={{ delay: i*0.06, duration: 0.5, ease: "easeOut" }}
              style={{ width: "100%", background: isToday ? "var(--bm-accent)" : color,
                height: `${Math.max(3, (v/max)*40)}px`, borderRadius: 4,
                transformOrigin: "bottom",
                boxShadow: v > 0 ? `0 0 8px ${isToday ? "var(--bm-accent)" : color}44` : "none",
                opacity: v === 0 ? 0.25 : 1,
              }}/>
            <span style={{ fontSize: 9, color: isToday ? "var(--bm-accent)" : "var(--bm-text3)", fontWeight: isToday ? 700 : 500, lineHeight: 1 }}>
              {dayNames[i].slice(0,1)}
            </span>
            <span style={{ fontSize: 8, color: "var(--bm-text4)", lineHeight: 1 }}>
              {dateNum}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── PATCH 1: DotCalendar component ───────────────────────────────────────────
// 4-week heatmap. activeDays is an array of "YYYY-MM-DD" strings.
function DotCalendar({ activeDays, streak }: { activeDays: string[]; streak: number }) {
  const activeSet = new Set(activeDays);
  const today = new Date();
  // Build 28 days, starting from 27 days ago, Mon-aligned
  const days: Array<{ iso: string; isActive: boolean; isToday: boolean; label: string }> = [];
  for (let i = 27; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const iso = d.toLocaleDateString("en-CA");
    days.push({
      iso,
      isActive: activeSet.has(iso),
      isToday: i === 0,
      label: d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }),
    });
  }
  // Week labels: Mon Tue Wed Thu Fri Sat Sun
  const weekDayLabels = ["M","T","W","T","F","S","S"];
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--bm-text2)" }}>Activity — Last 4 Weeks</span>
        {streak > 0 && (
          <span style={{ fontSize: 11, color: "var(--bm-amber)", fontWeight: 700 }}>
            🔥 {streak}d streak
          </span>
        )}
      </div>
      {/* Day-of-week column headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 16px)", gap: 3, marginBottom: 4 }}>
        {weekDayLabels.map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 8, color: "var(--bm-text4)", fontWeight: 600, width: 16 }}>{d}</div>
        ))}
      </div>
      {/* 4 rows x 7 cols — compact 16px cells so grid never stretches on wide screens */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 16px)", gap: 3 }}>
        {days.map((day, i) => (
          <div
            key={i}
            title={`${day.label}${day.isActive ? " — active" : ""}`}
            style={{
              width: 16,
              height: 16,
              borderRadius: 3,
              background: day.isToday
                ? "var(--bm-accent)"
                : day.isActive
                  ? "rgba(92,200,138,0.75)"
                  : "var(--bm-bg3)",
              boxShadow: day.isActive && !day.isToday ? "0 0 4px rgba(92,200,138,0.3)" : "none",
              border: day.isToday ? "1px solid var(--bm-accent)" : "1px solid transparent",
              transition: "transform 0.1s",
              cursor: "default",
            }}
          />
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, justifyContent: "flex-end" }}>
        <div style={{ width: 8, height: 8, borderRadius: 2, background: "var(--bm-bg3)" }}/>
        <span style={{ fontSize: 9, color: "var(--bm-text4)" }}>No activity</span>
        <div style={{ width: 8, height: 8, borderRadius: 2, background: "rgba(92,200,138,0.55)" }}/>
        <span style={{ fontSize: 9, color: "var(--bm-text4)" }}>Active</span>
        <div style={{ width: 8, height: 8, borderRadius: 2, background: "var(--bm-accent)" }}/>
        <span style={{ fontSize: 9, color: "var(--bm-text4)" }}>Today</span>
      </div>
    </div>
  );
}

function Tile({ label, value, sub, trend, spark, color, icon: Icon }: {
  label: string; value: string | number; sub?: string;
  trend?: "up"|"down"|"flat"; spark?: number[]; color: string;
  icon?: LucideIcon;
}) {
  const TI = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const tc = trend === "up" ? "var(--bm-green)" : trend === "down" ? "var(--bm-red)" : "var(--bm-text3)";
  return (
    <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }}
      style={{ background:"var(--bm-bg2)", border:"1px solid var(--bm-border)",
        borderRadius:"var(--r-xl)", padding:"18px 20px", position:"relative", overflow:"hidden" }}>
      <div style={{ position:"absolute", top:0, right:0, width:120, height:120,
        background:`radial-gradient(circle at 80% 20%, ${color}18 0%, transparent 65%)`, pointerEvents:"none" }}/>
      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:10 }}>
        {Icon && <Icon size={11} color={color}/>}
        <span style={{ fontSize:9, fontWeight:700, color:"var(--bm-text3)", textTransform:"uppercase", letterSpacing:"0.1em" }}>{label}</span>
      </div>
      <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", gap:8 }}>
        <div>
          <div style={{ fontSize:32, fontWeight:900, color, lineHeight:1, letterSpacing:"-0.04em", marginBottom:6 }}>{value}</div>
          {sub && (
            <div style={{ display:"flex", alignItems:"center", gap:4, fontSize:11, color:tc, fontWeight:600 }}>
              <TI size={10}/> {sub}
            </div>
          )}
        </div>
        {spark && spark.length > 1 && <Sparkline data={spark} color={color} w={80} h={32}/>}
      </div>
    </motion.div>
  );
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
      <div style={{ flex:1, height:1, background:"var(--bm-border)" }}/>
      <span style={{ fontSize:9, fontWeight:700, color:"var(--bm-text3)", textTransform:"uppercase", letterSpacing:"0.14em", whiteSpace:"nowrap" }}>{children}</span>
      <div style={{ flex:1, height:1, background:"var(--bm-border)" }}/>
    </div>
  );
}

type ExportFmt = "pdf"|"png"|"csv"|"json";

type AIWeeklyReportView = {
  summary: string;
  intention_vs_action: string;
  biggest_gap: string;
  next_week_focus: string;
  honest_assessment: string;
  intention_vs_execution_rate?: number;
  execution_trend?: "up" | "down" | "flat";
};

function ExportMenu({ onSelect, onClose }: { onSelect:(f:ExportFmt)=>void; onClose:()=>void }) {
  const opts: { fmt:ExportFmt; label:string; sub:string; icon:LucideIcon }[] = [
    { fmt:"pdf",  label:"PDF Document",  sub:"Print-quality report",        icon:FileText },
    { fmt:"png",  label:"PNG Image",     sub:"Screenshot for sharing",      icon:ImageIcon },
    { fmt:"csv",  label:"CSV Spreadsheet", sub:"Raw data for Excel / Sheets", icon:Table2 },
    { fmt:"json", label:"JSON Export",   sub:"Full structured report data", icon:BarChart3 },
  ];
  return (
    <motion.div initial={{ opacity:0, scale:0.95, y:-4 }} animate={{ opacity:1, scale:1, y:0 }}
      exit={{ opacity:0, scale:0.95, y:-4 }}
      style={{ position:"absolute", top:"calc(100% + 6px)", right:0, zIndex:50,
        background:"var(--bm-bg2)", border:"1px solid var(--bm-border)",
        borderRadius:"var(--r-xl)", padding:8, minWidth:230,
        boxShadow:"0 16px 48px rgba(0,0,0,0.35)" }}>
      {opts.map(({ fmt, label, sub, icon:Icon }) => (
        <button key={fmt} onClick={() => { onSelect(fmt); onClose(); }}
          style={{ display:"flex", alignItems:"center", gap:12, width:"100%",
            padding:"10px 12px", borderRadius:"var(--r-md)", border:"none",
            background:"transparent", cursor:"pointer", textAlign:"left", transition:"background 0.12s" }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--bm-bg3)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
          <div style={{ width:32, height:32, borderRadius:8, background:"var(--bm-bg3)",
            display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            <Icon size={14}/>
          </div>
          <div>
            <div style={{ fontSize:13, fontWeight:600, color:"var(--bm-text)" }}>{label}</div>
            <div style={{ fontSize:11, color:"var(--bm-text3)" }}>{sub}</div>
          </div>
        </button>
      ))}
    </motion.div>
  );
}

export default function ReportsPage() {
  const isMobile = useIsMobile();
  const { plan } = usePlan();
  const reportRef = useRef<HTMLDivElement>(null);
  const reportCardRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState<ExportFmt|null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [exported, setExported] = useState<string|null>(null);
  const [aiReport, setAiReport] = useState<AIWeeklyReportView | null>(null);
  const [aiReportLoading, setAiReportLoading] = useState(false);
  const [xpSynced, setXpSynced] = useState(false);

  const { data: summaries = [], isLoading } = useProjectSummariesQuery();
  const activeProjectId = useActiveProjectId();
  const project = useMemo(() => selectActiveProject(summaries, activeProjectId), [summaries, activeProjectId]);
  const { data: metrics, isLoading: metricsLoading } = useWeeklyReportMetricsQuery(project?.id);

  useEffect(() => {
    void syncStreakFromServer().catch(() => {});
    void syncScoreHistory().catch(() => {});
    void syncXP().then(() => setXpSynced(true)).catch(() => setXpSynced(true));
  }, []);

  useEffect(() => {
    if (!project?.id) return;
    let cancelled = false;
    setAiReport(null);
    setAiReportLoading(true);
    fetch("/api/ai/weekly-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: project.id }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.success && d.data?.summary) {
          setAiReport(d.data);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setAiReportLoading(false); });
    return () => { cancelled = true; };
  }, [project?.id]);

  const liveScore = useMemo(() => {
    if (!project) return 0;
    let streak = 0; try { streak = getStoredStreak(); } catch { /* ok */ }
    let xp = 0; try { xp = getXP(); } catch { /* ok */ }
    return computeStartupScore({ ...project, streak, xp });
  }, [project, xpSynced]);

  const score = metrics?.score ?? liveScore;
  const weeklyScores = metrics?.weeklyScores ?? Array(7).fill(0).map((_,i) => i===6 ? score : 0);
  const taskData = metrics?.taskData ?? [0,0,0,0,0,0,0];
  const tasksThisWeek = taskData.reduce((a,b) => a+b, 0);
  const taskDelta = (metrics?.tasksCompletedThisWeek??0) - (metrics?.tasksCompletedPreviousWeek??0);
  const scoreDelta = score - (metrics?.previousScore ?? score);
  const streak = metrics?.activeStreakDays ?? 0;
  const activeDays = (metrics as (typeof metrics & { activeDays?: string[] }) | undefined)?.activeDays ?? [];

  const scoreHistory = useMemo(() => {
    const hist = getScoreHistory();
    const vals = hist.slice(-7).map(h => h.score);
    while (vals.length < 7) vals.unshift(0);
    return vals;
  }, [xpSynced]);

  const wins = metrics?.wins ?? [];
  const displayWins = aiReport ? [...wins].slice(0, 4) : wins;
  const nextFocus = metrics?.nextFocus ?? [];
  const focusData = metrics?.focusData ?? [];
  const totalFocus = focusData.reduce((a,s) => a+s.value, 0);
  const intentionRate = metrics?.intention_vs_execution_rate ?? null;
  const prevIntentionRate = metrics?.previous_intention_vs_execution_rate ?? null;
  const executionTrend = metrics?.execution_trend ?? "flat";
  const avoidancePattern = metrics?.avoidance_pattern ?? null;

  // ── PATCH 3: Week-over-week sentence ─────────────────────────────────────
  // Generated from real numbers, shown instantly (no spinner), always accurate.
  const weekOverWeekSentence = useMemo(() => {
    const thisWeek = metrics?.tasksCompletedThisWeek ?? 0;
    const lastWeek = metrics?.tasksCompletedPreviousWeek ?? 0;
    if (thisWeek === 0 && lastWeek === 0) return null;
    if (lastWeek === 0) return `${thisWeek} task${thisWeek !== 1 ? "s" : ""} completed this week — no prior week data to compare.`;
    const diff = thisWeek - lastWeek;
    if (diff === 0) return `${thisWeek} tasks completed this week, same as last week.`;
    if (diff > 0) return `${thisWeek} tasks completed this week, up from ${lastWeek} last week (+${diff}).`;
    return `${thisWeek} tasks completed this week, down from ${lastWeek} last week (${diff}).`;
  }, [metrics]);

  // Week start date for DayBars labels
  const currentWeekStart = useMemo(() => {
    const now = new Date();
    const day = (now.getDay() + 6) % 7;
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(now.getDate() - day);
    return d;
  }, []);

  async function handleExport(fmt: ExportFmt) {
    setExporting(fmt);
    try {
      if (fmt === "png") {
        const html2canvas = (await import("html2canvas")).default;
        const el = reportCardRef.current;
        if (!el) return;
        const canvas = await html2canvas(el, {
          backgroundColor: getComputedStyle(document.documentElement).getPropertyValue("--bm-bg").trim() || "#0a0a0a",
          scale: 2, useCORS: true, logging: false,
        });
        const link = document.createElement("a");
        link.download = `buildmind-report-${new Date().toISOString().slice(0, 10)}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
        setExported("Report downloaded ✓");
      } else if (fmt === "pdf") {
        window.print();
        setExported("PDF sent to print dialog");
      } else if (fmt === "csv") {
        const rows = [
          ["Metric","Value"],
          ["Report Date", new Date().toLocaleDateString("en-GB")],
          ["Project", project?.title ?? "—"],
          ["Startup Score", score],
          ["Score Delta This Week", scoreDelta >= 0 ? `+${scoreDelta}` : scoreDelta],
          ["Tasks This Week", tasksThisWeek],
          ["Task Delta vs Last Week", taskDelta >= 0 ? `+${taskDelta}` : taskDelta],
          ["Active Streak (days)", streak],
          ["Execution Rate", intentionRate != null ? `${intentionRate}%` : "—"],
          ["Stage", project?.startup_stage ?? "—"],
          ["Plan", plan],
          ["",""],
          ["Day","Tasks Completed"],
          ...["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d,i) => [d, taskData[i]]),
          ["",""],
          ["Wins",""],
          ...displayWins.map(w => ["", w]),
          ["",""],
          ["Next Focus",""],
          ...nextFocus.map(f => ["", f]),
        ];
        const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"` ).join(",")).join("\n");
        const blob = new Blob([csv], { type:"text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href=url;
        a.download=`buildmind-report-${new Date().toISOString().slice(0,10)}.csv`;
        a.click(); URL.revokeObjectURL(url);
        setExported("CSV downloaded ✓");
      } else if (fmt === "json") {
        const data = {
          generatedAt: new Date().toISOString(),
          project: { title: project?.title, stage: project?.startup_stage },
          score, scoreDelta, streak, tasksThisWeek, taskDelta,
          intentionRate, executionTrend,
          taskData: ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].reduce<Record<string,number>>(
            (acc,d,i) => { acc[d]=taskData[i]; return acc; }, {}),
          weeklyScores, wins: displayWins, nextFocus,
          focusBreakdown: focusData, activeDays, plan,
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type:"application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href=url;
        a.download=`buildmind-report-${new Date().toISOString().slice(0,10)}.json`;
        a.click(); URL.revokeObjectURL(url);
        setExported("JSON downloaded ✓");
      }
    } finally {
      setExporting(null);
      setTimeout(() => setExported(null), 3500);
    }
  }

  if (isLoading || metricsLoading) return (
    <div className="mx-auto max-w-[980px] px-6 py-8">
      <div className="mb-7 space-y-3 border-b border-[var(--bm-border)] pb-5">
        <div className="h-7 w-48 animate-pulse rounded-lg bg-[var(--bm-bg3)]" />
        <div className="h-4 w-72 animate-pulse rounded-lg bg-[var(--bm-bg3)]" />
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        {[0,1,2,3].map((card) => (
          <div key={card} className="h-28 animate-pulse rounded-[var(--r-xl)] border border-[var(--bm-border)] bg-[var(--bm-bg2)]" />
        ))}
      </div>
      <div className="mt-4 h-56 animate-pulse rounded-[var(--r-xl)] border border-[var(--bm-border)] bg-[var(--bm-bg2)]" />
    </div>
  );

  const weekLabel = (() => {
    const now = new Date();
    const start = new Date(now); start.setDate(now.getDate() - ((now.getDay()+6)%7));
    const end = new Date(start); end.setDate(start.getDate()+6);
    const fmt = (d:Date) => d.toLocaleDateString("en-GB",{day:"numeric",month:"short"});
    return `${fmt(start)} – ${fmt(end)}`;
  })();

  return (
    <PaywallGate feature="weeklyReport">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .bm-report-print, .bm-report-print * { visibility: visible; }
          .bm-report-print {
            position: fixed;
            inset: 0;
            width: 100%;
            max-width: 100%;
            padding: 0;
            margin: 0;
            background: #fff;
            color: #000;
          }
          .bm-no-print { display: none !important; }
          @page { margin: 12mm; size: A4 portrait; }
        }
      `}</style>

      <div className="bm-report-print" ref={reportRef}
        style={{ maxWidth:980, margin:"0 auto", padding: isMobile ? "4px 0 40px" : "32px 24px 48px" }}>

        {/* HEADER */}
        <motion.div initial={{ opacity:0, y:-10 }} animate={{ opacity:1, y:0 }} transition={{ duration: 0.2 }} className="mb-7">
          <PageHeader
            title="Weekly Report"
            subtitle={`${weekLabel} · ${project?.title ?? "Your startup"}`}
            action={
              <div className="bm-no-print flex items-center gap-2">
                <span className="hidden rounded-full border border-[var(--bm-accent-bd)] bg-[var(--bm-accent-dim)] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--bm-accent)] sm:inline-flex">
                  {plan.toUpperCase()}
                </span>
                <div className="relative">
                  <button onClick={() => setMenuOpen(v => !v)} disabled={!!exporting}
                    className="flex items-center gap-2 rounded-lg border border-[var(--bm-border)] bg-[var(--bm-bg2)] px-4 py-2.5 text-[12px] font-semibold text-[var(--bm-text2)] transition-colors hover:border-[var(--bm-accent-bd)] hover:text-[var(--bm-accent)]">
                    <Download size={12}/>
                    {exporting ? "Exporting…" : "Export"}
                    <ChevronDown size={10} style={{ transform: menuOpen ? "rotate(180deg)" : "none", transition:"transform 0.15s" }}/>
                  </button>
                  <AnimatePresence>
                    {menuOpen && <ExportMenu onSelect={handleExport} onClose={() => setMenuOpen(false)}/>}
                  </AnimatePresence>
                </div>
              </div>
            }
          />
        </motion.div>

        {/* Toast */}
        <AnimatePresence>
          {exported && (
            <motion.div initial={{ opacity:0, y:-8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
              className="bm-no-print"
              style={{ background:"var(--bm-accent-dim)", border:"1px solid var(--bm-accent-bd)",
                borderRadius:"var(--r-lg)", padding:"10px 16px", marginBottom:16,
                fontSize:12, color:"var(--bm-accent)", fontWeight:600,
                display:"flex", alignItems:"center", gap:8 }}>
              <CheckCircle2 size={13}/> {exported}
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={reportCardRef} style={{ background:"var(--bm-bg)", padding: isMobile ? 0 : 8 }}>

        {/* HERO ROW */}
        <div style={{ display:"grid",
          gridTemplateColumns: isMobile ? "1fr 1fr" : "auto 1fr 1fr 1fr",
          gap:12, marginBottom:16, alignItems:"stretch" }}>
          {/* Score arc — hidden on mobile to save space, shown in project snapshot instead */}
          {!isMobile && (
            <motion.div initial={{ opacity:0, scale:0.9 }} animate={{ opacity:1, scale:1 }} transition={{ delay:0.05 }}
              style={{ background:"var(--bm-bg2)", border:"1px solid var(--bm-border)",
                borderRadius:"var(--r-xl)", padding:"20px 24px",
                display:"flex", flexDirection:"column", alignItems:"center",
                justifyContent:"center", gap:10, minWidth:160, position:"relative", overflow:"hidden" }}>
              <ScoreArc value={score} size={110}/>
              {scoreDelta !== 0 && (
                <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, fontWeight:700,
                  color: scoreDelta > 0 ? "var(--bm-green)" : "var(--bm-red)",
                  background: scoreDelta > 0 ? "rgba(92,200,138,0.1)" : "rgba(224,85,85,0.1)",
                  border: `1px solid ${scoreDelta > 0 ? "rgba(92,200,138,0.25)" : "rgba(224,85,85,0.25)"}`,
                  borderRadius:20, padding:"3px 10px" }}>
                  {scoreDelta > 0 ? <TrendingUp size={10}/> : <TrendingDown size={10}/>}
                  {scoreDelta > 0 ? `+${scoreDelta}` : scoreDelta} this week
                </div>
              )}
            </motion.div>
          )}
          <Tile label="Tasks Done" value={tasksThisWeek}
            sub={taskDelta===0 ? "Same as last week" : `${taskDelta>0?"+":""}${taskDelta} vs last week`}
            trend={taskDelta>0?"up":taskDelta<0?"down":"flat"}
            spark={taskData} color="var(--bm-accent)" icon={CheckCircle2}/>
          <Tile label="Active Streak" value={`${streak}d`}
            sub={streak>0?(streak>=7?"🔥 On fire":"Keep going"):"Complete a task"}
            trend={streak>0?"up":"flat"} color="var(--bm-amber)" icon={Flame}/>
          {intentionRate != null ? (
            <Tile label="Execution Rate" value={`${intentionRate}%`}
              sub={prevIntentionRate != null
                ? `${intentionRate > prevIntentionRate ? "+" : ""}${intentionRate - prevIntentionRate}% vs last week`
                : "Check-ins completed vs total"}
              trend={executionTrend} color={intentionRate >= 60 ? "var(--bm-green)" : intentionRate >= 30 ? "var(--bm-amber)" : "var(--bm-red)"} icon={TrendingUp}/>
          ) : (
            <Tile label="Total XP" value={getXP()}
              sub="Lifetime achievement points" trend="up"
              spark={scoreHistory} color="#A78BFA" icon={Zap}/>
          )}
        </div>

        {/* CHARTS */}
        <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1.5fr 1fr", gap:12, marginBottom:12 }}>
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.15 }}
            style={{ background:"var(--bm-bg2)", border:"1px solid var(--bm-border)",
              borderRadius:"var(--r-xl)", padding:"20px" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
              <span style={{ fontSize:12, fontWeight:600, color:"var(--bm-text2)" }}>Task Completion — This Week</span>
              <span style={{ fontSize:11, color:"var(--bm-text3)" }}>{tasksThisWeek} total</span>
            </div>
            <DayBars data={taskData} color="var(--bm-accent)" weekStart={currentWeekStart}/>
          </motion.div>
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.2 }}
            style={{ background:"var(--bm-bg2)", border:"1px solid var(--bm-border)",
              borderRadius:"var(--r-xl)", padding:"20px" }}>
            <div style={{ fontSize:12, fontWeight:600, color:"var(--bm-text2)", marginBottom:16 }}>Focus Breakdown</div>
            {focusData.length === 0 ? (
              <div style={{ fontSize:12, color:"var(--bm-text3)", lineHeight:1.7 }}>Complete tasks to see focus breakdown.</div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                {focusData.map((s,i) => (
                  <div key={i}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                      <span style={{ fontSize:11, color:"var(--bm-text3)", fontWeight:500 }}>{s.label}</span>
                      <span style={{ fontSize:11, color:s.color, fontWeight:700 }}>
                        {totalFocus ? Math.round((s.value/totalFocus)*100) : 0}%
                      </span>
                    </div>
                    <div style={{ height:5, borderRadius:99, background:"var(--bm-bg3)", overflow:"hidden" }}>
                      <motion.div
                        initial={{ width:0 }} animate={{ width: totalFocus ? `${(s.value/totalFocus)*100}%` : "0%" }}
                        transition={{ duration:0.8, delay:i*0.1, ease:"easeOut" }}
                        style={{ height:"100%", background:s.color, borderRadius:99, boxShadow:`0 0 6px ${s.color}66` }}/>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </div>

        {/* ── PATCH 1: DOT CALENDAR ─────────────────────────────────────── */}
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.22 }}
          style={{ background:"var(--bm-bg2)", border:"1px solid var(--bm-border)",
            borderRadius:"var(--r-xl)", padding:"20px", marginBottom:12 }}>
          <div style={{ display:"flex", justifyContent:"flex-start" }}>
            <DotCalendar activeDays={activeDays} streak={streak}/>
          </div>
        </motion.div>

        {/* SCORE TREND */}
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.25 }}
          style={{ background:"var(--bm-bg2)", border:"1px solid var(--bm-border)",
            borderRadius:"var(--r-xl)", padding:"20px", marginBottom:16 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <Activity size={13} color="var(--bm-accent)"/>
              <span style={{ fontSize:12, fontWeight:600, color:"var(--bm-text2)" }}>Score Trend — Last 7 Days</span>
            </div>
            <div style={{ display:"flex", gap:12 }}>
              {weeklyScores.map((s,i) => (
                <div key={i} style={{ textAlign:"center" }}>
                  <div style={{ fontSize:11, fontWeight:700,
                    color: s>=60?"var(--bm-green)":s>=30?"var(--bm-amber)":s>0?"var(--bm-red)":"var(--bm-text3)" }}>
                    {s||"—"}
                  </div>
                  <div style={{ fontSize:9, color:"var(--bm-text3)" }}>
                    {["M","T","W","T","F","S","S"][i]}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ height:60 }}>
            <Sparkline data={weeklyScores.map(s=>s||0)} color="var(--bm-accent)" w={isMobile?320:880} h={60}/>
          </div>
        </motion.div>

        {/* WINS & FOCUS */}
        <SectionHead>This Week</SectionHead>
        <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:12, marginBottom:16 }}>
          <motion.div initial={{ opacity:0, x:-8 }} animate={{ opacity:1, x:0 }} transition={{ delay:0.3 }}
            style={{ background:"var(--bm-bg2)", border:"1px solid var(--bm-border)",
              borderRadius:"var(--r-xl)", padding:"18px 20px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:14 }}>
              <Star size={12} color="var(--bm-green)"/>
              <span style={{ fontSize:12, fontWeight:700, color:"var(--bm-text)" }}>Wins</span>
            </div>
            {displayWins.length === 0 ? (
              <div style={{ fontSize:12, color:"var(--bm-text3)", lineHeight:1.6 }}>Complete tasks or milestones to log wins.</div>
            ) : displayWins.map((w,i) => (
              <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start",
                padding:"9px 0", borderBottom: i<displayWins.length-1 ? "1px solid var(--bm-border)" : "none" }}>
                <CheckCircle2 size={13} color="var(--bm-green)" style={{ flexShrink:0, marginTop:1 }}/>
                <span style={{ fontSize:13, color:"var(--bm-text2)", lineHeight:1.5 }}>{w}</span>
              </div>
            ))}
          </motion.div>
          <motion.div initial={{ opacity:0, x:8 }} animate={{ opacity:1, x:0 }} transition={{ delay:0.35 }}
            style={{ background:"var(--bm-bg2)", border:"1px solid var(--bm-border)",
              borderRadius:"var(--r-xl)", padding:"18px 20px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:14 }}>
              <Target size={12} color="var(--bm-amber)"/>
              <span style={{ fontSize:12, fontWeight:700, color:"var(--bm-text)" }}>Focus Next Week</span>
            </div>
            {nextFocus.length === 0 ? (
              <div style={{ fontSize:12, color:"var(--bm-text3)", lineHeight:1.6 }}>Create project tasks to generate focus items.</div>
            ) : nextFocus.map((f,i) => (
              <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start",
                padding:"9px 0", borderBottom: i<nextFocus.length-1 ? "1px solid var(--bm-border)" : "none" }}>
                <div style={{ width:5, height:5, borderRadius:"50%", background:"var(--bm-amber)",
                  flexShrink:0, marginTop:5, boxShadow:"0 0 6px var(--bm-amber)" }}/>
                <span style={{ fontSize:13, color:"var(--bm-text2)", lineHeight:1.5 }}>{f}</span>
              </div>
            ))}
          </motion.div>
        </div>

        {/* PROJECT SNAPSHOT */}
        {project && (
          <>
            <SectionHead>Project Snapshot</SectionHead>
            <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.4 }}
              style={{ background:"var(--bm-bg2)", border:"1px solid var(--bm-border)",
                borderRadius:"var(--r-xl)", padding:"20px",
                display:"grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4,1fr)",
                gap:20, marginBottom:16 }}>
              {([
                { label:"Stage",      value: project.startup_stage ?? "—",         color:"var(--bm-text)" },
                // Tasks Done: weekly check-ins completed (from reflexion_learning_log), not milestone tasks
                { label:"Check-ins",  value:`${tasksThisWeek} this week`,           color:"var(--bm-accent)" },
                // Exec Score: use liveScore (computed) — execution_score in DB can be stale/null
                { label:"Exec Score", value: project.execution_score != null ? project.execution_score : liveScore, color:"var(--bm-amber)" },
                // Momentum: server value from founder_context.momentum_score only — never fall back to stale project column
                { label:"Momentum",   value: metrics?.momentumScore != null ? metrics.momentumScore : "—", color:"#A78BFA" },
              ] as const).map(({ label, value, color }) => (
                <div key={label}>
                  <div style={{ fontSize:9, fontWeight:700, color:"var(--bm-text3)",
                    textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:6 }}>{label}</div>
                  <div style={{ fontSize:22, fontWeight:900, color, letterSpacing:"-0.03em" }}>{value}</div>
                </div>
              ))}
            </motion.div>
          </>
        )}

        {/* AI INSIGHT */}
        <motion.div initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.45 }}
          style={{ background:"var(--bm-accent-dim)", border:"1px solid var(--bm-accent-bd)",
            borderLeft:"3px solid var(--bm-accent)", borderRadius:"var(--r-xl)", padding:"18px 22px",
            marginBottom: avoidancePattern ? 12 : 0 }}>
          <div style={{ fontSize:9, fontWeight:700, color:"var(--bm-accent)",
            textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:8 }}>BuildMind Analysis</div>

          {/* ── PATCH 3: Week-over-week sentence — always shown, no spinner ── */}
          {weekOverWeekSentence && (
            <p style={{ fontSize:13, color:"var(--bm-text3)", margin:"0 0 12px", fontWeight:500, lineHeight:1.5 }}>
              {weekOverWeekSentence}
            </p>
          )}

          {/* Intention vs execution rate */}
          {intentionRate != null && (
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12,
              padding:"10px 14px", borderRadius:10,
              background: intentionRate >= 60 ? "rgba(92,200,138,0.08)" : "rgba(255,170,0,0.08)",
              border: `1px solid ${intentionRate >= 60 ? "rgba(92,200,138,0.2)" : "rgba(255,170,0,0.2)"}` }}>
              <div>
                <p style={{ fontSize:11, fontWeight:700, color:"var(--bm-text3)", textTransform:"uppercase",
                  letterSpacing:"0.08em", margin:"0 0 2px" }}>Check-in Follow-through This Week</p>
                <p style={{ fontSize:24, fontWeight:900, color: intentionRate >= 60 ? "var(--bm-green)" : "var(--bm-amber)",
                  margin:0, letterSpacing:"-0.03em", lineHeight:1 }}>
                  {intentionRate}%
                  {prevIntentionRate != null && (
                    <span style={{ fontSize:11, fontWeight:600, marginLeft:8,
                      color: intentionRate > prevIntentionRate ? "var(--bm-green)" : intentionRate < prevIntentionRate ? "var(--bm-red)" : "var(--bm-text3)" }}>
                      {intentionRate > prevIntentionRate ? "↑" : intentionRate < prevIntentionRate ? "↓" : "→"} {Math.abs(intentionRate - prevIntentionRate)}% vs last week
                    </span>
                  )}
                </p>
              </div>
            </div>
          )}

          {aiReportLoading && (
            <div style={{ height: 60, background: "var(--bm-bg3)", borderRadius: 8,
              animation: "pulse 1.5s ease-in-out infinite" }} />
          )}

          {aiReport && !aiReportLoading ? (
            <>
              <p style={{ fontSize:14, color:"var(--bm-text)", lineHeight:1.65,
                margin:"0 0 12px", fontWeight:500 }}>
                {aiReport.summary}
              </p>
              {aiReport.intention_vs_action && (
                <div style={{ marginBottom:12, padding:"12px 14px",
                  background:"rgba(168,213,186,0.04)",
                  border:"1px solid rgba(168,213,186,0.15)", borderRadius:10 }}>
                  <p style={{ fontSize:9, fontWeight:700, color:"var(--bm-accent)",
                    textTransform:"uppercase", letterSpacing:"0.1em", margin:"0 0 6px" }}>
                    Intention vs Reality
                  </p>
                  <p style={{ fontSize:13, color:"var(--bm-text2)", lineHeight:1.6, margin:0 }}>
                    {aiReport.intention_vs_action}
                  </p>
                </div>
              )}
              {aiReport.honest_assessment && (
                <div style={{ padding:"12px 14px",
                  background:"rgba(248,113,113,0.05)",
                  border:"1px solid rgba(248,113,113,0.15)", borderRadius:10,
                  marginBottom: aiReport.next_week_focus ? 10 : 0 }}>
                  <p style={{ fontSize:9, fontWeight:700, color:"var(--bm-red)",
                    textTransform:"uppercase", letterSpacing:"0.1em", margin:"0 0 6px" }}>
                    Honest Assessment
                  </p>
                  <p style={{ fontSize:13, color:"var(--bm-text2)", lineHeight:1.6,
                    margin:0, fontStyle:"italic" }}>
                    &quot;{aiReport.honest_assessment}&quot;
                  </p>
                </div>
              )}
              {aiReport.next_week_focus && (
                <p style={{ fontSize:12, color:"var(--bm-accent)", fontWeight:600, margin:"10px 0 0" }}>
                  → Monday priority: {aiReport.next_week_focus}
                </p>
              )}
            </>
          ) : !aiReportLoading ? (
            <>
              <p style={{ fontSize:14, color:"var(--bm-text)", lineHeight:1.65,
                margin:"0 0 8px", fontWeight:500 }}>
                {scoreDelta > 5
                  ? `Strong week — score climbed ${scoreDelta} points.`
                  : tasksThisWeek > 0
                  ? `${tasksThisWeek} task${tasksThisWeek > 1 ? "s" : ""} completed this week.`
                  : `No activity recorded this week.`}
              </p>
              {nextFocus.length > 0 && (
                <p style={{ fontSize:12, color:"var(--bm-accent)", fontWeight:600, margin:0 }}>
                  → Top priority next week: {nextFocus[0]}
                </p>
              )}
            </>
          ) : null}
        </motion.div>

        {/* Avoidance pattern callout */}
        {avoidancePattern && (
          <motion.div initial={{ opacity:0, y:4 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.5 }}
            style={{ borderLeft:"2px solid var(--bm-amber)", paddingLeft:14, marginBottom:0, marginTop:12 }}>
            <p style={{ fontSize:13, color:"var(--bm-text2)", margin:"0 0 4px", lineHeight:1.5 }}>
              Pattern detected: {avoidancePattern}. This is being written to your behavioral profile.
            </p>
            <p style={{ fontSize:12, color:"var(--bm-text3)", margin:0 }}>
              Monday&apos;s task will route around this pattern automatically.
            </p>
          </motion.div>
        )}
        </div>

        {/* FOOTER */}
        <div style={{ marginTop:32, paddingTop:16, borderTop:"1px solid var(--bm-border)",
          display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span style={{ fontSize:10, color:"var(--bm-text3)" }}>
            Generated by BuildMind · {new Date().toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})}
          </span>
          <span style={{ fontSize:10, color:"var(--bm-text3)" }}>{project?.title}</span>
        </div>
      </div>
    </PaywallGate>
  );
}
