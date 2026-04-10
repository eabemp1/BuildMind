"use client";
/**
 * /startup-kit — NEW (PDF: Idea Validation + Domain & Branding + Startup Kit)
 * Builder plan. Free sees paywall.
 * WHY: The PDF's core insight — remove branding/naming paralysis before building.
 */
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import PaywallGate from "@/components/PaywallGate";

function StartupKitContent() {
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<null|{
    names:string[]; tagline:string; positioning:string;
    colors:{name:string;hex:string}[];
    domains:{name:string;available:boolean;price:string}[];
    risks:string[];
  }>(null);

  useEffect(()=>{ const s=typeof window!=="undefined"?localStorage.getItem("bm_idea"):null; if(s)setIdea(s); },[]);

  const generate = async () => {
    if(!idea.trim())return; setLoading(true);
    await new Promise(r=>setTimeout(r,1800));
    const base = idea.split(" ")[0].toLowerCase().replace(/[^a-z]/g,"");
    setResult({
      names:[`${base.charAt(0).toUpperCase()+base.slice(1)}HQ`,`Get${base.charAt(0).toUpperCase()+base.slice(1)}`,`${base.charAt(0).toUpperCase()+base.slice(1)}OS`],
      tagline:"The fastest way to turn an idea into a real startup.",
      positioning:`For solo founders who need structure, not complexity. ${idea.split(" ").slice(0,4).join(" ")} is the execution OS that replaces procrastination with one clear daily action.`,
      colors:[{name:"Indigo",hex:"#6366f1"},{name:"Violet",hex:"#8b5cf6"},{name:"Teal",hex:"#14b8a6"}],
      domains:[
        {name:`${base}hq.com`,available:true,price:"$12/yr"},
        {name:`get${base}.io`,available:false,price:"—"},
        {name:`${base}os.co`,available:true,price:"$28/yr"},
      ],
      risks:["No clear distribution channel","Target audience too broad — narrow to one persona","Competitive market — differentiation needed"],
    });
    setLoading(false);
  };

  const card={background:"var(--bm-bg2)",border:"1px solid var(--bm-border)",borderRadius:14,padding:18,marginBottom:12};
  const label={fontSize:11,color:"var(--bm-text3)",textTransform:"uppercase" as const,letterSpacing:"0.06em",marginBottom:10};

  return (
    <div style={{maxWidth:680,margin:"0 auto",fontFamily:"system-ui,sans-serif",paddingBottom:40}}>
      <div style={{marginBottom:20,paddingBottom:16,borderBottom:"1px solid var(--bm-border)"}}>
        <div style={{fontSize:20,fontWeight:600,color:"var(--bm-text)",marginBottom:4}}>Startup Kit Generator</div>
        <div style={{fontSize:13,color:"var(--bm-text3)",lineHeight:1.6}}>Names · domains · brand colours · positioning · risk flags — in 30 seconds.</div>
      </div>
      <div style={card}>
        <div style={label}>Your idea</div>
        <textarea value={idea} onChange={e=>setIdea(e.target.value)} rows={3}
          placeholder="e.g. AI tool that gives solo founders one clear task every morning"
          style={{width:"100%",background:"var(--bm-bg3)",border:"1px solid var(--bm-border2)",borderRadius:10,padding:"10px 12px",fontSize:13,color:"var(--bm-text)",outline:"none",fontFamily:"monospace",resize:"none",lineHeight:1.6,marginBottom:12,boxSizing:"border-box"}}/>
        <button onClick={generate} disabled={loading||!idea.trim()}
          style={{width:"100%",padding:12,background:loading||!idea.trim()?"var(--bm-bg4)":"linear-gradient(135deg,#6366f1,#8b5cf6)",color:loading||!idea.trim()?"var(--bm-text3)":"#fff",fontWeight:700,fontSize:13,borderRadius:10,border:"none",cursor:loading||!idea.trim()?"not-allowed":"pointer",fontFamily:"inherit"}}>
          {loading?"Generating kit...":"Generate startup kit →"}
        </button>
      </div>
      <AnimatePresence>
        {result&&(
          <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}>
            <div style={card}>
              <div style={label}>Name suggestions</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                {result.names.map(n=><div key={n} style={{padding:"7px 14px",borderRadius:8,border:"1px solid var(--bm-border2)",background:"var(--bm-bg3)",fontSize:13,fontWeight:500,color:"var(--bm-text)"}}>{n}</div>)}
              </div>
            </div>
            <div style={card}>
              <div style={label}>Positioning</div>
              <div style={{fontSize:13,color:"var(--bm-text2)",lineHeight:1.7,fontFamily:"monospace"}}>{result.positioning}</div>
            </div>
            <div style={card}>
              <div style={label}>Domain suggestions</div>
              {result.domains.map(d=>(
                <div key={d.name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:"1px solid var(--bm-border)"}}>
                  <div style={{display:"flex",alignItems:"center",gap:9}}>
                    <div style={{width:7,height:7,borderRadius:"50%",background:d.available?"var(--bm-green)":"var(--bm-red)"}}/>
                    <span style={{fontSize:13,color:"var(--bm-text)",fontFamily:"monospace"}}>{d.name}</span>
                  </div>
                  <span style={{fontSize:11,color:d.available?"var(--bm-green)":"var(--bm-text4)"}}>{d.available?`Available · ${d.price}`:"Taken"}</span>
                </div>
              ))}
            </div>
            <div style={card}>
              <div style={label}>Brand colours</div>
              <div style={{display:"flex",gap:10}}>
                {result.colors.map(c=>(
                  <div key={c.hex} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
                    <div style={{width:"100%",height:44,borderRadius:8,background:c.hex}}/>
                    <div style={{fontSize:11,color:"var(--bm-text2)"}}>{c.name}</div>
                    <div style={{fontSize:10,color:"var(--bm-text3)",fontFamily:"monospace"}}>{c.hex}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{background:"rgba(248,113,113,.04)",border:"1px solid rgba(248,113,113,.15)",borderRadius:14,padding:18,marginBottom:12}}>
              <div style={label}>Risks to address first</div>
              {result.risks.map(r=><div key={r} style={{display:"flex",gap:8,fontSize:12,color:"var(--bm-text2)",fontFamily:"monospace",padding:"5px 0",borderBottom:"1px solid rgba(248,113,113,.08)"}}><span style={{color:"var(--bm-red)",flexShrink:0}}>✗</span>{r}</div>)}
            </div>
            <button onClick={()=>router.push("/landing-gen")}
              style={{width:"100%",padding:13,background:"linear-gradient(135deg,#6366f1,#8b5cf6)",color:"#fff",fontWeight:700,fontSize:13,borderRadius:12,border:"none",cursor:"pointer",fontFamily:"inherit"}}>
              Generate landing page from this kit →
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function StartupKitPage() {
  return (
    <PaywallGate feature="startupKit" featureLabel="Startup Kit Generator" requiredPlan="builder" variant="block">
      <StartupKitContent/>
    </PaywallGate>
  );
}
