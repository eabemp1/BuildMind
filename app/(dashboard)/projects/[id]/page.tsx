"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, useAnimation, AnimatePresence } from "framer-motion";
import {
  type BuildMindMilestone, type BuildMindTask,
  computeStartupScore, updateMilestoneForCurrentUser,
} from "@/lib/buildmind";
import { useDeleteProjectMutation, useProjectDetailQuery, useUpdateTaskMutation, useFounderScorecardQuery, useUpdateProjectMutation } from "@/lib/queries";
import { setActiveProjectId } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import { storage } from "@/lib/storage";
import { getTasksDone, getStoredStreak } from "@/lib/upgrade";
import { syncStreakFromServer } from "@/lib/plan";
import { STAGE_ORDER } from "@/lib/stages";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queries";
import { ScoreBreakdown } from "@/components/ui/ScoreBreakdown";
import { PageHeader } from "@/components/ui/PageHeader";
import { sanitizeOutput } from "@/lib/sanitizeOutput";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

type Tab = "milestones" | "tasks" | "validation" | "roadmap";

// CONSOLIDATION: TransitionReadinessPrompt / ReadinessPrompt removed — this
// rendered a second, separately-sourced "ready to move up?" banner
// alongside the "Stage check" banner below, both answering the same
// question from what used to be two different detectors with different
// thresholds. Now there's one detector (lib/server/stageTransition.ts) and
// one banner (the "Stage check" block further down, driven by
// stageTransitionPrompt). See that file's header comment for the full story.

// ─── Design tokens ──────────────────────────────────────────────────────────
const VIZ = {
  panel: "rgba(12,12,18,0.98)",
  panelHover: "rgba(16,16,24,0.98)",
  border: "var(--bm-border)",
  text1: "#f0f0f5",
  text2: "#9494a8",
  text3: "#4a4a5a",
  indigo: "var(--bm-accent)",
  violet: "var(--bm-accent2)",
  emerald: "var(--bm-green)",
  amber: "#fbbf24",
  rose: "#f87171",
};

type MilestoneType = "action"|"research"|"legal"|"money"|"security";
const TYPE_COLORS: Record<MilestoneType,string> = { action:"var(--bm-accent)",research:"var(--bm-accent2)",legal:"var(--bm-blue)",money:"var(--bm-green)",security:"var(--bm-red)" };
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

