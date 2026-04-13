"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useProjectsQuery, useProjectSummariesQuery, useDashboardOverviewQuery } from "@/lib/queries";
import { createClient } from "@/lib/supabase/client";
import { trackEvent } from "@/lib/analytics";
import { FEATURES } from "@/lib/features";
import { useRouter } from "next/navigation";
import { recordAIUse, checkUpgradeTrigger, getTasksDone } from "@/lib/upgrade";
import { getPlan, getLimits, getAIMessagesToday } from "@/lib/plan";
import { useLimitModal } from "@/components/LimitModal";
import { updateAchievementStats, checkAndUnlockAchievements, getAchievementStats } from "@/lib/achievements";
import { AIVisualWidget } from "@/components/ui/AIVisualWidget";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string[];
  phase?: "thinking" | "writing" | "done";
  error?: boolean;
};

const QUICK_PROMPTS = [
  "What should I do today?",
  "Why am I stuck?",
  "What's my biggest risk?",
  "How do I get my first 10 users?",
  "Am I ready to launch?",
];

// ─── Design tokens ──────────────────────────────────────────────────────────
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

// ─── BuildMind avatar ───────────────────────────────────────────────────────
function BMAvatar({ size=28, pulsing=false }: { size?:number; pulsing?:boolean }) {
  return (
    <motion.div animate={pulsing?{ opacity:[0.7,1,0.7] }:{}} transition={pulsing?{ duration:1.2,repeat:Infinity,ease:"easeInOut" }:{}}>
      <svg width={size} height={size} viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink:0 }}>
        <defs>
          <linearGradient id="avg2" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#818cf8"/>
            <stop offset="100%" stopColor="#7c3aed"/>
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="8" fill="url(#avg2)" />
        <circle cx="10" cy="10" r="2" fill="white" opacity="0.9"/>
        <circle cx="22" cy="10" r="2" fill="white" opacity="0.9"/>
        <circle cx="10" cy="22" r="2" fill="white" opacity="0.9"/>
        <circle cx="22" cy="22" r="2" fill="white" opacity="0.9"/>
        <circle cx="16" cy="16" r="2.5" fill="white"/>
        <line x1="12" y1="10" x2="14" y2="14" stroke="white" strokeWidth="1.2" opacity="0.7"/>
        <line x1="20" y1="10" x2="18" y2="14" stroke="white" strokeWidth="1.2" opacity="0.7"/>
        <line x1="12" y1="22" x2="14" y2="18" stroke="white" strokeWidth="1.2" opacity="0.7"/>
        <line x1="20" y1="22" x2="18" y2="18" stroke="white" strokeWidth="1.2" opacity="0.7"/>
      </svg>
    </motion.div>
  );
}

// ─── Stat chip ──────────────────────────────────────────────────────────────
function StatChip({ label, value, color }: { label:string; value:string; color:string }) {
  return (
    <div style={{ textAlign:"center", background:VIZ.panel, border:`1px solid ${VIZ.border}`, borderRadius:8, padding:"5px 10px", minWidth:48 }}>
      <div style={{ fontSize:12, fontWeight:700, color }}>{value}</div>
      <div style={{ fontSize:8, color:VIZ.text3, textTransform:"uppercase", letterSpacing:"0.07em", marginTop:1 }}>{label}</div>
    </div>
  );
}

