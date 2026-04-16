"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { computeStartupScore } from "@/lib/buildmind";
import { getActiveProjectId, setActiveProjectId } from "@/lib/api";
import { useCreateProjectMutation, useDeleteProjectMutation, useProjectSummariesQuery } from "@/lib/queries";
import { projectCreateSchema } from "@/lib/validation";
import { getLimits } from "@/lib/plan";
import { usePlan } from "@/lib/usePlan";
import { useLimitModal } from "@/components/LimitModal";
import BuildMindLoader from "@/components/BuildMindLoader";

const VIZ = {
  panel: "rgba(12,12,18,0.98)",
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

const STAGE_COLORS: Record<string, string> = {
  Idea: "#555", Validation: "#818cf8", Prototype: "#fbbf24", MVP: "#4ade80",
  Launch: "#22d3ee", Growth: "#a78bfa", Revenue: "#4ade80",
};
const STAGE_OPTIONS = ["Idea","Validation","MVP","Launch","Growth","Revenue"] as const;
type StartupStage = typeof STAGE_OPTIONS[number];

function normalizeStage(input: string): StartupStage {
  const v = String(input||"").trim().toLowerCase();
  if (v.includes("valid")) return "Validation";
  if (v.includes("mvp")||v.includes("proto")) return "MVP";
  if (v.includes("launch")) return "Launch";
  if (v.includes("growth")) return "Growth";
  if (v.includes("revenue")) return "Revenue";
  return "Idea";
}

// Mini arc ring for score
function MiniRing({ score, size=44 }: { score:number; size?:number }) {
  const r=(size-5)/2; const circ=2*Math.PI*r;
  const color=score>=60?VIZ.emerald:score>=30?VIZ.amber:"#444";
  return (
    <div style={{ position:"relative",width:size,height:size,flexShrink:0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform:"rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={4.5}/>
        <motion.circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={4.5}
          strokeLinecap="round" strokeDasharray={circ}
          initial={{ strokeDashoffset:circ }} animate={{ strokeDashoffset:circ-(score/100)*circ }}
          transition={{ duration:0.9,ease:"easeOut",delay:0.2 }}/>
      </svg>
      <div style={{ position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center" }}>
        <span style={{ fontSize:11,fontWeight:700,color,lineHeight:1 }}>{score}</span>
      </div>
    </div>
  );
}

// Progress bar
function ProgressBar({ value, delay=0 }: { value:number; delay?:number }) {
  const color=value>=60?VIZ.emerald:value>=30?VIZ.indigo:"#333";
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
      <div style={{ height:3,background:"rgba(255,255,255,0.04)",borderRadius:999,overflow:"hidden",width:80 }}>
        <motion.div initial={{ width:0 }} animate={{ width:`${value}%` }} transition={{ duration:0.8,ease:"easeOut",delay }}
          style={{ height:"100%",background:color,borderRadius:999 }} />
      </div>
      <span style={{ fontSize:10,color:VIZ.text3 }}>{value}%</span>
    </div>
  );
}

const inputStyle = {
  background:"rgba(8,8,12,0.9)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:8,
  padding:"10px 13px", fontSize:13, color:VIZ.text2, outline:"none",
  fontFamily:"inherit", width:"100%", boxSizing:"border-box" as const, transition:"border-color 0.15s",
};

export default function ProjectsPage() {
  const router = useRouter();
  const { showLimit } = useLimitModal();
  const { plan } = usePlan();
  const limits = getLimits(plan);
  const maxProjects = limits.maxProjects;

  const { data:summaries=[], isLoading, error:summariesError } = useProjectSummariesQuery();
  const createMutation = useCreateProjectMutation();
  const deleteMutation = useDeleteProjectMutation();
  const [modalOpen, setModalOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [ideaDescription, setIdeaDescription] = useState("");
  const [targetUsers, setTargetUsers] = useState("");
  const [startupStage, setStartupStage] = useState<StartupStage>("Idea");
  const [error, setError] = useState("");

  useEffect(()=>{
    if (!summaries.length) return;
    const active=getActiveProjectId();
    if (!active) { const firstId=summaries[0]?.id; if(firstId) setActiveProjectId(firstId); }
  },[summaries]);

  const onCreate = async () => {
    try {
      setError("");
      const values=projectCreateSchema.parse({ projectName,ideaDescription,targetUsers });
      const created=await createMutation.mutateAsync({ project_name:values.projectName,idea_description:values.ideaDescription,target_users:values.targetUsers,problem:values.ideaDescription,startup_stage:startupStage });
      setModalOpen(false); setProjectName(""); setIdeaDescription(""); setTargetUsers(""); setStartupStage("Idea");
      router.push(`/projects/${created.id}`);
    } catch(err) {
      if (err instanceof z.ZodError) { setError(err.issues[0]?.message??"Fill all fields."); return; }
      setError(err instanceof Error?err.message:"Failed to create project");
    }
  };

  // Aggregate stats
  const totalTasks = summaries.reduce((a,s)=>a+(s.tasksTotal??0),0);
  const doneTasks = summaries.reduce((a,s)=>a+(s.tasksCompleted??0),0);

  return (
    <div style={{ maxWidth:1040,margin:"0 auto",fontFamily:"system-ui,sans-serif",color:VIZ.text1,paddingBottom:48 }}>

      {/* Header */}
      <motion.div initial={{ opacity:0,y:-6 }} animate={{ opacity:1,y:0 }}
        style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22,paddingBottom:16,borderBottom:`1px solid ${VIZ.border}` }}>
        <div>
          <div style={{ fontSize:21,fontWeight:700,letterSpacing:"-0.03em",marginBottom:3 }}>Projects</div>
          <div style={{ fontSize:12,color:VIZ.text3 }}>
            {summaries.length} project{summaries.length!==1?"s":""}
            {maxProjects!==-1&&<span style={{ color:"#333",marginLeft:6 }}>· free plan: {summaries.length}/{maxProjects}</span>}
          </div>
        </div>
        <motion.button whileHover={{ scale:1.02 }} whileTap={{ scale:0.97 }}
          onClick={()=>{ if(maxProjects!==-1&&summaries.length>=maxProjects){ showLimit("generic"); return; } setModalOpen(true); }}
          style={{ background:"#fff",color:"#000",fontWeight:700,fontSize:13,padding:"9px 18px",borderRadius:9,border:"none",cursor:"pointer",fontFamily:"inherit" }}>
          + New project
        </motion.button>
      </motion.div>

      {/* Stat overview */}
      {summaries.length>0&&(
        <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:16 }}>
          {[
            { label:"Projects", value:summaries.length, color:VIZ.text1, icon:"📁" },
            { label:"Tasks done", value:doneTasks, color:VIZ.emerald, icon:"✅" },
            { label:"Total tasks", value:totalTasks, color:VIZ.text1, icon:"📋" },
          ].map((t,i)=>(
            <motion.div key={t.label} initial={{ opacity:0,y:8 }} animate={{ opacity:1,y:0 }} transition={{ delay:i*0.05 }}
              style={{ background:VIZ.panel,border:`1px solid ${VIZ.border}`,borderRadius:12,padding:"16px 18px" }}>
              <div style={{ fontSize:16,marginBottom:6 }}>{t.icon}</div>
              <div style={{ fontSize:9,color:VIZ.text3,textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:600,marginBottom:5 }}>{t.label}</div>
              <div style={{ fontSize:26,fontWeight:700,color:t.color,letterSpacing:"-0.04em",lineHeight:1 }}>{t.value}</div>
            </motion.div>
          ))}
        </div>
      )}

      {isLoading&&<BuildMindLoader variant="card" label="Loading projects…" />}
      {summariesError&&<div style={{ fontSize:12,color:VIZ.rose }}>{summariesError instanceof Error?summariesError.message:"Failed to load"}</div>}

      {!isLoading&&summaries.length===0&&(
        <motion.div initial={{ opacity:0,y:10 }} animate={{ opacity:1,y:0 }}
          style={{ background:VIZ.panel,border:`1px solid ${VIZ.border}`,borderRadius:14,padding:"64px 32px",textAlign:"center" }}>
          <div style={{ fontSize:40,marginBottom:16 }}>🚀</div>
          <div style={{ fontSize:16,fontWeight:700,marginBottom:8 }}>No projects yet</div>
          <div style={{ fontSize:13,color:VIZ.text2,marginBottom:24,lineHeight:1.65,maxWidth:360,margin:"0 auto 24px" }}>
            Create your first startup project. BuildMind generates milestones and a roadmap automatically.
          </div>
          <button onClick={()=>setModalOpen(true)} style={{ background:"#fff",color:"#000",fontWeight:700,fontSize:13,padding:"10px 22px",borderRadius:9,border:"none",cursor:"pointer",fontFamily:"inherit" }}>New project</button>
        </motion.div>
      )}

      {/* Projects table — visualizer style */}
      {summaries.length>0&&(
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.1 }}
          style={{ background:VIZ.panel,border:`1px solid ${VIZ.border}`,borderRadius:14,overflow:"hidden" }}>
          {/* Table header */}
          <div style={{ display:"grid",gridTemplateColumns:"1fr 100px 110px 64px 90px 40px",padding:"10px 18px",borderBottom:`1px solid ${VIZ.border}`,background:"rgba(255,255,255,0.02)" }}>
            {["Project","Stage","Progress","Score","Last activity",""].map(h=>(
              <div key={h} style={{ fontSize:9,color:VIZ.text3,textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:600 }}>{h}</div>
            ))}
          </div>
          {summaries.map((s,i)=>{
            const stage=s.startup_stage??"Idea";
            const score=computeStartupScore(s);
            const progress=s.progress??0;
            const stageColor=STAGE_COLORS[stage]??"#555";
            const lastActivity=s.lastActivity?new Date(s.lastActivity).toLocaleDateString("en-GB",{ day:"numeric",month:"short" }):"—";
            return (
              <motion.div key={s.id} initial={{ opacity:0,y:4 }} animate={{ opacity:1,y:0 }} transition={{ delay:i*0.05 }}
                onClick={()=>{ setActiveProjectId(s.id); router.push(`/projects/${s.id}`); }}
                style={{ display:"grid",gridTemplateColumns:"1fr 100px 110px 64px 90px 40px",padding:"14px 18px",borderBottom:i<summaries.length-1?`1px solid ${VIZ.border}`:"none",cursor:"pointer",transition:"background 0.15s",alignItems:"center" }}
                onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background="rgba(255,255,255,0.02)"}
                onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background="transparent"}>
                <div>
                  <div style={{ fontSize:13,color:VIZ.text1,fontWeight:600,marginBottom:2 }}>{s.title}</div>
                  <div style={{ fontSize:11,color:VIZ.text3,maxWidth:280,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{s.description}</div>
                </div>
                <div>
                  <span style={{ fontSize:10,color:stageColor,background:`${stageColor}12`,border:`1px solid ${stageColor}30`,borderRadius:5,padding:"3px 8px",whiteSpace:"nowrap" }}>{stage}</span>
                </div>
                <ProgressBar value={progress} delay={0.3+i*0.05} />
                <MiniRing score={score} />
                <div style={{ fontSize:11,color:VIZ.text3 }}>{lastActivity}</div>
                <button onClick={e=>{ e.stopPropagation(); if(window.confirm(`Delete "${s.title}"?`)) deleteMutation.mutate(s.id); }}
                  style={{ background:"none",border:"none",color:VIZ.text3,fontSize:16,cursor:"pointer",padding:"4px",borderRadius:4,lineHeight:1,transition:"color 0.15s" }}
                  onMouseEnter={e=>(e.currentTarget as HTMLButtonElement).style.color=VIZ.rose}
                  onMouseLeave={e=>(e.currentTarget as HTMLButtonElement).style.color=VIZ.text3}>×</button>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Create modal */}
      <AnimatePresence>
        {modalOpen&&(
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            style={{ position:"fixed",inset:0,zIndex:50,display:"flex",alignItems:"center",justifyContent:"center",padding:24,background:"rgba(0,0,0,0.9)" }}
            onClick={e=>{ if(e.target===e.currentTarget) setModalOpen(false); }}>
            <motion.div initial={{ opacity:0,y:12,scale:0.97 }} animate={{ opacity:1,y:0,scale:1 }} exit={{ opacity:0,y:8 }}
              transition={{ type:"spring",stiffness:300,damping:25 }}
              style={{ background:"rgba(14,14,20,0.99)",border:`1px solid ${VIZ.border}`,borderTop:`2px solid ${VIZ.indigo}`,borderRadius:14,padding:"26px 28px",width:"100%",maxWidth:480,fontFamily:"inherit",color:VIZ.text1 }}>
              <div style={{ fontSize:16,fontWeight:700,marginBottom:4,letterSpacing:"-0.02em" }}>New project</div>
              <div style={{ fontSize:12,color:VIZ.text3,marginBottom:20,lineHeight:1.6 }}>BuildMind generates a stage-aware roadmap and milestone plan automatically.</div>
              <div style={{ display:"flex",flexDirection:"column",gap:10,marginBottom:16 }}>
                <input value={projectName} onChange={e=>setProjectName(e.target.value)} placeholder="Project name" style={inputStyle}
                  onFocus={e=>(e.target as HTMLInputElement).style.borderColor="rgba(99,102,241,0.4)"}
                  onBlur={e=>(e.target as HTMLInputElement).style.borderColor="rgba(255,255,255,0.07)"} />
                <textarea value={ideaDescription} onChange={e=>setIdeaDescription(e.target.value)} placeholder="What are you building? Be specific." rows={3}
                  style={{ ...inputStyle,resize:"none" }}
                  onFocus={e=>(e.target as HTMLTextAreaElement).style.borderColor="rgba(99,102,241,0.4)"}
                  onBlur={e=>(e.target as HTMLTextAreaElement).style.borderColor="rgba(255,255,255,0.07)"} />
                <input value={targetUsers} onChange={e=>setTargetUsers(e.target.value)} placeholder="Who is this for?" style={inputStyle}
                  onFocus={e=>(e.target as HTMLInputElement).style.borderColor="rgba(99,102,241,0.4)"}
                  onBlur={e=>(e.target as HTMLInputElement).style.borderColor="rgba(255,255,255,0.07)"} />
                <div>
                  <div style={{ fontSize:11,color:VIZ.text3,marginBottom:6 }}>Current stage</div>
                  <select value={startupStage} onChange={e=>setStartupStage(normalizeStage(e.target.value))}
                    style={{ ...inputStyle,background:"rgba(10,10,16,0.95)" }}>
                    {STAGE_OPTIONS.map(s=><option key={s} value={s} style={{ background:"#0a0a10",color:VIZ.text2 }}>{s}</option>)}
                  </select>
                </div>
              </div>
              {error&&<div style={{ fontSize:12,color:VIZ.rose,marginBottom:12 }}>{error}</div>}
              <div style={{ display:"flex",gap:8,justifyContent:"flex-end" }}>
                <button onClick={()=>setModalOpen(false)} style={{ background:"transparent",border:`1px solid ${VIZ.border}`,color:VIZ.text2,fontSize:13,padding:"9px 16px",borderRadius:8,cursor:"pointer",fontFamily:"inherit" }}>Cancel</button>
                <motion.button whileTap={{ scale:0.97 }} onClick={()=>void onCreate()} disabled={createMutation.isPending}
                  style={{ background:createMutation.isPending?"#111":"#fff",color:createMutation.isPending?"#444":"#000",fontSize:13,fontWeight:700,padding:"9px 18px",borderRadius:8,border:"none",cursor:createMutation.isPending?"not-allowed":"pointer",fontFamily:"inherit" }}>
                  {createMutation.isPending?"Generating roadmap...":"Create project →"}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
