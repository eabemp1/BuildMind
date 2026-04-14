"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useProjectSummariesQuery } from "@/lib/queries";
import BuildMindLoader from "@/components/BuildMindLoader";
import { useLimitModal } from "@/components/LimitModal";
import { updateAchievementStats, checkAndUnlockAchievements } from "@/lib/achievements";
import PaywallGate from "@/components/PaywallGate";

// ─── Viz design tokens ────────────────────────────────────────────────────────
const VIZ = {
  panel: "rgba(14,14,20,0.97)",
  border: "rgba(255,255,255,0.06)",
  text1: "#f0f0f5",
  text2: "#9494a8",
  text3: "#4a4a5a",
  indigo: "#6366f1",
  violet: "#8b5cf6",
  emerald: "#4ade80",
  amber: "#fbbf24",
  rose: "#f87171",
  cyan: "#22d3ee",
};

function ArcRing({ value, max = 100, size = 120, stroke = 8, color, label, sublabel }: {
  value: number; max?: number; size?: number; stroke?: number; color: string; label: string; sublabel?: string;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={stroke} />
        <motion.circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - Math.min(value/max,1)*circ }}
          transition={{ duration: 1.4, ease: "easeOut", delay: 0.3 }} />
      </svg>
      <div style={{ position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2 }}>
        <motion.span initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.9 }}
          style={{ fontSize:size*0.22, fontWeight:700, color, lineHeight:1, fontVariantNumeric:"tabular-nums" }}>{label}</motion.span>
        {sublabel && <span style={{ fontSize:size*0.1, color:VIZ.text3, textTransform:"uppercase", letterSpacing:"0.08em" }}>{sublabel}</span>}
      </div>
    </div>
  );
}

function HBar({ value, max=100, color, label }: { value:number; max?:number; color:string; label:string }) {
  const pct = Math.min(100, Math.round((value/max)*100));
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
      <div style={{ display:"flex", justifyContent:"space-between" }}>
        <span style={{ fontSize:11, color:VIZ.text2 }}>{label}</span>
        <span style={{ fontSize:12, fontWeight:600, color, fontVariantNumeric:"tabular-nums" }}>{pct}%</span>
      </div>
      <div style={{ height:3, background:"rgba(255,255,255,0.05)", borderRadius:999, overflow:"hidden" }}>
        <motion.div initial={{ width:0 }} animate={{ width:`${pct}%` }} transition={{ duration:1.1, ease:"easeOut", delay:0.4 }}
          style={{ height:"100%", background:color, borderRadius:999 }} />
      </div>
    </div>
  );
}

function StatTile({ label, value, color, icon }: { label:string; value:string|number; color?:string; icon?:string }) {
  return (
    <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }}
      style={{ background:VIZ.panel, border:`1px solid ${VIZ.border}`, borderRadius:12, padding:"16px 18px" }}>
      {icon && <div style={{ fontSize:16, marginBottom:6 }}>{icon}</div>}
      <div style={{ fontSize:9, color:VIZ.text3, textTransform:"uppercase", letterSpacing:"0.1em", fontWeight:600, marginBottom:5 }}>{label}</div>
      <div style={{ fontSize:26, fontWeight:700, color:color??VIZ.text1, letterSpacing:"-0.04em", lineHeight:1 }}>{value}</div>
    </motion.div>
  );
}

function Panel({ accent, title, children, delay=0 }: { accent:string; title:string; children:React.ReactNode; delay?:number }) {
  return (
    <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} transition={{ delay }}
      style={{ background:VIZ.panel, border:`1px solid ${VIZ.border}`, borderTop:`2px solid ${accent}`, borderRadius:12, overflow:"hidden" }}>
      <div style={{ padding:"11px 18px", borderBottom:`1px solid ${VIZ.border}`, display:"flex", alignItems:"center", gap:8 }}>
        <div style={{ width:5, height:5, borderRadius:"50%", background:accent }} />
        <span style={{ fontSize:10, color:VIZ.text2, textTransform:"uppercase", letterSpacing:"0.1em", fontWeight:600 }}>{title}</span>
      </div>
      <div style={{ padding:"18px 20px" }}>{children}</div>
    </motion.div>
  );
}

