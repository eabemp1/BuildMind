"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence, useAnimation } from "framer-motion";
import {
  type BuildMindMilestone, type BuildMindTask,
  computeStartupScore, updateMilestoneForCurrentUser,
} from "@/lib/buildmind";
import { useDeleteProjectMutation, useProjectDetailQuery, useUpdateTaskMutation } from "@/lib/queries";
import { setActiveProjectId } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import { recordTaskCompletion, incrementDailyStreak, checkUpgradeTrigger, getTasksDone, getStoredStreak } from "@/lib/upgrade";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queries";
import BuildMindLoader from "@/components/BuildMindLoader";
import { ScoreBreakdown } from "@/components/ui/ScoreBreakdown";

type Tab = "milestones" | "tasks" | "validation" | "roadmap";

// ─── Design tokens ──────────────────────────────────────────────────────────
const VIZ = {
  panel: "rgba(12,12,18,0.98)",
  panelHover: "rgba(16,16,24,0.98)",
  border: "rgba(255,255,255,0.06)",
  text1: "#f0f0f5",
  text2: "#9494a8",
  text3: "#4a4a5a",
  indigo: "#6366f1",
  violet: "#8b5cf6",
  emerald: "#4ade80",
  amber: "#fbbf24",
  rose: "#f87171",
};

type MilestoneType = "action"|"research"|"legal"|"money"|"security";
const TYPE_COLORS: Record<MilestoneType,string> = { action:"#6366f1",research:"#8b5cf6",legal:"#f59e0b",money:"#10b981",security:"#ef4444" };
const TYPE_LABELS: Record<MilestoneType,string> = { action:"⚡ Action",research:"📚 Research",legal:"⚖️ Legal",money:"💰 Revenue",security:"🔒 Security" };

function inferMilestoneType(title:string): MilestoneType {
  const t=title.toLowerCase();
  if (t.includes("legal")||t.includes("privacy")||t.includes("gdpr")||t.includes("compli")||t.includes("terms")||t.includes("contract")) return "legal";
  if (t.includes("revenue")||t.includes("monetiz")||t.includes("pricing")||t.includes("payment")||t.includes("subscription")||t.includes("mrr")) return "money";
  if (t.includes("security")||t.includes("auth")||t.includes("encrypt")||t.includes("pentest")) return "security";
  if (t.includes("research")||t.includes("interview")||t.includes("survey")||t.includes("validat")||t.includes("analy")||t.includes("discover")) return "research";
  return "action";
}

const WEEK_LABELS=["Week 1","Week 2–3","Week 3–4","Month 2","Month 2–3","Month 3+"];
function getMilestoneWeek(idx:number) { return WEEK_LABELS[idx]??`Week ${idx+1}`; }

const STAGE_DETAIL_TEMPLATES: Record<string,{ detail:string; enforcement:string }> = {
  Idea:{ detail:"Your job at this stage is to get out of your own head. Talk to 5–10 real people who have this problem. Don't pitch — just ask about their life, their current workarounds, and how much it costs them today. Write down exact quotes. Every assumption you have right now is probably wrong, and that's fine — finding out now costs nothing.",enforcement:"Before marking this milestone complete: write down 3 quotes from real people who described this problem in their own words. No paraphrasing — exact words. Paste them into your project notes." },
  Validation:{ detail:"Validation is not asking people if they'd use your thing. It's finding someone who already has the problem and getting them to take a real action — pre-pay, give you their email, or use a fake version. Talk is cheap. Behavior is signal.",enforcement:"Before moving forward: document evidence of demand — at least 3 people who took a concrete action (paid, signed up, or committed time). 'They said they liked it' doesn't count." },
  MVP:{ detail:"Scope brutally. Your MVP is not a smaller version of your full vision — it's the smallest thing that lets one type of user solve one specific problem. Strip everything that isn't essential. Get it into one warm contact's hands before end of day.",enforcement:"Before marking complete: share a working link with at least 3 real users (not friends or family who won't give honest feedback). Record what they do — not what they say." },
  Launch:{ detail:"Launch is not a single event — it's the start of a feedback loop. Post on Product Hunt, post your story on Indie Hackers, and email every person who said they wanted this.",enforcement:"Before marking complete: you must have at least 10 real signups or users who aren't people you directly know." },
  Growth:{ detail:"Growth is not running ads — it's understanding why users stay and why they leave. Call one churned user. Not to win them back — to understand what failed.",enforcement:"Before marking complete: document the results of one growth experiment — what you tested, how many users it affected, and what the outcome was." },
  Revenue:{ detail:"Revenue stage is about making the business predictable. Map your full acquisition-to-revenue funnel and find the biggest leak. Know your current MRR.",enforcement:"Before marking complete: write down your current MRR, your target for next quarter, and the 3 specific actions that will get you there." },
};
function getMilestoneDetail(m:BuildMindMilestone) {
  const stage=m.stage??m.title;
  const key=Object.keys(STAGE_DETAIL_TEMPLATES).find(k=>stage.toLowerCase().includes(k.toLowerCase()));
  if (key) return STAGE_DETAIL_TEMPLATES[key];
  return { detail:"Complete all tasks in this milestone before moving forward. Each task is a specific action — not a checkbox exercise.",enforcement:"Before marking complete: all tasks must be done and you should have something tangible to show." };
}

