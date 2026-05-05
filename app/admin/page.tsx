"use client";

/**
 * app/admin/page.tsx — BuildMind Admin Dashboard
 *
 * Phase 1 components (all data already exists in Supabase):
 *  ① User table + plan filter + billing status panel
 *  ② Plan override tool (wraps persistUserPlan via /api/admin/plan-override)
 *  ③ MRR snapshot (billing_status = 'active' users × $19)
 *  ④ Paystack webhook event log
 *  ⑤ AI quality monitor (extends app/admin/quality/)
 *  ⑥ Streak distribution histogram
 *  ⑦ Groq API usage table (ai_usage table)
 *  ⑧ Onboarding funnel visualisation
 *  ⑨ DAU / WAU chart (PostHog / Supabase mirror)
 *
 * Operator-tier gate trackers (plan.ts hardcoded rule):
 *  → Briefing open rate must be > 35%
 *  → Task completion must be > 55%
 *
 * Design: matches existing BuildMind design system
 * (Warm Obsidian + Celadon Green, Geist + DM Serif Display)
 */

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart2, Users, DollarSign, Brain, Activity, Shield, AlertTriangle, Webhook,
  RefreshCw, ChevronUp, ChevronDown, ArrowUpRight, TrendingUp, Zap,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Plan = "free" | "builder";
type BillingStatus = "active" | "canceled" | "processing" | "free";

interface AdminUser {
  id: string;
  email: string;
  plan: Plan;
  billing_status: BillingStatus;
  billing_reference: string | null;
  subscription_id: string | null;
  streak: number;
  last_seen: string | null;
  created_at: string;
  projects_count: number;
  ai_calls_this_month: number;
}

interface MRRData {
  mrr: number;
  active_builders: number;
  new_this_month: number;
  churned_this_month: number;
  trend: { date: string; mrr: number }[];
}

interface WebhookEvent {
  id: string;
  event: string;
  customer_email: string | null;
  amount: number | null;
  status: "success" | "failed" | "pending";
  received_at: string;
  reference: string | null;
}

interface StreakBucket {
  label: string;
  min: number;
  max: number;
  count: number;
}

interface AIUsageRow {
  user_id: string;
  email: string;
  month: string;
  count: number;
  plan: Plan;
}

interface FunnelStep {
  step: string;
  label: string;
  count: number;
  drop_pct: number | null;
}

interface ActivityPoint {
  date: string;
  dau: number;
  wau: number;
}

interface QualitySummary {
  total: number;
  overallPassRate: number | null;
  recentPassRate: number | null;
  qualityAlert: string | null;
}

interface DashboardPayload {
  users: AdminUser[];
  mrr: MRRData;
  webhooks: WebhookEvent[];
  streaks: StreakBucket[];
  ai_usage: AIUsageRow[];
  funnel: FunnelStep[];
  activity: ActivityPoint[];
  quality: QualitySummary;
  operator_gate: {
    briefing_open_rate: number;
    task_completion_rate: number;
    day: number;
  };
  last_updated: string;
}

// ─── Design tokens (mirrors globals.css) ──────────────────────────────────────

const T = {
  bg:      "var(--bm-bg)",
  bg2:     "var(--bm-bg2)",
  bg3:     "var(--bm-bg3)",
  bg4:     "var(--bm-bg4)",
  border:  "var(--bm-border)",
  border2: "var(--bm-border2)",
  text:    "var(--bm-text)",
  text2:   "var(--bm-text2)",
  text3:   "var(--bm-text3)",
  accent:  "var(--bm-accent)",
  accent2: "var(--bm-accent2)",
  accentDim: "var(--bm-accent-dim)",
  accentBd:  "var(--bm-accent-bd)",
  amber:   "var(--bm-amber)",
  red:     "var(--bm-red)",
  blue:    "var(--bm-blue)",
  rLg:     "var(--r-lg)",
  rMd:     "var(--r-md)",
  shadow:  "var(--shadow-md)",
};

// ─── Tiny helpers ─────────────────────────────────────────────────────────────

function fmt(n: number) { return n.toLocaleString(); }
function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });
}
function fmtTime(s: string) {
  return new Date(s).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
function ago(s: string | null) {
  if (!s) return "never";
  const diff = Date.now() - new Date(s).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── Primitives ───────────────────────────────────────────────────────────────

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: T.bg2, border: `1px solid ${T.border}`, borderRadius: T.rLg, ...style }}>
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 16 }}>
      {children}
    </div>
  );
}