// REC 3.4: Stage directives — what being at this stage actually means for what I do today
// Static copy, written once, displayed prominently. Not a definition — a directive.
const STAGE_DIRECTIVES: Record<string, string> = {
  Idea: "You're in the idea stage. The only thing that matters is whether this problem is real to real people. Every task that does not involve talking to a human being is a distraction right now.",
  Validation: "You're in validation. The only question that matters is whether someone will pay — not whether they like it. Every task that does not answer that question is premature.",
  MVP: "You're building. The risk is building the wrong thing with confidence. Every week you should be able to say what you learned from a real user — not what you built.",
  Launch: "You're launching. Visibility matters more than readiness. An imperfect product people know about beats a perfect product nobody has heard of.",
  Growth: "You're growing. Find the one channel that's working and go deeper — don't spread across five things at 20% each.",
  Revenue: "You're at revenue stage. The acquisition-to-revenue funnel is your entire job right now. Know your MRR, know where it leaks, fix the biggest leak.",
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
  const color=score>=60?"var(--bm-green)":score>=30?VIZ.amber:VIZ.rose;
  return (
    <div style={{ position:"relative",width:size,height:size,flexShrink:0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform:"rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--bm-border)" strokeWidth={5.5} />
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
      style={{ width:size,height:size,borderRadius:4,border:checked?"none":"1px solid var(--bm-border2)",background:checked?"var(--bm-green)":"transparent",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0,transition:"background 0.2s" }}>
      {checked&&<span style={{ fontSize:size*0.6,color:"#000",lineHeight:1 }}>✓</span>}
    </motion.button>
  );
}

// ─── Milestone card ─────────────────────────────────────────────────────────
function MilestoneCard({ milestone, tasks, index, onToggleTask, onUpdateEstimate }: { milestone:BuildMindMilestone; tasks:BuildMindTask[]; index:number; onToggleTask:(t:BuildMindTask)=>void; onUpdateEstimate:(difficulty:number|null, estimated_days:number|null)=>void }) {
  const [expanded, setExpanded] = useState(false);
  const [editingEstimate, setEditingEstimate] = useState(false);
  const [difficultyDraft, setDifficultyDraft] = useState(milestone.difficulty ?? 3);
  const [estimatedDaysDraft, setEstimatedDaysDraft] = useState(milestone.estimated_days ?? 7);
  const milestoneType=inferMilestoneType(milestone.title);
  const typeColor=TYPE_COLORS[milestoneType];
  const typeLabel=TYPE_LABELS[milestoneType];
  const week=getMilestoneWeek(milestone.order_index??index);
  const { detail, enforcement }=getMilestoneDetail(milestone);
  const done=tasks.filter(t=>t.is_completed).length;
  const total=tasks.length;
  const pct=total>0?Math.round((done/total)*100):0;
  const isComplete=total>0&&done===total;
  const daysOpen = milestone.started_at ? Math.floor((Date.now() - new Date(milestone.started_at).getTime()) / (1000*60*60*24)) : null;
  const isOverEstimate = !isComplete && daysOpen != null && milestone.estimated_days != null && daysOpen > milestone.estimated_days;

  return (
    <motion.div initial={{ opacity:0,y:6 }} animate={{ opacity:1,y:0 }} transition={{ delay:index*0.06 }}
      style={{ background:isComplete?"rgba(74,222,128,0.03)":VIZ.panel, border:`1px solid ${isComplete?"rgba(74,222,128,0.2)":VIZ.border}`, borderRadius:12, overflow:"hidden", transition:"border-color 0.3s" }}>
      <div style={{ padding:"14px 16px",cursor:"pointer" }} onClick={()=>setExpanded(!expanded)}>
        <div style={{ display:"flex",alignItems:"flex-start",gap:12 }}>
          <div style={{ width:20,height:20,borderRadius:"50%",flexShrink:0,marginTop:1,background:isComplete?"var(--bm-green)":"transparent",border:isComplete?"none":"1.5px solid var(--bm-border2)",display:"flex",alignItems:"center",justifyContent:"center" }}>
            {isComplete&&<span style={{ fontSize:10,color:"#000",lineHeight:1 }}>✓</span>}
          </div>
          <div style={{ flex:1,minWidth:0 }}>
            <div style={{ display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:5 }}>
              <span style={{ fontSize:10,padding:"2px 8px",borderRadius:99,fontFamily:"monospace",background:`${typeColor}18`,color:typeColor,fontWeight:500 }}>{typeLabel}</span>
              <span style={{ fontSize:10,color:VIZ.text3,fontFamily:"monospace" }}>{week}</span>
              {milestone.estimated_days != null && (
                <span style={{ fontSize:10,padding:"2px 8px",borderRadius:99,fontFamily:"monospace",background:isOverEstimate?"rgba(232,197,71,0.15)":"rgba(255,255,255,0.05)",color:isOverEstimate?"var(--bm-amber)":VIZ.text3 }}>
                  {milestone.estimate_is_provisional ? "~" : ""}{milestone.estimated_days}d{milestone.difficulty ? ` · diff ${milestone.difficulty}/5` : ""}
                  {isOverEstimate && daysOpen != null ? ` · ${daysOpen}d in` : ""}
                </span>
              )}
            </div>
            <div style={{ fontSize:13,fontWeight:600,lineHeight:1.4,color:isComplete?"var(--bm-green)":VIZ.text1,textDecoration:isComplete?"line-through":"none" }}>{milestone.title}</div>
            {total>0&&(
              <div style={{ display:"flex",alignItems:"center",gap:8,marginTop:7 }}>
                <div style={{ width:80,height:2.5,background:"var(--bm-border)",borderRadius:999,overflow:"hidden" }}>
                  <motion.div initial={{ width:0 }} animate={{ width:`${pct}%` }} transition={{ duration:0.7,ease:"easeOut" }}
                    style={{ height:"100%",background:isComplete?"var(--bm-green)":typeColor,borderRadius:999 }} />
                </div>
                <span style={{ fontSize:10,color:VIZ.text3,fontFamily:"monospace" }}>{done}/{total} · {pct}%</span>
              </div>
            )}
          </div>
          <motion.span animate={{ rotate:expanded?180:0 }} transition={{ duration:0.2 }} style={{ fontSize:10,color:VIZ.text3,flexShrink:0,marginTop:4,display:"block" }}>▼</motion.span>
        </div>
      </div>
      <>
        {expanded&&(
          <motion.div initial={{ height:0,opacity:0 }} animate={{ height:"auto",opacity:1 }} exit={{ height:0,opacity:0 }} transition={{ duration:0.22 }} style={{ overflow:"hidden" }}>
            <div style={{ borderTop:`1px solid ${VIZ.border}`,padding:"14px 16px 16px",display:"flex",flexDirection:"column",gap:14 }}>
              <div>
                <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6 }}>
                  <div style={{ fontSize:9,textTransform:"uppercase",letterSpacing:"0.1em",color:VIZ.text3,fontFamily:"monospace" }}>Estimate</div>
                  {!editingEstimate && (
                    <button onClick={(e)=>{e.stopPropagation();setEditingEstimate(true);}}
                      style={{ fontSize:10,color:VIZ.text3,background:"none",border:"none",cursor:"pointer",textDecoration:"underline",padding:0 }}>edit</button>
                  )}
                </div>
                {editingEstimate ? (
                  <div onClick={(e)=>e.stopPropagation()} style={{ display:"flex",alignItems:"center",gap:10,flexWrap:"wrap" }}>
                    <label style={{ fontSize:11,color:VIZ.text2,display:"flex",alignItems:"center",gap:6 }}>
                      Difficulty
                      <select value={difficultyDraft} onChange={(e)=>setDifficultyDraft(Number(e.target.value))}
                        style={{ background:VIZ.panel,border:`1px solid ${VIZ.border}`,borderRadius:6,color:VIZ.text1,fontSize:11,padding:"3px 6px" }}>
                        {[1,2,3,4,5].map(n=>(<option key={n} value={n}>{n}</option>))}
                      </select>
                    </label>
                    <label style={{ fontSize:11,color:VIZ.text2,display:"flex",alignItems:"center",gap:6 }}>
                      Est. days
                      <input type="number" min={1} max={365} value={estimatedDaysDraft}
                        onChange={(e)=>setEstimatedDaysDraft(Math.max(1, Number(e.target.value) || 1))}
                        style={{ width:56,background:VIZ.panel,border:`1px solid ${VIZ.border}`,borderRadius:6,color:VIZ.text1,fontSize:11,padding:"3px 6px" }} />
                    </label>
                    <button onClick={()=>{onUpdateEstimate(difficultyDraft, estimatedDaysDraft);setEditingEstimate(false);}}
                      style={{ fontSize:11,color:"#000",background:"var(--bm-accent)",border:"none",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontWeight:600 }}>Save</button>
                    <button onClick={()=>setEditingEstimate(false)}
                      style={{ fontSize:11,color:VIZ.text3,background:"none",border:"none",cursor:"pointer" }}>Cancel</button>
                  </div>
                ) : (
                  <p style={{ fontSize:12,color:VIZ.text2,lineHeight:1.6,margin:0 }}>
                    {milestone.estimated_days != null
                      ? `${milestone.estimate_is_provisional ? "Rough estimate (not yet task-detailed): " : ""}${milestone.estimated_days} day${milestone.estimated_days===1?"":"s"}${milestone.difficulty ? `, difficulty ${milestone.difficulty}/5` : ""}${daysOpen != null ? ` — ${daysOpen} day${daysOpen===1?"":"s"} since started` : ""}`
                      : "No estimate set yet."}
                  </p>
                )}
              </div>
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
      </>
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
              background: running ? "var(--bm-border2)" : "var(--grad-primary)",
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
              <span style={{ color: VIZ.text1, fontWeight: 600 }}>Verdict:</span> {sanitizeOutput(analysis.verdict)}
            </div>
            {typeof analysis.survival_probability === "number" && (
              <div style={{ fontSize:12,color:VIZ.text2 }}>
                <span style={{ color: VIZ.text1, fontWeight: 600 }}>Survival probability:</span> {analysis.survival_probability}%
              </div>
            )}
            {analysis.brutal_advice && (
              <div style={{ fontSize:12,color:VIZ.text2, lineHeight: 1.6 }}>
                <span style={{ color: VIZ.text1, fontWeight: 600 }}>Brutal advice:</span> {sanitizeOutput(analysis.brutal_advice)}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

// ─── Edit project modal ─────────────────────────────────────────────────────
// Figma shows an "Edit project" action on the detail page that this codebase
// never had — confirmed absent by grep before adding. Reuses the same field
// set as the Create Project page (including the new key_metric /
// current_hypothesis columns) so a project created before those fields
// existed can still pick them up.
function EditProjectModal({
  initial,
  onClose,
  onSave,
  isPending,
}: {
  initial: { title: string; problem: string; targetUsers: string; keyMetric: string; currentHypothesis: string };
  onClose: () => void;
  onSave: (data: { title: string; problem: string; targetUsers: string; keyMetric: string; currentHypothesis: string }) => void;
  isPending: boolean;
}) {
  const [title, setTitle] = useState(initial.title);
  const [problem, setProblem] = useState(initial.problem);
  const [targetUsers, setTargetUsers] = useState(initial.targetUsers);
  const [keyMetric, setKeyMetric] = useState(initial.keyMetric);
  const [currentHypothesis, setCurrentHypothesis] = useState(initial.currentHypothesis);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(6px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.18 }}
        className="w-full max-w-md rounded-[var(--r-xl)] p-5 sm:p-7 flex flex-col gap-5"
        style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border2)" }}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-[var(--bm-text)] tracking-tight">Edit Project</h2>
            <p className="text-sm text-[var(--bm-text3)] mt-1">Keep BuildMind's context up to date.</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[var(--bm-text3)] hover:bg-[var(--bm-bg3)] transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <Input label="Project Name" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          <Textarea label="Problem You're Solving" value={problem} onChange={(e) => setProblem(e.target.value)} rows={3} />
          <Input label="Who Is This For?" value={targetUsers} onChange={(e) => setTargetUsers(e.target.value)} />
          <Input
            label="Key Metric"
            placeholder="e.g. Waitlist signups or active users"
            value={keyMetric}
            onChange={(e) => setKeyMetric(e.target.value)}
            helperText="Use a metric that clearly indicates validation proof points."
          />
          <Textarea
            label="Current Hypothesis"
            placeholder="What core belief are you testing in this validation cycle?"
            value={currentHypothesis}
            onChange={(e) => setCurrentHypothesis(e.target.value)}
            rows={2}
          />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button variant="secondary" fullWidth onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button
            fullWidth
            loading={isPending}
            disabled={!title.trim()}
            onClick={() => onSave({ title: title.trim(), problem: problem.trim(), targetUsers: targetUsers.trim(), keyMetric: keyMetric.trim(), currentHypothesis: currentHypothesis.trim() })}
          >
            Save changes
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

type ActivityEvent = { label: string; occurredAt: string };

// Mirrors app/api/project/stage-evidence/route.ts response shapes. Kept as
// plain local types (not imported from lib/server/stageEvidence.ts) since
// this is a client component — the requirement/completeness objects arrive
// pre-computed from the server, the client never needs the evaluation logic.
type StageEvidenceType = "metric" | "artifact" | "experiment" | "founder_judgment";
type StageEvidenceRow = {
  id: string;
  evidence_type: StageEvidenceType;
  metric_name: string | null;
  metric_value: string | null;
  metric_date: string | null;
  artifact_description: string | null;
  artifact_url: string | null;
  experiment_channel: string | null;
  experiment_hypothesis: string | null;
  experiment_outcome: string | null;
  judgment_text: string | null;
  created_at: string;
};
type StageEvidenceSlot = { key: string; label: string; helpText: string; acceptedTypes: StageEvidenceType[] };
type StageEvidenceRequirement = { fromStage: string; toStage: string; framing: string; slots: StageEvidenceSlot[] };
type StageEvidenceCompleteness = { filledSlotKeys: string[]; missingSlotKeys: string[]; isComplete: boolean };

function formatActivityTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (sameDay) return `Today ${time}`;
  if (isYesterday) return `Yesterday ${time}`;
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${time}`;
}

// ─── Main page ──────────────────────────────────────────────────────────────
export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { data, isLoading, error } = useProjectDetailQuery(id);
  const deleteMutation = useDeleteProjectMutation();
  const updateMutation = useUpdateTaskMutation(id);
  const { project, milestones = [], tasks = [] } = data ?? {};

  const [tab, setTab] = useState<Tab>("milestones");
  const [newNoteDraft, setNewNoteDraft] = useState<Record<string, string>>({});
  const [regenerating, setRegenerating] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  // Streak — synced from server on mount so it reflects Today page completions
  const [liveStreak, setLiveStreak] = useState(() => getStoredStreak());
  // Stage selector — lets founder manually set stage, waiving prior stages automatically
  const [stagePickerOpen, setStagePickerOpen] = useState(false);
  const [stageChanging, setStageChanging] = useState(false);
  // On-demand readiness check — decoupled from the Today check-in flow and
  // from reflection confidence entirely, so it can be tested any time.
  // Calls the same /api/project/level-up endpoint Today's check-in flow
  // calls, which reads real stage-milestone completion only (see
  // lib/server/stageProgress.ts) — it does not require reflections,
  // confidence, or a check-in to have happened today.
  // On-demand readiness check — decoupled from the Today check-in flow and
  // from reflection confidence entirely, so it can be tested any time.
  // Calls /api/project/level-up, which now merges milestone completion,
  // typed evidence capture, and reflection conviction into one honest tier
  // (lib/server/stageReadiness.ts) — not just "milestones done or not."
  const [readinessChecking, setReadinessChecking] = useState(false);
  const [readinessResult, setReadinessResult] = useState<{
    eligible: boolean; tier: "not_ready" | "checklist_only" | "ready";
    nextStage: string; completed: number; total: number;
    headline: string; detail: string;
  } | null>(null);
  // Stage-transition evidence review — built for every FORWARD stage move
  // (Idea->Validation, Validation->MVP, MVP->Launch, Launch->Growth,
  // Growth->Revenue), each with its own requirement spec, same rigor as the
  // original Launch->Growth build. See lib/server/stageEvidence.ts.
  // `stageEvidenceTarget` holds the stage the founder picked while the
  // review modal is open; null means the modal is closed. A backward move
  // proceeds directly, unchanged from before — moving back is a
  // correction, not a transition, so there's nothing to review.
  const [stageEvidenceFrom, setStageEvidenceFrom] = useState<string | null>(null);
  const [stageEvidenceTarget, setStageEvidenceTarget] = useState<string | null>(null);
  const [stageEvidenceRows, setStageEvidenceRows] = useState<StageEvidenceRow[]>([]);
  const [stageEvidenceRequirement, setStageEvidenceRequirement] = useState<StageEvidenceRequirement | null>(null);
  const [stageEvidenceCompleteness, setStageEvidenceCompleteness] = useState<StageEvidenceCompleteness | null>(null);
  const [stageEvidenceLoading, setStageEvidenceLoading] = useState(false);
  const [stageEvidenceSlotDraft, setStageEvidenceSlotDraft] = useState<string | null>(null);
  const [stageEvidenceForm, setStageEvidenceForm] = useState<Record<string, string>>({});
  const [stageEvidenceSubmitting, setStageEvidenceSubmitting] = useState(false);
  // REC 3.2 + 2.3 + 3.1: narrative sentence, transition challenge, readiness prompt
  const [narrativeSentence, setNarrativeSentence] = useState<string | null>(null);
  const [transitionChallenge, setTransitionChallenge] = useState<{
    challenges: string[]; recommended_action: string; milestone_sentence: string;
    milestone_title?: string; acknowledged: boolean;
  } | null>(null);
  const [challengeAcknowledged, setChallengeAcknowledged] = useState(false);
  const [stageTransitionPrompt, setStageTransitionPrompt] = useState<{
    currentStage: string; nextStage: string | null; reason: string;
  } | null>(null);
  const [stageTransitionDismissed, setStageTransitionDismissed] = useState(false);
  const updateProjectMutation = useUpdateProjectMutation();
  const [showEditProject, setShowEditProject] = useState(false);
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([]);

  // Close stage picker when clicking outside
  useEffect(() => {
    if (!stagePickerOpen) return;
    const handler = () => setStagePickerOpen(false);
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [stagePickerOpen]);

  useEffect(() => { if (id) setActiveProjectId(id); }, [id]);

  // Last activity feed (real data — activity_log filtered to this project).
  useEffect(() => {
    if (!id) return;
    fetch(`/api/projects/${id}/activity`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { ok?: boolean; events?: ActivityEvent[] }) => {
        if (d.ok && Array.isArray(d.events)) setActivityEvents(d.events);
      })
      .catch(() => {});
  }, [id]);

  // Sync streak from server — Today page is where streaks are earned; projects page
  // must read the same source, not a stale localStorage snapshot.
  useEffect(() => {
    syncStreakFromServer()
      .then(s => setLiveStreak(s))
      .catch(() => { /* keep initialised value from getStoredStreak */ });
  }, []);

  /**
   * handleStageSelect — founder manually picks a stage.
   *
   * When a stage is selected that is AHEAD of the current one, all milestones
   * belonging to prior stages are automatically marked completed ("waived").
   * This reflects reality: if you're at MVP, you don't need to re-do Idea work.
   *
   * When a stage is selected that is BEHIND the current one, we just update
   * the stage without touching milestones (no un-waiving).
   */
  async function checkStageReadiness() {
    if (!id || readinessChecking) return;
    setReadinessChecking(true);
    setReadinessResult(null);
    try {
      const res = await fetch("/api/project/level-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: id }),
      });
      const json = await res.json().catch(() => null);
      if (json?.ok) {
        setReadinessResult({
          eligible: !!json.eligible,
          tier: json.tier === "ready" ? "ready" : json.tier === "checklist_only" ? "checklist_only" : "not_ready",
          nextStage: json.next_stage ?? "",
          completed: json.stage_progress?.completedMilestones ?? 0,
          total: json.stage_progress?.totalMilestones ?? 0,
          headline: json.readiness?.headline ?? "",
          detail: json.readiness?.detail ?? "",
        });
      }
    } catch {
      // Leave readinessResult null — the button can just be retried.
    } finally {
      setReadinessChecking(false);
    }
  }

  async function handleStageSelect(newStage: string) {
    if (!project || !id || stageChanging) return;
    setStagePickerOpen(false);
    if (newStage === project.startup_stage) return;

    // Every FORWARD move now gets an evidence review before it proceeds —
    // Idea->Validation, Validation->MVP, MVP->Launch, Launch->Growth, and
    // Growth->Revenue each have their own requirement spec (see
    // lib/server/stageEvidence.ts). A BACKWARD move (correcting an
    // over-advanced stage) skips the review and goes straight through to
    // executeStageTransition, same as before — there's nothing to prove
    // when walking a stage back.
    const previousStage = project.startup_stage ?? "Idea";
    const prevIdx = STAGE_ORDER.indexOf(previousStage as typeof STAGE_ORDER[number]);
    const nextIdx = STAGE_ORDER.indexOf(newStage as typeof STAGE_ORDER[number]);
    if (nextIdx > prevIdx) {
      setStageEvidenceFrom(previousStage);
      setStageEvidenceTarget(newStage);
      setStageEvidenceLoading(true);
      try {
        const res = await fetch(
          `/api/project/stage-evidence?projectId=${id}&fromStage=${encodeURIComponent(previousStage)}&toStage=${encodeURIComponent(newStage)}`,
        );
        const json = await res.json().catch(() => null);
        if (json?.ok) {
          setStageEvidenceRows(json.rows ?? []);
          setStageEvidenceRequirement(json.requirement ?? null);
          setStageEvidenceCompleteness(json.completeness ?? null);
        }
      } catch {
        // Evidence review is a review aid, not a gate — if it fails to
        // load, the founder can still proceed via "Confirm without full evidence".
      } finally {
        setStageEvidenceLoading(false);
      }
      return;
    }

    await executeStageTransition(newStage);
  }

  /** Actually performs the transition — the same logic every stage change runs, evidence-reviewed or not. */
  async function executeStageTransition(newStage: string) {
    if (!project || !id) return;
    setStageChanging(true);
    try {
      const supabase = createClient();

      const currentIdx = STAGE_ORDER.indexOf(newStage as typeof STAGE_ORDER[number]);
      const prevIdx    = STAGE_ORDER.indexOf((project.startup_stage ?? "Idea") as typeof STAGE_ORDER[number]);

      // Moving forward: waive all milestones from prior stages
      if (currentIdx > prevIdx && milestones.length > 0) {
        const stagesToWaive = STAGE_ORDER.slice(0, currentIdx);
        const milestonesToWaive = milestones.filter(m => {
          // Priority 1: use the stage column written by generate-roadmap
          const dbStage = m.stage ? normalizeStageLocal(m.stage) : null;
          if (dbStage) return stagesToWaive.includes(dbStage as typeof STAGE_ORDER[number]);
          // Priority 2: keyword inference from title (fallback for older milestones)
          const milestoneStage = inferMilestoneStageFromTitle(m.title);
          return stagesToWaive.includes(milestoneStage as typeof STAGE_ORDER[number]);
        });

        // Batch-complete all waived milestones + their tasks
        await Promise.all(
          milestonesToWaive
            .filter(m => m.status !== "completed")
            .map(async (m) => {
              // Mark all tasks in this milestone complete
              const milestoneTasks = tasks.filter(t => t.milestone_id === m.id && !t.is_completed);
              await Promise.all(
                milestoneTasks.map(t =>
                  supabase.from("tasks").update({
                    is_completed: true,
                    updated_at: new Date().toISOString(),
                  }).eq("id", t.id)
                )
              );
              // Mark milestone complete
              await supabase.from("milestones").update({
                status: "completed",
                updated_at: new Date().toISOString(),
              }).eq("id", m.id);
            })
        );
      }

      const { data: existingProject } = await supabase
        .from("projects")
        .select("stage_history")
        .eq("id", id)
        .maybeSingle();
      const previousHistory = Array.isArray((existingProject as { stage_history?: unknown })?.stage_history)
        ? (existingProject as { stage_history: unknown[] }).stage_history
        : [];

      // Update project stage
      const previousStage = project.startup_stage ?? "Idea";
      const { error: stageUpdateError } = await supabase.from("projects").update({
        startup_stage: newStage,
        stage_history: [
          ...previousHistory,
          { from: previousStage, to: newStage, set_at: new Date().toISOString(), source: "manual" },
        ],
        updated_at: new Date().toISOString(),
      }).eq("id", id);
      if (stageUpdateError) throw stageUpdateError;

      // A manual stage change is a real transition, not merely a label edit.
      // Keep the legacy founder-context projection aligned and clear the
      // server-owned Today cache before any client can reuse an old-stage task.
      const [contextResponse, cacheResponse] = await Promise.all([
        fetch("/api/founder-context", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ current_stage: newStage }),
        }),
        fetch("/api/user/behavior-state", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ values: { today_action_cache: null } }),
        }),
      ]);
      if (!contextResponse.ok || !cacheResponse.ok) {
        throw new Error("Could not synchronize the stage transition");
      }
      storage.remove(`bm_today_action_cache_${project.user_id}`);
      storage.remove(`bm_today_action_cache_ts_${project.user_id}`);

      // These are the existing transition products. Previously only Today
      // detected a stage change, so a founder who advanced from Projects did
      // not get either the transition challenge or the Break My Startup
      // interstitial until another unrelated Today update happened.
      const transitionPayload = {
        projectId: id,
        previousStage,
        currentStage: newStage,
        triggerType: "stage_transition",
      };
      await Promise.allSettled([
        fetch("/api/ai/stage-transition-challenge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(transitionPayload),
        }),
        fetch("/api/ai/milestone-break", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(transitionPayload),
        }),
      ]);
      // Prevent Today's detector from duplicating the just-created transition.
      storage.set(`bm_last_stage_${id}`, newStage);

      // Refresh all project data
      // FIX: this never invalidated queryKeys.projectSummaries — the query
      // Today's page actually reads its `project` object from (via
      // selectActiveProject(summaries, activeProjectId) in app/today/page.tsx).
      // Only queryKeys.project(id)/projects were invalidated, which this
      // page itself uses, but Today kept serving the pre-transition stage
      // from its own cached summary indefinitely — confirmed root cause of
      // "I'm on Launch stage but received an Idea stage task": the daily
      // action generator does correctly read the live DB stage server-side,
      // but Today's client-side cache-validity check compares against this
      // stale client stage, found a false "match", and never busted the
      // cached (wrong-stage) action.
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.project(id) }),
        qc.invalidateQueries({ queryKey: queryKeys.projects }),
        qc.invalidateQueries({ queryKey: queryKeys.projectSummaries }),
      ]);
    } catch (err) {
      console.error("[projects] stage select failed:", err);
    } finally {
      setStageChanging(false);
    }
  }

  function closeStageEvidenceModal() {
    setStageEvidenceFrom(null);
    setStageEvidenceTarget(null);
    setStageEvidenceRows([]);
    setStageEvidenceRequirement(null);
    setStageEvidenceCompleteness(null);
    setStageEvidenceSlotDraft(null);
    setStageEvidenceForm({});
  }

  async function submitStageEvidence(evidenceType: StageEvidenceType) {
    if (!id || !stageEvidenceFrom || !stageEvidenceTarget || stageEvidenceSubmitting) return;
    setStageEvidenceSubmitting(true);
    try {
      const res = await fetch("/api/project/stage-evidence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: id,
          fromStage: stageEvidenceFrom,
          toStage: stageEvidenceTarget,
          evidence_type: evidenceType,
          ...stageEvidenceForm,
        }),
      });
      const json = await res.json().catch(() => null);
      if (json?.ok) {
        setStageEvidenceRows(json.rows ?? []);
        setStageEvidenceCompleteness(json.completeness ?? null);
        setStageEvidenceSlotDraft(null);
        setStageEvidenceForm({});
      }
    } catch {
      // Leave the draft open — founder can retry without losing what they typed.
    } finally {
      setStageEvidenceSubmitting(false);
    }
  }

  async function deleteStageEvidence(rowId: string) {
    if (!id) return;
    try {
      await fetch(`/api/project/stage-evidence?id=${rowId}&projectId=${id}`, { method: "DELETE" });
      const remaining = stageEvidenceRows.filter(r => r.id !== rowId);
      setStageEvidenceRows(remaining);
      if (stageEvidenceRequirement) {
        const submittedTypes = new Set(remaining.map(r => r.evidence_type));
        const missingSlotKeys = stageEvidenceRequirement.slots
          .filter(s => !s.acceptedTypes.some(t => submittedTypes.has(t)))
          .map(s => s.key);
        setStageEvidenceCompleteness({
          filledSlotKeys: stageEvidenceRequirement.slots.map(s => s.key).filter(k => !missingSlotKeys.includes(k)),
          missingSlotKeys,
          isComplete: missingSlotKeys.length === 0,
        });
      }
    } catch {
      // Non-fatal — the row is still shown; founder can retry the delete.
    }
  }

  async function confirmStageEvidenceTransition() {
    if (!stageEvidenceTarget) return;
    const target = stageEvidenceTarget;
    closeStageEvidenceModal();
    await executeStageTransition(target);
  }

  /** Normalize a raw stage string to STAGE_ORDER value, or null if unrecognizable */
  function normalizeStageLocal(raw: string): string | null {
    const v = raw.trim();
    // Exact match first (handles "Idea", "MVP" etc. from DB)
    const exact = STAGE_ORDER.find(s => s.toLowerCase() === v.toLowerCase());
    if (exact) return exact;
    // Partial match
    if (/(valid|discover)/.test(v.toLowerCase())) return "Validation";
    if (/(mvp|proto)/.test(v.toLowerCase())) return "MVP";
    if (/launch/.test(v.toLowerCase())) return "Launch";
    if (/growth/.test(v.toLowerCase())) return "Growth";
    if (/revenue/.test(v.toLowerCase())) return "Revenue";
    if (/idea/.test(v.toLowerCase())) return "Idea";
    return null;
  }

  /** Infer which stage a milestone belongs to from its title keywords */
  function inferMilestoneStageFromTitle(title: string): string {
    const t = title.toLowerCase();
    if (/(validate|validation|problem.*fit|customer.*interview|survey|hypothesis)/.test(t)) return "Validation";
    if (/(mvp|prototype|build|ship|v1|version 1|working.*product)/.test(t)) return "MVP";
    if (/(launch|announce|go.live|product.*hunt|beta)/.test(t)) return "Launch";
    if (/(growth|scale|retention|churn|referral|acquisition)/.test(t)) return "Growth";
    if (/(revenue|monetize|pricing|subscription|mrr|arr)/.test(t)) return "Revenue";
    return "Idea"; // default — safest to waive Idea-stage work
  }

  // REC 3.2: Load pending transition challenge and generate narrative on project load
  useEffect(() => {
    if (!project || !id) return;

    // Check for pending transition challenge stored in project data
    const pendingRaw = (project as Record<string, unknown>).pending_transition_challenge as string | null;
    if (pendingRaw) {
      try {
        const pending = JSON.parse(pendingRaw) as {
          challenges: string[]; recommended_action: string; milestone_sentence: string;
          milestone_title?: string; acknowledged: boolean;
        };
        if (!pending.acknowledged) {
          setTransitionChallenge(pending);
        }
      } catch { /* non-fatal */ }
    }

    // Generate narrative sentence from project data + avoidance patterns
    const completedTaskCount = tasks.filter(t => t.is_completed).length;
    const totalTaskCount = tasks.length;
    const completionPct = totalTaskCount > 0 ? Math.round((completedTaskCount / totalTaskCount) * 100) : 0;
    const pendingMilestoneCount = milestones.filter(m => m.status !== "completed").length;
    const completedMilestoneCount = milestones.filter(m => m.status === "completed").length;

    // Build a context-aware narrative sentence (no AI call — deterministic)
    const projectStage = project.startup_stage ?? "Idea";
    let narrative = "";
    if (completionPct === 0 && totalTaskCount > 0) {
      narrative = `You haven't started any tasks yet — the gap between planning and doing starts here.`;
    } else if (completionPct >= 80 && pendingMilestoneCount > 0) {
      narrative = `You're ${completionPct}% through your tasks but still have ${pendingMilestoneCount} milestone${pendingMilestoneCount > 1 ? "s" : ""} open — close the loop before moving on.`;
    } else if (completedMilestoneCount > 0 && completionPct < 50) {
      narrative = `You've completed ${completedMilestoneCount} milestone${completedMilestoneCount > 1 ? "s" : ""}, but execution is at ${completionPct}% — the pace needs to accelerate.`;
    } else if (projectStage === "Validation" && completionPct > 40) {
      narrative = `You're in validation — the only question that matters is whether someone will pay, not whether they like it.`;
    } else if (projectStage === "Idea") {
      narrative = `You're at the idea stage — every task that doesn't involve talking to a real human being is a distraction right now.`;
    } else if (projectStage === "MVP" && completionPct > 60) {
      narrative = `You're building — the risk is building the wrong thing with confidence. When did you last get feedback from a real user?`;
    } else if (projectStage === "Launch") {
      narrative = `You're launching. Visibility matters more than readiness right now — an imperfect product people know about beats a perfect one nobody has heard of.`;
    } else {
      narrative = `${completionPct}% complete — ${completedMilestoneCount} milestone${completedMilestoneCount !== 1 ? "s" : ""} done, ${pendingMilestoneCount} remaining.`;
    }
    setNarrativeSentence(narrative);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, tasks.length, milestones.length]);

  // Verbal transcript: Three-signal stage transition check
  useEffect(() => {
    if (!project?.id) return;
    const dismissKey = `bm_stage_transition_dismissed_${project.id}_${project.startup_stage}`;
    if (storage.get(dismissKey)) return;

    fetch("/api/ai/check-stage-transition", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: project.id }),
    })
      .then(r => r.json())
      .then((res: { success: boolean; data?: { shouldPrompt: boolean; currentStage: string; nextStage: string | null; reason: string } }) => {
        if (res.success && res.data?.shouldPrompt) {
          setStageTransitionPrompt({
            currentStage: res.data.currentStage,
            nextStage: res.data.nextStage,
            reason: res.data.reason,
          });
        }
      })
      .catch(() => { /* non-fatal */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  // CONSOLIDATION: the effect that used to live here read
  // founder_context.pending_stage_transition directly and rendered a
  // second "ready to move up?" banner via ReadinessPrompt — removed. The
  // effect above (check-stage-transition) now writes that same field as a
  // side effect via the single shared detector, so this page doesn't need
  // its own separate read of it; one fetch, one banner.

  // REC 2.3: When a milestone is marked complete, trigger stage-transition challenge in background
  const triggerMilestoneChallenge = async (milestoneTitle: string) => {
    if (!project || !id) return;
    try {
      // Fire stage-transition-challenge (existing)
      await fetch("/api/ai/stage-transition-challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: project.user_id,
          projectId: id,
          milestoneTitle,
          triggerType: "milestone_complete",
          currentStage: project.startup_stage ?? "Idea",
        }),
      });
      // Fire milestone-break in background — stores result for Today page interstitial
      fetch("/api/ai/milestone-break", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: id,
          milestoneTitle,
          triggerType: "milestone_complete",
          currentStage: project.startup_stage ?? "Idea",
        }),
      }).catch(() => {}); // best-effort, never blocks
      // Invalidate to reload the pending_transition_challenge from project
      void qc.invalidateQueries({ queryKey: queryKeys.project(id) });
    } catch { /* non-fatal — background only */ }
  };

  const milestoneMutation = useMutation({
    mutationFn: (payload: { id: string; title?: string; stage?: string; difficulty?: number | null; estimated_days?: number | null }) =>
      updateMilestoneForCurrentUser(payload.id, {
        title: payload.title,
        stage: payload.stage,
        difficulty: payload.difficulty,
        estimated_days: payload.estimated_days,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.project(id) }),
  });

  const stage = String(project?.startup_stage ?? "MVP");
  // FIX: momentum came from project.momentum_score directly (a mirror
  // column, not the authoritative value — see earlier this-session fix on
  // task-complete's atomic RPCs) and xp came from a require()'d local
  // getXP() call, both independent of the canonical scorecard. Now both,
  // plus streak, read from the exact same source reports/overview use.
  const { data: scorecard } = useFounderScorecardQuery();
  const score = useMemo(() => {
    if (!project) return 0;
    return computeStartupScore({
      validation_strengths: project.validation_strengths,
      execution_score: project.execution_score,
      momentum_score: scorecard?.momentum ?? project.momentum_score,
      streak: scorecard?.streak ?? liveStreak,
      xp: scorecard?.xp ?? 0,
    });
  }, [project, tasks, liveStreak, scorecard]);
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

  async function handleSaveProjectEdit(vals: { title: string; problem: string; targetUsers: string; keyMetric: string; currentHypothesis: string }) {
    if (!id) return;
    try {
      await updateProjectMutation.mutateAsync({
        projectId: id,
        updates: {
          title: vals.title,
          problem: vals.problem,
          target_users: vals.targetUsers,
          key_metric: vals.keyMetric,
          current_hypothesis: vals.currentHypothesis,
        },
      });
      setShowEditProject(false);
    } catch {
      // Non-fatal — modal stays open so the founder can retry
    }
  }

  const toggleTask = (task: BuildMindTask) => {
    const newCompleted = !task.is_completed;
    updateMutation.mutate({ taskId: task.id, isCompleted: newCompleted, notes: task.notes ?? "" });
    if (newCompleted) {
      // REC 2.3: Check if completing this task finishes a milestone — if so, trigger challenge
      const taskMilestone = milestones.find(m => m.id === task.milestone_id);
      if (taskMilestone) {
        const milestoneTasks = tasks.filter(t => t.milestone_id === taskMilestone.id);
        // Count as complete if this was the last incomplete task
        const remainingIncomplete = milestoneTasks.filter(t => !t.is_completed && t.id !== task.id);
        if (remainingIncomplete.length === 0 && taskMilestone.status !== "completed") {
          // Fire milestone challenge in background — non-blocking
          void triggerMilestoneChallenge(taskMilestone.title);
        }
      }
    }
  };

  if (isLoading) return (
    <div className="mx-auto max-w-[860px] px-3 py-5 pb-10 sm:px-6 sm:py-7 sm:pb-12">
      <div className="mb-6 space-y-3 border-b border-[var(--bm-border)] pb-5">
        <div className="h-3 w-24 animate-pulse rounded-lg bg-[var(--bm-bg3)]" />
        <div className="h-7 w-2/3 animate-pulse rounded-lg bg-[var(--bm-bg3)]" />
        <div className="flex gap-2">
          <div className="h-6 w-20 animate-pulse rounded-full bg-[var(--bm-bg3)]" />
          <div className="h-6 w-24 animate-pulse rounded-full bg-[var(--bm-bg3)]" />
        </div>
      </div>
      <div className="grid gap-4">
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className="h-24 animate-pulse rounded-[var(--r-xl)] border border-[var(--bm-border)] bg-[var(--bm-bg2)]" />
        ))}
      </div>
    </div>
  );
  if (error || !project) return (
    <div className="px-3 py-10 text-center sm:px-6">
      <div className="mb-3 text-[13px] text-[var(--bm-red)]">
        {error instanceof Error ? error.message : "Project not found."}
      </div>
      <button onClick={() => router.back()} className="rounded-lg border border-[var(--bm-border)] bg-transparent px-4 py-2 text-[13px] text-[var(--bm-text2)]">← Back</button>
    </div>
  );

  const roadmapSteps = STAGE_ROADMAPS[stage] ?? STAGE_ROADMAPS["MVP"];
  const progressColor = progress >= 60 ? "var(--bm-accent)" : "var(--grad-primary)";

  return (
    <div
      style={{ maxWidth: 1120, margin: "0 auto", padding: "20px clamp(12px, 4vw, 24px)", paddingBottom: 48 }}>

      {showUpgrade ? (
        <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 12, padding: "14px 16px", marginBottom: 16, display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: "var(--bm-text)", marginBottom: 4 }}>Execution streak unlocked Builder tools</div>
            <div style={{ fontSize: 12, color: "var(--bm-text3)", lineHeight: 1.5 }}>Your project is moving. Reports, startup kit, and deeper coaching can now compound that momentum.</div>
          </div>
          <button onClick={() => router.push("/upgrade")} style={{ background: "var(--bm-text)", border: "none", color: "var(--bm-bg)", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flex: "1 1 120px", maxWidth: 180 }}>Upgrade</button>
        </div>
      ) : null}

      {stageTransitionPrompt && !stageTransitionDismissed ? (
        <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: "var(--bm-text)", marginBottom: 6 }}>
                Stage check: {stageTransitionPrompt.currentStage} → {stageTransitionPrompt.nextStage ?? "next stage"}
              </div>
              <div style={{ fontSize: 12, color: "var(--bm-text2)", lineHeight: 1.55 }}>{sanitizeOutput(stageTransitionPrompt.reason)}</div>
            </div>
            <button
              onClick={() => {
                storage.set(`bm_stage_transition_dismissed_${project.id}_${project.startup_stage}`, "1");
                setStageTransitionDismissed(true);
              }}
              style={{ background: "none", border: "none", color: "var(--bm-text4)", cursor: "pointer", fontSize: 16, padding: 0, lineHeight: 1 }}>
              ×
            </button>
          </div>
        </div>
      ) : null}

      {/* REC 2.3: Transition Challenge Interstitial — acknowledge gate before today's work */}
      {transitionChallenge && !challengeAcknowledged ? (
        <div style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.22)", borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#fbbf24", marginBottom: 6 }}>
            Milestone challenge: {transitionChallenge.milestone_title ?? "prove the next step"}
          </div>
          <div style={{ fontSize: 12, color: "var(--bm-text2)", lineHeight: 1.55, marginBottom: 10 }}>{transitionChallenge.milestone_sentence}</div>
          <ul style={{ margin: "0 0 12px 16px", padding: 0, color: "var(--bm-text3)", fontSize: 12, lineHeight: 1.55 }}>
            {transitionChallenge.challenges.slice(0, 3).map(item => <li key={item}>{item}</li>)}
          </ul>
          <button onClick={() => setChallengeAcknowledged(true)} style={{ background: "var(--bm-bg3)", border: "1px solid var(--bm-border)", color: "var(--bm-text2)", borderRadius: 8, padding: "7px 10px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
            I understand the risk
          </button>
        </div>
      ) : null}

      {/* CONSOLIDATION: ReadinessPrompt removed here — was a second banner
          sourced from the now-retired detector, redundant with the "Stage
          check" banner above (both now driven by the same shared function). */}

      <div className="mb-5 border-b border-[var(--bm-border)] pb-[18px]">
        <button onClick={() => router.push("/projects")}
          className="mb-3.5 border-none bg-transparent p-0 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--bm-text4)] hover:text-[var(--bm-text3)]">
          Projects / {String(project.title ?? "Untitled project")}
        </button>
        <PageHeader
          title={String(project.title ?? "Untitled project")}
          subtitle={narrativeSentence ?? `${completedCount}/${tasks.length} tasks · ${progress}% complete`}
          action={
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <button onClick={() => setShowEditProject(true)}
                className="rounded-lg border border-[var(--bm-border2)] bg-transparent px-3.5 py-2 text-[12px] font-medium text-[var(--bm-text2)] hover:bg-[var(--bm-bg3)]">
                Edit project
              </button>
              <button onClick={() => router.push("/today")}
                className="w-full rounded-lg border-none bg-[var(--bm-text)] px-3.5 py-2 text-[12px] font-bold text-[var(--bm-bg)] sm:w-auto">
                Today&apos;s action
              </button>
            </div>
          }
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {/* Stage selector — click to change stage, auto-waives prior milestones */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setStagePickerOpen(p => !p)}
              disabled={stageChanging}
              style={{
                fontSize: 10, padding: "2px 9px", borderRadius: 20,
                background: "var(--bm-bg3)", color: "var(--bm-text3)",
                border: "1px solid var(--bm-border)", fontWeight: 700,
                cursor: stageChanging ? "wait" : "pointer",
                fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5,
                transition: "background 0.15s",
              }}
            >
              {stageChanging ? "Updating…" : String(stage)}
              <span style={{ fontSize: 8, opacity: 0.6 }}>▼</span>
            </button>
            {stagePickerOpen && (
              <div style={{
                position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 50,
                background: "var(--bm-bg2)", border: "1px solid var(--bm-border2)",
                borderRadius: 10, padding: "6px 0", minWidth: 160,
                boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
              }}>
                {STAGE_ORDER.map(s => {
                  const isCurrent = s === stage;
                  const idx = STAGE_ORDER.indexOf(s);
                  const currentIdx = STAGE_ORDER.indexOf(stage as typeof STAGE_ORDER[number]);
                  const isAhead = idx > currentIdx;
                  return (
                    <button
                      key={s}
                      onClick={() => void handleStageSelect(s)}
                      style={{
                        width: "100%", padding: "8px 14px", background: "none",
                        border: "none", textAlign: "left", cursor: "pointer",
                        fontSize: 12, fontFamily: "inherit",
                        color: isCurrent ? "var(--bm-accent)" : "var(--bm-text2)",
                        fontWeight: isCurrent ? 700 : 400,
                        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                      }}
                    >
                      <span>{s}</span>
                      {isCurrent && <span style={{ fontSize: 10, color: "var(--bm-accent)" }}>current</span>}
                      {isAhead && !isCurrent && (
                        <span style={{ fontSize: 9, color: "var(--bm-text4)" }}>waives prior</span>
                      )}
                    </button>
                  );
                })}
                <div style={{ borderTop: "1px solid var(--bm-border)", margin: "6px 14px 2px", padding: "6px 0 0" }}>
                  <p style={{ fontSize: 10, color: "var(--bm-text4)", margin: 0, lineHeight: 1.4 }}>
                    Selecting a later stage marks prior milestones complete.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* On-demand readiness check — real stage-milestone completion
              only, no reflection/confidence/check-in requirement. Exists
              specifically so readiness can be verified independent of
              Today's stricter 3-signal nudge, which needs 3+ reflections
              averaging above 3.5 confidence and won't fire without them. */}
          <button
            onClick={() => void checkStageReadiness()}
            disabled={readinessChecking}
            style={{
              fontSize: 10, padding: "2px 9px", borderRadius: 20,
              background: "none", color: "var(--bm-text4)",
              border: "1px solid var(--bm-border)", fontWeight: 600,
              cursor: readinessChecking ? "wait" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {readinessChecking ? "Checking…" : "Check stage readiness"}
          </button>
          {readinessResult && (
            <div style={{
              display: "flex", flexDirection: "column", gap: 2, maxWidth: 340,
            }}>
              <span style={{
                fontSize: 11, fontWeight: 700,
                color: readinessResult.tier === "ready" ? "var(--bm-green)"
                  : readinessResult.tier === "checklist_only" ? "var(--bm-amber)"
                  : "var(--bm-text4)",
              }}>
                {readinessResult.tier === "ready" && `✓ Ready for ${readinessResult.nextStage}`}
                {readinessResult.tier === "checklist_only" && `Checklist done, evidence thin`}
                {readinessResult.tier === "not_ready" && `Not yet — ${readinessResult.completed}/${readinessResult.total} milestones done`}
              </span>
              {readinessResult.tier !== "not_ready" && readinessResult.detail && (
                <span style={{ fontSize: 10, color: "var(--bm-text4)", lineHeight: 1.4 }}>
                  {readinessResult.detail}
                </span>
              )}
            </div>
          )}
          <a
            href="/progress?tab=patterns"
            title="See what moves your score"
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "3px 9px", borderRadius: 8,
              background: score >= 70 ? "rgba(74,222,128,0.08)" : score >= 45 ? "rgba(232,197,71,0.08)" : "rgba(224,85,85,0.07)",
              border: `1px solid ${score >= 70 ? "rgba(74,222,128,0.25)" : score >= 45 ? "rgba(232,197,71,0.2)" : "rgba(224,85,85,0.2)"}`,
              color: score >= 70 ? "#4ade80" : score >= 45 ? "var(--bm-accent)" : "var(--bm-red, #E05555)",
              fontSize: 11, fontWeight: 700, textDecoration: "none",
            }}
          >
            {score}pts →
          </a>
          <span className="text-[11px] text-[var(--bm-text3)]">{completedCount}/{tasks.length} tasks</span>
          <span className="text-[11px]" style={{ color: progress >= 60 ? "#4ade80" : progress >= 30 ? "#fbbf24" : "var(--bm-text3)" }}>{progress}% complete</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
      <main style={{ minWidth: 0 }}>

      {/* Progress bar */}
      <div style={{ height: 4, background: "var(--bm-bg3)", borderRadius: 99, overflow: "hidden", marginBottom: 16 }}>
        <div style={{ height: "100%", width: `${progress}%`, background: progressColor, borderRadius: 99 }} />
      </div>

      {narrativeSentence ? (
        <div style={{ fontSize: 12, color: "var(--bm-text3)", lineHeight: 1.55, marginBottom: 16, borderLeft: "2px solid var(--bm-border)", paddingLeft: 12 }}>
          {narrativeSentence}
        </div>
      ) : null}

      {/* REC 3.5: Avoidance pattern surface — BuildMind does what a to-do list cannot */}
      {Boolean((project as Record<string, unknown>).avoidance_pattern) ? (
        <div style={{ background: "rgba(251,191,36,0.04)", border: "1px solid rgba(251,191,36,0.15)", borderRadius: 10, padding: "10px 14px", marginBottom: 16, display: "flex", gap: 10, alignItems: "flex-start" }}>
          <span style={{ fontSize: 14, flexShrink: 0 }}>⚠</span>
          <div style={{ fontSize: 12, color: "var(--bm-text3)", lineHeight: 1.5 }}>
            {String((project as Record<string, unknown>).avoidance_pattern)}
          </div>
        </div>
      ) : null}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--bm-border)", marginBottom: 24, overflowX: "auto" }}>
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
            <MilestoneCard key={m.id} milestone={m} tasks={tasks.filter(t => t.milestone_id === m.id)} index={mi} onToggleTask={toggleTask}
              onUpdateEstimate={(difficulty, estimated_days) => milestoneMutation.mutate({ id: m.id, difficulty, estimated_days })} />
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
                style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 12, padding: "16px 18px" }}>
                <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--bm-bg4)", border: "1px solid var(--bm-border2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 11, color: "var(--bm-text3)", fontWeight: 800 }}>{i + 1}</div>
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
      </main>

      <aside className="order-first lg:order-none" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ fontSize: 9, color: "var(--bm-text4)", textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "'DM Mono', monospace", marginBottom: 10 }}>
            Project health
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 11, lineHeight: 1.45 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <span style={{ color: "var(--bm-text3)" }}>Momentum</span>
              <span style={{ color: "var(--bm-text2)", fontFamily: "'DM Mono', monospace" }}>{score} pts</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <span style={{ color: "var(--bm-text3)" }}>Execution</span>
              <span style={{ color: "var(--bm-text2)", fontFamily: "'DM Mono', monospace" }}>{completedCount}/{tasks.length} tasks</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <span style={{ color: "var(--bm-text3)" }}>Current stage</span>
              <span style={{ color: "var(--bm-accent)", fontFamily: "'DM Mono', monospace" }}>{String(stage)}</span>
            </div>
            {project.key_metric ? (
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span style={{ color: "var(--bm-text3)" }}>{project.key_metric}</span>
              </div>
            ) : null}
          </div>
          {project.current_hypothesis ? (
            <p style={{ fontSize: 11, lineHeight: 1.5, color: "var(--bm-text2)", margin: "10px 0 0" }}>
              <span style={{ color: "var(--bm-accent)", fontWeight: 700 }}>Current hypothesis: </span>
              {project.current_hypothesis}
            </p>
          ) : null}
        </div>

        <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ fontSize: 9, color: "var(--bm-text4)", textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "'DM Mono', monospace", marginBottom: 10 }}>
            Last activity
          </div>
          {activityEvents.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {activityEvents.map((ev, i) => (
                <div key={`${ev.occurredAt}-${i}`} style={{ fontSize: 11, lineHeight: 1.45 }}>
                  <div style={{ color: "var(--bm-text2)" }}>{ev.label}</div>
                  <div style={{ fontSize: 9, color: "var(--bm-text4)", fontFamily: "'DM Mono', monospace", marginTop: 1 }}>
                    {formatActivityTime(ev.occurredAt)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 11, color: "var(--bm-text4)", margin: 0, lineHeight: 1.5 }}>No activity logged for this project yet.</p>
          )}
        </div>

        <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ fontSize: 9, color: "var(--bm-text4)", textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "'DM Mono', monospace", marginBottom: 10 }}>
            Active sprint tasks
          </div>
          {tasks.filter(task => !task.is_completed).slice(0, 3).length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {tasks.filter(task => !task.is_completed).slice(0, 3).map(task => (
                <button
                  key={task.id}
                  onClick={() => setTab("tasks")}
                  style={{ display: "flex", alignItems: "flex-start", gap: 8, width: "100%", padding: 0, border: "none", background: "none", color: "var(--bm-text2)", cursor: "pointer", fontFamily: "inherit", fontSize: 11, lineHeight: 1.45, textAlign: "left" }}
                >
                  <span style={{ width: 12, height: 12, borderRadius: 3, border: "1px solid var(--bm-border2)", marginTop: 2, flexShrink: 0 }} />
                  <span>{task.title}</span>
                </button>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 11, color: "var(--bm-text4)", margin: 0, lineHeight: 1.5 }}>No open tasks in this project.</p>
          )}
        </div>

        <div style={{ background: "var(--bm-bg3)", border: "1px solid var(--bm-border)", borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ fontSize: 9, color: "var(--bm-text4)", textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "'DM Mono', monospace", marginBottom: 7 }}>
            Project statement
          </div>
          <p style={{ fontSize: 11, color: "var(--bm-text3)", lineHeight: 1.55, margin: 0 }}>
            {project.problem || project.description || "Add a problem statement so BuildMind can keep recommendations calibrated."}
          </p>
          {project.target_users ? (
            <p style={{ fontSize: 10, color: "var(--bm-text4)", lineHeight: 1.45, margin: "9px 0 0" }}>
              Target users: {project.target_users}
            </p>
          ) : null}
        </div>
      </aside>
      </div>

      <AnimatePresence>
        {showEditProject && (
          <EditProjectModal
            initial={{
              title: String(project.title ?? ""),
              problem: project.problem ?? "",
              targetUsers: project.target_users ?? "",
              keyMetric: project.key_metric ?? "",
              currentHypothesis: project.current_hypothesis ?? "",
            }}
            onClose={() => setShowEditProject(false)}
            onSave={handleSaveProjectEdit}
            isPending={updateProjectMutation.isPending}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {stageEvidenceTarget && (
          <div
            style={{
              position: "fixed", inset: 0, zIndex: 200,
              background: "rgba(0,0,0,0.6)", display: "flex",
              alignItems: "center", justifyContent: "center", padding: 16,
            }}
            onClick={closeStageEvidenceModal}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: "var(--bm-bg2)", border: "1px solid var(--bm-border2)",
                borderRadius: 14, padding: 22, maxWidth: 560, width: "100%",
                maxHeight: "85vh", overflowY: "auto",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 800, color: "var(--bm-text)", marginBottom: 6 }}>
                Review: {stageEvidenceFrom} → {stageEvidenceTarget}
              </div>
              <p style={{ fontSize: 12, color: "var(--bm-text3)", lineHeight: 1.55, marginBottom: 16 }}>
                {stageEvidenceRequirement?.framing ??
                  `${stageEvidenceFrom} is a different operating reality than ${stageEvidenceTarget}. Capture what actually changed before this project moves.`}
              </p>

              {stageEvidenceLoading ? (
                <div style={{ fontSize: 12, color: "var(--bm-text4)" }}>Loading evidence…</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {(stageEvidenceRequirement?.slots ?? []).map((slot) => {
                    const filled = stageEvidenceCompleteness?.filledSlotKeys.includes(slot.key) ?? false;
                    const rowsForSlot = stageEvidenceRows.filter(r => slot.acceptedTypes.includes(r.evidence_type));
                    const isDrafting = stageEvidenceSlotDraft === slot.key;
                    return (
                      <div key={slot.key} style={{
                        border: `1px solid ${filled ? "var(--bm-green-bd)" : "var(--bm-border)"}`,
                        borderRadius: 10, padding: 12,
                        background: filled ? "var(--bm-green-dim)" : "transparent",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: filled ? "var(--bm-green)" : "var(--bm-text2)" }}>
                              {filled ? "✓ " : ""}{slot.label}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--bm-text4)", marginTop: 2, lineHeight: 1.45 }}>
                              {slot.helpText}
                            </div>
                          </div>
                          {!isDrafting && (
                            <button
                              onClick={() => { setStageEvidenceSlotDraft(slot.key); setStageEvidenceForm({}); }}
                              style={{
                                flexShrink: 0, background: "none", border: "1px solid var(--bm-border2)",
                                color: "var(--bm-text2)", borderRadius: 8, padding: "5px 10px",
                                fontSize: 11, cursor: "pointer", fontFamily: "inherit",
                              }}
                            >
                              {filled ? "Add another" : "Add evidence"}
                            </button>
                          )}
                        </div>

                        {rowsForSlot.length > 0 && (
                          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                            {rowsForSlot.map(row => (
                              <div key={row.id} style={{
                                display: "flex", alignItems: "center", justifyContent: "space-between",
                                fontSize: 11, color: "var(--bm-text3)", gap: 8,
                              }}>
                                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {row.evidence_type === "metric" && `${row.metric_name}: ${row.metric_value}${row.metric_date ? ` (${row.metric_date})` : ""}`}
                                  {row.evidence_type === "artifact" && row.artifact_description}
                                  {row.evidence_type === "experiment" && `${row.experiment_channel} → ${row.experiment_outcome}`}
                                  {row.evidence_type === "founder_judgment" && row.judgment_text}
                                </span>
                                <button
                                  onClick={() => void deleteStageEvidence(row.id)}
                                  style={{ background: "none", border: "none", color: "var(--bm-text4)", cursor: "pointer", fontSize: 11, flexShrink: 0 }}
                                >
                                  remove
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {isDrafting && (
                          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                            {slot.acceptedTypes.length > 1 && (
                              <select
                                value={stageEvidenceForm._type ?? slot.acceptedTypes[0]}
                                onChange={(e) => setStageEvidenceForm(f => ({ ...f, _type: e.target.value }))}
                                style={{ background: "var(--bm-bg3)", border: "1px solid var(--bm-border2)", borderRadius: 6, color: "var(--bm-text2)", fontSize: 11, padding: "6px 8px" }}
                              >
                                {slot.acceptedTypes.map(t => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
                              </select>
                            )}
                            {(() => {
                              const activeType = (stageEvidenceForm._type as StageEvidenceType) ?? slot.acceptedTypes[0];
                              const inputStyle = {
                                background: "var(--bm-bg3)", border: "1px solid var(--bm-border2)", borderRadius: 6,
                                color: "var(--bm-text2)", fontSize: 12, padding: "7px 9px", fontFamily: "inherit", width: "100%",
                              } as const;
                              if (activeType === "metric") return (
                                <>
                                  <input placeholder="Metric name (e.g. weekly signups)" value={stageEvidenceForm.metric_name ?? ""} onChange={e => setStageEvidenceForm(f => ({ ...f, metric_name: e.target.value }))} style={inputStyle} />
                                  <input placeholder="Value (e.g. 42)" value={stageEvidenceForm.metric_value ?? ""} onChange={e => setStageEvidenceForm(f => ({ ...f, metric_value: e.target.value }))} style={inputStyle} />
                                  <input type="date" value={stageEvidenceForm.metric_date ?? ""} onChange={e => setStageEvidenceForm(f => ({ ...f, metric_date: e.target.value }))} style={inputStyle} />
                                </>
                              );
                              if (activeType === "artifact") return (
                                <>
                                  <textarea placeholder={slot.helpText} value={stageEvidenceForm.artifact_description ?? ""} onChange={e => setStageEvidenceForm(f => ({ ...f, artifact_description: e.target.value }))} rows={2} style={inputStyle} />
                                  <input placeholder="Link (optional)" value={stageEvidenceForm.artifact_url ?? ""} onChange={e => setStageEvidenceForm(f => ({ ...f, artifact_url: e.target.value }))} style={inputStyle} />
                                </>
                              );
                              if (activeType === "experiment") return (
                                <>
                                  <input placeholder="Channel or experiment (e.g. cold outreach, a pricing test)" value={stageEvidenceForm.experiment_channel ?? ""} onChange={e => setStageEvidenceForm(f => ({ ...f, experiment_channel: e.target.value }))} style={inputStyle} />
                                  <input placeholder="What you expected (optional)" value={stageEvidenceForm.experiment_hypothesis ?? ""} onChange={e => setStageEvidenceForm(f => ({ ...f, experiment_hypothesis: e.target.value }))} style={inputStyle} />
                                  <textarea placeholder="What actually happened" value={stageEvidenceForm.experiment_outcome ?? ""} onChange={e => setStageEvidenceForm(f => ({ ...f, experiment_outcome: e.target.value }))} rows={2} style={inputStyle} />
                                </>
                              );
                              return (
                                <textarea placeholder={slot.helpText} value={stageEvidenceForm.judgment_text ?? ""} onChange={e => setStageEvidenceForm(f => ({ ...f, judgment_text: e.target.value }))} rows={3} style={inputStyle} />
                              );
                            })()}
                            <div style={{ display: "flex", gap: 6 }}>
                              <button
                                disabled={stageEvidenceSubmitting}
                                onClick={() => void submitStageEvidence((stageEvidenceForm._type as StageEvidenceType) ?? slot.acceptedTypes[0])}
                                style={{
                                  background: "var(--bm-text)", color: "var(--bm-bg)", border: "none",
                                  borderRadius: 6, padding: "6px 12px", fontSize: 11, fontWeight: 700,
                                  cursor: stageEvidenceSubmitting ? "wait" : "pointer", fontFamily: "inherit",
                                }}
                              >
                                {stageEvidenceSubmitting ? "Saving…" : "Save"}
                              </button>
                              <button
                                onClick={() => { setStageEvidenceSlotDraft(null); setStageEvidenceForm({}); }}
                                style={{ background: "none", border: "none", color: "var(--bm-text4)", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 18 }}>
                <span style={{ fontSize: 11, color: "var(--bm-text4)" }}>
                  {stageEvidenceCompleteness
                    ? `${stageEvidenceCompleteness.filledSlotKeys.length} of ${stageEvidenceRequirement?.slots.length ?? 4} captured`
                    : ""}
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={closeStageEvidenceModal}
                    style={{ background: "none", border: "1px solid var(--bm-border2)", color: "var(--bm-text3)", borderRadius: 8, padding: "8px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
                  >
                    Not now
                  </button>
                  <button
                    onClick={() => void confirmStageEvidenceTransition()}
                    disabled={stageChanging}
                    style={{
                      background: stageEvidenceCompleteness?.isComplete ? "var(--bm-green)" : "var(--bm-text)",
                      color: "var(--bm-bg)", border: "none", borderRadius: 8, padding: "8px 14px",
                      fontSize: 12, fontWeight: 700, cursor: stageChanging ? "wait" : "pointer", fontFamily: "inherit",
                    }}
                  >
                    {stageEvidenceCompleteness?.isComplete
                      ? `Confirm transition to ${stageEvidenceTarget}`
                      : "Confirm without full evidence"}
                  </button>
                </div>
              </div>
              {/* Manual stage selection is intentionally an override, per
                  stage-transition-product-design.md — this review surfaces
                  missing evidence, it never blocks the founder's own call. */}
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
                      }