const STAGE_ROADMAPS: Record<string,{ step:string; detail:string; time:string }[]> = {
  Idea:[
    { step:"Talk to 5 people who have this problem — before writing any code.",detail:"Every assumption you have about your user is probably wrong. Conversations cost nothing to invalidate them.",time:"2 hrs" },
    { step:"Write down your riskiest assumption and the cheapest way to test it.",detail:"The biggest startup killers are untested assumptions held for too long.",time:"30 min" },
    { step:"Find 3 existing solutions and understand exactly why users are still frustrated.",detail:"If a solution exists, understand the gap before you build another one.",time:"1 hr" },
  ],
  Validation:[
    { step:"Send 10 personal outreach DMs — no pitch, just questions.",detail:"The Mom Test: ask about their life, not your idea. You'll get honest answers.",time:"1–2 hrs" },
    { step:"Run 5 user interviews and record every one.",detail:"Patterns only emerge across conversations, not from a single one.",time:"1 wk" },
    { step:"Map every piece of feedback to a specific problem — not a feature.",detail:"Feature requests are symptoms. Problems are what you're solving.",time:"30 min" },
  ],
  MVP:[
    { step:"Get your working link to one warm contact before end of day.",detail:"The version they see today teaches you more than 3 more days of polishing.",time:"30 min" },
    { step:"Define what MVP success looks like in numbers, not feelings.",detail:"You can't improve what you don't measure.",time:"20 min" },
    { step:"Run 3 usability sessions — watch someone use it without helping them.",detail:"You'll find problems in 20 minutes you'd never find on your own.",time:"1 hr each" },
  ],
  Launch:[
    { step:"Post on Product Hunt — imperfect listing beats no listing.",detail:"Visibility > polish.",time:"3 hrs" },
    { step:"Post your story on Indie Hackers with your launch numbers.",detail:"Transparency builds trust. The community rewards honesty.",time:"1 hr" },
    { step:"Set up a day 1 / day 3 / day 7 retention email sequence.",detail:"Acquisition is expensive. Retention compounds.",time:"2 hrs" },
  ],
  Revenue:[
    { step:"Call one churned user — not to win them back, to understand why.",detail:"Churn analysis beats 10 feature ideas every time.",time:"1 hr" },
    { step:"Identify your top 3 retention levers and run one experiment.",detail:"A 5% improvement in retention can double revenue over time.",time:"1 wk" },
    { step:"Set a revenue goal for this quarter and work backwards to weekly actions.",detail:"Goals without weekly checkpoints are just wishes.",time:"30 min" },
  ],
};

function appendNote(existing:string|null|undefined, next:string): string {
  if (!next.trim()) return existing??"";
  return existing?`${existing}||${next.trim()}`:next.trim();
}
function splitNotes(notes?:string|null): string[] {
  if (!notes) return [];
  return notes.split("||").map(n=>n.trim()).filter(Boolean);
}

