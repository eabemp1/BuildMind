"use client";

/**
 * app/explore/page.tsx — Community Founder Feed (v13)
 *
 * Data source: `feed_events` Supabase table (public, anonymized).
 * Falls back to curated seed data if the table has fewer than 4 rows,
 * so the page always shows useful content from day one.
 *
 * feed_events table schema (run in Supabase SQL editor):
 * ─────────────────────────────────────────────────────
 * create table feed_events (
 *   id          uuid primary key default gen_random_uuid(),
 *   flag        text not null,
 *   location    text not null,
 *   stage       text not null,
 *   stage_color text not null default '#6366f1',
 *   action      text not null,
 *   outcome     text,
 *   streak      int  not null default 0,
 *   type        text not null check (type in ('done','reflect','launched','streak','report')),
 *   created_at  timestamptz default now()
 * );
 * alter table feed_events enable row level security;
 * create policy "public read" on feed_events for select using (true);
 *
 * Rows are inserted server-side from the reflect-action API route — never
 * directly from the client — so the anon role only needs SELECT.
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface FeedItem {
  id: string;
  flag: string;
  location: string;
  stage: string;
  stage_color: string;
  action: string;
  outcome?: string | null;
  streak: number;
  ago: string;
  type: "done" | "reflect" | "launched" | "streak" | "report";
}

const SEED: Omit<FeedItem, "ago">[] = [
  { id: "s1",  flag: "🇬🇭", location: "Accra",     stage: "Validation", stage_color: "#10b981", action: "Interviewed 4 migrant workers about remittance friction — FX rate uncertainty is the #1 pain, not speed", outcome: "Pivoting the core value prop from speed to price transparency", streak: 8,  type: "reflect" },
  { id: "s2",  flag: "🇳🇬", location: "Lagos",     stage: "MVP",        stage_color: "#6366f1", action: "Shipped the first working demo to 3 pilot users", streak: 14, type: "launched" },
  { id: "s3",  flag: "🇬🇧", location: "London",    stage: "Idea",       stage_color: "#f59e0b", action: "Cold outreach to 15 LinkedIn contacts about scheduling pain — 4 replies in 2 hours", streak: 3,  type: "done" },
  { id: "s4",  flag: "🇰🇪", location: "Nairobi",   stage: "Revenue",    stage_color: "#a78bfa", action: "Closed first paying customer at $89/mo — 3 months after first user interview", streak: 30, type: "streak" },
  { id: "s5",  flag: "🇿🇦", location: "Cape Town", stage: "Launch",     stage_color: "#ef4444", action: "Product Hunt listing went live — 47 upvotes in first hour", streak: 21, type: "launched" },
  { id: "s6",  flag: "🇺🇸", location: "Atlanta",   stage: "Validation", stage_color: "#10b981", action: "Ran Break My Startup — survival probability 38%. Pivoted from B2C to B2B", outcome: "Changed target from individual users to HR teams", streak: 5, type: "reflect" },
  { id: "s7",  flag: "🇮🇳", location: "Bangalore", stage: "MVP",        stage_color: "#6366f1", action: "Cold emailed 40 potential users. 8 replied. 3 booked calls. Conversion: 7.5%", streak: 11, type: "done" },
  { id: "s8",  flag: "🇬🇭", location: "Kumasi",    stage: "Idea",       stage_color: "#f59e0b", action: "14-day streak — longest ever. Started skipping lunch to get the action done", streak: 14, type: "streak" },
  { id: "s9",  flag: "🇫🇷", location: "Paris",     stage: "Launch",     stage_color: "#ef4444", action: "Weekly report: biggest gap was building features nobody asked for. Freezing dev for 2 weeks", outcome: "Freezing the product for 2 weeks of user research", streak: 7,  type: "report" },
  { id: "s10", flag: "🇳🇬", location: "Abuja",     stage: "MVP",        stage_color: "#6366f1", action: "Deployed to production with zero downtime. 3 months of evenings and weekends.", streak: 45, type: "launched" },
  { id: "s11", flag: "🇨🇦", location: "Toronto",   stage: "Revenue",    stage_color: "#a78bfa", action: "Sent invoice #12. MRR crossed $1,000 for the first time.", streak: 22, type: "done" },
  { id: "s12", flag: "🇬🇭", location: "Accra",     stage: "Validation", stage_color: "#10b981", action: "Asked 3 people to pay before the product exists. 1 said yes. That was enough.", outcome: "One pre-order = enough validation to start building", streak: 6, type: "reflect" },
];

function toAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function seedWithAgo(): FeedItem[] {
  const now = Date.now();
  return SEED.map((s, i) => ({ ...s, ago: toAgo(new Date(now - i * 23 * 60000).toISOString()) }));
}

const TYPE_CONFIG = {
  done:     { label: "Completed action",      color: "#4ade80" },
  reflect:  { label: "Reflected",             color: "#a78bfa" },
  launched: { label: "Shipped",               color: "#fbbf24" },
  streak:   { label: "Streak milestone",      color: "#f97316" },
  report:   { label: "Weekly report insight", color: "#60a5fa" },
};

const STAGE_FILTERS = ["All", "Idea", "Validation", "MVP", "Launch", "Revenue"];
const TYPE_FILTERS  = ["All activity", "Shipped", "Reflected", "Streak milestones", "Weekly reports"];
const TYPE_MAP: Record<string, string> = {
  "Shipped": "launched", "Reflected": "reflect",
  "Streak milestones": "streak", "Weekly reports": "report",
};

function FeedCard({ item }: { item: FeedItem }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = TYPE_CONFIG[item.type];
  return (
    <motion.div layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 12, overflow: "hidden", marginBottom: 8 }}>
      <div style={{ padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "#111", border: "1px solid #1a1a1a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
            {item.flag}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: "#666" }}>{item.location}</span>
              <span style={{ width: 3, height: 3, borderRadius: "50%", background: "#333", display: "inline-block" }} />
              <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 20, background: `${item.stage_color}15`, color: item.stage_color, fontWeight: 600 }}>{item.stage}</span>
              <span style={{ width: 3, height: 3, borderRadius: "50%", background: "#333", display: "inline-block" }} />
              <span style={{ fontSize: 10, color: "#444" }}>{item.ago}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.color, flexShrink: 0 }} />
              <span style={{ fontSize: 10, color: cfg.color, fontWeight: 600 }}>{cfg.label}</span>
              {item.streak >= 7 && <span style={{ fontSize: 10, color: "#f97316", marginLeft: 4 }}>🔥 {item.streak}d streak</span>}
            </div>
          </div>
        </div>
        <p style={{ fontSize: 13, color: "var(--bm-text)", lineHeight: 1.6, margin: "0 0 8px" }}>{item.action}</p>
        {item.outcome && (
          <button onClick={() => setExpanded(v => !v)}
            style={{ fontSize: 11, color: "#555", background: "transparent", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4 }}>
            <span>{expanded ? "▲" : "▼"}</span>
            {expanded ? "Hide" : "What happened next?"}
          </button>
        )}
        <AnimatePresence>
          {expanded && item.outcome && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: "hidden" }}>
              <div style={{ marginTop: 10, padding: "10px 12px", background: "#0a0a0a", borderRadius: 8, borderLeft: `3px solid ${cfg.color}` }}>
                <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4, fontWeight: 600 }}>Outcome</div>
                <p style={{ fontSize: 12, color: "#888", lineHeight: 1.6, margin: 0 }}>{item.outcome}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export default function ExplorePage() {
  const [stageFilter, setStageFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All activity");
  const [feed, setFeed] = useState<FeedItem[]>(seedWithAgo());
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    async function loadFeed() {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("feed_events")
          .select("id, flag, location, stage, stage_color, action, outcome, streak, type, created_at")
          .order("created_at", { ascending: false })
          .limit(40);
        if (!error && data && data.length >= 4) {
          setFeed(data.map(row => ({ ...row, stage_color: row.stage_color ?? "#6366f1", outcome: row.outcome ?? null, streak: row.streak ?? 0, ago: toAgo(row.created_at) } as FeedItem)));
          setIsLive(true);
        }
      } catch { /* table not yet created — seed data stays */ }
    }
    void loadFeed();
  }, []);

  const filtered = feed.filter(item => {
    if (stageFilter !== "All" && item.stage !== stageFilter) return false;
    if (typeFilter !== "All activity" && item.type !== TYPE_MAP[typeFilter]) return false;
    return true;
  });

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", fontFamily: "system-ui, sans-serif", paddingBottom: 48 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "var(--bm-text)", marginBottom: 4 }}>
          🌍 Founder Feed
          {isLive && <span style={{ fontSize: 11, fontWeight: 500, marginLeft: 10, color: "#4ade80", verticalAlign: "middle" }}>● live</span>}
          {!isLive && <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 10, color: "#555", verticalAlign: "middle" }}>curated examples</span>}
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: "#555" }}>Real actions from real founders, anonymised.</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 20 }}>
        {[{ label: "Active this week", value: "247", color: "#4ade80" }, { label: "Actions completed", value: "1,840", color: "#a78bfa" }, { label: "Countries", value: "18", color: "#fbbf24" }].map(s => (
          <div key={s.label} style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 10, padding: "12px", textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {STAGE_FILTERS.map(f => (
          <button key={f} onClick={() => setStageFilter(f)}
            style={{ padding: "5px 12px", borderRadius: 20, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: stageFilter === f ? 600 : 400, background: stageFilter === f ? "#1a1a3a" : "transparent", border: `1px solid ${stageFilter === f ? "#3b3b7a" : "#1a1a1a"}`, color: stageFilter === f ? "#a78bfa" : "#555" }}>{f}</button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
        {TYPE_FILTERS.map(f => (
          <button key={f} onClick={() => setTypeFilter(f)}
            style={{ padding: "4px 10px", borderRadius: 20, fontSize: 10, cursor: "pointer", fontFamily: "inherit", fontWeight: typeFilter === f ? 600 : 400, background: typeFilter === f ? "#111" : "transparent", border: `1px solid ${typeFilter === f ? "#2a2a2a" : "#111"}`, color: typeFilter === f ? "#e2e2e2" : "#444" }}>{f}</button>
        ))}
      </div>
      <AnimatePresence mode="popLayout">
        {filtered.length === 0
          ? <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ textAlign: "center", padding: "48px 20px", color: "#333", fontSize: 13 }}>No activity matching this filter.</motion.div>
          : filtered.map(item => <FeedCard key={item.id} item={item} />)}
      </AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
        style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 14, padding: "20px 24px", textAlign: "center", marginTop: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--bm-text)", marginBottom: 6 }}>Your actions will show up here</div>
        <p style={{ fontSize: 12, color: "#666", lineHeight: 1.6, marginBottom: 16 }}>Every founder who completes an action joins this feed. Anonymous. Real. Building alone doesn't have to feel lonely.</p>
        <Link href="/auth/signup" style={{ display: "inline-block", padding: "10px 24px", borderRadius: 10, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>Start building →</Link>
      </motion.div>
    </div>
  );
}
