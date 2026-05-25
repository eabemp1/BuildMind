"use client";

/**
 * app/break/page.tsx — Public "Break My Startup" Landing Page
 * No login required. Viral entry point → funnel to signup.
 */

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

type Phase = "input" | "loading" | "result";

type BreakResult = {
  verdict: string;
  kill_reasons: string[];
  survive_reasons: string[];
  brutal_advice: string;
  survival_probability: number;
  differentiation_plan: string[];
  competitor_summary?: string;
};

function SurvivalArc({ score }: { score: number }) {
  const size = 160, stroke = 10;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const color = score >= 60 ? "#4ade80" : score >= 35 ? "#fbbf24" : "#ef4444";
  const label = score >= 60 ? "Survivable" : score >= 35 ? "Risky" : "Critical";
  return (
    <div style={{ position:"relative", width:size, height:size, margin:"0 auto" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform:"rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--bm-border)" strokeWidth={stroke} />
        <motion.circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circ} initial={{ strokeDashoffset:circ }}
          animate={{ strokeDashoffset:circ-(score/100)*circ }}
          transition={{ duration:1.6, ease:[0.22,1,0.36,1], delay:0.2 }} />
      </svg>
      <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
        <motion.span initial={{ opacity:0, scale:0.8 }} animate={{ opacity:1, scale:1 }} transition={{ delay:0.9 }}
          style={{ fontSize:38, fontWeight:800, color, lineHeight:1, letterSpacing:"-0.06em" }}>{score}%</motion.span>
        <motion.span initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:1.1 }}
          style={{ fontSize:10, color:"var(--bm-text3)", textTransform:"uppercase", letterSpacing:"0.12em", marginTop:4 }}>{label}</motion.span>
      </div>
    </div>
  );
}

const LOADING_STEPS = [
  "Reading your startup...",
  "Scanning the competitive landscape...",
  "Identifying failure modes...",
  "Calculating survival probability...",
  "Writing your brutal assessment...",
];

function LoadingState() {
  const [stepIdx, setStepIdx] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setStepIdx(i => Math.min(i+1, LOADING_STEPS.length-1)), 1400);
    return () => clearInterval(iv);
  }, []);
  return (
    <div style={{ textAlign:"center", padding:"60px 20px" }}>
      <motion.div animate={{ rotate:360 }} transition={{ duration:1.5, repeat:Infinity, ease:"linear" }}
        style={{ width:36, height:36, borderRadius:"50%", border:"2.5px solid rgba(239,68,68,0.2)", borderTopColor:"#ef4444", margin:"0 auto 24px" }} />
      <AnimatePresence mode="wait">
        <motion.div key={stepIdx} initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-6 }} transition={{ duration:0.3 }}
          style={{ fontSize:14, color:"var(--bm-text2)", fontFamily:"monospace" }}>{LOADING_STEPS[stepIdx]}</motion.div>
      </AnimatePresence>
      <div style={{ display:"flex", justifyContent:"center", gap:6, marginTop:24 }}>
        {LOADING_STEPS.map((_,i) => <div key={i} style={{ width:6, height:6, borderRadius:"50%", background:i<=stepIdx?"#ef4444":"var(--bm-border2)", transition:"background 0.3s" }} />)}
      </div>
    </div>
  );
}

function buildShareText(idea: string, result: BreakResult): string {
  return `I ran my startup idea through "Break My Startup" — an AI adversarial analysis.\n\nIdea: "${idea}"\n\nSurvival probability: ${result.survival_probability}%\n\nBiggest kill risk:\n→ ${result.kill_reasons[0]}\n\nBrutal advice:\n"${result.brutal_advice}"\n\nTry yours free → buildmind.live/break\n\n#buildinpublic #solofounder #startups`;
}