// ─── Panel wrapper ──────────────────────────────────────────────────────────
function Panel({ accent, title, children, delay=0, noPad=false }: { accent?:string; title?:string; children:React.ReactNode; delay?:number; noPad?:boolean }) {
  return (
    <motion.div initial={{ opacity:0,y:8 }} animate={{ opacity:1,y:0 }} transition={{ delay }}
      style={{ background:VIZ.panel, border:`1px solid ${VIZ.border}`, borderTop:accent?`2px solid ${accent}`:"none", borderRadius:12, overflow:"hidden" }}>
      {title&&(
        <div style={{ padding:"11px 18px", borderBottom:`1px solid ${VIZ.border}`, display:"flex", alignItems:"center", gap:8 }}>
          {accent&&<div style={{ width:5,height:5,borderRadius:"50%",background:accent }} />}
          <span style={{ fontSize:10,color:VIZ.text2,textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:600 }}>{title}</span>
        </div>
      )}
      <div style={noPad?{}:{ padding:"16px 18px" }}>{children}</div>
    </motion.div>
  );
}

// ─── Arc ring ───────────────────────────────────────────────────────────────
function ArcRing({ score, size=72 }: { score:number; size?:number }) {
  const r=(size-6)/2; const circ=2*Math.PI*r;
  const color=score>=60?VIZ.emerald:score>=30?VIZ.amber:VIZ.rose;
  return (
    <div style={{ position:"relative",width:size,height:size,flexShrink:0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform:"rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={5.5} />
        <motion.circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={5.5}
          strokeLinecap="round" strokeDasharray={circ}
          initial={{ strokeDashoffset:circ }} animate={{ strokeDashoffset:circ-(score/100)*circ }}
          transition={{ duration:1.2,ease:"easeOut",delay:0.3 }} />
      </svg>
      <div style={{ position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center" }}>
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.8 }}
          style={{ fontSize:size*0.24,fontWeight:700,color,lineHeight:1 }}>{score}</motion.div>
        <div style={{ fontSize:size*0.12,color:VIZ.text3,textTransform:"uppercase",letterSpacing:"0.07em",marginTop:1 }}>score</div>
      </div>
    </div>
  );
}

// ─── Task checkbox ──────────────────────────────────────────────────────────
function TaskCheckbox({ checked, onChange, size=16 }: { checked:boolean; onChange:()=>void; size?:number }) {
  const controls=useAnimation();
  const handleClick=async()=>{ if(!checked) await controls.start({ scale:[1,1.35,0.9,1.1,1],transition:{ duration:0.35 } }); onChange(); };
  return (
    <motion.button animate={controls} onClick={handleClick}
      style={{ width:size,height:size,borderRadius:4,border:checked?"none":"1px solid rgba(255,255,255,0.1)",background:checked?VIZ.emerald:"transparent",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0,transition:"background 0.2s" }}>
      {checked&&<span style={{ fontSize:size*0.6,color:"#000",lineHeight:1 }}>✓</span>}
    </motion.button>
  );
}

// ─── Milestone card ─────────────────────────────────────────────────────────
function MilestoneCard({ milestone, tasks, index, onToggleTask }: { milestone:BuildMindMilestone; tasks:BuildMindTask[]; index:number; onToggleTask:(t:BuildMindTask)=>void }) {
  const [expanded, setExpanded] = useState(false);
  const milestoneType=inferMilestoneType(milestone.title);
  const typeColor=TYPE_COLORS[milestoneType];
  const typeLabel=TYPE_LABELS[milestoneType];
  const week=getMilestoneWeek(milestone.order_index??index);
  const { detail, enforcement }=getMilestoneDetail(milestone);
  const done=tasks.filter(t=>t.is_completed).length;
  const total=tasks.length;
  const pct=total>0?Math.round((done/total)*100):0;
  const isComplete=total>0&&done===total;

  return (
    <motion.div initial={{ opacity:0,y:6 }} animate={{ opacity:1,y:0 }} transition={{ delay:index*0.06 }}
      style={{ background:isComplete?"rgba(74,222,128,0.03)":VIZ.panel, border:`1px solid ${isComplete?"rgba(74,222,128,0.2)":VIZ.border}`, borderLeft:`3px solid ${isComplete?VIZ.emerald:typeColor}`, borderRadius:12, overflow:"hidden", transition:"border-color 0.3s" }}>
      <div style={{ padding:"14px 16px",cursor:"pointer" }} onClick={()=>setExpanded(!expanded)}>
        <div style={{ display:"flex",alignItems:"flex-start",gap:12 }}>
          <div style={{ width:20,height:20,borderRadius:"50%",flexShrink:0,marginTop:1,background:isComplete?VIZ.emerald:"transparent",border:isComplete?"none":"1.5px solid rgba(255,255,255,0.1)",display:"flex",alignItems:"center",justifyContent:"center" }}>
            {isComplete&&<span style={{ fontSize:10,color:"#000",lineHeight:1 }}>✓</span>}
          </div>
          <div style={{ flex:1,minWidth:0 }}>
            <div style={{ display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:5 }}>
              <span style={{ fontSize:10,padding:"2px 8px",borderRadius:99,fontFamily:"monospace",background:`${typeColor}18`,color:typeColor,fontWeight:500 }}>{typeLabel}</span>
              <span style={{ fontSize:10,color:VIZ.text3,fontFamily:"monospace" }}>{week}</span>
            </div>
            <div style={{ fontSize:13,fontWeight:600,lineHeight:1.4,color:isComplete?VIZ.emerald:VIZ.text1,textDecoration:isComplete?"line-through":"none" }}>{milestone.title}</div>
            {total>0&&(
              <div style={{ display:"flex",alignItems:"center",gap:8,marginTop:7 }}>
                <div style={{ width:80,height:2.5,background:"rgba(255,255,255,0.04)",borderRadius:999,overflow:"hidden" }}>
                  <motion.div initial={{ width:0 }} animate={{ width:`${pct}%` }} transition={{ duration:0.7,ease:"easeOut" }}
                    style={{ height:"100%",background:isComplete?VIZ.emerald:typeColor,borderRadius:999 }} />
                </div>
                <span style={{ fontSize:10,color:VIZ.text3,fontFamily:"monospace" }}>{done}/{total} · {pct}%</span>
              </div>
            )}
          </div>
          <motion.span animate={{ rotate:expanded?180:0 }} transition={{ duration:0.2 }} style={{ fontSize:10,color:VIZ.text3,flexShrink:0,marginTop:4,display:"block" }}>▼</motion.span>
        </div>
      </div>
      <AnimatePresence>
        {expanded&&(
          <motion.div initial={{ height:0,opacity:0 }} animate={{ height:"auto",opacity:1 }} exit={{ height:0,opacity:0 }} transition={{ duration:0.22 }} style={{ overflow:"hidden" }}>
            <div style={{ borderTop:`1px solid ${VIZ.border}`,padding:"14px 16px 16px",display:"flex",flexDirection:"column",gap:14 }}>
              <div>
                <div style={{ fontSize:9,textTransform:"uppercase",letterSpacing:"0.1em",color:VIZ.text3,marginBottom:6,fontFamily:"monospace" }}>What to do</div>
                <p style={{ fontSize:12,color:VIZ.text2,lineHeight:1.7,margin:0 }}>{detail}</p>
              </div>
              <div style={{ background:"rgba(245,158,11,0.05)",border:"1px solid rgba(245,158,11,0.2)",borderRadius:9,padding:"10px 13px" }}>
                <div style={{ fontSize:9,textTransform:"uppercase",letterSpacing:"0.1em",color:VIZ.amber,marginBottom:5,fontFamily:"monospace" }}>🔒 Completion checkpoint</div>
                <p style={{ fontSize:11,color:VIZ.text2,lineHeight:1.65,margin:0 }}>{enforcement}</p>
              </div>
              {tasks.length>0&&(
                <div>
                  <div style={{ fontSize:9,textTransform:"uppercase",letterSpacing:"0.1em",color:VIZ.text3,marginBottom:8,fontFamily:"monospace" }}>Tasks</div>
                  <div style={{ display:"flex",flexDirection:"column" }}>
                    {tasks.map(task=>(
                      <div key={task.id} style={{ display:"flex",alignItems:"flex-start",gap:10,padding:"9px 0",borderBottom:`1px solid ${VIZ.border}` }}>
                        <div style={{ paddingTop:1 }}><TaskCheckbox checked={task.is_completed} onChange={()=>onToggleTask(task)} size={14} /></div>
                        <div style={{ fontSize:12,lineHeight:1.5,color:task.is_completed?VIZ.text3:VIZ.text2,textDecoration:task.is_completed?"line-through":"none",transition:"all 0.25s" }}>{task.title}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Validation tab ─────────────────────────────────────────────────────────
function ValidationTab({ projectId,strengths,weaknesses,suggestions,router }: {
  projectId:string; strengths:string[]; weaknesses:string[]; suggestions:string[];
  router:ReturnType<typeof import("next/navigation").useRouter>;
}) {
  const [running, setRunning] = useState(false);
  const [analysis, setAnalysis] = useState<{ verdict:string; survival_probability:number; kill_reasons:string[]; survive_reasons:string[]; brutal_advice:string; competitors?:{ title:string; url:string; snippet:string }[]; competitor_summary?:string; }|null>(null);
  const [error, setError] = useState("");
  const hasData=(strengths?.length??0)>0||(weaknesses?.length??0)>0;

  const runAnalysis=async()=>{
    setRunning(true); setError(""); setAnalysis(null);
    try {
      const supabase=createClient();
      const { data:authData }=await supabase.auth.getUser();
      if (!authData.user) throw new Error("Not authenticated");
      const res=await fetch("/api/ai/break-my-startup",{ method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ userId:authData.user.id,projectId }) });
      const body=await res.json().catch(()=>({}));
      if (!res.ok||!body.success) throw new Error(body?.error??"Analysis failed");
      setAnalysis(body.data);
    } catch(err) { setError(err instanceof Error?err.message:"Analysis failed"); }
    finally { setRunning(false); }
  };
  
    return (
      <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap" }}>
          <div>
            <div style={{ fontSize:13,fontWeight:600,color:VIZ.text1 }}>Validation Review</div>
            <div style={{ fontSize:11,color:VIZ.text2 }}>Run a quick AI critique of your validation inputs.</div>
          </div>
          <button
            onClick={runAnalysis}
            disabled={running || !projectId}
            style={{
              background: running ? "rgba(255,255,255,0.08)" : "var(--grad-primary)",
              color: running ? VIZ.text3 : "#fff",
              fontSize: 11,
              fontWeight: 700,
              padding: "7px 14px",
              borderRadius: 8,
              border: "none",
              cursor: running ? "default" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {running ? "Running…" : "Run analysis"}
          </button>
        </div>

        {!hasData && (
          <div style={{ fontSize:11,color:VIZ.text3 }}>
            Add validation strengths or weaknesses to enable analysis.
          </div>
        )}

        {error && (
          <div style={{ fontSize:11,color:VIZ.rose }}>
            {error}
          </div>
        )}

        {analysis && (
          <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
            <div style={{ fontSize:12,color:VIZ.text2 }}>
              <span style={{ color: VIZ.text1, fontWeight: 600 }}>Verdict:</span> {analysis.verdict}
            </div>
            {typeof analysis.survival_probability === "number" && (
              <div style={{ fontSize:12,color:VIZ.text2 }}>
                <span style={{ color: VIZ.text1, fontWeight: 600 }}>Survival probability:</span> {analysis.survival_probability}%
              </div>
            )}
            {analysis.brutal_advice && (
              <div style={{ fontSize:12,color:VIZ.text2, lineHeight: 1.6 }}>
                <span style={{ color: VIZ.text1, fontWeight: 600 }}>Brutal advice:</span> {analysis.brutal_advice}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

// ─── Main page ──────────────────────────────────────────────────────────────
export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { data, isLoading, error } = useProjectDetailQuery(id);
  const deleteMutation = useDeleteProjectMutation();
  const updateMutation = useUpdateTaskMutation(id);

  useEffect(() => { if (id) setActiveProjectId(id); }, [id]);

  const milestoneMutation = useMutation({
    mutationFn: (payload: { id: string; title?: string; stage?: string }) =>
      updateMilestoneForCurrentUser(payload.id, { title: payload.title, stage: payload.stage }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.project(id) }),
  });

  const [tab, setTab] = useState<Tab>("milestones");
  const [newNoteDraft, setNewNoteDraft] = useState<Record<string, string>>({});
  const [regenerating, setRegenerating] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const { project, milestones = [], tasks = [] } = data ?? {};
  const stage = project?.startup_stage ?? "MVP";
  const score = useMemo(() => {
    if (!project) return 0;
    let xp = 0;
    try { const { getXP: _getXP } = require("@/lib/scoring"); xp = _getXP(); } catch { /* ok */ }
    return computeStartupScore({
      validation_strengths: project.validation_strengths,
      execution_score: project.execution_score,
      momentum_score: project.momentum_score,
      streak: getStoredStreak(),
      xp,
    });
  }, [project, tasks]);
  const validationStrengths = Array.isArray(project?.validation_strengths)
    ? project.validation_strengths.length
    : 0;
  const completedCount = useMemo(() => tasks.filter(t => t.is_completed).length, [tasks]);
  const progress = tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0;

  async function handleRegenerateMilestones() {
    if (!project) return;
    setRegenerating(true);
    try {
      const res = await fetch("/api/ai/generate-roadmap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: id,
          title: project.title,
          idea_description: project.description,
          target_users: project.target_users ?? "",
          problem: project.problem ?? "",
          startup_stage: project.startup_stage ?? "Idea",
        }),
      });
      if (res.ok) {
        void qc.invalidateQueries({ queryKey: queryKeys.project(id) });
      }
    } catch {
      // Non-fatal
    } finally {
      setRegenerating(false);
    }
  }

  const toggleTask = (task: BuildMindTask) => {
    const newCompleted = !task.is_completed;
    updateMutation.mutate({ taskId: task.id, isCompleted: newCompleted, notes: task.notes ?? "" });
    if (newCompleted) {
      recordTaskCompletion();
      const streak = incrementDailyStreak();
      const { shouldUpgrade } = checkUpgradeTrigger(streak);
      if (shouldUpgrade) setShowUpgrade(true);
    }
  };

  if (isLoading) return <BuildMindLoader variant="card" label="Loading project…" />;
  if (error || !project) return (
    <div style={{ padding: "40px 24px", textAlign: "center" }}>
      <div style={{ fontSize: 13, color: "var(--bm-red)", marginBottom: 12 }}>
        {error instanceof Error ? error.message : "Project not found."}
      </div>
      <button onClick={() => router.back()} style={{ background: "none", border: "1px solid var(--bm-border)", color: "var(--bm-text2)", cursor: "pointer", fontFamily: "inherit", fontSize: 13, padding: "8px 16px", borderRadius: 9 }}>← Back</button>
    </div>
  );

  const roadmapSteps = STAGE_ROADMAPS[stage] ?? STAGE_ROADMAPS["MVP"];
  const progressColor = progress >= 60 ? "var(--bm-accent)" : "var(--grad-primary)";

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      style={{ maxWidth: 860, margin: "0 auto", padding: "28px 24px", paddingBottom: 48 }}>

      {/* Upgrade nudge */}
      <AnimatePresence>
        {showUpgrade && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            style={{ background: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.20)", borderRadius: 14, padding: "14px 18px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#A78BFA" }}>You're making progress.</div>
              <div style={{ fontSize: 12, color: "var(--bm-text3)", marginTop: 2 }}>Unlock your next steps and keep building.</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => router.push(`/upgrade?tasks=${getTasksDone()}&streak=${getStoredStreak()}`)}
                style={{ background: "var(--grad-primary)", color: "#fff", fontSize: 12, fontWeight: 700, padding: "7px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit" }}>Continue →</button>
              <button onClick={() => setShowUpgrade(false)} style={{ background: "none", border: "none", color: "var(--bm-text3)", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <button onClick={() => router.back()}
          style={{ background: "none", border: "none", color: "var(--bm-text3)", cursor: "pointer", fontSize: 11, padding: 0, marginBottom: 14, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4 }}>
          ← Projects
        </button>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, paddingBottom: 18, borderBottom: "1px solid var(--bm-border)" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--bm-text)", letterSpacing: "-0.03em", marginBottom: 10, wordBreak: "break-word" }}>{project.title}</h1>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, padding: "2px 9px", borderRadius: 20, background: "rgba(124,58,237,0.10)", color: "#A78BFA", border: "1px solid rgba(124,58,237,0.22)", fontWeight: 700 }}>{stage}</span>
              <span style={{ fontSize: 11, color: "var(--bm-text3)" }}>{completedCount}/{tasks.length} tasks</span>
              <span style={{ fontSize: 11, color: "var(--bm-text3)" }}>{progress}% complete</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <ArcRing score={score} />
              <ScoreBreakdown
                score={score}
                executionScore={project.execution_score ?? progress}
                momentumScore={progress}
                streak={getStoredStreak()}
                validationStrengths={validationStrengths}
                compact
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <button onClick={() => router.push("/today")}
                style={{ background: "var(--grad-primary)", color: "#fff", fontSize: 12, fontWeight: 700, padding: "9px 16px", borderRadius: 9, border: "none", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                ⚡ Today&apos;s action
              </button>
              <button onClick={() => { if (window.confirm(`Delete "${project.title}"?`)) deleteMutation.mutate(id, { onSuccess: () => router.push("/projects") }); }}
                style={{ background: "none", border: "1px solid var(--bm-border)", color: "var(--bm-text3)", fontSize: 12, padding: "7px 16px", borderRadius: 9, cursor: "pointer", fontFamily: "inherit" }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 4, background: "var(--bm-bg3)", borderRadius: 99, overflow: "hidden", marginBottom: 24 }}>
        <motion.div initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.9, ease: "easeOut" }}
          style={{ height: "100%", background: progressColor, borderRadius: 99 }} />
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--bm-border)", marginBottom: 24 }}>
        {(["milestones", "tasks", "roadmap", "validation"] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: "9px 18px", fontSize: 12, fontWeight: tab === t ? 700 : 400, color: tab === t ? "var(--bm-accent)" : "var(--bm-text3)", background: "none", border: "none", borderBottom: tab === t ? "2px solid var(--bm-accent)" : "2px solid transparent", cursor: "pointer", fontFamily: "inherit", textTransform: "capitalize", transition: "color 0.15s", marginBottom: -1 }}>
            {t}
          </button>
        ))}
      </div>

      {/* ── Milestones ── */}
      {tab === "milestones" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {milestones.length === 0 && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "48px 0" }}>
              <div style={{ fontSize: 13, color: "var(--bm-text3)", textAlign: "center" }}>No milestones yet. BuildMind generates them from your project idea.</div>
              <button
                onClick={handleRegenerateMilestones}
                disabled={regenerating}
                style={{ padding: "9px 18px", borderRadius: 9, border: "none", background: "var(--grad-primary)", color: "white", fontSize: 13, fontWeight: 600, cursor: regenerating ? "not-allowed" : "pointer", opacity: regenerating ? 0.65 : 1, fontFamily: "inherit" }}
              >
                {regenerating ? "Generating…" : "⚡ Generate milestones & tasks"}
              </button>
            </div>
          )}
          {milestones.length > 0 && (
            <>
              <div style={{ display: "flex", gap: 3, marginBottom: 10 }}>
                {milestones.map(m => {
                  const mt = tasks.filter(t => t.milestone_id === m.id);
                  const done = mt.length > 0 && mt.every(t => t.is_completed);
                  const partial = !done && mt.some(t => t.is_completed);
                  return <motion.div key={m.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} title={m.title}
                    style={{ height: 4, flex: 1, borderRadius: 99, minWidth: 20, background: done ? "var(--bm-accent)" : partial ? "var(--grad-primary)" : "var(--bm-bg3)", transition: "background 0.4s" }} />;
                })}
              </div>
              {/* Fix #2: "Generate again" always visible — not just when 0 milestones */}
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                <button
                  onClick={handleRegenerateMilestones}
                  disabled={regenerating}
                  style={{ fontSize: 11, color: "var(--bm-text3)", background: "transparent", border: "1px solid var(--bm-border)", borderRadius: 8, padding: "5px 12px", cursor: regenerating ? "not-allowed" : "pointer", opacity: regenerating ? 0.55 : 1, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5 }}
                >
                  <span style={{ fontSize: 13 }}>⚡</span>
                  {regenerating ? "Generating…" : "Generate milestones & tasks again"}
                </button>
              </div>
            </>
          )}
          {milestones.map((m, mi) => (
            <MilestoneCard key={m.id} milestone={m} tasks={tasks.filter(t => t.milestone_id === m.id)} index={mi} onToggleTask={toggleTask} />
          ))}
        </div>
      )}

      {/* ── Tasks ── */}
      {tab === "tasks" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {tasks.length === 0 && <div style={{ fontSize: 13, color: "var(--bm-text3)", textAlign: "center", padding: "48px 0" }}>No tasks yet.</div>}
          {tasks.map((task, ti) => {
            const milestone = milestones.find(m => m.id === task.milestone_id);
            const notes = splitNotes(task.notes);
            return (
              <motion.div key={task.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: ti * 0.04 }}
                style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 12, padding: "13px 16px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ paddingTop: 2 }}><TaskCheckbox checked={task.is_completed} onChange={() => toggleTask(task)} size={15} /></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: task.is_completed ? "var(--bm-text3)" : "var(--bm-text)", textDecoration: task.is_completed ? "line-through" : "none", lineHeight: 1.45, fontWeight: 500, marginBottom: milestone ? 4 : 0 }}>{task.title}</div>
                    {milestone && (
                      <div style={{ fontSize: 10, color: "var(--bm-text3)" }}>
                        <span style={{ color: TYPE_COLORS[inferMilestoneType(milestone.title)], marginRight: 4 }}>●</span>
                        {milestone.title}
                      </div>
                    )}
                    {notes.map((n, ni) => (
                      <div key={ni} style={{ fontSize: 11, color: "var(--bm-text3)", marginTop: 6, background: "var(--bm-bg3)", borderRadius: 6, padding: "5px 9px", border: "1px solid var(--bm-border)" }}>📝 {n}</div>
                    ))}
                    <div style={{ display: "flex", gap: 7, marginTop: 9 }}>
                      <input value={newNoteDraft[task.id] ?? ""} onChange={e => setNewNoteDraft(d => ({ ...d, [task.id]: e.target.value }))}
                        placeholder="Add a note…"
                        style={{ background: "var(--bm-bg3)", border: "1px solid var(--bm-border)", borderRadius: 7, padding: "6px 10px", fontSize: 11, color: "var(--bm-text2)", outline: "none", fontFamily: "inherit", flex: 1, transition: "border-color 0.15s" }}
                        onFocus={e => { e.target.style.borderColor = "var(--bm-accent-bd)"; }}
                        onBlur={e => { e.target.style.borderColor = "var(--bm-border)"; }}
                        onKeyDown={e => {
                          if (e.key === "Enter") {
                            const next = newNoteDraft[task.id] ?? "";
                            if (next.trim()) {
                              updateMutation.mutate({ taskId: task.id, isCompleted: task.is_completed, notes: appendNote(task.notes, next) });
                              setNewNoteDraft(d => ({ ...d, [task.id]: "" }));
                            }
                          }
                        }} />
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ── Roadmap ── */}
      {tab === "roadmap" && (
        <div>
          <div style={{ fontSize: 12, color: "var(--bm-text3)", marginBottom: 18 }}>
            Proven actions for <span style={{ color: "#A78BFA", fontWeight: 600 }}>{stage}</span> stage — based on what actually works.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {roadmapSteps.map((step, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
                style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderLeft: "3px solid var(--bm-accent)", borderRadius: 12, padding: "16px 18px" }}>
                <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--bm-accent-dim)", border: "1px solid var(--bm-accent-bd)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 11, color: "var(--bm-accent)", fontWeight: 800 }}>{i + 1}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--bm-text)", marginBottom: 6, lineHeight: 1.45 }}>{step.step}</div>
                    <div style={{ fontSize: 12, color: "var(--bm-text3)", lineHeight: 1.65, marginBottom: 6 }}>{step.detail}</div>
                    <div style={{ fontSize: 10, color: "var(--bm-text3)" }}>⏱ {step.time}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* ── Validation ── */}
      {tab === "validation" && (
        <ValidationTab projectId={id} strengths={project.validation_strengths} weaknesses={project.validation_weaknesses} suggestions={project.validation_suggestions} router={router} />
      )}
    </motion.div>
  );
}
