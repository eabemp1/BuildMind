"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { useProjectsQuery } from "@/lib/queries";
import { createClient } from "@/lib/supabase/client";
import { getPlan, canAccess } from "@/lib/plan";
import { useLimitModal } from "@/components/LimitModal";
import { updateAchievementStats, checkAndUnlockAchievements } from "@/lib/achievements";
import BuildMindLoader from "@/components/BuildMindLoader";

type Analysis = {
  reasoning: string[];
  verdict: string;
  kill_reasons: string[];
  survive_reasons: string[];
  brutal_advice: string;
  survival_probability: number;
  your_moat?: string;
  competitor_summary?: string;
  competitors?: { title: string; url: string; snippet: string }[];
  differentiation_plan?: string[];
};

// ─── Design tokens ─────────────────────────────────────────────────────────
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

// ─── Arc ring ──────────────────────────────────────────────────────────────
function ArcRing({ value, size=130, stroke=9 }: { value:number; size?:number; stroke?:number }) {
  const r = (size-stroke)/2;
  const circ = 2*Math.PI*r;
  const color = value>=60?VIZ.emerald:value>=40?VIZ.amber:VIZ.rose;
  return (
    <div style={{ position:"relative", width:size, height:size, flexShrink:0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform:"rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={stroke} />
        <motion.circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={circ}
          initial={{ strokeDashoffset:circ }}
          animate={{ strokeDashoffset:circ-(value/100)*circ }}
          transition={{ duration:1.5, ease:"easeOut", delay:0.3 }} />
      </svg>
      <div style={{ position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center" }}>
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:1 }}
          style={{ fontSize:28, fontWeight:700, color, letterSpacing:"-0.03em", lineHeight:1 }}>{value}%</motion.div>
        <div style={{ fontSize:9, color:VIZ.text3, textTransform:"uppercase", letterSpacing:"0.1em", marginTop:3 }}>survival</div>
      </div>
    </div>
  );
}

// ─── Panel wrapper ─────────────────────────────────────────────────────────
function Panel({ accent, title, children, delay=0 }: { accent:string; title:string; children:React.ReactNode; delay?:number }) {
  return (
    <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} transition={{ delay }}
      style={{ background:VIZ.panel, border:`1px solid ${VIZ.border}`, borderTop:`2px solid ${accent}`, borderRadius:12, overflow:"hidden" }}>
      <div style={{ padding:"11px 18px", borderBottom:`1px solid ${VIZ.border}`, display:"flex", alignItems:"center", gap:8 }}>
        <div style={{ width:5,height:5,borderRadius:"50%",background:accent }} />
        <span style={{ fontSize:10, color:VIZ.text2, textTransform:"uppercase", letterSpacing:"0.1em", fontWeight:600 }}>{title}</span>
      </div>
      <div style={{ padding:"18px 20px" }}>{children}</div>
    </motion.div>
  );
}

// ─── Reason list ───────────────────────────────────────────────────────────
function ReasonList({ items, color, blurred=false }: { items:string[]; color:string; blurred?:boolean }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
      {items.map((r,i)=>(
        <motion.div key={i} initial={{ opacity:0,x:-6 }} animate={{ opacity:1,x:0 }} transition={{ delay:0.05+i*0.07 }}
          style={{ display:"flex", gap:10, alignItems:"flex-start", filter:blurred?"blur(4px)":"none", userSelect:blurred?"none":"auto" }}>
          <div style={{ width:18,height:18,borderRadius:"50%",background:`${color}18`,border:`1px solid ${color}30`,
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color,flexShrink:0,marginTop:1 }}>
            {color===VIZ.rose?"✕":"✓"}
          </div>
          <span style={{ fontSize:13, color:VIZ.text2, lineHeight:1.6 }}>{r}</span>
        </motion.div>
      ))}
    </div>
  );
}

