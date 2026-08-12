"use client";

/**
 * app/admin/page.tsx — BuildMind Unified Admin
 *
 * All admin surfaces in one place — previously scattered across
 * /admin, /admin/growth, /admin/quality, /admin/testimonials, /my-ventures.
 *
 * 8 tabs: Overview · Users · Revenue · AI & Quality · Engagement · Growth · Testimonials · Ventures
 * Protected by middleware (is_admin check via /api/system/admin-check).
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { storage } from "@/lib/storage";
import {
  BarChart2, Users, DollarSign, Brain, Activity, Shield, AlertTriangle,
  Webhook, RefreshCw, ChevronUp, ChevronDown, TrendingUp, CheckCircle2,
  Target, BarChart3, XCircle, MessageSquare, Map, Globe, EyeOff, Copy,
  Check, Star, Search, ArrowUpDown, Zap, Flame, Clock,
} from "lucide-react";
import { BrandMark } from "@/components/layout/logo";
import { VENTURE_TRACKS, type VentureTrack } from "@/lib/ventures";

// ─── Tokens ───────────────────────────────────────────────────────────────────
const C = {
  bg:  "var(--bm-bg)",  bg2: "var(--bm-bg2)", bg3: "var(--bm-bg3)",
  bg4: "var(--bm-bg4)", bg5: "var(--bm-bg5)",
  b:   "var(--bm-border)",  b2: "var(--bm-border2)", b3: "var(--bm-border3)",
  t:   "var(--bm-text)", t2: "var(--bm-text2)", t3: "var(--bm-text3)", t4: "var(--bm-text4)",
  a:   "var(--bm-accent)", a2: "var(--bm-accent2)", ad: "var(--bm-accent-dim)", ab: "var(--bm-accent-bd)",
  amber: "var(--bm-amber)", red: "var(--bm-red)", teal: "var(--bm-teal)", blue: "var(--bm-blue)",
  rSm: "var(--r-sm)", rMd: "var(--r-md)", rLg: "var(--r-lg)", rXl: "var(--r-xl)",
};

// ─── Types ────────────────────────────────────────────────────────────────────
type Plan = "free" | "builder";
type BillingStatus = "active" | "canceled" | "processing" | "free";
type MetricStatus = "on_track" | "watch" | "below_target" | "no_data";
type DoneMap = Record<string, boolean>;
type Tab = "overview" | "users" | "revenue" | "ai" | "engagement" | "growth" | "proof" | "testimonials" | "ventures";

interface AdminUser { id: string; email: string; plan: Plan; billing_status: BillingStatus; billing_reference: string | null; subscription_id: string | null; streak: number; last_seen: string | null; created_at: string; projects_count: number; ai_calls_this_month: number; }
interface MRRData { mrr: number; active_builders: number; new_this_month: number; churned_this_month: number; trend: { date: string; mrr: number }[]; }
interface WebhookEvent { id: string; event: string; customer_email: string | null; amount: number | null; status: "success" | "failed" | "pending"; received_at: string; reference: string | null; }
interface StreakBucket { label: string; min: number; max: number; count: number; }
interface AIUsageRow { user_id: string; email: string; month: string; count: number; plan: Plan; }
interface FunnelStep { step: string; label: string; count: number; drop_pct: number | null; }
interface ActivityPoint { date: string; dau: number; wau: number; }
interface QualitySummary { total: number; totalPass: number; totalFail: number; overallPassRate: number | null; recentPassRate: number | null; qualityAlert: string | null; dailyTrend: { date: string; pass: number; fail: number; total: number; passRate: number | null }[]; contextBreakdown: { context: string; pass: number; fail: number; total: number; passRate: number | null }[]; topRejectReasons: { reason: string; count: number }[]; }
interface GrowthMetric { key: string; label: string; value: number | null; target: number; unit: "percent" | "count"; status: MetricStatus; detail: string; }
interface GrowthData { generatedAt: string; summary: GrowthMetric[]; weeklyActive: { founders: number; since: string }; conversion: { activatedUsers: number; paidActivatedUsers: number }; executionBehavior: { foundersWithThreeCompletedActions: number; averageCompletedActionsPerActivatedFounder: number | null; }; }
interface Testimonial { id: string; user_id: string | null; display_name: string; avatar_url: string | null; streak: number; stage: string; quote: string; rating: number; is_public: boolean; source: string; created_at: string; approved_at: string | null; }
interface DashboardPayload { users: AdminUser[]; mrr: MRRData; webhooks: WebhookEvent[]; streaks: StreakBucket[]; ai_usage: AIUsageRow[]; funnel: FunnelStep[]; activity: ActivityPoint[]; quality: QualitySummary; operator_gate: { briefing_open_rate: number; task_completion_rate: number; day: number }; last_updated: string; }

// ─── Helpers ──────────────────────────────────────────────────────────────────
const n = (v: number) => v.toLocaleString();
const ago = (s: string | null) => { if (!s) return "never"; const m = Math.floor((Date.now() - new Date(s).getTime()) / 60000); if (m < 60) return `${m}m`; const h = Math.floor(m / 60); if (h < 24) return `${h}h`; return `${Math.floor(h / 24)}d`; };
const fmtDT = (s: string) => new Date(s).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const statusColor = (s: MetricStatus) => ({ on_track: C.a, watch: C.amber, below_target: C.red, no_data: C.t3 })[s];
const statusLabel = (s: MetricStatus) => ({ on_track: "On track", watch: "Watch", below_target: "Below", no_data: "—" })[s];

// ─── Base UI atoms ────────────────────────────────────────────────────────────
const Card = ({ children, style, onClick, onMouseEnter, onMouseLeave }: { children: React.ReactNode; style?: React.CSSProperties; onClick?: () => void; onMouseEnter?: React.MouseEventHandler<HTMLDivElement>; onMouseLeave?: React.MouseEventHandler<HTMLDivElement> }) => (
  <div onClick={onClick} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} style={{ background: C.bg2, border: `1px solid ${C.b}`, borderRadius: C.rLg, transition: "border-color 0.15s", ...(onClick ? { cursor: "pointer" } : {}), ...style }}>
    {children}
  </div>
);

const Label = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontSize: 10, fontWeight: 700, color: C.t3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 14 }}>{children}</div>
);

const Badge = ({ label, color, bg, border }: { label: string; color: string; bg: string; border: string }) => (
  <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: bg, color, border: `1px solid ${border}`, whiteSpace: "nowrap" }}>{label}</span>
);

const PlanBadge = ({ plan }: { plan: Plan }) => (
  <Badge label={plan} color={plan === "builder" ? C.a : C.t3} bg={plan === "builder" ? C.ad : C.bg4} border={plan === "builder" ? C.ab : C.b2} />
);

const Dot = ({ status }: { status: BillingStatus }) => {
  const col = { active: C.a, canceled: C.red, processing: C.amber, free: C.t4 }[status];
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: C.t2 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: col, display: "inline-block", flexShrink: 0, boxShadow: status === "active" ? `0 0 6px ${col}` : "none" }} />{status}</span>;
};

const Spin = () => <RefreshCw size={12} style={{ animation: "adm-spin 0.8s linear infinite", color: C.t3 }} />;

const Stat = ({ label, value, sub, color, icon: Icon }: { label: string; value: string | number; sub?: string; color?: string; icon?: React.ElementType }) => (
  <div style={{ background: C.bg3, border: `1px solid ${C.b}`, borderRadius: C.rMd, padding: "16px 18px" }}>
    {Icon && <Icon size={14} color={color ?? C.a} style={{ marginBottom: 8 }} />}
    <div style={{ fontSize: 10, color: C.t3, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{label}</div>
    <div style={{ fontSize: 24, fontWeight: 800, color: color ?? C.t, letterSpacing: "-0.03em", lineHeight: 1 }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: C.t3, marginTop: 5 }}>{sub}</div>}
  </div>
);

function Sparkline({ data, color = C.a, h = 40 }: { data: number[]; color?: string; h?: number }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const W = data.length * 12;
  const pts = data.map((v, i) => `${i * 12 + 6},${h - 4 - Math.round((v / max) * (h - 8))}`).join(" ");
  return (
    <svg width={W} height={h} style={{ overflow: "visible", display: "block" }}>
      <defs>
        <linearGradient id="spk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon fill="url(#spk)" points={`6,${h} ${pts} ${(data.length - 1) * 12 + 6},${h}`} />
      <polyline fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" points={pts} />
    </svg>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "overview",     label: "Overview",      icon: BarChart2 },
  { id: "users",        label: "Users",         icon: Users },
  { id: "revenue",      label: "Revenue",       icon: DollarSign },
  { id: "ai",           label: "AI & Quality",  icon: Brain },
  { id: "engagement",   label: "Engagement",    icon: Activity },
  { id: "growth",       label: "Growth",        icon: TrendingUp },
  { id: "proof",        label: "Proof",         icon: Shield },
  { id: "testimonials", label: "Testimonials",  icon: MessageSquare },
  { id: "ventures",     label: "My Ventures",   icon: Map },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION: OVERVIEW
// ═══════════════════════════════════════════════════════════════════════════════
function OverviewTab({ data, onTabChange }: { data: DashboardPayload; onTabChange: (t: Tab) => void }) {
  const { operator_gate: gate, mrr, quality, streaks, activity } = data;
  const briefOk = gate.briefing_open_rate >= 35;
  const taskOk  = gate.task_completion_rate >= 55;
  const allOk   = briefOk && taskOk;
  const qRate   = quality.overallPassRate;
  const qColor  = qRate === null ? C.t3 : qRate >= 80 ? C.a : qRate >= 60 ? C.amber : C.red;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <Stat label="MRR" value={`$${n(mrr.mrr)}`} sub={`+${mrr.new_this_month} new · ${mrr.churned_this_month} churned`} color={C.a} icon={DollarSign} />
        <Stat label="Builders" value={mrr.active_builders} sub="paying subscribers" color={C.teal} icon={Users} />
        <Stat label="AI pass rate" value={qRate !== null ? `${qRate}%` : "—"} sub="Agent B overall" color={qColor} icon={Brain} />
        <Stat label="Weekly active" value={activity[activity.length - 1]?.wau ?? "—"} sub="founders (WAU)" color={C.blue} icon={Activity} />
      </div>

      {/* Operator gate */}
      <Card style={{ padding: "20px 24px", borderColor: allOk ? C.ab : "rgba(232,160,32,0.3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <div style={{ width: 32, height: 32, borderRadius: C.rMd, background: allOk ? C.ad : "rgba(232,160,32,0.1)", border: `1px solid ${allOk ? C.ab : "rgba(232,160,32,0.3)"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Shield size={15} color={allOk ? C.a : C.amber} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.t }}>Operator Tier Gate</div>
            <div style={{ fontSize: 12, color: C.t3 }}>Day {gate.day}/90 — {allOk ? "all thresholds met ✓" : `${[!briefOk && "briefing open rate", !taskOk && "task completion"].filter(Boolean).join(", ")} below target`}</div>
          </div>
          <span style={{ marginLeft: "auto", padding: "4px 12px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: allOk ? C.ad : "rgba(232,160,32,0.1)", color: allOk ? C.a : C.amber, border: `1px solid ${allOk ? C.ab : "rgba(232,160,32,0.25)"}` }}>
            {allOk ? "Unlocked" : `${Math.max(0, 90 - gate.day)}d left`}
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[
            { label: "Briefing open rate", value: gate.briefing_open_rate, target: 35, ok: briefOk },
            { label: "Task completion rate", value: gate.task_completion_rate, target: 55, ok: taskOk },
          ].map(({ label, value, target, ok }) => (
            <div key={label} style={{ background: C.bg3, borderRadius: C.rMd, padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                <span style={{ fontSize: 12, color: C.t2 }}>{label}</span>
                <span style={{ fontSize: 11, color: C.t3 }}>target {target}%</span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: ok ? C.a : C.amber, letterSpacing: "-0.04em", marginBottom: 10 }}>{value}%</div>
              <div style={{ height: 3, borderRadius: 99, background: C.bg4, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.min(100, (value / target) * 100)}%`, background: ok ? C.a : C.amber, borderRadius: 99, transition: "width 0.5s ease" }} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Activity + streaks */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
        <MiniActivityChart data={data.activity} />
        <StreakHisto buckets={streaks} />
      </div>

      {/* Quick nav to other tabs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        {(["users", "revenue", "ai", "testimonials"] as Tab[]).map(id => {
          const tab = TABS.find(t => t.id === id)!;
          const Icon = tab.icon;
          return (
            <button key={id} onClick={() => onTabChange(id)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px", borderRadius: C.rMd, border: `1px solid ${C.b}`, background: C.bg3, color: C.t2, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s", textAlign: "left" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.ab; (e.currentTarget as HTMLElement).style.color = C.a; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.b; (e.currentTarget as HTMLElement).style.color = C.t2; }}>
              <Icon size={14} />{tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MiniActivityChart({ data }: { data: ActivityPoint[] }) {
  const maxVal = Math.max(...data.flatMap(d => [d.dau, d.wau]), 1);
  const H = 72;
  return (
    <Card style={{ padding: "20px 22px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Label>DAU / WAU — last 30 days</Label>
        <div style={{ display: "flex", gap: 14 }}>
          {[{ c: C.a, l: "DAU" }, { c: C.blue, l: "WAU" }].map(({ c, l }) => (
            <div key={l} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: C.t3 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: c }} />{l}
            </div>
          ))}
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: H + 18, minWidth: data.length * 18 }}>
          {data.map((d, i) => (
            <div key={i} title={`${d.date}: DAU ${d.dau} / WAU ${d.wau}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flex: "0 0 16px" }}>
              <div style={{ display: "flex", gap: 1, alignItems: "flex-end", height: H }}>
                <div style={{ width: 7, background: C.a, borderRadius: "2px 2px 0 0", height: Math.max(2, (d.dau / maxVal) * H), opacity: 0.85 }} />
                <div style={{ width: 7, background: C.blue, borderRadius: "2px 2px 0 0", height: Math.max(2, (d.wau / maxVal) * H), opacity: 0.65 }} />
              </div>
              {i % 5 === 0 && <span style={{ fontSize: 8, color: C.t4, marginTop: 2 }}>{new Date(d.date).getDate()}</span>}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function StreakHisto({ buckets }: { buckets: StreakBucket[] }) {
  const max = Math.max(...buckets.map(b => b.count), 1);
  return (
    <Card style={{ padding: "20px 22px" }}>
      <Label>Streak distribution</Label>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 72 }}>
        {buckets.map(b => (
          <div key={b.label} title={`${b.label}: ${b.count} founders`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flex: 1 }}>
            <div style={{ width: "100%", height: Math.max(4, (b.count / max) * 64), background: `linear-gradient(to top, ${C.a}, ${C.teal})`, borderRadius: "3px 3px 0 0", opacity: 0.8 }} />
            <span style={{ fontSize: 9, color: C.t4 }}>{b.label}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: C.t2 }}>{b.count}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION: USERS
// ═══════════════════════════════════════════════════════════════════════════════
function UsersTab({ users, onOverride }: { users: AdminUser[]; onOverride: (u: AdminUser) => void }) {
  const [plan, setPlan] = useState<"all" | Plan>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"last_seen" | "streak" | "ai_calls">("last_seen");
  const [page, setPage] = useState(0);
  const PAGE = 20;

  const filtered = users
    .filter(u => (plan === "all" || u.plan === plan) && (!search || u.email.toLowerCase().includes(search.toLowerCase())))
    .sort((a, b) => {
      if (sort === "streak") return b.streak - a.streak;
      if (sort === "ai_calls") return b.ai_calls_this_month - a.ai_calls_this_month;
      const ta = a.last_seen ? new Date(a.last_seen).getTime() : 0;
      const tb = b.last_seen ? new Date(b.last_seen).getTime() : 0;
      return tb - ta;
    });

  const pages = Math.ceil(filtered.length / PAGE);
  const visible = filtered.slice(page * PAGE, (page + 1) * PAGE);

  const builders = users.filter(u => u.plan === "builder").length;
  const active7d = users.filter(u => u.last_seen && (Date.now() - new Date(u.last_seen).getTime()) < 7 * 864e5).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Summary row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <Stat label="Total users" value={n(users.length)} color={C.t} />
        <Stat label="Builders" value={n(builders)} color={C.a} />
        <Stat label="Active 7d" value={n(active7d)} color={C.teal} />
        <Stat label="Free tier" value={n(users.length - builders)} color={C.t3} />
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.t3 }} />
          <input type="text" placeholder="Search by email…" value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            style={{ width: "100%", paddingLeft: 32, paddingRight: 12, paddingTop: 9, paddingBottom: 9, borderRadius: C.rMd, border: `1px solid ${C.b}`, background: C.bg3, color: C.t, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
        </div>
        <select value={plan} onChange={e => { setPlan(e.target.value as "all" | Plan); setPage(0); }}
          style={{ padding: "9px 12px", borderRadius: C.rMd, border: `1px solid ${C.b}`, background: C.bg3, color: C.t, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
          <option value="all">All plans</option>
          <option value="free">Free</option>
          <option value="builder">Builder</option>
        </select>
        <select value={sort} onChange={e => setSort(e.target.value as typeof sort)}
          style={{ padding: "9px 12px", borderRadius: C.rMd, border: `1px solid ${C.b}`, background: C.bg3, color: C.t, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
          <option value="last_seen">Sort: Recent</option>
          <option value="streak">Sort: Streak</option>
          <option value="ai_calls">Sort: AI calls</option>
        </select>
      </div>

      {/* Table */}
      <Card style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: C.bg3, borderBottom: `1px solid ${C.b}` }}>
                {["Email", "Plan", "Billing", "Streak", "Last seen", "Projects", "AI calls", ""].map(h => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: C.t3, textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((u, i) => (
                <tr key={u.id} style={{ borderBottom: `1px solid ${C.b}`, transition: "background 0.1s" }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = C.bg3}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                  <td style={{ padding: "12px 14px", color: C.t2, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</td>
                  <td style={{ padding: "12px 14px" }}><PlanBadge plan={u.plan} /></td>
                  <td style={{ padding: "12px 14px" }}><Dot status={u.billing_status} /></td>
                  <td style={{ padding: "12px 14px" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 4, color: u.streak > 6 ? C.amber : u.streak > 0 ? C.t2 : C.t4 }}>
                      {u.streak > 0 && <Flame size={11} />}{u.streak}d
                    </span>
                  </td>
                  <td style={{ padding: "12px 14px", color: C.t3, fontSize: 11 }}>{ago(u.last_seen)}</td>
                  <td style={{ padding: "12px 14px", color: C.t2 }}>{u.projects_count}</td>
                  <td style={{ padding: "12px 14px" }}>
                    <span style={{ color: u.ai_calls_this_month > 50 ? C.amber : C.t2 }}>{n(u.ai_calls_this_month)}</span>
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    <button onClick={() => onOverride(u)}
                      style={{ padding: "5px 10px", borderRadius: C.rSm, border: `1px solid ${C.b2}`, background: "transparent", color: C.t2, fontSize: 11, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.ab; (e.currentTarget as HTMLElement).style.color = C.a; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.b2; (e.currentTarget as HTMLElement).style.color = C.t2; }}>
                      Override
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderTop: `1px solid ${C.b}` }}>
            <span style={{ fontSize: 12, color: C.t3 }}>Showing {page * PAGE + 1}–{Math.min((page + 1) * PAGE, filtered.length)} of {n(filtered.length)}</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
                style={{ padding: "6px 12px", borderRadius: C.rSm, border: `1px solid ${C.b}`, background: "transparent", color: page === 0 ? C.t4 : C.t2, fontSize: 11, cursor: page === 0 ? "default" : "pointer", fontFamily: "inherit" }}>← Prev</button>
              <button disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}
                style={{ padding: "6px 12px", borderRadius: C.rSm, border: `1px solid ${C.b}`, background: "transparent", color: page >= pages - 1 ? C.t4 : C.t2, fontSize: 11, cursor: page >= pages - 1 ? "default" : "pointer", fontFamily: "inherit" }}>Next →</button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Plan override modal ──────────────────────────────────────────────────────
function PlanOverrideModal({ user, onClose, onSuccess }: { user: AdminUser; onClose: () => void; onSuccess: (id: string, plan: Plan) => void }) {
  const [target, setTarget] = useState<Plan>(user.plan === "builder" ? "free" : "builder");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/admin/plan-override", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: user.id, plan: target }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      onSuccess(user.id, target); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }} onClick={onClose}>
      <motion.div initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }}
        style={{ background: C.bg2, border: `1px solid ${C.b2}`, borderRadius: C.rXl, padding: "28px", width: 380, boxShadow: "var(--shadow-lg)" }}
        onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.t, marginBottom: 4 }}>Override plan</div>
        <div style={{ fontSize: 12, color: C.t3, marginBottom: 20 }}>{user.email}</div>
        <div style={{ fontSize: 11, fontWeight: 600, color: C.t3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Set to</div>
        <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
          {(["free", "builder"] as Plan[]).map(p => (
            <button key={p} onClick={() => setTarget(p)}
              style={{ flex: 1, padding: "12px", borderRadius: C.rMd, border: `2px solid ${target === p ? C.a : C.b}`, background: target === p ? C.ad : C.bg3, color: target === p ? C.a : C.t2, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s", textTransform: "capitalize" }}>
              {p}
            </button>
          ))}
        </div>
        {error && <div style={{ padding: "10px 12px", background: "rgba(224,85,85,0.1)", border: `1px solid ${C.red}`, borderRadius: C.rMd, color: C.red, fontSize: 12, marginBottom: 16 }}>{error}</div>}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "11px", borderRadius: C.rMd, border: `1px solid ${C.b}`, background: "transparent", color: C.t2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
          <button onClick={submit} disabled={loading} style={{ flex: 1, padding: "11px", borderRadius: C.rMd, border: "none", background: C.a, color: "#0F0F10", fontSize: 13, fontWeight: 700, cursor: loading ? "default" : "pointer", fontFamily: "inherit", opacity: loading ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            {loading ? <><Spin /> Applying…</> : "Apply"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION: REVENUE
// ═══════════════════════════════════════════════════════════════════════════════
function RevenueTab({ mrr, webhooks }: { mrr: MRRData; webhooks: WebhookEvent[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? webhooks : webhooks.slice(0, 8);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <Card style={{ padding: "20px 22px", gridColumn: "span 1" }}>
          <div style={{ fontSize: 11, color: C.t3, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>MRR</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: C.a, letterSpacing: "-0.04em", marginBottom: 12 }}>${n(mrr.mrr)}</div>
          <Sparkline data={mrr.trend.map(d => d.mrr)} color={C.a} />
        </Card>
        <Stat label="Builder subscribers" value={n(mrr.active_builders)} color={C.teal} />
        <Stat label="New this month" value={`+${mrr.new_this_month}`} color={C.a} />
        <Stat label="Churned" value={mrr.churned_this_month} color={mrr.churned_this_month > 0 ? C.red : C.t3} />
      </div>

      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "18px 22px", borderBottom: `1px solid ${C.b}` }}>
          <Webhook size={14} color={C.t3} />
          <span style={{ fontSize: 13, fontWeight: 600, color: C.t }}>Paystack webhook log</span>
          <span style={{ marginLeft: "auto", fontSize: 11, color: C.t3 }}>{webhooks.length} events</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: C.bg3 }}>
                {["Event", "Email", "Amount", "Status", "Time"].map(h => (
                  <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 10, fontWeight: 700, color: C.t3, textTransform: "uppercase", letterSpacing: "0.08em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map(ev => (
                <tr key={ev.id} style={{ borderTop: `1px solid ${C.b}` }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = C.bg3}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                  <td style={{ padding: "11px 16px", color: C.t2, fontFamily: "monospace", fontSize: 11 }}>{ev.event}</td>
                  <td style={{ padding: "11px 16px", color: C.t3, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.customer_email || "—"}</td>
                  <td style={{ padding: "11px 16px", color: C.t }}>{ev.amount ? `₦${n(ev.amount)}` : "—"}</td>
                  <td style={{ padding: "11px 16px" }}>
                    <Badge label={ev.status}
                      color={ev.status === "success" ? C.a : ev.status === "failed" ? C.red : C.amber}
                      bg={ev.status === "success" ? C.ad : ev.status === "failed" ? "rgba(224,85,85,0.1)" : "rgba(232,160,32,0.1)"}
                      border={ev.status === "success" ? C.ab : ev.status === "failed" ? "rgba(224,85,85,0.25)" : "rgba(232,160,32,0.25)"} />
                  </td>
                  <td style={{ padding: "11px 16px", color: C.t4, fontSize: 11 }}>{fmtDT(ev.received_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {webhooks.length > 8 && (
          <button onClick={() => setExpanded(e => !e)}
            style={{ width: "100%", padding: "12px", borderTop: `1px solid ${C.b}`, background: "transparent", border: "none", color: C.t3, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, fontFamily: "inherit" }}>
            {expanded ? <><ChevronUp size={12} /> Show less</> : <><ChevronDown size={12} /> Show {webhooks.length - 8} more events</>}
          </button>
        )}
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION: AI & QUALITY
// ═══════════════════════════════════════════════════════════════════════════════
function AITab({ quality, aiUsage }: { quality: QualitySummary; aiUsage: AIUsageRow[] }) {
  const sorted = [...aiUsage].sort((a, b) => b.count - a.count);
  const totalCalls = aiUsage.reduce((s, r) => s + r.count, 0);
  const maxCalls = Math.max(...aiUsage.map(r => r.count), 1);
  const qc = quality.overallPassRate === null ? C.t3 : quality.overallPassRate >= 80 ? C.a : quality.overallPassRate >= 60 ? C.amber : C.red;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Quality KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
        <Stat label="Total evals" value={n(quality.total)} icon={BarChart2} />
        <Stat label="Overall pass" value={quality.overallPassRate !== null ? `${quality.overallPassRate}%` : "—"} color={qc} icon={CheckCircle2} />
        <Stat label="Last 7d pass" value={quality.recentPassRate !== null ? `${quality.recentPassRate}%` : "—"} color={(quality.recentPassRate ?? 0) >= 70 ? C.a : C.red} icon={TrendingUp} />
        <Stat label="Total passed" value={n(quality.totalPass)} color={C.a} icon={CheckCircle2} />
        <Stat label="Total failed" value={n(quality.totalFail)} color={C.red} icon={XCircle} />
      </div>

      {quality.qualityAlert && (
        <div style={{ display: "flex", gap: 10, padding: "14px 16px", borderRadius: C.rMd, background: "rgba(232,160,32,0.07)", border: "1px solid rgba(232,160,32,0.22)", color: C.amber }}>
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 13 }}>{quality.qualityAlert}</span>
        </div>
      )}

      {/* Daily pass-rate chart */}
      {quality.dailyTrend?.length > 0 && (
        <Card style={{ padding: "20px 22px" }}>
          <Label>Agent B pass rate — daily (last 30 days)</Label>
          <div style={{ overflowX: "auto" }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 80, minWidth: quality.dailyTrend.length * 22 }}>
              {quality.dailyTrend.map(d => {
                const r = d.passRate ?? 0;
                const h = Math.max(4, Math.round((r / 100) * 72));
                const col = r >= 80 ? C.a : r >= 60 ? C.amber : C.red;
                return (
                  <div key={d.date} title={`${d.date}: ${r}% (${d.pass}/${d.total})`} style={{ flex: 1, minWidth: 14, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                    <div style={{ width: "100%", height: h, background: col, borderRadius: "2px 2px 0 0", opacity: 0.85 }} />
                    <span style={{ fontSize: 7, color: C.t4, transform: "rotate(-45deg)", whiteSpace: "nowrap" }}>{d.date.slice(5)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      )}

      {/* Context + reject reasons */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Card style={{ padding: "20px 22px" }}>
          <Label>Pass rate by context</Label>
          {!quality.contextBreakdown?.length
            ? <p style={{ fontSize: 13, color: C.t3, margin: 0 }}>No data yet.</p>
            : quality.contextBreakdown.map(ctx => {
              const col = ctx.passRate !== null ? (ctx.passRate >= 80 ? C.a : ctx.passRate >= 60 ? C.amber : C.red) : C.t3;
              return (
                <div key={ctx.context} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: C.t2 }}>{ctx.context}</span>
                    <div style={{ display: "flex", gap: 10 }}>
                      <span style={{ fontSize: 11, color: C.t4 }}>{ctx.total} runs</span>
                      <span style={{ fontWeight: 700, color: col, fontSize: 12 }}>{ctx.passRate !== null ? `${ctx.passRate}%` : "—"}</span>
                    </div>
                  </div>
                  <div style={{ height: 4, background: C.bg4, borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${ctx.total ? Math.round((ctx.pass / ctx.total) * 100) : 0}%`, background: col, borderRadius: 99 }} />
                  </div>
                </div>
              );
            })
          }
        </Card>
        <Card style={{ padding: "20px 22px" }}>
          <Label>Top reject reasons</Label>
          {!quality.topRejectReasons?.length
            ? <p style={{ fontSize: 13, color: C.t3, margin: 0 }}>No rejections recorded.</p>
            : quality.topRejectReasons.map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "flex-start" }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: C.red, minWidth: 22, flexShrink: 0 }}>{r.count}×</span>
                <span style={{ fontSize: 12, color: C.t2, lineHeight: 1.5 }}>{r.reason}</span>
              </div>
            ))
          }
        </Card>
      </div>

      {/* AI usage table */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", borderBottom: `1px solid ${C.b}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Zap size={14} color={C.amber} />
            <span style={{ fontSize: 13, fontWeight: 600, color: C.t }}>Groq API usage — this month</span>
          </div>
          <span style={{ fontSize: 12, color: C.t3 }}>{n(totalCalls)} total calls</span>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: C.bg3 }}>
              {["Email", "Plan", "Calls", "Usage"].map(h => (
                <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 10, fontWeight: 700, color: C.t3, textTransform: "uppercase", letterSpacing: "0.08em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, 12).map(row => (
              <tr key={row.user_id} style={{ borderTop: `1px solid ${C.b}` }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = C.bg3}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                <td style={{ padding: "10px 16px", color: C.t2, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.email}</td>
                <td style={{ padding: "10px 16px" }}><PlanBadge plan={row.plan} /></td>
                <td style={{ padding: "10px 16px", color: row.count > 100 ? C.amber : C.t, fontWeight: 600 }}>{n(row.count)}</td>
                <td style={{ padding: "10px 16px", width: 140 }}>
                  <div style={{ height: 4, background: C.bg4, borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(row.count / maxCalls) * 100}%`, background: row.count > 100 ? C.amber : C.a, borderRadius: 99 }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <CleanupAvoidanceZonesCard />
    </div>
  );
}

// ─── Avoidance-zones cleanup (scripts/cleanup-avoidance-zones.ts, browser version) ─
type CleanupRow = {
  user_id: string;
  avoidance_zones?: { before: string[]; after: string[] };
  strengths?: { before: string[]; after: string[] };
  writeError?: string;
};
type CleanupSection = { ok: boolean; dryRun?: boolean; touched?: number; skipped?: number; results?: CleanupRow[]; error?: string };
type CleanupResponse = { ok: boolean; dryRun?: boolean; founder_memory?: CleanupSection; founder_context?: CleanupSection; error?: string };

function CleanupAvoidanceZonesCard() {
  const [loading, setLoading] = useState<"preview" | "apply" | null>(null);
  const [result, setResult] = useState<CleanupResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function runCleanup(method: "GET" | "POST") {
    setLoading(method === "GET" ? "preview" : "apply");
    setError(null);
    setConfirming(false);
    try {
      const res = await fetch("/api/admin/cleanup-avoidance-zones", { method });
      const json: CleanupResponse = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
      setResult(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(null);
    }
  }

  // The endpoint returns two separate passes (founder_memory and the
  // separate founder_context.avoidance_zones column) — combine for the
  // top-level "how many rows total" summary, but each section's own
  // results still render separately below so it's clear which table each
  // change came from.
  const totalTouched = (result?.founder_memory?.touched ?? 0) + (result?.founder_context?.touched ?? 0);
  const totalSkipped = (result?.founder_memory?.skipped ?? 0) + (result?.founder_context?.skipped ?? 0);

  return (
    <Card style={{ padding: "20px 22px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Shield size={14} color={C.a} />
          <span style={{ fontSize: 13, fontWeight: 600, color: C.t }}>Clean up avoidance zones</span>
        </div>
      </div>
      <p style={{ fontSize: 12, color: C.t3, lineHeight: 1.6, margin: "6px 0 16px" }}>
        Re-runs every founder_memory row's avoidance_zones and strengths through actionCategoryLabel() + deduplicateTags(),
        fixing raw truncated fragments left by an older bug. Same logic as scripts/cleanup-avoidance-zones.ts — preview
        first, nothing is written until you confirm.
      </p>

      <div style={{ display: "flex", gap: 10, marginBottom: result || error ? 16 : 0 }}>
        <button
          onClick={() => runCleanup("GET")}
          disabled={loading !== null}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: C.rMd, border: `1px solid ${C.b}`, background: "transparent", color: C.t2, fontSize: 12, fontWeight: 600, cursor: loading ? "default" : "pointer", fontFamily: "inherit", opacity: loading !== null ? 0.6 : 1 }}
        >
          {loading === "preview" ? <Spin /> : <EyeOff size={12} />}
          {loading === "preview" ? "Previewing…" : "Preview (dry run)"}
        </button>

        {result && result.dryRun && totalTouched > 0 && !confirming && (
          <button
            onClick={() => setConfirming(true)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: C.rMd, border: `1px solid ${C.ab}`, background: C.ad, color: C.a, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
          >
            <CheckCircle2 size={12} />
            Run cleanup for real ({totalTouched} row{totalTouched === 1 ? "" : "s"})
          </button>
        )}

        {confirming && (
          <>
            <button
              onClick={() => runCleanup("POST")}
              disabled={loading !== null}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: C.rMd, border: `1px solid ${C.red}`, background: "rgba(224,85,85,0.08)", color: C.red, fontSize: 12, fontWeight: 700, cursor: loading ? "default" : "pointer", fontFamily: "inherit", opacity: loading !== null ? 0.6 : 1 }}
            >
              {loading === "apply" ? <Spin /> : <AlertTriangle size={12} />}
              {loading === "apply" ? "Writing…" : "Confirm — write changes now"}
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={loading !== null}
              style={{ padding: "8px 14px", borderRadius: C.rMd, border: `1px solid ${C.b}`, background: "transparent", color: C.t3, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
            >
              Cancel
            </button>
          </>
        )}
      </div>

      {error && (
        <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderRadius: C.rMd, background: "rgba(224,85,85,0.07)", border: "1px solid rgba(224,85,85,0.2)", color: C.red, fontSize: 12, marginBottom: 12 }}>
          <XCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} /> {error}
        </div>
      )}

      {result && !result.dryRun && (
        <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderRadius: C.rMd, background: "rgba(46,204,113,0.08)", border: "1px solid rgba(46,204,113,0.22)", color: C.a, fontSize: 12, marginBottom: 12 }}>
          <CheckCircle2 size={13} style={{ flexShrink: 0, marginTop: 1 }} />
          Wrote {totalTouched} row{totalTouched === 1 ? "" : "s"}. {totalSkipped} already clean.
        </div>
      )}

      {result && ((result.founder_memory?.results?.length ?? 0) > 0 || (result.founder_context?.results?.length ?? 0) > 0) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {(result.founder_memory?.results?.length ?? 0) > 0 && (
            <div>
              <div style={{ fontSize: 10, color: C.t3, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>founder_memory ({result.founder_memory!.results!.length})</div>
              <div style={{ maxHeight: 260, overflowY: "auto", border: `1px solid ${C.b}`, borderRadius: C.rMd }}>
                {result.founder_memory!.results!.map(row => (
                  <div key={row.user_id} style={{ padding: "12px 14px", borderBottom: `1px solid ${C.b}` }}>
                    <div style={{ fontSize: 11, color: C.t4, marginBottom: 6, fontFamily: "monospace" }}>{row.user_id}</div>
                    {row.writeError && (
                      <div style={{ fontSize: 11, color: C.red, marginBottom: 6 }}>Write failed: {row.writeError}</div>
                    )}
                    {row.avoidance_zones && (
                      <div style={{ marginBottom: row.strengths ? 8 : 0 }}>
                        <div style={{ fontSize: 10, color: C.t3, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>avoidance_zones</div>
                        <div style={{ fontSize: 12, color: C.red, textDecoration: "line-through", opacity: 0.7 }}>{row.avoidance_zones.before.join(", ")}</div>
                        <div style={{ fontSize: 12, color: C.a }}>{row.avoidance_zones.after.join(", ") || "(removed)"}</div>
                      </div>
                    )}
                    {row.strengths && (
                      <div>
                        <div style={{ fontSize: 10, color: C.t3, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>strengths</div>
                        <div style={{ fontSize: 12, color: C.red, textDecoration: "line-through", opacity: 0.7 }}>{row.strengths.before.join(", ")}</div>
                        <div style={{ fontSize: 12, color: C.a }}>{row.strengths.after.join(", ") || "(removed)"}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {(result.founder_context?.results?.length ?? 0) > 0 && (
            <div>
              <div style={{ fontSize: 10, color: C.t3, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>founder_context ({result.founder_context!.results!.length})</div>
              <div style={{ maxHeight: 260, overflowY: "auto", border: `1px solid ${C.b}`, borderRadius: C.rMd }}>
                {result.founder_context!.results!.map(row => (
                  <div key={row.user_id} style={{ padding: "12px 14px", borderBottom: `1px solid ${C.b}` }}>
                    <div style={{ fontSize: 11, color: C.t4, marginBottom: 6, fontFamily: "monospace" }}>{row.user_id}</div>
                    {row.writeError && (
                      <div style={{ fontSize: 11, color: C.red, marginBottom: 6 }}>Write failed: {row.writeError}</div>
                    )}
                    {row.avoidance_zones && (
                      <div>
                        <div style={{ fontSize: 10, color: C.t3, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>avoidance_zones</div>
                        <div style={{ fontSize: 12, color: C.red, textDecoration: "line-through", opacity: 0.7 }}>{row.avoidance_zones.before.join(", ")}</div>
                        <div style={{ fontSize: 12, color: C.a }}>{row.avoidance_zones.after.join(", ") || "(removed)"}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {result && totalTouched === 0 && (
        <p style={{ fontSize: 12, color: C.t3, margin: 0 }}>Nothing to clean — every row already looks right.</p>
      )}
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION: ENGAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════
function EngagementTab({ data }: { data: DashboardPayload }) {
  const maxCount = Math.max(...data.funnel.map(s => s.count), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <MiniActivityChart data={data.activity} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card style={{ padding: "20px 22px" }}>
          <Label>Onboarding funnel</Label>
          {data.funnel.map((s, i) => (
            <div key={i} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: C.t2 }}>{s.label}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.t }}>{n(s.count)}</span>
              </div>
              <div style={{ height: 5, background: C.bg4, borderRadius: 99, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(s.count / maxCount) * 100}%`, background: s.drop_pct && s.drop_pct > 20 ? C.amber : C.a, borderRadius: 99, transition: "width 0.4s ease" }} />
              </div>
              {s.drop_pct !== null && <div style={{ fontSize: 10, color: C.t4, marginTop: 3 }}>↓ {s.drop_pct}% drop from previous</div>}
            </div>
          ))}
        </Card>
        <StreakHisto buckets={data.streaks} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION: GROWTH
// ═══════════════════════════════════════════════════════════════════════════════
function GrowthTab() {
  const [data, setData] = useState<GrowthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/system/growth-metrics", { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) throw new Error(j?.error ?? "Failed");
      setData(j.data);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={load} disabled={loading} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: C.rMd, border: `1px solid ${C.b}`, background: C.bg3, color: C.t2, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
          <RefreshCw size={12} style={{ animation: loading ? "adm-spin 0.8s linear infinite" : "none" }} />
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error && <div style={{ padding: "12px 16px", borderRadius: C.rMd, background: "rgba(224,85,85,0.07)", border: "1px solid rgba(224,85,85,0.2)", color: C.red, fontSize: 13 }}>{error}</div>}
      {loading && !data && <div style={{ padding: 48, textAlign: "center", color: C.t3, fontSize: 13 }}>Loading growth metrics…</div>}

      {data && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
            {data.summary.map(m => {
              const col = statusColor(m.status);
              const val = m.value === null ? "—" : m.unit === "percent" ? `${m.value}%` : n(m.value);
              return (
                <Card key={m.key} style={{ padding: "18px 20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.t3, textTransform: "uppercase", letterSpacing: "0.08em", lineHeight: 1.3 }}>{m.label}</span>
                    <Badge label={statusLabel(m.status)} color={col} bg={`${col}14`} border={`${col}33`} />
                  </div>
                  <div style={{ fontSize: 30, fontWeight: 800, color: col, letterSpacing: "-0.04em", marginBottom: 2 }}>{val}</div>
                  <div style={{ fontSize: 10, color: C.t4, marginBottom: 10 }}>target {m.unit === "percent" ? `${m.target}%` : n(m.target)}</div>
                  <p style={{ fontSize: 12, lineHeight: 1.55, color: C.t3, margin: 0 }}>{m.detail}</p>
                </Card>
              );
            })}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            <Stat label="Weekly active founders" value={`${data.weeklyActive.founders}`} sub={`since ${new Date(data.weeklyActive.since).toLocaleDateString()}`} icon={Activity} />
            <Stat label="Paid activation" value={`${data.conversion.paidActivatedUsers} / ${data.conversion.activatedUsers}`} sub="paid / activated" icon={DollarSign} color={C.teal} />
            <Stat label="Execution proof" value={`${data.executionBehavior.foundersWithThreeCompletedActions}`} sub="founders with 3+ completions" icon={CheckCircle2} color={C.a} />
            <Stat label="Avg completed actions" value={data.executionBehavior.averageCompletedActionsPerActivatedFounder ?? "—"} sub="per activated founder" icon={Target} color={C.blue} />
          </div>

          <Card style={{ padding: "18px 22px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <BarChart3 size={14} color={C.a} />
              <span style={{ fontSize: 12, fontWeight: 700, color: C.t2, textTransform: "uppercase", letterSpacing: "0.08em" }}>Venture signal</span>
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.7, color: C.t3, margin: 0 }}>
              BuildMind looks venture-scalable when D30 retention &gt; 25%, weekly active founders &gt; 100, activated-to-paid conversion &gt; 10%, and execution data proves the product changes founder behaviour.
            </p>
            <p style={{ fontSize: 11, color: C.t4, margin: "10px 0 0" }}>Generated {new Date(data.generatedAt).toLocaleString()}</p>
          </Card>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION: PROOF
// ═══════════════════════════════════════════════════════════════════════════════
function ProofTab() {
  const [data, setData] = useState<{
    retention?: unknown[];
    stage_advancement?: unknown[];
    behaviour_trajectory?: unknown[];
    recent_activity?: Array<{ event_type?: string; occurred_at?: string }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/proof", { cache: "no-store" })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(j => setData(j.data ?? null))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Card style={{ padding: 24, color: C.t3 }}><Spin /> Loading proof metrics...</Card>;
  if (!data) return <Card style={{ padding: 24, color: C.t3 }}>Proof metrics are unavailable until the migration is applied.</Card>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <Stat label="Retention proof" value={data.retention?.length ?? 0} sub="W1/W4 cohort rows" icon={Shield} color={C.a} />
        <Stat label="Stage proof" value={data.stage_advancement?.length ?? 0} sub="advancement cohorts" icon={TrendingUp} color={C.teal} />
        <Stat label="Behaviour proof" value={data.behaviour_trajectory?.length ?? 0} sub="execution trajectory rows" icon={Activity} color={C.blue} />
      </div>
      <Card style={{ padding: 18 }}>
        <Label>Recent activity events</Label>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {(data.recent_activity ?? []).slice(0, 20).map((row, i) => (
            <div key={`${row.event_type}-${row.occurred_at}-${i}`} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12, color: C.t2, borderBottom: `1px solid ${C.b}`, paddingBottom: 8 }}>
              <span>{row.event_type ?? "event"}</span>
              <span style={{ color: C.t3 }}>{row.occurred_at ? fmtDT(row.occurred_at) : "unknown"}</span>
            </div>
          ))}
          {!(data.recent_activity ?? []).length && <div style={{ fontSize: 12, color: C.t3 }}>No activity recorded yet.</div>}
        </div>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION: TESTIMONIALS
// ═══════════════════════════════════════════════════════════════════════════════
const SRC_LABELS: Record<string, string> = { streak_7: "🔥 7d streak", streak_14: "⚔️ 14d", streak_30: "💎 30d", high_confidence: "💪 High confidence", manual: "Manual", admin: "Admin" };

function TestimonialsTab() {
  const [all, setAll] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "approved">("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await fetch("/api/admin/testimonials"); const d = await r.json(); setAll(d.testimonials ?? []); }
    catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggle(id: string, approved: boolean) {
    await fetch("/api/admin/testimonials", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, approve: !approved }) });
    setAll(prev => prev.map(t => t.id === id ? { ...t, approved_at: approved ? null : new Date().toISOString() } : t));
  }

  function copy(t: Testimonial) {
    navigator.clipboard.writeText(`"${t.quote}" — ${t.display_name}, ${t.stage} stage`).catch(() => {});
    setCopiedId(t.id); setTimeout(() => setCopiedId(null), 2000);
  }

  const filtered = all.filter(t => filter === "all" ? true : filter === "pending" ? !t.approved_at : !!t.approved_at);
  const approved = all.filter(t => !!t.approved_at).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        <Stat label="Total" value={all.length} />
        <Stat label="Approved" value={approved} color={C.a} />
        <Stat label="Public consent" value={all.filter(t => t.is_public).length} color={C.teal} />
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ display: "flex", gap: 4, background: C.bg3, padding: 4, borderRadius: C.rMd, border: `1px solid ${C.b}` }}>
          {(["all", "pending", "approved"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ padding: "6px 14px", borderRadius: "7px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", border: "none", background: filter === f ? C.bg2 : "transparent", color: filter === f ? C.t : C.t3, boxShadow: filter === f ? "0 1px 3px rgba(0,0,0,0.3)" : "none", transition: "all 0.15s" }}>
              {f === "all" ? `All (${all.length})` : f === "pending" ? `Pending (${all.length - approved})` : `Approved (${approved})`}
            </button>
          ))}
        </div>
        <button onClick={load} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, padding: "8px 12px", borderRadius: C.rMd, border: `1px solid ${C.b}`, background: "transparent", color: C.t3, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
          <RefreshCw size={11} style={{ animation: loading ? "adm-spin 0.8s linear infinite" : "none" }} /> Refresh
        </button>
      </div>

      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 0", color: C.t3, fontSize: 13 }}>No testimonials yet. They appear here after founders submit them in-product.</div>
      )}

      {filtered.map(t => (
        <Card key={t.id} style={{ padding: "20px 22px", borderColor: t.approved_at ? C.ab : C.b }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: C.bg4, border: `1px solid ${C.b2}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: C.t2, flexShrink: 0 }}>
                {t.display_name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.t }}>{t.display_name}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 2, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, color: C.t3 }}>{t.stage}</span>
                  <span style={{ fontSize: 11, color: C.t4 }}>·</span>
                  <span style={{ fontSize: 11, color: C.amber }}>🔥 {t.streak}d</span>
                  <span style={{ fontSize: 11, color: C.t4 }}>·</span>
                  <span style={{ fontSize: 11, color: C.t3 }}>{SRC_LABELS[t.source] ?? t.source}</span>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <span style={{ display: "inline-flex", gap: 2 }}>
                {[1,2,3,4,5].map(s => <Star key={s} size={11} fill={s <= t.rating ? C.amber : "none"} color={s <= t.rating ? C.amber : C.t4} strokeWidth={1.5} />)}
              </span>
              {t.is_public
                ? <Badge label="consented" color={C.teal} bg="rgba(74,184,176,0.1)" border="rgba(74,184,176,0.25)" />
                : <Badge label="private" color={C.t3} bg={C.bg4} border={C.b} />
              }
            </div>
          </div>

          <blockquote style={{ margin: "0 0 16px", padding: "14px 18px", background: C.bg3, borderRadius: C.rMd, border: `1px solid ${C.b}`, borderLeft: `3px solid ${C.ab}`, fontSize: 14, color: C.t2, lineHeight: 1.65, fontStyle: "italic" }}>
            &ldquo;{t.quote}&rdquo;
          </blockquote>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 11, color: C.t4, display: "flex", alignItems: "center", gap: 8 }}>
              <Clock size={11} />{new Date(t.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              {t.approved_at && <span style={{ color: C.a, display: "flex", alignItems: "center", gap: 4 }}><CheckCircle2 size={11} /> approved</span>}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => copy(t)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: C.rMd, border: `1px solid ${C.b}`, background: C.bg3, color: C.t3, fontSize: 12, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
                {copiedId === t.id ? <><Check size={11} /> Copied!</> : <><Copy size={11} /> Copy</>}
              </button>
              {t.is_public && (
                <button onClick={() => toggle(t.id, !!t.approved_at)}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: C.rMd, border: `1px solid ${t.approved_at ? "rgba(224,85,85,0.3)" : C.ab}`, background: t.approved_at ? "rgba(224,85,85,0.07)" : C.ad, color: t.approved_at ? C.red : C.a, fontSize: 12, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
                  {t.approved_at ? <><EyeOff size={11} /> Revoke</> : <><Globe size={11} /> Approve</>}
                </button>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION: MY VENTURES
// ═══════════════════════════════════════════════════════════════════════════════
function VenturesTab() {
  const [selected, setSelected] = useState<VentureTrack | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try { const r = storage.get("bm_admin_ventures_done"); if (r) setDone(JSON.parse(r)); } catch {}
  }, []);

  function toggle(vid: string, mid: string) {
    const key = `${vid}::${mid}`;
    setDone(prev => {
      const next = { ...prev, [key]: !prev[key] };
      try { storage.set("bm_admin_ventures_done", JSON.stringify(next)); } catch {}
      return next;
    });
  }

  if (selected) {
    const milestones = selected.phases.flatMap(p => p.milestones);
    const completed = milestones.filter(m => done[`${selected.id}::${m.id}`]).length;
    const pct = milestones.length ? Math.round((completed / milestones.length) * 100) : 0;

    return (
      <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button onClick={() => setSelected(null)} style={{ padding: "7px 14px", borderRadius: C.rMd, border: `1px solid ${C.b}`, background: "transparent", color: C.t3, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>← All ventures</button>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: selected.color, flexShrink: 0 }} />
              <span style={{ fontSize: 16, fontWeight: 700, color: C.t }}>{selected.name}</span>
              <Badge label={selected.status} color={selected.status === "active" ? "#34d399" : "#818cf8"} bg={selected.status === "active" ? "rgba(52,211,153,0.1)" : "rgba(129,140,248,0.1)"} border={selected.status === "active" ? "rgba(52,211,153,0.2)" : "rgba(129,140,248,0.2)"} />
            </div>
            <div style={{ fontSize: 12, color: C.t3, marginTop: 2 }}>{selected.tagline}</div>
          </div>
        </div>

        <Card style={{ padding: "16px 20px", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: C.t3 }}>Milestone progress</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: selected.color }}>{pct}% · {completed}/{milestones.length}</span>
          </div>
          <div style={{ height: 5, background: C.bg4, borderRadius: 99, overflow: "hidden" }}>
            <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, ease: "easeOut" }} style={{ height: "100%", background: selected.color, borderRadius: 99 }} />
          </div>
        </Card>

        <div style={{ fontSize: 12, color: C.t3, background: "rgba(99,102,241,0.05)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: C.rMd, padding: "12px 16px", marginBottom: 14, lineHeight: 1.6 }}>
          {selected.soloFirstNote}
        </div>

        <Card style={{ padding: "14px 18px", marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: C.t4, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Revenue model</div>
          {selected.revenueModel.map((r, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
              <span style={{ color: C.t3 }}>{r.label}</span>
              <span style={{ color: "#10b981", fontWeight: 600 }}>{r.value}</span>
            </div>
          ))}
        </Card>

        {selected.phases.map(phase => (
          <div key={phase.id} style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 3, height: 18, borderRadius: 99, background: phase.color }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.t }}>{phase.label}</div>
                <div style={{ fontSize: 11, color: C.t4 }}>{phase.weeks} · {phase.goal}</div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {phase.milestones.map(m => {
                const key = `${selected.id}::${m.id}`;
                const isDone = !!done[key];
                return (
                  <div key={m.id} style={{ borderRadius: C.rMd, border: `1px solid ${isDone ? "rgba(16,185,129,0.2)" : C.b}`, background: isDone ? "rgba(16,185,129,0.03)" : C.bg2, opacity: isDone ? 0.6 : 1 }}>
                    <div style={{ padding: "11px 14px", display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <button onClick={() => toggle(selected.id, m.id)}
                        style={{ width: 20, height: 20, borderRadius: "50%", flexShrink: 0, marginTop: 1, border: `1px solid ${isDone ? "#10b981" : C.b2}`, background: isDone ? "#10b981" : "transparent", color: "white", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {isDone ? "✓" : ""}
                      </button>
                      <div>
                        <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
                          <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 99, background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)", color: "#818cf8" }}>{m.type}</span>
                          <span style={{ fontSize: 10, color: C.t4 }}>{m.week}</span>
                        </div>
                        <div style={{ fontSize: 13, color: isDone ? C.t3 : C.t, textDecoration: isDone ? "line-through" : "none", lineHeight: 1.4 }}>{m.task}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </motion.div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ fontSize: 13, color: C.t3, margin: 0 }}>Your 4 private venture roadmaps. Not visible to other users.</p>
      {VENTURE_TRACKS.map(v => {
        const ms = v.phases.flatMap(p => p.milestones);
        const comp = ms.filter(m => done[`${v.id}::${m.id}`]).length;
        const pct = ms.length ? Math.round((comp / ms.length) * 100) : 0;
        return (
          <Card key={v.id} onClick={() => setSelected(v)}
            style={{ padding: "20px 22px", transition: "border-color 0.15s, background 0.15s" }}
            onMouseEnter={(e: React.MouseEvent<HTMLDivElement>) => { (e.currentTarget as HTMLElement).style.borderColor = C.b3; }}
            onMouseLeave={(e: React.MouseEvent<HTMLDivElement>) => { (e.currentTarget as HTMLElement).style.borderColor = C.b; }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: v.color, flexShrink: 0, boxShadow: `0 0 8px ${v.color}55` }} />
                  <span style={{ fontSize: 15, fontWeight: 700, color: C.t }}>{v.name}</span>
                  <Badge label={v.status} color={v.status === "active" ? "#34d399" : "#818cf8"} bg={v.status === "active" ? "rgba(52,211,153,0.1)" : "rgba(129,140,248,0.1)"} border={v.status === "active" ? "rgba(52,211,153,0.2)" : "rgba(129,140,248,0.2)"} />
                </div>
                <div style={{ fontSize: 12, color: C.t3, marginBottom: 14 }}>{v.tagline}</div>
                <div style={{ height: 3, background: C.bg4, borderRadius: 99, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: v.color, borderRadius: 99 }} />
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: v.color, letterSpacing: "-0.03em" }}>{pct}%</div>
                <div style={{ fontSize: 11, color: C.t4 }}>{comp}/{ms.length}</div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
async function fetchDashboard(): Promise<DashboardPayload> {
  const r = await fetch("/api/admin/dashboard");
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j?.error ?? `HTTP ${r.status}`); }
  return r.json();
}

const VALID_TABS = new Set<string>(["overview","users","revenue","ai","engagement","growth","proof","testimonials","ventures"]);

/**
 * Fix #2 — Page decomposition (audit P0.2)
 * Tab components extracted to app/admin/components/:
 *   GrowthTab       → app/admin/components/GrowthTab.tsx
 *   TestimonialsTab → app/admin/components/TestimonialsTab.tsx
 *   VenturesTab     → app/admin/components/VenturesTab.tsx
 *
 * Remaining in this file: OverviewTab, UsersTab, RevenueTab, AITab, EngagementTab
 * Next step: extract those too to bring this file under 400 lines.
 */
export default function AdminPage() {
  const [data, setData]         = useState<DashboardPayload | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [tab, setTab]           = useState<Tab>("overview");
  const [override, setOverride] = useState<AdminUser | null>(null);

  // Sync tab → URL hash so bookmarks and redirects work
  useEffect(() => {
    if (typeof window !== "undefined") window.location.hash = tab;
  }, [tab]);

  // Read hash on first mount (for redirect URLs like /admin#growth)
  useEffect(() => {
    const h = window.location.hash.replace("#", "");
    if (VALID_TABS.has(h) && h !== tab) setTab(h as Tab);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await fetchDashboard()); }
    catch (e) { setError(e instanceof Error ? e.message : "Unknown error"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handlePlanUpdated(userId: string, newPlan: Plan) {
    setData(d => d ? ({ ...d, users: d.users.map(u => u.id === userId ? { ...u, plan: newPlan } : u) }) : d);
  }

  // These tabs load their own data
  const selfLoadingTabs: Tab[] = ["testimonials", "ventures", "growth", "proof"];

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.t, fontFamily: "Geist, system-ui, sans-serif" }}>

      {/* Top bar */}
      <div style={{ borderBottom: `1px solid ${C.b}`, background: C.bg2, position: "sticky", top: 0, zIndex: 200 }}>
        <div style={{ maxWidth: 1300, margin: "0 auto", padding: "0 24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 52 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <BrandMark size={26} href="/" />
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: C.t4, background: C.bg4, border: `1px solid ${C.b}`, padding: "3px 8px", borderRadius: C.rSm }}>Admin</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: C.t }}>BuildMind</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {data && <span style={{ fontSize: 11, color: C.t4, display: "flex", alignItems: "center", gap: 4 }}><Clock size={10} /> {new Date(data.last_updated).toLocaleTimeString("en-GB")}</span>}
              <button onClick={load} disabled={loading}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: C.rMd, border: `1px solid ${C.b}`, background: "transparent", color: C.a, fontSize: 12, fontWeight: 600, cursor: loading ? "default" : "pointer", fontFamily: "inherit", opacity: loading ? 0.6 : 1 }}>
                <RefreshCw size={11} style={{ animation: loading ? "adm-spin 0.8s linear infinite" : "none" }} />
                {loading ? "Loading…" : "Refresh"}
              </button>
            </div>
          </div>

          {/* Tab nav */}
          <div style={{ display: "flex", gap: 0, overflowX: "auto", marginTop: 0 }}>
            {TABS.map(t => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button key={t.id} onClick={() => setTab(t.id)}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "11px 16px", border: "none", background: "none", fontSize: 12, fontWeight: active ? 600 : 400, color: active ? C.a : C.t3, borderBottom: `2px solid ${active ? C.a : "transparent"}`, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0, transition: "color 0.15s" }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.color = C.t2; }}
                  onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.color = C.t3; }}>
                  <Icon size={13} />{t.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 1300, margin: "0 auto", padding: "28px 24px 80px" }}>
        {error && (
          <div style={{ padding: "14px 18px", background: "rgba(224,85,85,0.07)", border: `1px solid rgba(224,85,85,0.2)`, borderRadius: C.rLg, color: C.red, marginBottom: 20, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
            <AlertTriangle size={14} /> <strong>Error:</strong> {error}
          </div>
        )}

        {/* Self-loading tabs — don't wait for dashboard data */}
        {tab === "testimonials" && <TestimonialsTab key="testimonials" />}
        {tab === "ventures"     && <VenturesTab key="ventures" />}
        {tab === "growth"       && <GrowthTab key="growth" />}
        {tab === "proof"        && <ProofTab key="proof" />}

        {/* Dashboard-data tabs */}
        {!selfLoadingTabs.includes(tab) && (
          <>
            {loading && !data && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: "100px 0" }}>
                <RefreshCw size={20} style={{ animation: "adm-spin 0.8s linear infinite", color: C.t3 }} />
                <span style={{ color: C.t3, fontSize: 13 }}>Loading dashboard…</span>
              </div>
            )}

            {data && (
              <AnimatePresence mode="wait">
                {tab === "overview" && (
                  <motion.div key="overview" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    <OverviewTab data={data} onTabChange={setTab} />
                  </motion.div>
                )}
                {tab === "users" && (
                  <motion.div key="users" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    <UsersTab users={data.users} onOverride={setOverride} />
                  </motion.div>
                )}
                {tab === "revenue" && (
                  <motion.div key="revenue" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    <RevenueTab mrr={data.mrr} webhooks={data.webhooks} />
                  </motion.div>
                )}
                {tab === "ai" && (
                  <motion.div key="ai" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    <AITab quality={data.quality} aiUsage={data.ai_usage} />
                  </motion.div>
                )}
                {tab === "engagement" && (
                  <motion.div key="engagement" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    <EngagementTab data={data} />
                  </motion.div>
                )}
              </AnimatePresence>
            )}
          </>
        )}
      </div>

      {/* Plan override modal */}
      <AnimatePresence>
        {override && (
          <PlanOverrideModal user={override} onClose={() => setOverride(null)} onSuccess={handlePlanUpdated} />
        )}
      </AnimatePresence>

      <style>{`@keyframes adm-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
                     }
