"use client";
/**
 * /weekly-share — NEW (stickiness feature: builders-map.com style public progress)
 * Free for all plans — sharing BuildMind grows BuildMind.
 * WHY: The #1 stickiness mechanism missing from the app. Every Friday,
 * users generate a shareable card of their week. That card links back to
 * BuildMind. This is the viral loop that builders-map.com uses.
 */
import { useState } from "react";
import { motion } from "framer-motion";

const WEEK_DATA = {
  name: "Kwame A.",
  project: "ConsentLedger",
  stage: "MVP",
  streak: 7,
  score: 72,
  tasksCommitted: 8,
  tasksDone: 6,
  milestone: "GDPR checker page live",
  nextFocus: "Cold email 50 EU shop owners",
  week: "Week 14",
};

export default function WeeklySharePage() {
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);

  const tweetText = encodeURIComponent(
    `${WEEK_DATA.week} building ${WEEK_DATA.project} with @buildmind_os\n\n` +
    `✓ ${WEEK_DATA.tasksDone}/${WEEK_DATA.tasksCommitted} tasks done\n` +
    `🔥 ${WEEK_DATA.streak} day streak\n` +
    `📈 Execution score: ${WEEK_DATA.score}/100\n` +
    `🎯 Milestone: ${WEEK_DATA.milestone}\n\n` +
    `Next week: ${WEEK_DATA.nextFocus}\n\n` +
    `Track my build → buildmind.live\n#buildinpublic #solofounder #indiehacker`
  );

  const card = {background:"var(--bm-bg2)",border:"1px solid var(--bm-border)",borderRadius:16,padding:24,marginBottom:16};

  return (
    <div style={{maxWidth:560,margin:"0 auto",fontFamily:"system-ui,sans-serif",paddingBottom:40}}>
      <div style={{marginBottom:20,paddingBottom:16,borderBottom:"1px solid var(--bm-border)"}}>
        <div style={{fontSize:20,fontWeight:600,color:"var(--bm-text)",marginBottom:4}}>Weekly progress card</div>
        <div style={{fontSize:13,color:"var(--bm-text3)",lineHeight:1.6}}>Share your week publicly. Builds accountability and attracts your first users.</div>
      </div>

      {/* The shareable card preview */}
      <motion.div style={{...card,background:"linear-gradient(135deg,rgba(99,102,241,.06),rgba(139,92,246,.04))",border:"1px solid rgba(99,102,241,.2)"}} initial={{opacity:0,y:10}} animate={{opacity:1,y:0}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18}}>
          <div>
            <div style={{fontSize:11,color:"var(--bm-text3)",fontFamily:"monospace",marginBottom:3}}>{WEEK_DATA.week} · BuildMind</div>
            <div style={{fontSize:16,fontWeight:700,color:"var(--bm-text)"}}>{WEEK_DATA.name}</div>
            <div style={{fontSize:12,color:"var(--bm-purple)",marginTop:2}}>{WEEK_DATA.project} · {WEEK_DATA.stage}</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6,fontSize:13,color:"var(--bm-amber)",background:"rgba(251,191,36,.08)",border:"1px solid rgba(251,191,36,.2)",padding:"5px 10px",borderRadius:20}}>
            🔥 {WEEK_DATA.streak}d
          </div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:16}}>
          {[
            {label:"Tasks done",value:`${WEEK_DATA.tasksDone}/${WEEK_DATA.tasksCommitted}`,color:"var(--bm-text)"},
            {label:"Exec score",value:`${WEEK_DATA.score}/100`,color:"var(--bm-green)"},
            {label:"Accountability",value:`${Math.round(WEEK_DATA.tasksDone/WEEK_DATA.tasksCommitted*100)}%`,color:"var(--bm-amber)"},
          ].map(s=>(
            <div key={s.label} style={{background:"var(--bm-bg3)",borderRadius:10,padding:"10px 12px",textAlign:"center"}}>
              <div style={{fontSize:16,fontWeight:600,color:s.color}}>{s.value}</div>
              <div style={{fontSize:10,color:"var(--bm-text3)",marginTop:2}}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{background:"rgba(74,222,128,.04)",border:"1px solid rgba(74,222,128,.15)",borderRadius:10,padding:12,marginBottom:12}}>
          <div style={{fontSize:10,color:"var(--bm-green)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>This week's milestone</div>
          <div style={{fontSize:12,color:"var(--bm-text2)",fontFamily:"monospace"}}>{WEEK_DATA.milestone}</div>
        </div>

        <div style={{background:"var(--bm-bg3)",borderRadius:10,padding:12}}>
          <div style={{fontSize:10,color:"var(--bm-text3)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>Next week focus</div>
          <div style={{fontSize:12,color:"var(--bm-text2)",fontFamily:"monospace"}}>{WEEK_DATA.nextFocus}</div>
        </div>

        <div style={{textAlign:"center",marginTop:14,fontSize:10,color:"var(--bm-text4)",fontFamily:"monospace"}}>
          buildmind.live · #buildinpublic
        </div>
      </motion.div>

      {/* Share buttons */}
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        <a href={`https://twitter.com/intent/tweet?text=${tweetText}`} target="_blank" rel="noopener noreferrer"
          onClick={()=>setShared(true)}
          style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:13,background:"linear-gradient(135deg,#6366f1,#8b5cf6)",color:"#fff",fontWeight:700,fontSize:13,borderRadius:12,textDecoration:"none"}}>
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
      </div>

      <div style={{marginTop:16,background:"rgba(99,102,241,.05)",border:"1px solid rgba(99,102,241,.15)",borderRadius:10,padding:12}}>
        <div style={{fontSize:11,color:"var(--bm-purple)",marginBottom:4,fontWeight:500}}>Why share publicly?</div>
        <div style={{fontSize:12,color:"var(--bm-text3)",lineHeight:1.7,fontFamily:"monospace"}}>
          Public accountability doubles follow-through rates. Every post attracts potential users, partners, and investors who find your early journey compelling. It's free marketing for your startup — and for BuildMind.
        </div>
      </div>
    </div>
  );
}