export default function BreakPublicPage() {
  const [phase, setPhase] = useState<Phase>("input");
  const [idea, setIdea] = useState("");
  const [targetUsers, setTargetUsers] = useState("");
  const [problem, setProblem] = useState("");
  const [result, setResult] = useState<BreakResult | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const canRun = idea.trim().length > 10;

  const handleRun = async () => {
    if (!canRun) return;
    setPhase("loading"); setError("");
    try {
      const res = await fetch("/api/ai/break-public", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ idea:idea.trim(), targetUsers:targetUsers.trim(), problem:problem.trim() }),
      });
      const body = await res.json().catch(()=>({}));
      if (!res.ok||!body.success) throw new Error(body?.error??"Analysis failed");
      setResult(body.data); setPhase("result");
    } catch(err) {
      setError(err instanceof Error?err.message:"Something went wrong."); setPhase("input");
    }
  };

  const handleShare = (platform:"twitter"|"linkedin") => {
    if (!result) return;
    const text = buildShareText(idea, result);
    const url = platform==="twitter"
      ? `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`
      : `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent("https://buildmind.live/break")}&summary=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  };

  const handleCopy = () => {
    if (!result) return;
    navigator.clipboard.writeText(buildShareText(idea, result)).catch(()=>{});
    setCopied(true); setTimeout(()=>setCopied(false), 1500);
  };

  const handleReset = () => { setPhase("input"); setResult(null); setIdea(""); setTargetUsers(""); setProblem(""); };

  return (
    <div style={{ minHeight:"100vh", background:"#080810", color:"#f0f0f5", fontFamily:"system-ui,-apple-system,sans-serif" }}>
      {/* Nav */}
      <div style={{ maxWidth:680, margin:"0 auto", padding:"20px 20px 0", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <Link href="/" style={{ display:"flex", alignItems:"center", gap:8, textDecoration:"none" }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width={24} height={24}>
            <rect width="32" height="32" rx="7" fill="#09090B"/>
            <rect width="32" height="32" rx="7" fill="none" stroke="rgba(139,92,246,0.4)" strokeWidth="0.8"/>
            <circle cx="6" cy="16" r="2.2" fill="#C4B5FD"/><circle cx="16" cy="14" r="2.4" fill="#A78BFA"/><circle cx="26" cy="16" r="2.2" fill="#C4B5FD"/>
          </svg>
          <span style={{ fontSize:14, fontWeight:600, color:"#f0f0f5" }}>BuildMind</span>
        </Link>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <Link href="/auth/login" style={{ fontSize:12, color:"var(--bm-text2)", textDecoration:"none", padding:"6px 12px" }}>Sign in</Link>
          <Link href="/auth/login" style={{ fontSize:12, fontWeight:600, color:"#000", background:"#fff", borderRadius:7, padding:"7px 14px", textDecoration:"none" }}>Get started free</Link>
        </div>
      </div>

      <div style={{ maxWidth:680, margin:"0 auto", padding:"48px 20px 80px" }}>
        <AnimatePresence mode="wait">

          {phase==="input" && (
            <motion.div key="input" initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-12 }}>
              <div style={{ textAlign:"center", marginBottom:48 }}>
                <motion.div initial={{ scale:0.8, opacity:0 }} animate={{ scale:1, opacity:1 }} transition={{ delay:0.1 }}
                  style={{ fontSize:40, marginBottom:16 }}>⚡</motion.div>
                <h1 style={{ fontSize:36, fontWeight:800, letterSpacing:"-0.04em", margin:"0 0 12px", lineHeight:1.1 }}>Break My Startup</h1>
                <p style={{ fontSize:15, color:"var(--bm-text3)", lineHeight:1.6, maxWidth:440, margin:"0 auto" }}>
                  The brutal AI stress test that tells founders why their startup will fail, then turns the result into the next action.
                </p>
                <div style={{ display:"flex", gap:16, justifyContent:"center", marginTop:16, flexWrap:"wrap" }}>
                  {["No login required","30-second analysis","Shareable result"].map(t=>(
                    <span key={t} style={{ fontSize:11, color:"var(--bm-text4)", display:"flex", alignItems:"center", gap:4 }}>
                      <span style={{ color:"#4ade80" }}>✓</span> {t}
                    </span>
                  ))}
                </div>
              </div>

              <div style={{ background:"var(--bm-border)", border:"1px solid var(--bm-border2)", borderRadius:16, overflow:"hidden" }}>
                <div style={{ padding:"20px 24px", borderBottom:"1px solid var(--bm-border)" }}>
                  <label style={{ fontSize:11, color:"var(--bm-text4)", fontFamily:"monospace", letterSpacing:"0.1em", textTransform:"uppercase", display:"block", marginBottom:10 }}>What are you building? *</label>
                  <textarea value={idea} onChange={e=>setIdea(e.target.value)} autoFocus
                    placeholder="e.g. A tool that tells solo founders exactly what to do today based on their startup stage — no planning paralysis, just the one action that moves the needle."
                    rows={3}
                    style={{ width:"100%", background:"transparent", border:"none", color:"#f0f0f5", fontSize:14, lineHeight:1.65, fontFamily:"inherit", resize:"none", outline:"none", boxSizing:"border-box" }} />
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", borderBottom:"1px solid var(--bm-border)" }}>
                  <div style={{ padding:"16px 24px", borderRight:"1px solid var(--bm-border)" }}>
                    <label style={{ fontSize:11, color:"var(--bm-text4)", fontFamily:"monospace", letterSpacing:"0.1em", textTransform:"uppercase", display:"block", marginBottom:8 }}>Who is it for? (optional)</label>
                    <input value={targetUsers} onChange={e=>setTargetUsers(e.target.value)} placeholder="e.g. Pre-revenue solo founders"
                      style={{ width:"100%", background:"transparent", border:"none", color:"#f0f0f5", fontSize:13, fontFamily:"inherit", outline:"none", boxSizing:"border-box" }} />
                  </div>
                  <div style={{ padding:"16px 24px" }}>
                    <label style={{ fontSize:11, color:"var(--bm-text4)", fontFamily:"monospace", letterSpacing:"0.1em", textTransform:"uppercase", display:"block", marginBottom:8 }}>Core problem? (optional)</label>
                    <input value={problem} onChange={e=>setProblem(e.target.value)} placeholder="e.g. Founders build the wrong thing"
                      style={{ width:"100%", background:"transparent", border:"none", color:"#f0f0f5", fontSize:13, fontFamily:"inherit", outline:"none", boxSizing:"border-box" }} />
                  </div>
                </div>
                <div style={{ padding:"16px 24px" }}>
                  {error && <div style={{ fontSize:12, color:"#f87171", marginBottom:10 }}>{error}</div>}
                  <button onClick={handleRun} disabled={!canRun} style={{
                    width:"100%", padding:"14px 0",
                    background:canRun?"var(--bm-red)":"var(--bm-border)",
                    border:"none", borderRadius:10, color:canRun?"#fff":"var(--bm-border3)",
                    fontSize:14, fontWeight:700, fontFamily:"inherit", cursor:canRun?"pointer":"not-allowed", letterSpacing:"0.02em", transition:"all 0.2s",
                  }}>
                    {canRun ? "⚡ Break My Startup" : "Describe your startup above"}
                  </button>
                  <p style={{ textAlign:"center", fontSize:11, color:"var(--bm-border3)", marginTop:10, marginBottom:0 }}>Free · No account needed · Takes ~30 seconds</p>
                </div>
              </div>
            </motion.div>
          )}

          {phase==="loading" && (
            <motion.div key="loading" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}><LoadingState /></motion.div>
          )}

          {phase==="result" && result && (
            <motion.div key="result" initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }}>
              {/* Score */}
              <div style={{ textAlign:"center", marginBottom:36 }}>
                <div style={{ fontSize:11, color:"var(--bm-text4)", fontFamily:"monospace", letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:20 }}>survival probability</div>
                <SurvivalArc score={result.survival_probability} />
                <motion.p initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:1.2 }}
                  style={{ fontSize:14, color:"var(--bm-text2)", maxWidth:480, margin:"20px auto 0", lineHeight:1.65 }}>{result.verdict}</motion.p>
              </div>

              {/* Kill reasons */}
              <div style={{ marginBottom:24 }}>
                <div style={{ fontSize:11, color:"#ef4444", fontFamily:"monospace", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:12, fontWeight:600 }}>Why it fails</div>
                {result.kill_reasons.map((r,i)=>(
                  <motion.div key={i} initial={{ opacity:0, x:-12 }} animate={{ opacity:1, x:0 }} transition={{ delay:0.1*i+0.3 }}
                    style={{ display:"flex", gap:10, alignItems:"flex-start", padding:"11px 14px", background:"rgba(239,68,68,0.05)", border:"1px solid rgba(239,68,68,0.12)", borderLeft:"3px solid #ef4444", borderRadius:8, marginBottom:8 }}>
                    <span style={{ color:"#ef4444", fontSize:12, flexShrink:0, marginTop:1 }}>✕</span>
                    <span style={{ fontSize:13, color:"var(--bm-text)", lineHeight:1.55 }}>{r}</span>
                  </motion.div>
                ))}
              </div>

              {/* Survive reasons */}
              {result.survive_reasons.length>0 && (
                <div style={{ marginBottom:24 }}>
                  <div style={{ fontSize:11, color:"#4ade80", fontFamily:"monospace", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:12, fontWeight:600 }}>Why it could work</div>
                  {result.survive_reasons.map((r,i)=>(
                    <motion.div key={i} initial={{ opacity:0, x:-12 }} animate={{ opacity:1, x:0 }} transition={{ delay:0.1*i+0.5 }}
                      style={{ display:"flex", gap:10, alignItems:"flex-start", padding:"11px 14px", background:"rgba(74,222,128,0.05)", border:"1px solid rgba(74,222,128,0.12)", borderLeft:"3px solid #4ade80", borderRadius:8, marginBottom:8 }}>
                      <span style={{ color:"#4ade80", fontSize:12, flexShrink:0, marginTop:1 }}>✓</span>
                      <span style={{ fontSize:13, color:"var(--bm-text)", lineHeight:1.55 }}>{r}</span>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Brutal advice */}
              <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.6 }}
                style={{ background:"rgba(129,140,248,0.06)", border:"1px solid var(--bm-accent-bd)", borderRadius:12, padding:"16px 18px", marginBottom:24 }}>
                <div style={{ fontSize:11, color:"var(--bm-text2)", fontFamily:"monospace", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:8, fontWeight:600 }}>The one thing to do now</div>
                <p style={{ fontSize:14, color:"var(--bm-text)", lineHeight:1.65, margin:0 }}>{result.brutal_advice}</p>
              </motion.div>

              {/* Differentiation */}
              {result.differentiation_plan?.length>0 && (
                <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.75 }}
                  style={{ background:"rgba(251,191,36,0.04)", border:"1px solid rgba(251,191,36,0.15)", borderRadius:12, padding:"16px 18px", marginBottom:28 }}>
                  <div style={{ fontSize:11, color:"#fbbf24", fontFamily:"monospace", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:12, fontWeight:600 }}>How to stand out</div>
                  {result.differentiation_plan.map((item,i)=>(
                    <div key={i} style={{ display:"flex", gap:10, marginBottom:i<result.differentiation_plan.length-1?8:0 }}>
                      <span style={{ color:"#fbbf24", fontSize:12, flexShrink:0, marginTop:2 }}>→</span>
                      <span style={{ fontSize:13, color:"var(--bm-text2)", lineHeight:1.55 }}>{item}</span>
                    </div>
                  ))}
                </motion.div>
              )}

              {/* Share */}
              <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.9 }}
                style={{ display:"flex", gap:8, marginBottom:28, flexWrap:"wrap" }}>
                <button onClick={()=>handleShare("twitter")} style={{ flex:1, minWidth:120, padding:"11px 0", borderRadius:8, background:"rgba(29,161,242,0.08)", border:"1px solid rgba(29,161,242,0.2)", color:"#93c5fd", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>Share on X ↗</button>
                <button onClick={()=>handleShare("linkedin")} style={{ flex:1, minWidth:120, padding:"11px 0", borderRadius:8, background:"rgba(10,102,194,0.08)", border:"1px solid rgba(10,102,194,0.2)", color:"#60a5fa", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>Share on LinkedIn ↗</button>
                <button onClick={handleCopy} style={{ padding:"11px 16px", borderRadius:8, background:"transparent", border:"1px solid var(--bm-border2)", color:"var(--bm-text2)", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>{copied?"Copied!":"Copy"}</button>
                <button onClick={handleReset} style={{ padding:"11px 16px", borderRadius:8, background:"transparent", border:"1px solid var(--bm-border2)", color:"var(--bm-text2)", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>Try another ↺</button>
              </motion.div>

              {/* Signup CTA */}
              <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} transition={{ delay:1.1 }}
                style={{ background:"var(--bm-accent-dim)", border:"1px solid var(--bm-accent-bd)", borderRadius:"var(--r-lg)", padding:"24px 28px", textAlign:"center" }}>
                <div style={{ fontSize:18, fontWeight:700, letterSpacing:"-0.03em", marginBottom:8 }}>Turn this into a daily action system</div>
                <p style={{ fontSize:13, color:"var(--bm-text3)", lineHeight:1.65, marginBottom:20, maxWidth:420, margin:"0 auto 20px" }}>
                  BuildMind is the AI Chief of Staff for stuck founders. It decides the next execution move, stress-tests weak ideas, and keeps founder momentum honest.
                </p>
                <div style={{ display:"flex", gap:10, justifyContent:"center", flexWrap:"wrap" }}>
                  <Link href={`/auth/login?idea=${encodeURIComponent(idea.slice(0,100))}`}
                    style={{ padding:"12px 28px", borderRadius:9, background:"var(--bm-accent)", color:"#fff", fontSize:13, fontWeight:700, textDecoration:"none", display:"inline-block" }}>
                    Start building smarter — free →
                  </Link>
                  <Link href="/auth/login" style={{ padding:"12px 20px", borderRadius:9, background:"transparent", border:"1px solid var(--bm-border2)", color:"var(--bm-text2)", fontSize:13, textDecoration:"none", display:"inline-block" }}>Sign in</Link>
                </div>
                <p style={{ fontSize:11, color:"var(--bm-border3)", marginTop:12, marginBottom:0 }}>Free plan · No credit card · 2 minutes to set up</p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