function PlanBadge({ plan }: { plan: Plan }) {
  const isBuilder = plan === "builder";
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 5,
      background: isBuilder ? T.accentDim : T.bg4,
      color: isBuilder ? T.accent : T.text3,
      border: `1px solid ${isBuilder ? T.accentBd : T.border2}`,
      textTransform: "uppercase", letterSpacing: "0.06em",
    }}>
      {plan}
    </span>
  );
}

function StatusDot({ status }: { status: BillingStatus }) {
  const map: Record<BillingStatus, string> = {
    active: T.accent, canceled: T.red, processing: T.amber, free: T.text3,
  };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: T.text2 }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: map[status], display: "inline-block", flexShrink: 0 }} />
      {status}
    </span>
  );
}

function Spinner({ size = 13 }: { size?: number }) {
  return (
    <RefreshCw size={size} style={{ animation: "bm-spin 1s linear infinite", color: T.text3 }} />
  );
}

function MiniSparkline({ data, color = T.accent }: { data: number[]; color?: string }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const H = 36, W = data.length * 14;
  const pts = data.map((v, i) => `${i * 14 + 7},${H - Math.round((v / max) * (H - 4)) - 2}`).join(" ");
  return (
    <svg width={W} height={H} style={{ overflow: "visible" }}>
      <polyline fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" points={pts} opacity={0.8} />
    </svg>
  );
}

// ─── Gate tracker (Operator tier unlock) ──────────────────────────────────────

