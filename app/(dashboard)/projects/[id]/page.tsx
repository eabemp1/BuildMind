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
import { recordTaskCompletion, checkUpgradeTrigger, getTasksDone } from "@/lib/upgrade";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queries";
import BuildMindLoader from "@/components/BuildMindLoader";

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

  const survColor=(n:number)=>n>=60?VIZ.emerald:n>=40?VIZ.amber:VIZ.rose;

  return (
    <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
      {hasData&&(
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10 }}>
          {[
            { label:"Strengths",items:strengths,accent:VIZ.emerald,icon:"✓" },
            { label:"Weaknesses",items:weaknesses,accent:VIZ.rose,icon:"✗" },
            { label:"Suggestions",items:suggestions,accent:VIZ.amber,icon:"→" },
          ].map(({ label,items,accent,icon })=>(
            <Panel key={label} accent={accent} title={`${icon}  ${label}`} delay={0.05}>
              {(!items||items.length===0)
                ? <div style={{ fontSize:12,color:VIZ.text3 }}>None identified yet.</div>
                : items.map((item,i)=>(
                    <div key={i} style={{ display:"flex",gap:8,padding:"6px 0",borderBottom:i<items.length-1?`1px solid ${VIZ.border}`:"none" }}>
                      <span style={{ color:accent,fontSize:12,flexShrink:0,marginTop:1 }}>{icon}</span>
                      <div style={{ fontSize:12,color:VIZ.text2,lineHeight:1.55 }}>{item}</div>
                    </div>
                  ))
              }
            </Panel>
          ))}
        </div>
      )}

      {!analysis&&(
        <Panel accent={VIZ.rose} title="🔥  Break My Startup analysis" delay={0.1}>
          <div style={{ fontSize:13,color:VIZ.text2,lineHeight:1.7,marginBottom:16 }}>
            Get your survival probability, live competitor scan, every kill reason, and the one thing that saves you — generated from this project&apos;s actual data.
            {!hasData&&" Add more details to your project first to get a more accurate result."}
          </div>
          {error&&<div style={{ fontSize:12,color:VIZ.rose,marginBottom:12,padding:"8px 12px",background:"rgba(248,113,113,0.06)",borderRadius:8 }}>{error}</div>}
          <motion.button whileHover={{ scale:1.01 }} whileTap={{ scale:0.97 }} onClick={()=>void runAnalysis()} disabled={running}
            style={{ background:running?"rgba(255,255,255,0.03)":"rgba(248,113,113,0.1)",border:"1px solid rgba(248,113,113,0.3)",color:running?VIZ.text3:VIZ.rose,fontSize:13,fontWeight:700,padding:"10px 20px",borderRadius:9,cursor:running?"not-allowed":"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:8 }}>
            {running?<><motion.div animate={{ rotate:360 }} transition={{ duration:1,repeat:Infinity,ease:"linear" }} style={{ width:13,height:13,borderRadius:"50%",border:"2px solid rgba(248,113,113,0.3)",borderTopColor:VIZ.rose }} />Scanning competitors + analyzing...</>:"Break my startup →"}
          </motion.button>
        </Panel>
      )}

      <AnimatePresence>
        {analysis&&(
          <motion.div initial={{ opacity:0,y:10 }} animate={{ opacity:1,y:0 }} style={{ display:"flex",flexDirection:"column",gap:12 }}>
            <Panel accent={VIZ.rose} title="🔥  Survival Analysis" delay={0}>
              <div style={{ display:"flex",alignItems:"flex-start",gap:20 }}>
                <div style={{ textAlign:"center",flexShrink:0 }}>
                  <div style={{ fontSize:36,fontWeight:700,color:survColor(analysis.survival_probability),lineHeight:1 }}>{analysis.survival_probability}%</div>
                  <div style={{ fontSize:9,color:VIZ.text3,textTransform:"uppercase",letterSpacing:"0.1em",marginTop:3 }}>survival</div>
                </div>
                <div>
                  <div style={{ fontSize:9,color:VIZ.text3,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6 }}>Verdict</div>
                  <div style={{ fontSize:13,color:VIZ.text2,lineHeight:1.65 }}>{analysis.verdict}</div>
                </div>
              </div>
            </Panel>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
              <Panel accent={VIZ.rose} title="💀  Kill Reasons" delay={0.05}>
                {(analysis.kill_reasons??[]).map((r,i)=>(
                  <div key={i} style={{ display:"flex",gap:8,fontSize:12,color:VIZ.text2,lineHeight:1.5,padding:"5px 0",borderBottom:i<(analysis.kill_reasons?.length??0)-1?`1px solid ${VIZ.border}`:"none" }}>
                    <span style={{ color:VIZ.rose,flexShrink:0 }}>×</span>{r}
                  </div>
                ))}
              </Panel>
              <Panel accent={VIZ.emerald} title="✓  Survive Reasons" delay={0.1}>
                {(analysis.survive_reasons??[]).map((r,i)=>(
                  <div key={i} style={{ display:"flex",gap:8,fontSize:12,color:VIZ.text2,lineHeight:1.5,padding:"5px 0",borderBottom:i<(analysis.survive_reasons?.length??0)-1?`1px solid ${VIZ.border}`:"none" }}>
                    <span style={{ color:VIZ.emerald,flexShrink:0 }}>✓</span>{r}
                  </div>
                ))}
              </Panel>
            </div>
            {analysis.brutal_advice&&(
              <Panel accent={VIZ.violet} title="⚡  The one thing that matters" delay={0.15}>
                <div style={{ fontSize:13,color:VIZ.text2,lineHeight:1.75 }}>{analysis.brutal_advice}</div>
              </Panel>
            )}
            {(analysis.competitors??[]).length>0&&(
              <Panel accent="#22d3ee" title="🌐  Live competitor scan" delay={0.2}>
                {analysis.competitor_summary&&<p style={{ fontSize:12,color:VIZ.text2,lineHeight:1.65,marginBottom:12 }}>{analysis.competitor_summary}</p>}
                {(analysis.competitors??[]).map((c,i)=>(
                  <div key={i} style={{ padding:"7px 0",borderBottom:i<(analysis.competitors?.length??0)-1?`1px solid ${VIZ.border}`:"none" }}>
                    <a href={c.url} target="_blank" rel="noopener noreferrer" style={{ fontSize:12,color:"#a78bfa",textDecoration:"none",fontWeight:600 }}>{c.title}</a>
                    {c.snippet&&<div style={{ fontSize:11,color:VIZ.text3,marginTop:2 }}>{c.snippet.slice(0,100)}...</div>}
                  </div>
                ))}
              </Panel>
            )}
            <div style={{ display:"flex",gap:8 }}>
              <button onClick={()=>setAnalysis(null)} style={{ background:"transparent",border:`1px solid ${VIZ.border}`,color:VIZ.text2,fontSize:12,padding:"8px 14px",borderRadius:7,cursor:"pointer",fontFamily:"inherit" }}>Run again</button>
              <button onClick={()=>router.push("/break-my-startup")} style={{ background:"transparent",border:"1px solid rgba(248,113,113,0.2)",color:VIZ.rose,fontSize:12,padding:"8px 14px",borderRadius:7,cursor:"pointer",fontFamily:"inherit" }}>Full analysis →</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────
export default function ProjectDetailPage() {
  const { id }=useParams<{ id:string }>();
  const router=useRouter();
  const qc=useQueryClient();
  const { data,isLoading,error }=useProjectDetailQuery(id);
  const deleteMutation=useDeleteProjectMutation();
  const updateMutation=useUpdateTaskMutation(id);

  useEffect(()=>{ if(id) setActiveProjectId(id); },[id]);

  const milestoneMutation=useMutation({
    mutationFn:(payload:{ id:string; title?:string; stage?:string })=>updateMilestoneForCurrentUser(payload.id,{ title:payload.title,stage:payload.stage }),
    onSuccess:()=>void qc.invalidateQueries({ queryKey:queryKeys.project(id) }),
  });

  const [tab, setTab]=useState<Tab>("milestones");
  const [newNoteDraft, setNewNoteDraft]=useState<Record<string,string>>({});
  const [showUpgrade, setShowUpgrade]=useState(false);

  const { project,milestones=[],tasks=[] }=data??{};
  const stage=project?.startup_stage??"MVP";
  const score=useMemo(()=>project?computeStartupScore({ progress:tasks.length?Math.round((tasks.filter(t=>t.is_completed).length/tasks.length)*100):0,validation_strengths:project.validation_strengths,execution_score:project.execution_score }):0,[project,tasks]);
  const completedCount=useMemo(()=>tasks.filter(t=>t.is_completed).length,[tasks]);
  const progress=tasks.length?Math.round((completedCount/tasks.length)*100):0;
  const progressColor=progress>=60?VIZ.emerald:VIZ.indigo;

  const toggleTask=(task:BuildMindTask)=>{
    const newCompleted=!task.is_completed;
    updateMutation.mutate({ taskId:task.id,isCompleted:newCompleted,notes:task.notes??"" });
    if (newCompleted) {
      recordTaskCompletion();
      const streak=Number(localStorage.getItem("bm_streak")??"1");
      const { shouldUpgrade }=checkUpgradeTrigger(streak);
      if (shouldUpgrade) setShowUpgrade(true);
    }
  };

  if (isLoading) return <BuildMindLoader variant="card" label="Loading project…" />;
  if (error||!project) return (
    <div style={{ fontSize:13,color:VIZ.rose,padding:20 }}>
      {error instanceof Error?error.message:"Project not found."}
      <button onClick={()=>router.back()} style={{ display:"block",marginTop:12,background:"none",border:"none",color:VIZ.text3,cursor:"pointer",fontFamily:"inherit",fontSize:13 }}>← Back</button>
    </div>
  );

  const roadmapSteps=STAGE_ROADMAPS[stage]??STAGE_ROADMAPS["MVP"];

  return (
    <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }}
      style={{ maxWidth:860,margin:"0 auto",fontFamily:"system-ui,sans-serif",color:VIZ.text1,paddingBottom:48 }}>

      {/* Upgrade nudge */}
      <AnimatePresence>
        {showUpgrade&&(
          <motion.div initial={{ opacity:0,y:-10 }} animate={{ opacity:1,y:0 }} exit={{ opacity:0,y:-10 }}
            style={{ background:"rgba(99,102,241,0.08)",border:"1px solid rgba(99,102,241,0.2)",borderRadius:11,padding:"14px 18px",marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
            <div>
              <div style={{ fontSize:13,fontWeight:600,color:"#a78bfa" }}>You're making progress.</div>
              <div style={{ fontSize:12,color:VIZ.text3,marginTop:2 }}>Unlock your next steps and keep building.</div>
            </div>
            <div style={{ display:"flex",gap:8 }}>
              <button onClick={()=>router.push(`/upgrade?tasks=${getTasksDone()}&streak=${localStorage.getItem("bm_streak")??1}`)} style={{ background:"#fff",color:"#000",fontSize:12,fontWeight:700,padding:"7px 16px",borderRadius:7,border:"none",cursor:"pointer",fontFamily:"inherit" }}>Continue →</button>
              <button onClick={()=>setShowUpgrade(false)} style={{ background:"none",border:"none",color:VIZ.text3,cursor:"pointer",fontSize:18,lineHeight:1 }}>×</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div style={{ marginBottom:20,paddingBottom:16,borderBottom:`1px solid ${VIZ.border}` }}>
        <button onClick={()=>router.back()} style={{ background:"none",border:"none",color:VIZ.text3,cursor:"pointer",fontSize:11,padding:0,marginBottom:10,fontFamily:"inherit",display:"flex",alignItems:"center",gap:4 }}>
          ← Projects
        </button>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:16 }}>
          <div style={{ flex:1,minWidth:0 }}>
            <div style={{ fontSize:21,fontWeight:700,letterSpacing:"-0.03em",wordBreak:"break-word",marginBottom:8 }}>{project.title}</div>
            <div style={{ display:"flex",alignItems:"center",gap:8,flexWrap:"wrap" }}>
              <span style={{ fontSize:11,color:VIZ.violet,background:"rgba(139,92,246,0.1)",border:"1px solid rgba(139,92,246,0.2)",borderRadius:5,padding:"2px 9px" }}>{stage}</span>
              <span style={{ fontSize:11,color:VIZ.text3 }}>{completedCount}/{tasks.length} tasks</span>
              <span style={{ fontSize:11,color:VIZ.text3 }}>{progress}% complete</span>
            </div>
          </div>
          <div style={{ display:"flex",alignItems:"center",gap:14,flexShrink:0 }}>
            <ArcRing score={score} />
            <div style={{ display:"flex",flexDirection:"column",gap:6 }}>
              <button onClick={()=>router.push("/today")} style={{ background:"#fff",color:"#000",fontSize:12,fontWeight:700,padding:"8px 16px",borderRadius:8,border:"none",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap" }}>⚡ Today&apos;s action</button>
              <button onClick={()=>{ if(window.confirm(`Delete "${project.title}"?`)) deleteMutation.mutate(id,{ onSuccess:()=>router.push("/projects") }); }} style={{ background:"none",border:`1px solid ${VIZ.border}`,color:VIZ.text3,fontSize:12,padding:"7px 16px",borderRadius:8,cursor:"pointer",fontFamily:"inherit" }}>Delete</button>
            </div>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height:3,background:"rgba(255,255,255,0.04)",borderRadius:999,overflow:"hidden",marginBottom:20 }}>
        <motion.div initial={{ width:0 }} animate={{ width:`${progress}%` }} transition={{ duration:0.9,ease:"easeOut" }}
          style={{ height:"100%",background:progressColor,borderRadius:999 }} />
      </div>

      {/* Tabs */}
      <div style={{ display:"flex",gap:0,borderBottom:`1px solid ${VIZ.border}`,marginBottom:20 }}>
        {(["milestones","tasks","roadmap","validation"] as Tab[]).map(t=>(
          <button key={t} onClick={()=>setTab(t)}
            style={{ padding:"8px 16px",fontSize:12,fontWeight:tab===t?600:400,color:tab===t?VIZ.text1:VIZ.text3,background:"none",border:"none",borderBottom:tab===t?`2px solid ${VIZ.indigo}`:"2px solid transparent",cursor:"pointer",fontFamily:"inherit",textTransform:"capitalize",transition:"color 0.15s",marginBottom:-1 }}>
            {t}
          </button>
        ))}
      </div>

      {/* ── Milestones ── */}
      {tab==="milestones"&&(
        <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
          {milestones.length===0&&<div style={{ fontSize:13,color:VIZ.text3,textAlign:"center",padding:48 }}>No milestones yet. BuildMind generates them from your project idea.</div>}
          {milestones.length>0&&(
            <div style={{ display:"flex",gap:3,marginBottom:6 }}>
              {milestones.map(m=>{ const mt=tasks.filter(t=>t.milestone_id===m.id); const done=mt.length>0&&mt.every(t=>t.is_completed); const partial=!done&&mt.some(t=>t.is_completed); return <motion.div key={m.id} initial={{ opacity:0 }} animate={{ opacity:1 }} title={m.title} style={{ height:3,flex:1,borderRadius:999,minWidth:20,background:done?VIZ.emerald:partial?VIZ.indigo:"rgba(255,255,255,0.04)",transition:"background 0.4s" }} />; })}
            </div>
          )}
          {milestones.map((m,mi)=>(<MilestoneCard key={m.id} milestone={m} tasks={tasks.filter(t=>t.milestone_id===m.id)} index={mi} onToggleTask={toggleTask} />))}
        </div>
      )}

      {/* ── Tasks ── */}
      {tab==="tasks"&&(
        <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
          {tasks.length===0&&<div style={{ fontSize:13,color:VIZ.text3,textAlign:"center",padding:48 }}>No tasks yet.</div>}
          {tasks.map((task,ti)=>{
            const milestone=milestones.find(m=>m.id===task.milestone_id);
            const notes=splitNotes(task.notes);
            return (
              <motion.div key={task.id} initial={{ opacity:0,y:4 }} animate={{ opacity:1,y:0 }} transition={{ delay:ti*0.04 }}
                style={{ background:VIZ.panel,border:`1px solid ${VIZ.border}`,borderRadius:10,padding:"12px 14px" }}>
                <div style={{ display:"flex",alignItems:"flex-start",gap:10 }}>
                  <div style={{ paddingTop:2 }}><TaskCheckbox checked={task.is_completed} onChange={()=>toggleTask(task)} size={15} /></div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13,color:task.is_completed?VIZ.text3:VIZ.text1,textDecoration:task.is_completed?"line-through":"none",marginBottom:milestone?3:0,lineHeight:1.45,fontWeight:500 }}>{task.title}</div>
                    {milestone&&<div style={{ fontSize:10,color:VIZ.text3,fontFamily:"monospace" }}><span style={{ color:TYPE_COLORS[inferMilestoneType(milestone.title)],marginRight:4 }}>●</span>{milestone.title}</div>}
                    {notes.map((n,ni)=><div key={ni} style={{ fontSize:11,color:VIZ.text3,marginTop:5,background:"rgba(255,255,255,0.02)",borderRadius:5,padding:"4px 8px" }}>📝 {n}</div>)}
                    <div style={{ display:"flex",gap:6,marginTop:8 }}>
                      <input value={newNoteDraft[task.id]??""} onChange={e=>setNewNoteDraft(d=>({ ...d,[task.id]:e.target.value }))} placeholder="Add a note..."
                        style={{ background:"rgba(255,255,255,0.02)",border:`1px solid ${VIZ.border}`,borderRadius:6,padding:"5px 9px",fontSize:11,color:VIZ.text2,outline:"none",fontFamily:"inherit",flex:1 }}
                        onKeyDown={e=>{ if(e.key==="Enter"){ const next=newNoteDraft[task.id]??""; if(next.trim()){ updateMutation.mutate({ taskId:task.id,isCompleted:task.is_completed,notes:appendNote(task.notes,next) }); setNewNoteDraft(d=>({ ...d,[task.id]:"" })); } } }} />
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ── Roadmap ── */}
      {tab==="roadmap"&&(
        <div>
          <div style={{ fontSize:12,color:VIZ.text3,marginBottom:16 }}>Proven actions for <span style={{ color:VIZ.violet }}>{stage}</span> stage — based on what actually works</div>
          <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
            {roadmapSteps.map((step,i)=>(
              <motion.div key={i} initial={{ opacity:0,y:6 }} animate={{ opacity:1,y:0 }} transition={{ delay:i*0.08 }}
                style={{ background:VIZ.panel,border:`1px solid ${VIZ.border}`,borderLeft:`3px solid ${VIZ.indigo}`,borderRadius:11,padding:"16px 18px" }}>
                <div style={{ display:"flex",gap:14,alignItems:"flex-start" }}>
                  <div style={{ width:22,height:22,borderRadius:"50%",background:"rgba(99,102,241,0.12)",border:"1px solid rgba(99,102,241,0.25)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:10,color:VIZ.indigo,fontWeight:700 }}>{i+1}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13,fontWeight:600,color:VIZ.text1,marginBottom:6,lineHeight:1.45 }}>{step.step}</div>
                    <div style={{ fontSize:12,color:VIZ.text2,lineHeight:1.65,marginBottom:6 }}>{step.detail}</div>
                    <div style={{ fontSize:10,color:VIZ.text3 }}>⏱ {step.time}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* ── Validation ── */}
      {tab==="validation"&&(
        <ValidationTab projectId={id} strengths={project.validation_strengths} weaknesses={project.validation_weaknesses} suggestions={project.validation_suggestions} router={router} />
      )}
    </motion.div>
  );
}