function TypewriterText({ text, isNew }: { text:string; isNew?:boolean }) {
  const [d, setD] = useState(isNew ? "" : text);
  useEffect(() => {
    if (!isNew) { setD(text); return; }
    setD(""); let i=0;
    const tick = () => { if(i>=text.length)return; const c=Math.floor(Math.random()*3)+2; i=Math.min(i+c,text.length); setD(text.slice(0,i)); setTimeout(tick,text[i-1]==="."?60:14); };
    setTimeout(tick, 100);
  }, [text, isNew]);
  return <span style={{ fontSize:13, color:VIZ.text2, lineHeight:1.75 }}>{d}{isNew&&d.length<text.length&&<motion.span animate={{ opacity:[1,0] }} transition={{ duration:0.5, repeat:Infinity }} style={{ display:"inline-block",width:2,height:"1em",background:VIZ.violet,marginLeft:1,verticalAlign:"text-bottom" }} />}</span>;
}

function ThinkingSteps({ steps, active }: { steps:string[]; active:boolean }) {
  const [visible, setVisible] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    if (!active) { setVisible(steps.length); setTimeout(()=>setCollapsed(true),900); return; }
    setVisible(0); setCollapsed(false); let i=0;
    const iv = setInterval(()=>{ i++; setVisible(i); if(i>=steps.length)clearInterval(iv); },650);
    return ()=>clearInterval(iv);
  },[active, steps]);
  return (
    <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }}
      style={{ background:"rgba(99,102,241,0.04)", border:"1px solid rgba(99,102,241,0.12)", borderRadius:10, padding:"12px 16px", marginBottom:16 }}>
      <button onClick={()=>setCollapsed(c=>!c)} style={{ display:"flex", alignItems:"center", gap:8, background:"none", border:"none", cursor:"pointer", padding:0, fontFamily:"inherit", width:"100%" }}>
        {active ? <motion.div animate={{ rotate:360 }} transition={{ duration:1.5, repeat:Infinity, ease:"linear" }} style={{ width:12,height:12,borderRadius:"50%",border:"1.5px solid #a78bfa",borderTopColor:"transparent",flexShrink:0 }} />
                : <span style={{ fontSize:10,color:"#555" }}>▾</span>}
        <span style={{ fontSize:11, color:active?"#a78bfa":"#555", fontFamily:"monospace" }}>
          {active ? "Analyzing your startup..." : collapsed ? `${steps.length} analysis steps` : "Analysis reasoning"}
        </span>
      </button>
      <AnimatePresence>
        {!collapsed && (
          <motion.div initial={{ height:0,opacity:0 }} animate={{ height:"auto",opacity:1 }} exit={{ height:0,opacity:0 }} transition={{ duration:0.2 }} style={{ overflow:"hidden" }}>
            <div style={{ marginTop:10, borderLeft:"1.5px solid rgba(167,139,250,0.2)", paddingLeft:12, display:"flex", flexDirection:"column", gap:4 }}>
              {steps.slice(0,visible).map((s,i)=>(
                <motion.div key={i} initial={{ opacity:0,x:-6 }} animate={{ opacity:1,x:0 }} style={{ fontSize:11,color:"#555",fontFamily:"monospace",display:"flex",gap:6 }}>
                  <span style={{ color:"#a78bfa",flexShrink:0 }}>→</span>{s}
                  {i===visible-1&&active&&<motion.span animate={{ opacity:[0,1,0] }} transition={{ duration:0.8,repeat:Infinity }} style={{ color:"#a78bfa" }}>▊</motion.span>}
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function ReportPage() {
  const router = useRouter();
  const { showLimit } = useLimitModal();
  const { data: summaries = [], isLoading: summariesLoading } = useProjectSummariesQuery();
  const [plan, setPlan] = useState<"free"|"builder"|"venture">("free");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [generating, setGenerating] = useState(false);
  const [reasoning] = useState<string[]>([
    "Reading your project and milestone data...",
    "Computing task completion rate and momentum score...",
    "Identifying your biggest execution gap this week...",
    "Measuring intention vs. actual delivery delta...",
    "Drafting your honest weekly assessment...",
  ]);
  const [reasoningActive, setReasoningActive] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<{
    summary:string; intention_vs_action:string; biggest_gap:string;
    next_week_focus:string; honest_assessment:string; momentum_score:number;
  }|null>(null);

  useEffect(() => { updateAchievementStats({ reportViewed:true }); setTimeout(()=>checkAndUnlockAchievements(),1000); },[]);
  useEffect(() => {
    if (typeof window !== "undefined") {
      const local = localStorage.getItem("bm_plan") as "free"|"builder"|"venture"|null;
      setPlan(local&&["free","builder","venture"].includes(local)?local:"free");
    }
  },[]);

  const hasWeeklyReport = plan==="builder"||plan==="venture";
  const activeProjectId = selectedProjectId||summaries[0]?.id||"";
  const totalTasks = summaries.reduce((a,s)=>a+(s.tasksTotal??0),0);
  const completedTasks = summaries.reduce((a,s)=>a+(s.tasksCompleted??0),0);
  const pct = totalTasks>0?Math.round((completedTasks/totalTasks)*100):0;
  const pColor = pct>=70?VIZ.emerald:pct>=40?VIZ.amber:VIZ.rose;

  if (summariesLoading) return <BuildMindLoader variant="card" label="Loading your report data…" />;

  const generate = async () => {
    if (!hasWeeklyReport) { showLimit("weekly_report"); return; }
    setGenerating(true); setReasoningActive(true); setShowAnswer(false); setError(""); setReport(null);
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error("Not authenticated");
      const res = await fetch("/api/ai/weekly-report",{ method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ userId:data.user.id, projectId:activeProjectId }) });
      const body = await res.json().catch(()=>({}));
      if (!res.ok||!body.success) throw new Error(body?.error??"Report failed");
      setTimeout(()=>{ setReasoningActive(false); setReport(body.data); setIsNew(true); setShowAnswer(true); setGenerating(false); }, reasoning.length*650+500);
    } catch(err) { setError(err instanceof Error?err.message:"Failed"); setReasoningActive(false); setGenerating(false); }
  };

  return (
    <PaywallGate feature="weeklyReport" featureLabel="Weekly Report" requiredPlan="builder" variant="block">
    <div style={{ maxWidth:900, margin:"0 auto", fontFamily:"system-ui,sans-serif", color:VIZ.text1, paddingBottom:60 }}>

      {/* Header */}
      <motion.div initial={{ opacity:0,y:-6 }} animate={{ opacity:1,y:0 }}
        style={{ marginBottom:24, paddingBottom:18, borderBottom:`1px solid ${VIZ.border}`, display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <div>
          <div style={{ fontSize:21, fontWeight:700, letterSpacing:"-0.03em", marginBottom:3 }}>Weekly Report</div>
          <div style={{ fontSize:12, color:VIZ.text3 }}>Intention vs action · Honest mirror · Forward focus</div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          {summaries.length>1&&(
            <select value={activeProjectId} onChange={e=>setSelectedProjectId(e.target.value)}
              style={{ background:VIZ.panel, border:`1px solid ${VIZ.border}`, borderRadius:8, padding:"7px 11px", fontSize:12, color:VIZ.text2, outline:"none", fontFamily:"inherit", cursor:"pointer" }}>
              {summaries.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          )}
          <motion.button whileHover={{ scale:1.02 }} whileTap={{ scale:0.97 }} onClick={generate} disabled={generating}
            style={{ padding:"8px 18px", borderRadius:9, fontSize:12, fontWeight:700, cursor:generating?"not-allowed":"pointer", fontFamily:"inherit", border:"none", opacity:generating?0.65:1,
              background:hasWeeklyReport?`linear-gradient(135deg,${VIZ.indigo},${VIZ.violet})`:"rgba(99,102,241,0.08)",
              color:hasWeeklyReport?"#fff":VIZ.indigo }}>
            {generating?"Generating...":hasWeeklyReport?"⚡ Generate Report":"🔒 Builder plan"}
          </motion.button>
        </div>
      </motion.div>

      {/* Stats */}
      {summaries.length>0&&(
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:14 }}>
          <StatTile label="Projects" value={summaries.length} icon="📁" />
          <StatTile label="Tasks done" value={completedTasks} icon="✅" color={VIZ.emerald} />
          <StatTile label="Total tasks" value={totalTasks} icon="📋" />
          <StatTile label="Completion" value={`${pct}%`} icon="📈" color={pColor} />
        </div>
      )}

      {/* Mirror gauge */}
      {summaries.length>0&&(
        <Panel accent={VIZ.violet} title="🪞  The Honest Mirror" delay={0.1}>
          <div style={{ display:"flex", alignItems:"center", gap:24 }}>
            <ArcRing value={pct} color={pColor} label={`${pct}%`} sublabel="done" size={100} stroke={7} />
            <div style={{ flex:1, display:"flex", flexDirection:"column", gap:12 }}>
              <div>
                <div style={{ fontSize:14, fontWeight:600, color:VIZ.text1, marginBottom:2 }}>
                  {pct>=70?"Strong execution":pct>=40?"Moderate execution":"Execution gap detected"}
                </div>
                <div style={{ fontSize:12, color:VIZ.text2 }}>{completedTasks} of {totalTasks} tasks completed</div>
              </div>
              <HBar value={completedTasks} max={totalTasks} color={pColor} label="Task completion rate" />
              <div style={{ fontSize:11, color:VIZ.text3, lineHeight:1.6, borderTop:`1px solid ${VIZ.border}`, paddingTop:10 }}>
                {pct<100?`${totalTasks-completedTasks} task${totalTasks-completedTasks!==1?"s":""} still open. Every unclosed task is a decision you deferred.`:"All tasks done. That's rare. The best founders maintain this."}
              </div>
            </div>
          </div>
        </Panel>
      )}

      {summaries.length===0&&(
        <motion.div initial={{ opacity:0,y:10 }} animate={{ opacity:1,y:0 }}
          style={{ background:VIZ.panel, border:`1px solid ${VIZ.border}`, borderRadius:12, padding:"64px 32px", textAlign:"center", marginTop:16 }}>
          <div style={{ fontSize:40, marginBottom:16 }}>🪞</div>
          <div style={{ fontSize:16, fontWeight:600, marginBottom:8 }}>No projects yet</div>
          <div style={{ fontSize:13, color:VIZ.text2, lineHeight:1.65, marginBottom:20 }}>Create a project and complete tasks to see your weekly report.</div>
          <button onClick={()=>router.push("/projects")} style={{ background:VIZ.indigo, color:"#fff", fontSize:13, fontWeight:600, padding:"10px 22px", borderRadius:9, border:"none", cursor:"pointer", fontFamily:"inherit" }}>Create project →</button>
        </motion.div>
      )}

      {(generating||showAnswer)&&<div style={{ marginTop:20 }}><ThinkingSteps steps={reasoning} active={reasoningActive} /></div>}
      {error&&<motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} style={{ fontSize:13, color:VIZ.rose, padding:"12px 16px", background:"rgba(248,113,113,0.06)", border:"1px solid rgba(248,113,113,0.15)", borderRadius:10, marginTop:12 }}>{error}</motion.div>}

      {/* Report results */}
      <AnimatePresence>
        {report&&showAnswer&&(
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} style={{ display:"flex", flexDirection:"column", gap:12, marginTop:4 }}>
            <Panel accent={VIZ.cyan} title="⚡  Momentum Score" delay={0}>
              <div style={{ display:"flex", alignItems:"center", gap:24 }}>
                <ArcRing value={report.momentum_score} color={report.momentum_score>=70?VIZ.emerald:report.momentum_score>=40?VIZ.amber:VIZ.rose}
                  label={String(report.momentum_score)} sublabel="momentum" size={110} stroke={8} />
                <div style={{ flex:1 }}>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
                    <HBar value={report.momentum_score} max={100} color={report.momentum_score>=70?VIZ.emerald:VIZ.amber} label="Weekly momentum" />
                    <HBar value={pct} max={100} color={pColor} label="Task completion" />
                  </div>
                  <div style={{ borderTop:`1px solid ${VIZ.border}`, paddingTop:12 }}><TypewriterText text={report.summary} isNew={isNew} /></div>
                </div>
              </div>
            </Panel>
            {[
              { label:"Intention vs Action", value:report.intention_vs_action, accent:VIZ.amber, icon:"⚡" },
              { label:"Biggest Gap", value:report.biggest_gap, accent:VIZ.rose, icon:"🎯" },
              { label:"Next Week Focus", value:report.next_week_focus, accent:VIZ.emerald, icon:"🚀" },
              { label:"Honest Assessment", value:report.honest_assessment, accent:VIZ.violet, icon:"🔍" },
            ].map((s,i)=>(
              <Panel key={s.label} accent={s.accent} title={`${s.icon}  ${s.label}`} delay={0.08*(i+1)}>
                <TypewriterText text={s.value} isNew={isNew&&i<2} />
              </Panel>
            ))}
            <div style={{ display:"flex", gap:8, marginTop:4 }}>
              <button onClick={()=>router.push("/ai-coach")} style={{ background:"transparent", border:"1px solid rgba(99,102,241,0.25)", color:VIZ.indigo, fontSize:12, padding:"9px 16px", borderRadius:8, cursor:"pointer", fontFamily:"inherit" }}>Discuss with AI Coach →</button>
              <button onClick={generate} style={{ background:"transparent", border:`1px solid ${VIZ.border}`, color:VIZ.text2, fontSize:12, padding:"9px 16px", borderRadius:8, cursor:"pointer", fontFamily:"inherit" }}>Regenerate</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!hasWeeklyReport&&!generating&&!showAnswer&&summaries.length>0&&(
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.3 }}
          style={{ marginTop:20, background:"rgba(99,102,241,0.04)", border:"1px solid rgba(99,102,241,0.18)", borderRadius:14, padding:"36px 28px", textAlign:"center" }}>
          <div style={{ fontSize:36, marginBottom:12 }}>⚡</div>
          <div style={{ fontSize:17, fontWeight:700, marginBottom:10, letterSpacing:"-0.02em" }}>Weekly AI Strategy Report</div>
          <div style={{ fontSize:13, color:VIZ.text2, lineHeight:1.75, marginBottom:24, maxWidth:460, margin:"0 auto 24px" }}>
            Every week: your intention vs action gap, momentum score, biggest blocker, next week focus, and a brutally honest assessment of your trajectory. Builder plan only.
          </div>
          <button onClick={()=>showLimit("weekly_report")} style={{ padding:"12px 30px", background:`linear-gradient(135deg,${VIZ.indigo},${VIZ.violet})`, color:"#fff", fontWeight:700, fontSize:14, borderRadius:10, border:"none", cursor:"pointer", fontFamily:"inherit" }}>Unlock weekly report — $19/mo →</button>
          <div style={{ fontSize:11, color:VIZ.text3, marginTop:10 }}>Cancel anytime.</div>
        </motion.div>
      )}
    </div>
    </PaywallGate>
  );
}