// ─── Reasoning steps ────────────────────────────────────────────────────────
function ReasoningSteps({ steps, phase }: { steps:string[]; phase:"thinking"|"writing"|"done" }) {
  const [visibleCount, setVisibleCount] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    if (phase==="thinking") {
      setCollapsed(false); setVisibleCount(0); let i=0;
      const iv = setInterval(()=>{ i++; setVisibleCount(i); if(i>=steps.length)clearInterval(iv); },650);
      return ()=>clearInterval(iv);
    }
    if (phase==="writing") { setVisibleCount(steps.length); const t=setTimeout(()=>setCollapsed(true),800); return ()=>clearTimeout(t); }
    if (phase==="done") { setVisibleCount(steps.length); setCollapsed(true); }
  },[phase,steps]);
  const isThinking = phase==="thinking";
  return (
    <div style={{ marginBottom:8 }}>
      <button onClick={()=>setCollapsed(c=>!c)} style={{ display:"flex",alignItems:"center",gap:6,background:"none",border:"none",cursor:"pointer",padding:0,fontFamily:"inherit",marginBottom:collapsed?0:6 }}>
        {isThinking
          ? <motion.div animate={{ rotate:360 }} transition={{ duration:1.5,repeat:Infinity,ease:"linear" }} style={{ width:12,height:12,borderRadius:"50%",border:`1.5px solid ${VIZ.indigo}`,borderTopColor:"transparent" }} />
          : <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 4L6 8L10 4" stroke="#444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform:collapsed?"rotate(-90deg)":"rotate(0)",transformOrigin:"center",transition:"transform 0.2s" }}/></svg>}
        <span style={{ fontSize:10, color:isThinking?"#818cf8":"#444", fontFamily:"monospace", letterSpacing:"0.05em" }}>
          {isThinking?"Thinking...":collapsed?`${steps.length} reasoning steps`:"Reasoning"}
        </span>
      </button>
      <AnimatePresence>
        {!collapsed&&(
          <motion.div initial={{ height:0,opacity:0 }} animate={{ height:"auto",opacity:1 }} exit={{ height:0,opacity:0 }} transition={{ duration:0.2 }} style={{ overflow:"hidden" }}>
            <div style={{ borderLeft:"1.5px solid rgba(99,102,241,0.2)",paddingLeft:12,display:"flex",flexDirection:"column",gap:4,marginBottom:8 }}>
              {steps.slice(0,visibleCount).map((step,i)=>(
                <motion.div key={i} initial={{ opacity:0,x:-6 }} animate={{ opacity:1,x:0 }} transition={{ duration:0.3 }}
                  style={{ fontSize:11,color:"#555",fontFamily:"monospace",lineHeight:1.5,display:"flex",alignItems:"flex-start",gap:6 }}>
                  <span style={{ color:"#333",flexShrink:0,marginTop:1 }}>→</span>
                  <span>{step}</span>
                  {i===visibleCount-1&&isThinking&&<motion.span animate={{ opacity:[0,1,0] }} transition={{ duration:0.8,repeat:Infinity }} style={{ color:VIZ.indigo,marginLeft:2 }}>▊</motion.span>}
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Typewriter ─────────────────────────────────────────────────────────────
function TypewriterContent({ content, onDone, isNew }: { content:string; onDone?:()=>void; isNew?:boolean }) {
  const [displayed, setDisplayed] = useState(isNew?"":content);
  const doneRef = useRef(false);
  useEffect(() => {
    if (!isNew) { setDisplayed(content); return; }
    setDisplayed(""); doneRef.current=false; let i=0;
    const tick = ()=>{
      if (i>=content.length) { if(!doneRef.current){doneRef.current=true;onDone?.();} return; }
      const chars = i<10?1:Math.floor(Math.random()*3)+2;
      i=Math.min(i+chars,content.length); setDisplayed(content.slice(0,i));
      const delay = content[i-1]==="."||content[i-1]==="?"||content[i-1]==="!"?80:content[i-1]===","?40:18;
      setTimeout(tick,delay);
    };
    const start=setTimeout(tick,120); return ()=>clearTimeout(start);
  },[content,isNew]);
  const lines=displayed.split("\n");
  return (
    <div style={{ lineHeight:1.75,fontSize:13,color:VIZ.text2 }}>
      {lines.map((line,i)=>{
        if (line.startsWith("**")&&line.endsWith("**")) return <div key={i} style={{ fontWeight:600,color:VIZ.text1,marginBottom:2 }}>{line.slice(2,-2)}</div>;
        if (line.startsWith("- ")||line.startsWith("• ")) return <div key={i} style={{ display:"flex",gap:8,marginBottom:3,paddingLeft:4 }}><span style={{ color:VIZ.indigo,flexShrink:0,marginTop:2,fontSize:10 }}>●</span><span>{line.slice(2)}</span></div>;
        if (line==="") return <div key={i} style={{ height:8 }} />;
        const parts=line.split(/(\*\*[^*]+\*\*)/g);
        return <div key={i} style={{ marginBottom:1 }}>{parts.map((part,pi)=>part.startsWith("**")&&part.endsWith("**")?<strong key={pi}>{part.slice(2,-2)}</strong>:part)}</div>;
      })}
      {isNew&&displayed.length<content.length&&<motion.span animate={{ opacity:[1,0] }} transition={{ duration:0.5,repeat:Infinity }} style={{ display:"inline-block",width:2,height:"1em",background:VIZ.indigo,marginLeft:1,verticalAlign:"text-bottom" }} />}
    </div>
  );
}

// ─── Assistant bubble ───────────────────────────────────────────────────────
function AssistantBubble({ message, isLatest }: { message:ChatMessage; isLatest:boolean }) {
  const [phase, setPhase] = useState<"thinking"|"writing"|"done">(isLatest&&message.phase!=="done"?"thinking":"done");
  useEffect(()=>{
    if (!isLatest||message.phase==="done") { setPhase("done"); return; }
    const dur=(message.reasoning?.length??2)*650+400;
    const t=setTimeout(()=>setPhase("writing"),dur);
    return ()=>clearTimeout(t);
  },[isLatest,message.phase,message.reasoning]);
  return (
    <motion.div initial={{ opacity:0,y:8 }} animate={{ opacity:1,y:0 }} transition={{ duration:0.25 }}
      style={{ display:"flex",alignItems:"flex-start",gap:10,padding:"3px 0" }}>
      <div style={{ flexShrink:0,marginTop:4 }}><BMAvatar size={22} pulsing={phase==="thinking"} /></div>
      <div style={{ flex:1,minWidth:0 }}>
        {message.reasoning&&message.reasoning.length>0&&<ReasoningSteps steps={message.reasoning} phase={phase} />}
        <AnimatePresence>
          {(phase==="writing"||phase==="done")&&(
            <motion.div initial={{ opacity:0,y:4 }} animate={{ opacity:1,y:0 }} transition={{ duration:0.3 }}
              style={{ background:message.error?"rgba(248,113,113,0.06)":VIZ.panel, border:`1px solid ${message.error?"rgba(248,113,113,0.2)":VIZ.border}`, borderRadius:"4px 14px 14px 14px", padding:"13px 16px", boxShadow:"0 2px 12px rgba(0,0,0,0.2)" }}>
              <TypewriterContent content={message.content} isNew={isLatest&&phase==="writing"} onDone={()=>setPhase("done")} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ─── AI limit banner ────────────────────────────────────────────────────────
function AILimitBanner({ used, limit, onUpgrade }: { used:number; limit:number; onUpgrade:()=>void }) {
  const pct=Math.min(100,Math.round((used/limit)*100));
  if (used<limit*0.5) return null;
  return (
    <motion.div initial={{ opacity:0,y:-8 }} animate={{ opacity:1,y:0 }}
      style={{ flexShrink:0, background:"rgba(99,102,241,0.05)", border:"1px solid rgba(99,102,241,0.15)", borderRadius:10, padding:"10px 14px", marginBottom:10, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
      <div>
        <div style={{ fontSize:12,color:VIZ.text2,fontWeight:500 }}>{used}/{limit} messages used today</div>
        <div style={{ height:3,width:140,background:"rgba(255,255,255,0.04)",borderRadius:99,marginTop:5,overflow:"hidden" }}>
          <div style={{ height:"100%",width:`${pct}%`,background:pct>=90?VIZ.rose:VIZ.indigo,borderRadius:99,transition:"width 0.3s" }} />
        </div>
      </div>
      {used>=limit&&<button onClick={onUpgrade} style={{ background:VIZ.indigo,color:"white",border:"none",borderRadius:7,padding:"6px 14px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit" }}>Upgrade →</button>}
    </motion.div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────
export default function AICoachPage() {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { data:projects=[], isLoading:loadingProjects } = useProjectsQuery();
  const { data:summaries=[] } = useProjectSummariesQuery();
  const { data:overview } = useDashboardOverviewQuery();

  const plan=getPlan(); const limits=getLimits();
  const isUnlimited=plan!=="free"||!FEATURES.aiUsageLimits;
  const [aiUsedToday, setAiUsedToday] = useState(()=>getAIMessagesToday());
  const hitDailyLimit=!isUnlimited&&aiUsedToday>=limits.aiMessagesPerDay;

  const [selectedProjectId, setSelectedProjectId] = useState<string|undefined>();
  const activeProjectId=selectedProjectId??projects[0]?.id;
  const activeSummary=summaries.find(s=>s.id===activeProjectId)??summaries[0];
  const stage=activeSummary?.startup_stage??"Idea";
  const score=activeSummary?Math.round((activeSummary.tasksCompleted/Math.max(1,activeSummary.tasksTotal))*100):0;
  const streak=overview?.founderStreakDays??Number(typeof window!=="undefined"?localStorage.getItem("bm_streak")??"0":"0");

  const openingContent = activeSummary
    ? `I've read your project.\n\n**"${activeSummary.title}"** · Stage: ${stage} · Score: ${score}/100 · Streak: ${streak}d\n\n${score<40?"Your execution score is low. Before we do anything else — what specific task have you been avoiding?":score<70?"You're making progress but there's a gap to close. What's the one thing you committed to last week that didn't happen?":"Strong execution. The question now is whether you're working on the right things. What's your north star metric this week?"}`
    : "I'm BuildMind. I read your actual project data before every response — not guessing.\n\nCreate a project first so I have something real to work with.";

  const [messages, setMessages] = useState<ChatMessage[]>([{ id:"welcome", role:"assistant", content:openingContent, reasoning:["Reading your project state...","Assessing execution score and streak...","Choosing the most important question to ask..."], phase:"done" }]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string|null>(null);

  useEffect(()=>{
    if (activeSummary&&messages.length===1&&messages[0].id==="welcome") {
      const nc=`I've read your project.\n\n**"${activeSummary.title}"** · Stage: ${stage} · Score: ${score}/100 · Streak: ${streak}d\n\n${score<40?"Your execution score is low. Before we do anything else — what specific task have you been avoiding?":score<70?"You're making progress but there's a gap to close. What's the one thing you committed to last week that didn't happen?":"Strong execution. The question now is whether you're working on the right things. What's your north star metric?"}`;
      setMessages([{ id:"welcome",role:"assistant",content:nc,reasoning:["Reading your project state...","Assessing execution score and streak...","Choosing the most important question to ask..."],phase:"done" }]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[activeSummary?.id]);

  useEffect(()=>{ if(scrollRef.current){ scrollRef.current.scrollTop=scrollRef.current.scrollHeight; } },[messages,isSending]);
  const { showLimit } = useLimitModal();

  const send = useCallback(async(overrideMessage?:string)=>{
    const message=(overrideMessage??input).trim();
    if (!message||!activeProjectId||isSending) return;
    if (hitDailyLimit) { showLimit("ai_coach"); return; }
    setInput(""); setError(null);
    const userId_tmp=`${Date.now()}-user`; const aiId_tmp=`${Date.now()}-ai`;
    const userMsg:ChatMessage={ id:userId_tmp,role:"user",content:message };
    setMessages(prev=>[...prev,userMsg]); setIsSending(true);
    const placeholderMsg:ChatMessage={ id:aiId_tmp,role:"assistant",content:"",reasoning:["Reading your project data...","Identifying what matters right now...","Deciding how to be most useful..."],phase:"thinking" };
    setMessages(prev=>[...prev,placeholderMsg]);
    try {
      const supabase=createClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error("Not authenticated");
      const res=await fetch("/api/ai/coach",{ method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ userId:data.user.id,projectId:activeProjectId,message,messages:messages.map(m=>({ role:m.role,content:m.content })),blockerType:typeof window!=="undefined"?(localStorage.getItem("bm_blocker")??""):"",domain:typeof window!=="undefined"?(localStorage.getItem("bm_domain")??""):"" }) });
      const body=await res.json().catch(()=>({}));
      const reasoning:string[]=body?.data?.reasoning??["Analyzing your situation...","Determining the key insight..."];
      const answer=body?.data?.answer??"BuildMind couldn't respond right now.";
      const isError=!res.ok||body?.success===false;
      setMessages(prev=>prev.map(m=>m.id===aiId_tmp?{ ...m,reasoning,content:answer,phase:"thinking" as const,error:isError }:m));
      if (!isError) {
        trackEvent("ai_coach_used"); recordAIUse(); setAiUsedToday(n=>n+1);
        const cs=getAchievementStats(); updateAchievementStats({ aiMessages:cs.aiMessages+1 });
        setTimeout(()=>checkAndUnlockAchievements(),600);
        const ls=Number(localStorage.getItem("bm_streak")??"1");
        const { shouldUpgrade }=checkUpgradeTrigger(ls);
        if (shouldUpgrade) router.push(`/upgrade?tasks=${getTasksDone()}&streak=${ls}`);
      }
    } catch(err) {
      const errMsg=err instanceof Error?err.message:"Failed to send";
      setMessages(prev=>prev.map(m=>m.id===aiId_tmp?{ ...m,content:`Error: ${errMsg}`,phase:"done" as const,error:true,reasoning:["An error occurred..."] }:m));
    } finally { setIsSending(false); }
  },[input,activeProjectId,isSending,hitDailyLimit,messages,router]);

  const handleKeyDown=(e:React.KeyboardEvent<HTMLTextAreaElement>)=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); void send(); } };

  const scoreColor=score>=60?VIZ.emerald:score>=30?VIZ.amber:VIZ.rose;
  const streakColor=streak>=7?"#f97316":streak>=3?VIZ.amber:VIZ.text3;

  return (
    <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }}
      style={{ maxWidth:840,margin:"0 auto",fontFamily:"system-ui,sans-serif",color:VIZ.text1,display:"flex",flexDirection:"column",height:"calc(100dvh - 60px)",padding:"0 2px" }}>

      {/* AI Visual Widget — shows context-aware coaching insights */}
      {messages.length === 0 && (
        <AIVisualWidget
          page="ai-coach"
          intent="Show a coaching readiness panel: score, stage, streak, and 3 sharp questions the founder should be asking themselves right now based on their stage"
          context={{ stage, score, streak }}
          data={{}}
          label="Generate coaching context"
          className="mb-3"
          autoGenerate={false}
        />
      )}

      {/* Header */}
      <div style={{ flexShrink:0, paddingBottom:14, marginBottom:10, borderBottom:`1px solid ${VIZ.border}` }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start" }}>
          <div style={{ display:"flex",alignItems:"center",gap:12 }}>
            <BMAvatar size={38} />
            <div>
              <div style={{ fontSize:17,fontWeight:700,letterSpacing:"-0.02em",lineHeight:1.1 }}>AI Coach</div>
              <div style={{ fontSize:11,color:VIZ.text3,marginTop:3 }}>reads your project · thinks before answering</div>
            </div>
          </div>
          <div style={{ display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",justifyContent:"flex-end" }}>
            <StatChip label="Score" value={String(score)} color={scoreColor} />
            <StatChip label="Stage" value={stage} color={VIZ.violet} />
            <StatChip label="🔥 Streak" value={`${streak}d`} color={streakColor} />
            {projects.length>1&&(
              <select value={selectedProjectId??""} onChange={e=>setSelectedProjectId(e.target.value||undefined)}
                style={{ background:VIZ.panel,border:`1px solid ${VIZ.border}`,borderRadius:7,padding:"5px 7px",fontSize:10,color:VIZ.text2,outline:"none",fontFamily:"inherit",cursor:"pointer",maxWidth:100 }}>
                <option value="">All</option>
                {projects.map(p=><option key={p.id} value={p.id}>{p.title.slice(0,12)}</option>)}
              </select>
            )}
          </div>
        </div>
      </div>

      {!isUnlimited&&<AILimitBanner used={aiUsedToday} limit={limits.aiMessagesPerDay} onUpgrade={()=>showLimit("ai_coach")} />}

      {/* Message thread */}
      <div ref={scrollRef} style={{ flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:8,paddingRight:2,paddingBottom:8,scrollbarWidth:"none" }}>
        {messages.map((m,idx)=>{
          const isLatest=idx===messages.length-1;
          if (m.role==="user") return (
            <motion.div key={m.id} initial={{ opacity:0,y:6,scale:0.98 }} animate={{ opacity:1,y:0,scale:1 }} transition={{ duration:0.2 }}
              style={{ display:"flex",justifyContent:"flex-end",padding:"3px 0" }}>
              <div style={{ maxWidth:"82%",padding:"11px 16px",borderRadius:"16px 16px 4px 16px",
                background:"linear-gradient(135deg,rgba(99,102,241,0.16),rgba(124,58,237,0.12))",
                border:"1px solid rgba(99,102,241,0.25)",fontSize:13,color:VIZ.text2,lineHeight:1.6,wordBreak:"break-word" }}>
                {m.content}
              </div>
            </motion.div>
          );
          return <AssistantBubble key={m.id} message={m} isLatest={isLatest} />;
        })}
      </div>

      {/* Quick prompts */}
      <AnimatePresence>
        {messages.length<=2&&(
          <motion.div initial={{ opacity:0,y:6 }} animate={{ opacity:1,y:0 }} exit={{ opacity:0,y:4 }}
            style={{ flexShrink:0,display:"flex",gap:6,flexWrap:"wrap",padding:"8px 0 6px" }}>
            {QUICK_PROMPTS.map((p,i)=>(
              <motion.button key={p} onClick={()=>void send(p)} disabled={hitDailyLimit||isSending}
                initial={{ opacity:0,scale:0.9 }} animate={{ opacity:1,scale:1 }} transition={{ delay:0.05*i }}
                whileHover={{ borderColor:VIZ.violet,color:VIZ.text2,scale:1.02 }} whileTap={{ scale:0.97 }}
                style={{ background:"transparent",border:`1px solid ${VIZ.border}`,borderRadius:99,padding:"5px 13px",fontSize:11,
                  color:hitDailyLimit?VIZ.text3:VIZ.text2,cursor:hitDailyLimit||isSending?"not-allowed":"pointer",fontFamily:"inherit",transition:"all 0.15s" }}>
                {p}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input */}
      <div style={{ flexShrink:0,paddingTop:10,borderTop:`1px solid ${VIZ.border}` }}>
        {error&&<div style={{ marginBottom:8,padding:"8px 12px",background:"rgba(248,113,113,0.07)",border:"1px solid rgba(248,113,113,0.2)",borderRadius:8,fontSize:11,color:VIZ.rose }}>{error}</div>}
        <div style={{ display:"flex",gap:8,alignItems:"flex-end",background:VIZ.panel,border:`1px solid ${VIZ.border}`,borderRadius:14,padding:"8px 10px 8px 14px",transition:"box-shadow 0.2s,border-color 0.2s" }}
          onFocus={e=>(e.currentTarget.style.boxShadow="0 0 0 2px rgba(99,102,241,0.18)")}
          onBlur={e=>(e.currentTarget.style.boxShadow="none")}>
          <textarea ref={inputRef} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={handleKeyDown}
            disabled={hitDailyLimit||isSending}
            placeholder={isSending?"BuildMind is thinking...":hitDailyLimit?"Daily limit reached — upgrade to continue":"Ask BuildMind anything about your startup…"}
            rows={1}
            style={{ flex:1,background:"transparent",border:"none",outline:"none",color:VIZ.text1,fontSize:13,fontFamily:"inherit",resize:"none",lineHeight:1.5,maxHeight:120,overflowY:"auto",scrollbarWidth:"none",paddingTop:1 }} />
          <motion.button onClick={()=>void send()} disabled={(!input.trim()&&!isSending)||hitDailyLimit}
            whileHover={input.trim()&&!hitDailyLimit&&!isSending?{ scale:1.06 }:{}}
            whileTap={input.trim()?{ scale:0.94 }:{}}
            style={{ flexShrink:0,width:34,height:34,background:input.trim()&&!hitDailyLimit?VIZ.indigo:"rgba(255,255,255,0.04)",border:"none",borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center",cursor:input.trim()&&!hitDailyLimit?"pointer":"default",transition:"background 0.15s" }}>
            {isSending
              ? <motion.div animate={{ rotate:360 }} transition={{ duration:1,repeat:Infinity,ease:"linear" }} style={{ width:14,height:14,borderRadius:"50%",border:"2px solid rgba(255,255,255,0.25)",borderTopColor:"white" }} />
              : <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 12L7 2L12 12L7 9.5L2 12Z" fill={input.trim()&&!hitDailyLimit?"white":VIZ.text3} /></svg>}
          </motion.button>
        </div>
        <div style={{ textAlign:"center",marginTop:6,fontSize:10,color:VIZ.text3 }}>↵ send · shift+↵ new line</div>
      </div>
    </motion.div>
  );
}