// ─── Teaser for free users ─────────────────────────────────────────────────
function TeaserAnalysis({ onUpgrade }: { onUpgrade:()=>void }) {
  const KILLS = [
    "No evidence of validated customer demand — you're solving a problem you assumed exists",
    "Monetisation strategy relies on volume you don't have yet",
    "3 direct competitors already solving this with more funding",
  ];
  const SURVIVES = [
    "Niche is defensible if you own distribution early",
    "Founder domain expertise gives 6-month head start",
    "Pricing model is differentiated from incumbents",
  ];
  return (
    <motion.div initial={{ opacity:0,y:16 }} animate={{ opacity:1,y:0 }} style={{ display:"flex", flexDirection:"column", gap:12 }}>
      {/* One free insight */}
      <Panel accent={VIZ.amber} title="⚠️  One finding — for free" delay={0.05}>
        <div style={{ fontSize:13, color:VIZ.text2, lineHeight:1.7 }}>
          {KILLS[0]}. This is the most common kill reason for early-stage startups. Upgrade to see the full picture — and the exact action to fix it.
        </div>
      </Panel>

      {/* Blurred survival ring */}
      <Panel accent={VIZ.indigo} title="📊  Survival Probability" delay={0.1}>
        <div style={{ display:"flex", alignItems:"center", gap:20 }}>
          <div style={{ position:"relative", width:130, height:130, flexShrink:0, filter:"blur(3px)" }}>
            <svg width="130" height="130" viewBox="0 0 130 130" style={{ transform:"rotate(-90deg)" }}>
              <circle cx="65" cy="65" r="56" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="9" />
              <circle cx="65" cy="65" r="56" fill="none" stroke={VIZ.indigo} strokeWidth="9"
                strokeLinecap="round" strokeDasharray={`${2*Math.PI*56*0.6} ${2*Math.PI*56*0.4}`} />
            </svg>
            <div style={{ position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center" }}>
              <div style={{ fontSize:28,fontWeight:700,color:VIZ.indigo,filter:"blur(6px)",userSelect:"none" }}>??%</div>
              <div style={{ fontSize:9,color:VIZ.text3,textTransform:"uppercase",letterSpacing:"0.1em",marginTop:3 }}>survival</div>
            </div>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, color:VIZ.text2, lineHeight:1.65, filter:"blur(5px)", userSelect:"none", marginBottom:10 }}>
              Your startup sits in a difficult zone. The core concept is defensible but your execution gap makes it fragile. Here is what our analysis found...
            </div>
            <div style={{ fontSize:11, color:"#a78bfa", fontWeight:600 }}>🔒 Unlocks on Builder</div>
          </div>
        </div>
      </Panel>

      {/* Kill / survive 2-col */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Panel accent={VIZ.rose} title="💀  Kill Reasons" delay={0.15}>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            <motion.div initial={{ opacity:0,x:-6 }} animate={{ opacity:1,x:0 }} style={{ display:"flex",gap:10,alignItems:"flex-start" }}>
              <div style={{ width:18,height:18,borderRadius:"50%",background:"rgba(248,113,113,0.15)",border:"1px solid rgba(248,113,113,0.3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:VIZ.rose,flexShrink:0 }}>✕</div>
              <span style={{ fontSize:13,color:VIZ.text2,lineHeight:1.6 }}>{KILLS[0].split("—")[0].trim()}</span>
            </motion.div>
            {[1,2].map(i=>(
              <div key={i} style={{ display:"flex",gap:10,alignItems:"flex-start",filter:"blur(4px)",userSelect:"none" }}>
                <div style={{ width:18,height:18,borderRadius:"50%",background:"rgba(248,113,113,0.1)",border:"1px solid rgba(248,113,113,0.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:VIZ.rose,flexShrink:0 }}>✕</div>
                <span style={{ fontSize:13,color:VIZ.text2,lineHeight:1.6 }}>{KILLS[i]}</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel accent={VIZ.emerald} title="✓  Why it might survive" delay={0.18}>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {SURVIVES.map((s,i)=>(
              <div key={i} style={{ display:"flex",gap:10,alignItems:"flex-start",filter:"blur(4px)",userSelect:"none" }}>
                <div style={{ width:18,height:18,borderRadius:"50%",background:"rgba(74,222,128,0.1)",border:"1px solid rgba(74,222,128,0.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:VIZ.emerald,flexShrink:0 }}>✓</div>
                <span style={{ fontSize:13,color:VIZ.text2,lineHeight:1.6 }}>{s}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* Brutal advice — blurred */}
      <Panel accent={VIZ.violet} title="⚡  The one thing that saves you" delay={0.22}>
        <div style={{ filter:"blur(5px)", userSelect:"none", fontSize:13, color:VIZ.text2, lineHeight:1.7, marginBottom:10 }}>
          Stop building. Talk to 10 people who have this problem this week. Not friends. Not advisors. Real people in your target segment. What you learn will either validate you or save you 6 months of wasted building.
        </div>
        <div style={{ fontSize:11, color:"#a78bfa", fontWeight:600 }}>🔒 Full advice on Builder</div>
      </Panel>

      {/* CTA */}
      <motion.div initial={{ opacity:0,y:8 }} animate={{ opacity:1,y:0 }} transition={{ delay:0.3 }}
        style={{ background:"rgba(99,102,241,0.06)", border:"1px solid rgba(99,102,241,0.2)", borderRadius:14, padding:"28px 24px", textAlign:"center", cursor:"pointer" }}
        onClick={onUpgrade}>
        <div style={{ fontSize:15, fontWeight:700, color:VIZ.text1, marginBottom:8 }}>Get the full brutal analysis</div>
        <div style={{ fontSize:12, color:VIZ.text2, marginBottom:20, lineHeight:1.65 }}>
          Real survival % · All kill reasons · Every strength · Live competitor scan · The one action that saves you
        </div>
        <motion.button whileHover={{ scale:1.03 }} whileTap={{ scale:0.97 }} onClick={onUpgrade}
          style={{ background:`linear-gradient(135deg,${VIZ.indigo},${VIZ.violet})`, color:"#fff", fontWeight:700, fontSize:14, padding:"13px 32px", borderRadius:10, border:"none", cursor:"pointer", fontFamily:"inherit" }}>
          Upgrade to Builder — $19/mo →
        </motion.button>
        <div style={{ fontSize:11, color:VIZ.text3, marginTop:8 }}>Cancel anytime. Instant access.</div>
      </motion.div>
    </motion.div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────
export default function BreakMyStartupPage() {
  const router = useRouter();
  const { showLimit } = useLimitModal();
  const { data: projects=[], isLoading } = useProjectsQuery();
  const [selectedId, setSelectedId] = useState("");
  const [analysis, setAnalysis] = useState<Analysis|null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [showTeaser, setShowTeaser] = useState(false);

  const plan = getPlan();
  const hasFullAccess = canAccess("breakMyStartup", plan)&&plan!=="free";
  const isFree = plan==="free";
  const activeId = selectedId||projects[0]?.id||"";

  const runAnalysis = async () => {
    if (!activeId) return;
    setLoading(true); setError(""); setAnalysis(null);
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error("Not authenticated");
      const res = await fetch("/api/ai/break-my-startup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ userId:data.user.id, projectId:activeId })});
      const body = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(String(body?.error??"Analysis failed"));
      if (isFree) { setShowTeaser(true); }
      else {
        setAnalysis(body.data);
        updateAchievementStats({ breakMyStartupUsed:true });
        setTimeout(()=>checkAndUnlockAchievements(),600);
      }
    } catch(err) { setError(err instanceof Error?err.message:"Analysis failed"); }
    finally { setLoading(false); }
  };

  if (isLoading) return <BuildMindLoader variant="card" label="Loading projects…" />;

  if (!projects.length) return (
    <motion.div initial={{ opacity:0,y:10 }} animate={{ opacity:1,y:0 }}
      style={{ maxWidth:400, margin:"80px auto", fontFamily:"system-ui,sans-serif" }}>
      <div style={{ background:VIZ.panel, border:`1px solid ${VIZ.border}`, borderRadius:12, padding:"32px", textAlign:"center" }}>
        <div style={{ fontSize:32, marginBottom:12 }}>🔥</div>
        <div style={{ fontSize:14, fontWeight:600, color:"#fff", marginBottom:8 }}>No projects yet</div>
        <div style={{ fontSize:13, color:VIZ.text2, marginBottom:22, lineHeight:1.6 }}>Create a project before running the analysis.</div>
        <button onClick={()=>router.push("/projects")} style={{ background:"#fff", color:"#000", fontWeight:600, fontSize:13, padding:"9px 18px", borderRadius:7, border:"none", cursor:"pointer", fontFamily:"inherit" }}>New project</button>
      </div>
    </motion.div>
  );

  return (
    <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }}
      style={{ maxWidth:880, margin:"0 auto", fontFamily:"system-ui,sans-serif", color:VIZ.text1, paddingBottom:48 }}>

      {/* Header */}
      <div style={{ marginBottom:24, paddingBottom:18, borderBottom:`1px solid ${VIZ.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div>
          <div style={{ fontSize:21, fontWeight:700, color:VIZ.rose, letterSpacing:"-0.03em" }}>Break My Startup</div>
          <div style={{ fontSize:12, color:VIZ.text3, marginTop:3 }}>Honest failure analysis — before it's too late</div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          {isFree&&<div style={{ fontSize:10, color:VIZ.amber, border:"1px solid rgba(251,191,36,0.3)", borderRadius:99, padding:"3px 9px", fontFamily:"monospace" }}>Free preview</div>}
          {projects.length>1&&(
            <select value={activeId} onChange={e=>setSelectedId(e.target.value)}
              style={{ background:VIZ.panel, border:`1px solid ${VIZ.border}`, borderRadius:7, padding:"6px 10px", fontSize:12, color:VIZ.text2, outline:"none", fontFamily:"inherit", cursor:"pointer" }}>
              {projects.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Confirmation gate */}
      {!confirmed&&!analysis&&!showTeaser&&(
        <Panel accent={VIZ.rose} title="⚠️  Are you ready for the truth?" delay={0}>
          <div style={{ fontSize:13, color:VIZ.text2, lineHeight:1.75, marginBottom:18 }}>
            This analysis will find every reason your startup could fail — weak validation, wrong target users, unrealistic assumptions, competition you&apos;re ignoring.
            It won&apos;t be comfortable. That&apos;s the point.
          </div>
          {isFree&&(
            <div style={{ fontSize:12, color:VIZ.amber, background:"rgba(251,191,36,0.06)", border:"1px solid rgba(251,191,36,0.2)", borderRadius:8, padding:"10px 14px", marginBottom:18, fontFamily:"monospace" }}>
              ⚠️ Free plan: You&apos;ll see a preview. Upgrade to Builder for the full analysis including survival probability, all kill reasons, and the one thing that saves you.
            </div>
          )}
          <div style={{ display:"flex", gap:8 }}>
            <motion.button whileHover={{ scale:1.01 }} whileTap={{ scale:0.97 }}
              onClick={()=>{ setConfirmed(true); void runAnalysis(); }}
              style={{ background:"rgba(248,113,113,0.1)", border:"1px solid rgba(248,113,113,0.3)", color:VIZ.rose, fontSize:13, fontWeight:700, padding:"10px 20px", borderRadius:9, cursor:"pointer", fontFamily:"inherit" }}>
              {isFree?"Preview analysis →":"Break my startup →"}
            </motion.button>
            <button onClick={()=>router.push("/dashboard")} style={{ background:"transparent", border:`1px solid ${VIZ.border}`, color:VIZ.text2, fontSize:13, padding:"10px 18px", borderRadius:9, cursor:"pointer", fontFamily:"inherit" }}>Not yet</button>
          </div>
        </Panel>
      )}

      {/* Loading */}
      {loading&&(
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }}
          style={{ background:VIZ.panel, border:`1px solid ${VIZ.border}`, borderRadius:12, padding:"60px 32px", textAlign:"center", marginTop:4 }}>
          <motion.div animate={{ opacity:[0.3,1,0.3] }} transition={{ duration:1.5,repeat:Infinity }}
            style={{ fontSize:13,color:VIZ.text2,marginBottom:6 }}>Analyzing your startup...</motion.div>
          <div style={{ fontSize:11,color:VIZ.text3 }}>Reading project data and running failure analysis</div>
          <motion.div style={{ height:2,background:`linear-gradient(90deg,${VIZ.indigo},${VIZ.rose})`,borderRadius:999,marginTop:20,width:200,margin:"20px auto 0" }}
            animate={{ scaleX:[0,1,0],originX:0 }} transition={{ duration:2,repeat:Infinity,ease:"easeInOut" }} />
        </motion.div>
      )}

      {error&&(
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }}
          style={{ fontSize:13,color:VIZ.rose,padding:"12px 16px",background:"rgba(248,113,113,0.06)",border:"1px solid rgba(248,113,113,0.15)",borderRadius:9,marginTop:12 }}>
          {error}
        </motion.div>
      )}

      {/* Teaser */}
      <AnimatePresence>
        {showTeaser&&!loading&&<TeaserAnalysis onUpgrade={()=>showLimit("break_startup")} />}
      </AnimatePresence>

      {/* Full analysis */}
      <AnimatePresence>
        {analysis&&!loading&&(
          <motion.div initial={{ opacity:0,y:16 }} animate={{ opacity:1,y:0 }} transition={{ duration:0.35 }}
            style={{ display:"flex", flexDirection:"column", gap:12 }}>

            {/* Verdict + ring */}
            <Panel accent={VIZ.rose} title="🔥  Survival Analysis" delay={0}>
              <div style={{ display:"flex", alignItems:"flex-start", gap:24 }}>
                <ArcRing value={analysis.survival_probability} />
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:10,color:VIZ.text3,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:10,fontWeight:600 }}>Verdict</div>
                  <div style={{ fontSize:14,color:VIZ.text1,lineHeight:1.7 }}>{analysis.verdict}</div>
                </div>
              </div>
            </Panel>

            {/* Kill vs survive */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <Panel accent={VIZ.rose} title="💀  Kill Reasons" delay={0.08}>
                <ReasonList items={analysis.kill_reasons??[]} color={VIZ.rose} />
              </Panel>
              <Panel accent={VIZ.emerald} title="✓  Why it could survive" delay={0.12}>
                <ReasonList items={analysis.survive_reasons??[]} color={VIZ.emerald} />
              </Panel>
            </div>

            {/* Brutal advice */}
            {analysis.brutal_advice&&(
              <Panel accent={VIZ.violet} title="⚡  Brutal advice" delay={0.16}>
                <div style={{ fontSize:13,color:VIZ.text2,lineHeight:1.75 }}>{analysis.brutal_advice}</div>
              </Panel>
            )}

            {/* Differentiation plan */}
            {(analysis.differentiation_plan??[]).length>0&&(
              <Panel accent={VIZ.indigo} title="🎯  How to stand out from competitors" delay={0.2}>
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  {(analysis.differentiation_plan??[]).map((step,i)=>(
                    <motion.div key={i} initial={{ opacity:0,x:-6 }} animate={{ opacity:1,x:0 }} transition={{ delay:0.22+i*0.08 }}
                      style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
                      <div style={{ width:22,height:22,borderRadius:"50%",background:"rgba(99,102,241,0.15)",border:"1px solid rgba(99,102,241,0.3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:VIZ.indigo,fontWeight:700,flexShrink:0,marginTop:1 }}>{i+1}</div>
                      <div style={{ fontSize:13,color:VIZ.text2,lineHeight:1.65 }}>{step}</div>
                    </motion.div>
                  ))}
                </div>
              </Panel>
            )}

            {/* Competitors */}
            {((analysis.competitors??[]).length>0||analysis.competitor_summary)&&(
              <Panel accent="#22d3ee" title="🌐  Live competitor scan" delay={0.24}>
                {analysis.competitor_summary&&(
                  <p style={{ fontSize:12,color:VIZ.text2,lineHeight:1.65,marginBottom:(analysis.competitors?.length??0)>0?14:0,fontFamily:"monospace" }}>{analysis.competitor_summary}</p>
                )}
                {(analysis.competitors??[]).map((c,i)=>(
                  <motion.div key={i} initial={{ opacity:0,x:-4 }} animate={{ opacity:1,x:0 }} transition={{ delay:0.28+i*0.06 }}
                    style={{ display:"flex",flexDirection:"column",gap:3,padding:"9px 0",borderBottom:i<(analysis.competitors?.length??0)-1?`1px solid ${VIZ.border}`:"none" }}>
                    <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                      <span style={{ fontSize:10,color:"#22d3ee",flexShrink:0 }}>→</span>
                      <a href={c.url} target="_blank" rel="noopener noreferrer" style={{ fontSize:12,color:"#a78bfa",textDecoration:"none",fontWeight:600,wordBreak:"break-all" }}>{c.title}</a>
                    </div>
                    {c.snippet&&<div style={{ fontSize:11,color:VIZ.text3,lineHeight:1.5,paddingLeft:18,fontFamily:"monospace" }}>{c.snippet.slice(0,140)}{c.snippet.length>140?"...":""}</div>}
                  </motion.div>
                ))}
              </Panel>
            )}

            <div style={{ display:"flex", gap:8 }}>
              <button onClick={()=>{ setAnalysis(null); setConfirmed(false); setShowTeaser(false); }}
                style={{ background:"transparent", border:`1px solid ${VIZ.border}`, color:VIZ.text2, fontSize:12, padding:"9px 16px", borderRadius:8, cursor:"pointer", fontFamily:"inherit" }}>
                Run again
              </button>
              <button onClick={()=>router.push("/ai-coach")}
                style={{ background:"transparent", border:"1px solid rgba(99,102,241,0.25)", color:VIZ.indigo, fontSize:12, padding:"9px 16px", borderRadius:8, cursor:"pointer", fontFamily:"inherit" }}>
                Discuss with AI Coach →
              </button>
            </div>

            {/* Feed analysis into today — closes the loop */}
            {analysis && (analysis.kill_reasons?.length > 0 || analysis.your_moat) && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
                style={{ marginTop: 12 }}
              >
                <button
                  onClick={() => {
                    const topKill = analysis.kill_reasons?.[0] ?? "your biggest identified risk";
                    const moat = analysis.your_moat ?? "";
                    const overrideAction = `Address your top survival risk now: ${topKill}.${moat ? ` Lean into your moat: ${moat}` : ""}`;
                    const overrideCausality = `Because Break My Startup flagged "${topKill}" → today removes that risk first.`;
                    try {
                      localStorage.setItem("bm_break_override_action", overrideAction);
                      localStorage.setItem("bm_break_override_causality", overrideCausality);
                      localStorage.setItem("bm_break_override_timestamp", String(Date.now()));
                      const existingDone = localStorage.getItem("bm_today_done_date");
                      if (!existingDone) {
                        localStorage.setItem("bm_last_reflect", JSON.stringify({
                          causality: overrideCausality, outcome: "learned", timestamp: Date.now(),
                        }));
                      } else {
                        const lastReflect = JSON.parse(localStorage.getItem("bm_last_reflect") ?? "{}");
                        lastReflect.causality = overrideCausality;
                        localStorage.setItem("bm_last_reflect", JSON.stringify(lastReflect));
                      }
                    } catch {}
                    router.push("/today");
                  }}
                  style={{
                    width: "100%", background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
                    color: "white", fontWeight: 700, fontSize: 13, padding: "12px 0",
                    borderRadius: 9, border: "none", cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  ⚡ Use this analysis — update my today action
                </button>
                <div style={{ fontSize: 10, color: VIZ.text3, textAlign: "center", marginTop: 6 }}>
                  Sends your top risk to Today page as your next directive
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