function OperatorGate({ gate }: { gate: DashboardPayload["operator_gate"] }) {
  const briefingOk = gate.briefing_open_rate >= 35;
  const taskOk = gate.task_completion_rate >= 55;
  const allGood = briefingOk && taskOk;
  const daysLeft = Math.max(0, 90 - gate.day);

  return (
    <Card style={{ padding: "18px 22px", border: `1px solid ${allGood ? T.accentBd : "rgba(232,160,32,0.25)"}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Shield size={14} color={allGood ? T.accent : T.amber} />
          <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>Operator Tier Gate</span>
        </div>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 6,
          background: allGood ? T.accentDim : "rgba(232,160,32,0.08)",
          color: allGood ? T.accent : T.amber,
          border: `1px solid ${allGood ? T.accentBd : "rgba(232,160,32,0.25)"}`,
        }}>
          Day {gate.day}/90 {allGood ? "✓ Unlocked" : daysLeft > 0 ? `(${daysLeft}d left)` : "Expired"}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {[
          { label: "Briefing open rate", value: gate.briefing_open_rate, threshold: 35, ok: briefingOk },
          { label: "Task completion rate", value: gate.task_completion_rate, threshold: 55, ok: taskOk },
        ].map(({ label, value, threshold, ok }) => (
          <div key={label} style={{ background: ok ? "rgba(74,184,176,0.04)" : "rgba(232,160,32,0.04)", border: `1px solid ${ok ? "rgba(74,184,176,0.15)" : "rgba(232,160,32,0.15)"}`, borderRadius: T.rMd, padding: "12px 14px" }}>
            <div style={{ fontSize: 10, color: T.text3, marginBottom: 6 }}>{label}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span style={{ fontSize: 20, fontWeight: 700, color: ok ? T.accent : T.amber }}>{value}%</span>
              <span style={{ fontSize: 10, color: T.text3 }}>of {threshold}%</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── MRR Snapshot ─────────────────────────────────────────────────────────────

function MRRSnapshot({ mrr }: { mrr: MRRData }) {
  const trend = mrr.trend.map(d => d.mrr);
  return (
    <Card style={{ padding: "18px 22px" }}>
      <SectionLabel>Revenue</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
        <div style={{ background: T.bg3, borderRadius: T.rMd, padding: "14px 16px", gridColumn: "span 1" }}>
          <div style={{ fontSize: 10, color: T.text3, marginBottom: 8 }}>MRR</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: T.accent, marginBottom: 10 }}>
            ${fmt(mrr.mrr)}
          </div>
          <MiniSparkline data={trend} />
        </div>
        {[
          { label: "Builder subscribers", value: fmt(mrr.active_builders), color: T.text },
          { label: "New this month", value: `+${mrr.new_this_month}`, color: T.accent },
          { label: "Churned this month", value: `${mrr.churned_this_month}`, color: mrr.churned_this_month > 0 ? T.red : T.text3 },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: T.bg3, borderRadius: T.rMd, padding: "14px 16px" }}>
            <div style={{ fontSize: 10, color: T.text3, marginBottom: 8 }}>{label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── DAU / WAU Chart ──────────────────────────────────────────────────────────

function ActivityChart({ data }: { data: ActivityPoint[] }) {
  if (!data.length) return null;
  const maxVal = Math.max(...data.flatMap(d => [d.dau, d.wau]), 1);
  const H = 80;
  const W_per = Math.max(20, Math.floor(600 / data.length));

  return (
    <Card style={{ padding: "18px 22px" }}>
      <SectionLabel>DAU / WAU — last 30 days</SectionLabel>
      <div style={{ overflowX: "auto" }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 3, minWidth: data.length * (W_per + 3), height: H + 20, paddingBottom: 20, position: "relative" }}>
          {data.map((d, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flex: "0 0 auto" }}>
              <div style={{ display: "flex", gap: 1, height: H }}>
                <div style={{ width: Math.floor(W_per / 2) - 1, background: T.accent, borderRadius: 2, height: Math.max(2, (d.dau / maxVal) * H), alignSelf: "flex-end" }} title={`DAU: ${d.dau}`} />
                <div style={{ width: Math.floor(W_per / 2) - 1, background: T.blue, borderRadius: 2, height: Math.max(2, (d.wau / maxVal) * H), alignSelf: "flex-end" }} title={`WAU: ${d.wau}`} />
              </div>
              <span style={{ fontSize: 8, color: T.text3 }}>{new Date(d.date).getDate()}</span>
            </div>
          ))}
        </div>
      </div>
      {/* Legend */}
      <div style={{ display: "flex", gap: 16, marginTop: 4 }}>
        {[{ color: T.accent, label: "DAU" }, { color: T.blue, label: "WAU" }].map(({ color, label }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: T.text2 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
            {label}
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Streak Histogram ─────────────────────────────────────────────────────────

function StreakHistogram({ buckets }: { buckets: StreakBucket[] }) {
  const max = Math.max(...buckets.map(b => b.count), 1);
  return (
    <Card style={{ padding: "18px 22px" }}>
      <SectionLabel>Streak distribution</SectionLabel>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 80 }}>
        {buckets.map((b) => (
          <div key={b.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flex: 1 }}>
            <div style={{ width: "100%", height: Math.max(4, (b.count / max) * 72), background: T.accent, borderRadius: 3, transition: "height 0.3s" }} title={`${b.label}: ${b.count}`} />
            <span style={{ fontSize: 9, color: T.text3 }}>{b.label}</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: T.text }}>{b.count}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Onboarding Funnel ────────────────────────────────────────────────────────

function OnboardingFunnel({ steps }: { steps: FunnelStep[] }) {
  const maxCount = Math.max(...steps.map(s => s.count), 1);
  return (
    <Card style={{ padding: "18px 22px" }}>
      <SectionLabel>Onboarding funnel</SectionLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {steps.map((s, i) => (
          <div key={i}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: T.text2 }}>{s.label}</span>
              <span style={{ fontSize: 11, color: T.text3 }}>{fmt(s.count)}</span>
            </div>
            <div style={{ background: T.bg3, borderRadius: 3, height: 6, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(s.count / maxCount) * 100}%`, background: s.drop_pct && s.drop_pct > 20 ? T.amber : T.accent, transition: "width 0.3s" }} />
            </div>
            {s.drop_pct !== null && <span style={{ fontSize: 9, color: T.text3, marginTop: 2, display: "block" }}>↓ {s.drop_pct}% drop</span>}
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Webhook Log ──────────────────────────────────────────────────────────────

function WebhookLog({ events }: { events: WebhookEvent[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? events : events.slice(0, 6);
  return (
    <Card style={{ padding: "18px 22px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <SectionLabel>Paystack webhook log</SectionLabel>
        <Webhook size={13} color={T.text3} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 1, overflowX: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 80px 90px", gap: 8, padding: "0 0 8px 0", borderBottom: `1px solid ${T.border}`, marginBottom: 6 }}>
          {["Event", "Email", "Amount", "Status", "Time"].map(h => (
            <div key={h} style={{ fontSize: 9, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</div>
          ))}
        </div>
        {visible.map(ev => (
          <div key={ev.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 80px 90px", gap: 8, padding: "8px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
            <span style={{ color: T.text2 }}>{ev.event}</span>
            <span style={{ color: T.text3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.customer_email || "—"}</span>
            <span style={{ color: T.text2 }}>{ev.amount ? `₦${fmt(ev.amount)}` : "—"}</span>
            <span style={{ color: ev.status === "success" ? T.accent : ev.status === "failed" ? T.red : T.amber, fontSize: 10, fontWeight: 600 }}>
              {ev.status}
            </span>
            <span style={{ color: T.text3, fontSize: 11 }}>{fmtTime(ev.received_at)}</span>
          </div>
        ))}
      </div>
      {events.length > 6 && (
        <button onClick={() => setExpanded(e => !e)} style={{ marginTop: 12, fontSize: 11, color: T.accent, background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 4, fontFamily: "inherit" }}>
          {expanded ? <><ChevronUp size={12} /> Show less</> : <><ChevronDown size={12} /> Show {events.length - 6} more</>}
        </button>
      )}
    </Card>
  );
}

// ─── AI Usage Table ───────────────────────────────────────────────────────────

function AIUsageTable({ rows }: { rows: AIUsageRow[] }) {
  const sorted = [...rows].sort((a, b) => b.count - a.count);
  const total = rows.reduce((s, r) => s + r.count, 0);
  const maxCount = Math.max(...rows.map(r => r.count), 1);

  return (
    <Card style={{ padding: "18px 22px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <SectionLabel>Groq API usage — this month</SectionLabel>
        <span style={{ fontSize: 11, color: T.text3 }}>{fmt(total)} total calls</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 60px 120px", gap: 8, padding: "0 0 8px 0", borderBottom: `1px solid ${T.border}`, marginBottom: 4 }}>
          {["Email", "Calls", "Plan", ""].map(h => (
            <div key={h} style={{ fontSize: 9, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</div>
          ))}
        </div>
        {sorted.slice(0, 10).map((row) => (
          <div key={row.user_id} style={{ display: "grid", gridTemplateColumns: "1fr 80px 60px 120px", gap: 8, padding: "8px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12, alignItems: "center" }}>
            <span style={{ color: T.text2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.email}</span>
            <span style={{ color: T.text }}>{fmt(row.count)}</span>
            <PlanBadge plan={row.plan} />
            <div style={{ background: T.bg3, borderRadius: 3, height: 4, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(row.count / maxCount) * 100}%`, background: T.accent }} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Quality Monitor (extends app/admin/quality/) ────────────────────────────

function QualityMonitor({ quality }: { quality: QualitySummary }) {
  const rate = quality.overallPassRate;
  const color = rate === null ? T.text3 : rate >= 80 ? T.accent : rate >= 60 ? T.amber : T.red;
  return (
    <Card style={{ padding: "18px 22px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <SectionLabel>AI quality monitor</SectionLabel>
        <a href="/admin/quality" style={{ fontSize: 11, color: T.accent, textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
          Full log <ArrowUpRight size={11} />
        </a>
      </div>
      {quality.qualityAlert && (
        <div style={{ display: "flex", gap: 8, padding: "10px 12px", borderRadius: T.rMd, background: "rgba(232,160,32,0.08)", border: "1px solid rgba(232,160,32,0.25)", color: T.amber, fontSize: 12, marginBottom: 14 }}>
          <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
          {quality.qualityAlert}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        {[
          { label: "Total evals", value: fmt(quality.total), color: T.text },
          { label: "Overall pass", value: rate !== null ? `${rate}%` : "—", color },
          { label: "Last 7d", value: quality.recentPassRate !== null ? `${quality.recentPassRate}%` : "—", color: quality.recentPassRate !== null ? (quality.recentPassRate >= 70 ? T.accent : T.red) : T.text3 },
        ].map(({ label, value, color: c }) => (
          <div key={label} style={{ background: T.bg3, borderRadius: T.rMd, padding: "12px 14px" }}>
            <div style={{ fontSize: 10, color: T.text3, marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: c }}>{value}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Plan Override Modal ──────────────────────────────────────────────────────

function PlanOverrideModal({
  user,
  onClose,
  onSuccess,
}: {
  user: AdminUser;
  onClose: () => void;
  onSuccess: (userId: string, newPlan: Plan) => void;
}) {
  const [targetPlan, setTargetPlan] = useState<Plan>(user.plan === "builder" ? "free" : "builder");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/plan-override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, plan: targetPlan }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? `HTTP ${res.status}`);
      }
      onSuccess(user.id, targetPlan);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        style={{ background: "var(--bm-bg2)", border: `1px solid ${T.border2}`, borderRadius: "var(--r-xl)", padding: "28px 28px 24px", width: 380, boxShadow: "var(--shadow-lg)" }}
        onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 6px 0", fontSize: 16, fontWeight: 600, color: T.text }}>Override plan</h3>
        <p style={{ margin: "0 0 18px 0", fontSize: 12, color: T.text2 }}>{user.email}</p>
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", marginBottom: 8, letterSpacing: "0.06em" }}>New plan</div>
          <div style={{ display: "flex", gap: 10 }}>
            {(["free", "builder"] as Plan[]).map(p => (
              <button
                key={p}
                onClick={() => setTargetPlan(p)}
                style={{
                  flex: 1, padding: "10px 12px", borderRadius: 8, border: `2px solid ${targetPlan === p ? T.accent : T.border}`,
                  background: targetPlan === p ? T.accentDim : T.bg3, color: targetPlan === p ? T.accent : T.text2,
                  fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s",
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        {error && (
          <div style={{ padding: "10px 12px", background: "rgba(220,38,38,0.1)", border: `1px solid ${T.red}`, borderRadius: 6, color: T.red, fontSize: 11, marginBottom: 16 }}>
            {error}
          </div>
        )}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "10px 0", borderRadius: 6, border: `1px solid ${T.border}`, background: "transparent", color: T.text2, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Cancel
          </button>
          <button onClick={submit} disabled={loading} style={{ flex: 1, padding: "10px 0", borderRadius: 6, border: "none", background: loading ? T.text3 : T.accent, color: "#000", fontSize: 12, fontWeight: 700, cursor: loading ? "default" : "pointer", fontFamily: "inherit", opacity: loading ? 0.6 : 1 }}>
            {loading ? <Spinner size={11} /> : "Apply"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── User Table ───────────────────────────────────────────────────────────────

function UserTable({ users, onOverride }: { users: AdminUser[]; onOverride: (u: AdminUser) => void }) {
  const [filter, setFilter] = useState<"all" | Plan>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const PAGE = 15;

  const filtered = users.filter(u => {
    if (filter !== "all" && u.plan !== filter) return false;
    if (search && !u.email.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const pages = Math.ceil(filtered.length / PAGE);
  const visible = filtered.slice(page * PAGE, (page + 1) * PAGE);

  return (
    <Card style={{ padding: "18px 22px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <SectionLabel>Users ({fmt(filtered.length)})</SectionLabel>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input type="text" placeholder="Search email..." value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} style={{
            fontSize: 11, padding: "6px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.bg3, color: T.text, fontFamily: "inherit",
          }} />
          <select value={filter} onChange={e => { setFilter(e.target.value as "all" | Plan); setPage(0); }} style={{
            fontSize: 11, padding: "6px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.bg3, color: T.text, fontFamily: "inherit", cursor: "pointer",
          }}>
            <option value="all">All plans</option>
            <option value="free">Free</option>
            <option value="builder">Builder</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 90px 80px 90px 60px 60px", gap: 8, padding: "0 0 8px 0", borderBottom: `1px solid ${T.border}`, marginBottom: 4 }}>
          {["Email", "Plan", "Billing", "Streak", "Last seen", "Projects", "API calls"].map(h => (
            <div key={h} style={{ fontSize: 9, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</div>
          ))}
        </div>
        {visible.map(u => (
          <div key={u.id} style={{ display: "grid", gridTemplateColumns: "1fr 70px 90px 80px 90px 60px 60px", gap: 8, padding: "10px 0", borderBottom: `1px solid ${T.border}`, fontSize: 11, alignItems: "center" }}>
            <span style={{ color: T.text2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</span>
            <PlanBadge plan={u.plan} />
            <StatusDot status={u.billing_status} />
            <span style={{ color: u.streak > 0 ? T.accent : T.text3 }}>{u.streak}d</span>
            <span style={{ color: T.text3, fontSize: 10 }}>{ago(u.last_seen)}</span>
            <span style={{ color: T.text2 }}>{u.projects_count}</span>
            <span style={{ color: T.text2 }}>{u.ai_calls_this_month}</span>
            <button onClick={() => onOverride(u)} style={{ padding: "4px 8px", borderRadius: 4, border: "none", background: T.accent, color: "#000", fontSize: 9, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              ⋯
            </button>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, justifyContent: "flex-end" }}>
          {page > 0 && <button onClick={() => setPage(p => p - 1)} style={{ fontSize: 11, padding: "4px 8px", borderRadius: 4, border: `1px solid ${T.border}`, background: "transparent", color: T.accent, cursor: "pointer", fontFamily: "inherit" }}>← Prev</button>}
          <span style={{ fontSize: 10, color: T.text3 }}>Page {page + 1} of {pages}</span>
          {page < pages - 1 && <button onClick={() => setPage(p => p + 1)} style={{ fontSize: 11, padding: "4px 8px", borderRadius: 4, border: `1px solid ${T.border}`, background: "transparent", color: T.accent, cursor: "pointer", fontFamily: "inherit" }}>Next →</button>}
        </div>
      )}
    </Card>
  );
}

// ─── Nav tabs ─────────────────────────────────────────────────────────────────

type Tab = "overview" | "users" | "revenue" | "ai" | "engagement";
const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "overview",   label: "Overview",   icon: BarChart2 },
  { id: "users",      label: "Users",      icon: Users },
  { id: "revenue",    label: "Revenue",    icon: DollarSign },
  { id: "ai",         label: "AI & Usage", icon: Brain },
  { id: "engagement", label: "Engagement", icon: Activity },
];

// ─── Mock data loader (replace with real API call) ────────────────────────────

async function fetchDashboard(): Promise<DashboardPayload> {
  const res = await fetch("/api/admin/dashboard");
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json?.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [overrideTarget, setOverrideTarget] = useState<AdminUser | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await fetchDashboard();
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handlePlanUpdated(userId: string, newPlan: Plan) {
    setData(d => d ? ({
      ...d,
      users: d.users.map(u => u.id === userId ? { ...u, plan: newPlan } : u),
    }) : d);
  }

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: "Geist, system-ui, sans-serif" }}>
      {/* Top bar */}
      <div style={{ borderBottom: `1px solid ${T.border}`, background: T.bg2, position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Admin Dashboard</h1>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={load} disabled={loading} style={{ padding: "6px 12px", fontSize: 11, borderRadius: 6, border: `1px solid ${T.border}`, background: "transparent", color: T.accent, cursor: loading ? "default" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4, opacity: loading ? 0.6 : 1 }}>
              <RefreshCw size={11} style={{ animation: loading ? "bm-spin 1s linear infinite" : "none" }} /> Refresh
            </button>
            <span style={{ fontSize: 10, color: T.text3 }}>Last: {data ? new Date(data.last_updated).toLocaleTimeString("en-GB") : "—"}</span>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 24px 60px" }}>
        {error && (
          <div style={{ padding: "14px 16px", background: "rgba(220,38,38,0.1)", border: `1px solid ${T.red}`, borderRadius: T.rLg, color: T.red, marginBottom: 20, fontSize: 12 }}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {loading && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "60px" }}>
            <Spinner size={16} />
            <span style={{ color: T.text2 }}>Loading dashboard...</span>
          </div>
        )}

        {!loading && data && (
          <>
            {/* Tabs */}
            <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${T.border}`, marginBottom: 28 }}>
              {TABS.map(tab => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    style={{
                      padding: "12px 16px", border: "none", background: "none", fontSize: 13, fontWeight: isActive ? 600 : 500, color: isActive ? T.accent : T.text2,
                      borderBottom: `2px solid ${isActive ? T.accent : "transparent"}`, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6,
                    }}
                  >
                    <Icon size={14} /> {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Content */}
            {activeTab === "overview" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <OperatorGate gate={data.operator_gate} />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
                  <QualityMonitor quality={data.quality} />
                  <StreakHistogram buckets={data.streaks} />
                </div>
                <ActivityChart data={data.activity} />
              </motion.div>
            )}

            {activeTab === "users" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <UserTable users={data.users} onOverride={setOverrideTarget} />
              </motion.div>
            )}

            {activeTab === "revenue" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <MRRSnapshot mrr={data.mrr} />
                <WebhookLog events={data.webhooks} />
              </motion.div>
            )}

            {activeTab === "ai" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <QualityMonitor quality={data.quality} />
                <AIUsageTable rows={data.ai_usage} />
              </motion.div>
            )}

            {activeTab === "engagement" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <ActivityChart data={data.activity} />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
                  <OnboardingFunnel steps={data.funnel} />
                  <StreakHistogram buckets={data.streaks} />
                </div>
              </motion.div>
            )}
          </>
        )}
      </div>

      {/* Plan override modal */}
      <AnimatePresence>
        {overrideTarget && (
          <PlanOverrideModal
            user={overrideTarget}
            onClose={() => setOverrideTarget(null)}
            onSuccess={handlePlanUpdated}
          />
        )}
      </AnimatePresence>

      <style>{`
        @keyframes bm-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
