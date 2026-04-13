"use client";
import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Bot, FolderKanban, Gauge, LineChart, Settings, Zap, Flame, Map, Shield, Sun, Moon, RefreshCw, Lightbulb, LayoutDashboard, Trophy, Bell, Users, Globe } from "lucide-react";
import { getUnseenCount } from "@/lib/achievements";
import { getUnreadCount } from "@/lib/notifications";

function NotifBadge() {
  const [count, setCount] = React.useState(0);
  React.useEffect(() => {
    const refresh = () => setCount(getUnreadCount());
    refresh();
    window.addEventListener("bm_notification_added", refresh);
    window.addEventListener("storage", refresh);
    const t = setInterval(refresh, 10000);
    return () => { window.removeEventListener("bm_notification_added", refresh); window.removeEventListener("storage", refresh); clearInterval(t); };
  }, []);
  if (count === 0) return null;
  return (
    <span style={{fontSize:8,padding:"2px 6px",borderRadius:10,fontWeight:700,background:"rgba(248,113,113,0.15)",color:"#f87171",letterSpacing:"0.05em"}}>
      {count}
    </span>
  );
}
import { FEATURES } from "@/lib/features";
import { getPlan } from "@/lib/plan";
import { useEffect, useState } from "react";
import { useTheme } from "@/components/layout/theme-provider";

const Logo = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width={22} height={22} style={{flexShrink:0}}>
    <defs><linearGradient id="sbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#C4B5FD"/><stop offset="100%" stopColor="#7C3AED"/></linearGradient></defs>
    <rect width="32" height="32" rx="7" fill="var(--bm-bg3)"/>
    <rect width="32" height="32" rx="7" fill="none" stroke="rgba(139,92,246,0.4)" strokeWidth="0.8"/>
    <circle cx="6"  cy="9"  r="1.6" fill="#4F46E5" opacity="0.75"/>
    <circle cx="6"  cy="16" r="1.6" fill="#4F46E5" opacity="0.75"/>
    <circle cx="6"  cy="23" r="1.6" fill="#4F46E5" opacity="0.75"/>
    <circle cx="16" cy="7"  r="1.6" fill="#7C3AED" opacity="0.8"/>
    <circle cx="16" cy="14" r="1.6" fill="#7C3AED" opacity="0.8"/>
    <circle cx="16" cy="21" r="1.6" fill="#7C3AED" opacity="0.8"/>
    <circle cx="26" cy="9"  r="1.6" fill="#A78BFA" opacity="0.75"/>
    <circle cx="26" cy="16" r="1.6" fill="#A78BFA" opacity="0.75"/>
    <circle cx="26" cy="23" r="1.6" fill="#A78BFA" opacity="0.75"/>
    <line x1="7.6" y1="16" x2="14.4" y2="14" stroke="#6D28D9" strokeWidth="1" opacity="0.95"/>
    <line x1="17.6" y1="14" x2="24.4" y2="16" stroke="#8B5CF6" strokeWidth="1" opacity="0.95"/>
    <circle cx="6"  cy="16" r="2.2" fill="url(#sbg)"/>
    <circle cx="16" cy="14" r="2.4" fill="#A78BFA"/>
    <circle cx="26" cy="16" r="2.2" fill="#C4B5FD"/>
  </svg>
);

const NAV = [
  {href:"/today",           label:"Today",        icon:Zap,          enabled:true,                    primary:true,  badge:null, showDot:false},
  {href:"/overview",         label:"Overview",     icon:LayoutDashboard, enabled:true,               primary:false, badge:null, showDot:false},
  {href:"/reflect",         label:"Reflect",      icon:RefreshCw,    enabled:true,                    primary:true,  badge:null, showDot:true},
  {href:"/dashboard",       label:"Dashboard",    icon:Gauge,        enabled:true,                    primary:false, badge:null, showDot:false},
  {href:"/projects",        label:"Projects",     icon:FolderKanban, enabled:true,                    primary:false, badge:null, showDot:false},
  {href:"/ventures",        label:"Roadmap Tracks",icon:Map,         enabled:true,                    primary:false, badge:"New",showDot:false},
  {href:"/explore",         label:"Founder Feed", icon:Globe,        enabled:true,                    primary:false, badge:null, showDot:false},
  {href:"/ai-coach",        label:"AI Coach",    icon:Bot,          enabled:FEATURES.aiCoach,        primary:false, badge:null, showDot:false},
  {href:"/break-my-startup",label:"Break Startup",icon:Flame,        enabled:FEATURES.breakMyStartup, primary:false, badge:null, showDot:false},
  {href:"/startup-kit",     label:"Startup Kit",  icon:Lightbulb,    enabled:FEATURES.startupKit,     primary:false, badge:"Builder",showDot:false},
  {href:"/notifications",   label:"Notifications",icon:Bell,         enabled:FEATURES.notifications,  primary:false, badge:null, showDot:false},
  {href:"/reports",         label:"Report",     icon:LineChart,    enabled:FEATURES.analytics,      primary:false, badge:null, showDot:false},
  {href:"/achievements",    label:"Badges",      icon:Trophy,       enabled:true,                    primary:false, badge:null, showDot:false},
  {href:"/invite",          label:"Invite & Earn",icon:Users,        enabled:true,                    primary:false, badge:"Free mo",showDot:false},
  {href:"/settings",        label:"Settings",     icon:Settings,     enabled:true,                    primary:false, badge:null, showDot:false},
];

