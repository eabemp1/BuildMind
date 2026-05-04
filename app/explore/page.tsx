"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Search, Globe, Zap, TrendingUp, Flame, Star } from "lucide-react";

type PublicStartup = {
  id: string;
  title: string;
  description: string;
  startup_stage: string;
  domain?: string;
  score?: number;
  streak?: number;
  user_id: string;
  profiles?: { username?: string; name?: string };
};

const STAGE_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  Idea:       { text: "#A78BFA", bg: "rgba(167,139,250,0.08)", border: "rgba(167,139,250,0.20)" },
  Validation: { text: "var(--bm-amber)", bg: "rgba(232,160,32,0.08)", border: "rgba(232,160,32,0.22)" },
  MVP:        { text: "var(--bm-blue)", bg: "rgba(74,144,217,0.10)", border: "rgba(74,144,217,0.22)" },
  Launch:     { text: "var(--bm-accent)", bg: "var(--bm-accent-dim)", border: "var(--bm-accent-bd)" },
  Growth:     { text: "#F97316", bg: "rgba(249,115,22,0.08)", border: "rgba(249,115,22,0.22)" },
  Revenue:    { text: "var(--bm-green)", bg: "rgba(34,197,94,0.08)", border: "rgba(34,197,94,0.22)" },
};

function ScoreRing({ value, size = 38 }: { value: number; size?: number }) {
  const stroke = 3.5;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const color = value >= 60 ? "var(--bm-accent)" : value >= 40 ? "var(--bm-amber)" : "var(--bm-red)";
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ - (Math.min(value,100)/100)*circ} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.25, fontWeight: 800, color }}>{value}</div>
    </div>
  );
}

function StartupCard({ s }: { s: PublicStartup }) {
  const router = useRouter();
  const stage = s.startup_stage ?? "Idea";
  const stageStyle = STAGE_COLORS[stage] ?? STAGE_COLORS.Idea;
  const handle = s.profiles?.username;

  return (
    <motion.div whileHover={{ y: -2 }} transition={{ duration: 0.15 }}
      onClick={() => handle && router.push(`/explore/${s.id}`)}
      style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 16, padding: "18px 20px", cursor: handle ? "pointer" : "default", transition: "border-color 0.15s" }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--bm-border2)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--bm-border)"; }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--bm-text)", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</div>
          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: stageStyle.bg, color: stageStyle.text, border: `1px solid ${stageStyle.border}`, fontWeight: 700 }}>{stage}</span>
        </div>
        {s.score !== undefined && <ScoreRing value={s.score} />}
      </div>
      <p style={{ fontSize: 12, color: "var(--bm-text3)", lineHeight: 1.6, margin: "0 0 12px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
        {s.description || "A founder is building this."}
      </p>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {handle ? (
          <span style={{ fontSize: 11, color: "var(--bm-text3)" }}>@{handle}</span>
        ) : <span />}
        {s.streak !== undefined && s.streak > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--bm-amber)" }}>
            <Flame size={11} /> {s.streak}d
          </div>
        )}
      </div>
    </motion.div>
  );
}

const FILTERS = ["All", "Idea", "Validation", "MVP", "Launch", "Growth", "Revenue"];

export default function ExplorePage() {
  const [startups, setStartups] = useState<PublicStartup[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("All");

  useEffect(() => {
    const fetchStartups = async () => {
      try {
        const sb = createClient();
        const { data } = await sb.from("projects")
          .select("id, title, description, startup_stage, domain, score, streak, user_id, profiles(username, name)")
          .eq("is_public", true)
          .order("score", { ascending: false })
          .limit(48);
        setStartups((data as PublicStartup[]) ?? []);
      } catch {} finally { setLoading(false); }
    };
    fetchStartups();
  }, []);

  const filtered = startups.filter(s => {
    const matchStage = stageFilter === "All" || s.startup_stage === stageFilter;
    const matchQuery = !query || s.title?.toLowerCase().includes(query.toLowerCase()) || s.description?.toLowerCase().includes(query.toLowerCase());
    return matchStage && matchQuery;
  });

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "28px 24px" }}>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--bm-text)", letterSpacing: "-0.03em", margin: 0 }}>Explore</h1>
          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "var(--bm-bg3)", color: "var(--bm-text3)", border: "1px solid var(--bm-border)", fontWeight: 600 }}>
            {filtered.length} building
          </span>
        </div>
        <p style={{ fontSize: 12, color: "var(--bm-text3)", margin: 0 }}>Founders building in public. Get inspired. Stay accountable.</p>
      </motion.div>

      {/* Search + filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <Search size={13} color="var(--bm-text3)" style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)" }} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search startups…"
            style={{ width: "100%", paddingLeft: 36, paddingRight: 14, height: 38, borderRadius: 10, background: "var(--bm-bg3)", border: "1px solid var(--bm-border2)", color: "var(--bm-text)", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box", transition: "border-color 0.15s" }}
            onFocus={e => { e.target.style.borderColor = "var(--bm-accent-bd)"; }}
            onBlur={e => { e.target.style.borderColor = "var(--bm-border2)"; }} />
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {FILTERS.map(f => (
            <button key={f} onClick={() => setStageFilter(f)}
              style={{ padding: "7px 14px", borderRadius: 20, border: `1px solid ${stageFilter === f ? "var(--bm-accent-bd)" : "var(--bm-border)"}`, background: stageFilter === f ? "var(--bm-accent-dim)" : "transparent", color: stageFilter === f ? "var(--bm-accent)" : "var(--bm-text3)", fontSize: 12, fontWeight: stageFilter === f ? 600 : 400, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
          {[...Array(9)].map((_, i) => (
            <div key={i} className="shimmer" style={{ height: 160, borderRadius: 16 }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <Globe size={32} color="var(--bm-text3)" style={{ margin: "0 auto 14px", display: "block" }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--bm-text2)", marginBottom: 6 }}>No startups found</div>
          <div style={{ fontSize: 12, color: "var(--bm-text3)" }}>Try a different filter or check back later.</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
          {filtered.map((s, i) => (
            <motion.div key={s.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
              <StartupCard s={s} />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