export default function Sidebar() {
  const pathname = usePathname();
  const plan = getPlan();
  const { theme, toggle } = useTheme();
  const [isAdmin, setIsAdmin] = useState(false);
  const [reflectPending, setReflectPending] = useState(false);
  const [unseenBadges, setUnseenBadges] = useState(0);

  useEffect(() => {
    const checkPending = () => {
      try {
        setReflectPending(localStorage.getItem("bm_reflect_pending") === "true");
        setUnseenBadges(getUnseenCount());
      } catch {}
    };
    checkPending();
    window.addEventListener("storage", checkPending);
    const interval = setInterval(checkPending, 8000);
    return () => { window.removeEventListener("storage", checkPending); clearInterval(interval); };
  }, []);

  useEffect(() => {
    const check = async () => {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const sb = createClient();
        const { data } = await sb.auth.getUser();
        const aid = process.env.NEXT_PUBLIC_ADMIN_USER_ID;
        setIsAdmin(!!aid && data.user?.id === aid);
      } catch {}
    };
    void check();
  }, []);

  const linkStyle = (active: boolean, primary: boolean) => ({
    position:"relative" as const, display:"flex", alignItems:"center", gap:9,
    padding:"8px 10px", borderRadius:6, textDecoration:"none",
    color: active ? "var(--bm-text)" : primary ? "var(--bm-text2)" : "var(--bm-text3)",
    fontSize:13, fontWeight: active ? 500 : 400,
    background: active ? "var(--bm-bg4)" : "transparent",
    border: active ? "1px solid var(--bm-border2)" : "1px solid transparent",
    transition:"color 0.15s, background 0.15s",
    justifyContent:"space-between",
  });

  return (
    <aside style={{display:"flex",flexDirection:"column",height:"100%",width:"100%",background:"var(--bm-bg2)",borderRight:"1px solid var(--bm-border)",padding:"14px 10px",fontFamily:"system-ui,sans-serif"}}>

      {/* Logo + tagline */}
      <div style={{display:"flex",alignItems:"center",gap:9,padding:"6px 8px 16px",borderBottom:"1px solid var(--bm-border)",marginBottom:10}}>
        <Logo/>
        <div>
          <div style={{fontSize:13,fontWeight:500,color:"var(--bm-text)",letterSpacing:"-0.01em",lineHeight:1}}>BuildMind</div>
          <div style={{fontSize:9,color:"var(--bm-text4)",letterSpacing:"0.05em",textTransform:"uppercase",marginTop:2,lineHeight:1.3}}>
            One decision. Already made.
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{display:"flex",flexDirection:"column",gap:1,flex:1}}>
        {NAV.filter(i=>i.enabled).map(item=>{
          const active = pathname===item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          const showNotif = item.showDot && reflectPending && !active;
          return (
            <Link key={item.href} href={item.href} style={linkStyle(active,item.primary??false)} data-tour={`nav-${item.href.replace("/","")}`}>
              <div style={{display:"flex",alignItems:"center",gap:9,position:"relative"}}>
                <Icon size={14} strokeWidth={active?2:1.5}/>
                {item.label}
                {showNotif && (
                  <motion.span
                    initial={{scale:0}} animate={{scale:1}}
                    transition={{type:"spring",stiffness:400,damping:16}}
                    style={{
                      position:"absolute",top:-3,left:-3,
                      width:6,height:6,borderRadius:"50%",
                      background:"#f97316",
                      boxShadow:"0 0 6px rgba(249,115,22,0.6)",
                    }}
                  />
                )}
              </div>
              {showNotif ? (
                <span style={{fontSize:8,padding:"2px 5px",borderRadius:4,fontWeight:600,background:"rgba(249,115,22,0.12)",color:"#f97316",letterSpacing:"0.05em"}}>
                  NOW
                </span>
              ) : item.badge ? (
                <span style={{fontSize:8,padding:"2px 5px",borderRadius:4,fontWeight:600,background:"var(--bm-pdim)",color:"var(--bm-purple)",letterSpacing:"0.05em"}}>
                  {item.badge}
                </span>
              ) : (item.href === "/achievements" && unseenBadges > 0) ? (
                <span style={{fontSize:8,padding:"2px 6px",borderRadius:10,fontWeight:700,background:"rgba(251,191,36,0.15)",color:"#fbbf24",letterSpacing:"0.05em"}}>
                  {unseenBadges} new
                </span>
              ) : item.href === "/notifications" ? (
                <NotifBadge />
              ) : null}
            </Link>
          );
        })}

        {isAdmin && (
          <>
            <Link href="/my-ventures" style={{...linkStyle(pathname==="/my-ventures",false),color:pathname==="/my-ventures"?"var(--bm-red)":"var(--bm-text4)"}}>
              <div style={{display:"flex",alignItems:"center",gap:9}}><Map size={14} strokeWidth={1.5}/>My Ventures</div>
              <span style={{fontSize:8,padding:"2px 5px",borderRadius:4,background:"rgba(239,68,68,0.1)",color:"var(--bm-red)"}}>Private</span>
            </Link>
            <Link href="/owner" style={{...linkStyle(pathname==="/owner",false),color:pathname==="/owner"?"#fbbf24":"#555"}}>
              <div style={{display:"flex",alignItems:"center",gap:9}}><Shield size={14} strokeWidth={1.5}/>Owner Panel</div>
              <span style={{fontSize:8,padding:"2px 5px",borderRadius:4,background:"rgba(251,191,36,0.1)",color:"#fbbf24"}}>Admin</span>
            </Link>
          </>
        )}
      </nav>

      {/* Bottom controls */}
      <div style={{borderTop:"1px solid var(--bm-border)",paddingTop:10,marginTop:8}}>

        {/* Theme toggle */}
        <button onClick={toggle} style={{display:"flex",alignItems:"center",gap:7,padding:"7px 10px",borderRadius:6,border:"1px solid var(--bm-border)",background:"transparent",color:"var(--bm-text3)",fontSize:11,cursor:"pointer",width:"100%",fontFamily:"inherit",marginBottom:6,transition:"all 0.15s"}}>
          {theme==="dark" ? <><Sun size={12}/><span>Switch to light mode</span></> : <><Moon size={12}/><span>Switch to dark mode</span></>}
        </button>

        {/* Referral nudge — social loop */}
        <Link href="/invite" style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",borderRadius:6,textDecoration:"none",border:"1px solid var(--bm-border)",background:"var(--bm-bg3)",marginBottom:8,transition:"border-color 0.15s"}}
          onMouseEnter={e=>(e.currentTarget.style.borderColor="var(--bm-pbd)")}
          onMouseLeave={e=>(e.currentTarget.style.borderColor="var(--bm-border)")}>
          <Users size={12} color="var(--bm-text4)" strokeWidth={1.5}/>
          <div>
            <div style={{fontSize:11,fontWeight:500,color:"var(--bm-text3)",lineHeight:1}}>Invite a founder</div>
            <div style={{fontSize:9,color:"var(--bm-text4)",marginTop:2}}>1 month free for you both</div>
          </div>
          <span style={{marginLeft:"auto",fontSize:9,color:"var(--bm-text4)"}}>→</span>
        </Link>

        {/* Plan chip */}
        {plan==="free" ? (
          <Link href="/upgrade" style={{textDecoration:"none"}}>
            <motion.div whileHover={{borderColor:"var(--bm-pbd)"}} style={{padding:"8px 10px",borderRadius:6,border:"1px solid var(--bm-border)",cursor:"pointer",transition:"border-color 0.15s"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontSize:11,color:"var(--bm-text3)"}}>Free plan</div>
                  <div style={{fontSize:10,color:"var(--bm-text4)",marginTop:1}}>3 AI messages/day</div>
                </div>
                <span style={{fontSize:10,color:"var(--bm-purple)",fontWeight:500}}>Upgrade →</span>
              </div>
            </motion.div>
          </Link>
        ) : (
          <div style={{padding:"8px 10px",borderRadius:6,border:"1px solid var(--bm-border)"}}>
            <div style={{fontSize:11,color:"var(--bm-text3)"}}>{plan==="builder"?"Builder plan":"Venture plan"}</div>
            <div style={{fontSize:10,color:"var(--bm-text4)",marginTop:1}}>Unlimited actions</div>
          </div>
        )}
      </div>
    </aside>
  );
}
