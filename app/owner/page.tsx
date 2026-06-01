"use client";

/**
 * app/owner/page.tsx — Owner Command Panel
 *
 * Only accessible if the authenticated user has is_admin = true in the profiles
 * table (verified server-side via /api/system/admin-check). Normal users get a
 * 404-style redirect.
 *
 * Features:
 * - Plan override (test any plan as owner)
 * - All features force-enabled
 * - Achievement stats editor
 * - Live DB overview (user count, project count, recent signups)
 * - All pages unlocked for testing
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { getPlan, setStoredPlan, type Plan, PLAN_LIMITS } from "@/lib/plan";
import { getAchievementStats, updateAchievementStats, getTotalXP, checkAndUnlockAchievements, getUnlocked } from "@/lib/achievements";
import { getFunnelSummary, getDropOffStep, getPageViews, getRecentEvents } from "@/lib/onboarding-analytics";

type Tab = "plans" | "features" | "achievements" | "analytics" | "pages";
type AIProviderInfo = { provider: string; model: string; configured: boolean };
type EnvStatus = {
  vars: Record<string, boolean>;
  aiProviders: Record<string, AIProviderInfo[]>;
};

const SECTION: React.CSSProperties = {
  background: "#0a0a0a", border: "1px solid #1e1e1e", borderRadius: 14, padding: "20px",
  marginBottom: 16,
};
const LABEL: React.CSSProperties = { fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "#555", marginBottom: 6, fontWeight: 600 };
const VALUE: React.CSSProperties = { fontSize: 22, fontWeight: 800, color: "#fff" };
const BTN = (active?: boolean, color?: string): React.CSSProperties => ({
  padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
  fontFamily: "inherit", border: `1px solid ${active ? (color ?? "#7c3aed") : "#222"}`,
  background: active ? `${color ?? "#7c3aed"}22` : "#111",
  color: active ? (color ?? "#a78bfa") : "#666", transition: "all 0.15s",
});

function StatCard({ label, value, color = "#a78bfa" }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ background: "#0f0f0f", border: "1px solid #1a1a1a", borderRadius: 12, padding: "16px", textAlign: "center" }}>
      <div style={{ ...VALUE, color, fontSize: 20 }}>{value}</div>
      <div style={{ ...LABEL, marginBottom: 0 }}>{label}</div>
    </div>
  );
}

export default function OwnerPanel() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("plans");
  const [plan, setPlan] = useState<Plan>("free");
  const [stats, setStats] = useState(getAchievementStats());
  const [xp, setXp] = useState(getTotalXP());
  const [unlocked, setUnlocked] = useState(getUnlocked());
  const [dbStats, setDbStats] = useState<{ users: number; projects: number; signups_today: number } | null>(null);
  const [envStatus, setEnvStatus] = useState<EnvStatus>({ vars: {}, aiProviders: {} });

  // Auth check — server-side only via /api/system/admin-check.
  // The is_admin flag is read from the profiles table using the service-role key.
  // No client-visible env var is involved.
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch("/api/system/admin-check");
        const json = await res.json();
        if (!json.isAdmin) {
          setAuthorized(false);
          setTimeout(() => router.replace("/today"), 2000);
        } else {
          setAuthorized(true);
          const sb = createClient();
          setPlan(getPlan());
          loadEnvStatus();
          loadDbStats(sb);
        }
      } catch {
        setAuthorized(false);
        router.replace("/today");
      }
    };
    void check();
  }, [router]);

  const loadEnvStatus = async () => {
    try {
      const res = await fetch("/api/system/env-status");
      const data = await res.json();
      setEnvStatus({
        vars: data.vars ?? {},
        aiProviders: data.aiProviders ?? {},
      });
    } catch {}
  };

  const loadDbStats = async (sb: ReturnType<typeof createClient>) => {
    try {
      const [{ count: users }, { count: projects }] = await Promise.all([
        sb.from("profiles").select("*", { count: "exact", head: true }),
        sb.from("projects").select("*", { count: "exact", head: true }),
      ]);

      // Signups today
      const today = new Date().toISOString().split("T")[0];
      const { count: signups_today } = await sb
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .gte("created_at", `${today}T00:00:00`);

      setDbStats({ users: users ?? 0, projects: projects ?? 0, signups_today: signups_today ?? 0 });
    } catch {}
  };

  const applyPlan = (p: Plan) => {
    setStoredPlan(p);
    setPlan(p);
    window.dispatchEvent(new Event("bm_plan_changed"));
  };

  const applyStatUpdate = (partial: Partial<typeof stats>) => {
    updateAchievementStats(partial);
    const freshStats = getAchievementStats();
    setStats(freshStats);
    const newBadges = checkAndUnlockAchievements();
    if (newBadges.length > 0) {
      setUnlocked(getUnlocked());
      setXp(getTotalXP());
    }
  };

  if (authorized === null) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#000", color: "#666", fontFamily: "system-ui" }}>
        Verifying identity...
      </div>
    );
  }

  if (authorized === false) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#000", fontFamily: "system-ui" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40 }}>🔒</div>
          <div style={{ color: "#ef4444", fontSize: 14, marginTop: 12 }}>Access denied. Redirecting...</div>
        </div>
      </div>
    );
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: "plans", label: "⚡ Plans" },
    { id: "achievements", label: "🏆 Badges" },
    { id: "analytics", label: "📊 Analytics" },
    { id: "pages", label: "🗂️ Pages" },
    { id: "features", label: "🔧 Env" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#000", color: "#fff", fontFamily: "system-ui, sans-serif", padding: "24px 20px", maxWidth: 860, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28, paddingBottom: 20, borderBottom: "1px solid #111" }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: "#1a0f3d", border: "2px solid #7c3aed", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>👑</div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>Owner Panel</div>
          <div style={{ fontSize: 11, color: "#555" }}>You're the admin. All systems visible.</div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <div style={{ fontSize: 9, textTransform: "uppercase", color: "#7c3aed", letterSpacing: "0.12em", fontWeight: 700 }}>🟢 OWNER MODE ACTIVE</div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ ...BTN(tab === t.id), padding: "8px 14px" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Plans tab ── */}
      {tab === "plans" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div style={SECTION}>
            <div style={LABEL}>Current Plan (Local Override)</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(["free", "builder"] as Plan[]).map(p => (
                <button key={p} onClick={() => applyPlan(p)}
                  style={BTN(plan === p, p === "builder" ? "var(--bm-accent)" : "#555")}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                  {plan === p && " active"}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: "#444", marginTop: 10 }}>
              Changes are local-only (localStorage). Other users are unaffected.
            </div>
          </div>

          <div style={SECTION}>
            <div style={LABEL}>Current Plan Limits</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {Object.entries(PLAN_LIMITS[plan]).map(([key, val]) => (
                <div key={key} style={{ fontSize: 11, color: "#888", display: "flex", justifyContent: "space-between", padding: "6px 10px", background: "#111", borderRadius: 6 }}>
                  <span style={{ color: "#555" }}>{key}</span>
                  <span style={{ color: typeof val === "boolean" ? (val ? "#4ade80" : "#ef4444") : "#a78bfa", fontWeight: 600 }}>
                    {typeof val === "boolean" ? (val ? "on" : "off") : val === -1 ? "unlimited" : String(val)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Achievements tab ── */}
      {tab === "achievements" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 16 }}>
            <StatCard label="Total XP" value={xp.toLocaleString()} />
            <StatCard label="Badges Unlocked" value={`${unlocked.length}/${26}`} color="#fbbf24" />
            <StatCard label="Streak" value={`${stats.streak}d`} color="#f97316" />
          </div>

          <div style={SECTION}>
            <div style={LABEL}>Simulate Stats (triggers real badge unlocks)</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                { label: "Streak days", key: "streak" as const, value: stats.streak },
                { label: "Tasks done", key: "checkInsDone" as const, value: stats.checkInsDone },
                { label: "AI messages", key: "aiMessages" as const, value: stats.aiMessages },
                { label: "Reflections", key: "reflectionsLogged" as const, value: stats.reflectionsLogged },
                { label: "Projects", key: "projectsCreated" as const, value: stats.projectsCreated },
                { label: "Days active", key: "daysActive" as const, value: stats.daysActive },
              ].map(({ label, key, value }) => (
                <div key={key} style={{ background: "#111", borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ fontSize: 10, color: "#555", marginBottom: 6 }}>{label}: <strong style={{ color: "#888" }}>{value}</strong></div>
                  <div style={{ display: "flex", gap: 4 }}>
                    {[1, 5, 10, 50].map(n => (
                      <button key={n} onClick={() => applyStatUpdate({ [key]: value + n })}
                        style={{ padding: "3px 8px", borderRadius: 5, fontSize: 10, cursor: "pointer", fontFamily: "inherit", background: "#1a1a1a", border: "1px solid #2a2a2a", color: "#666" }}>
                        +{n}
                      </button>
                    ))}
                    <button onClick={() => applyStatUpdate({ [key]: 0 })}
                      style={{ padding: "3px 8px", borderRadius: 5, fontSize: 10, cursor: "pointer", fontFamily: "inherit", background: "#1a0000", border: "1px solid #400000", color: "#666" }}>
                      0
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
              {[
                { label: "Ventures viewed", key: "venturesViewed" as const },
                { label: "Break used", key: "breakMyStartupUsed" as const },
                { label: "Report viewed", key: "reportViewed" as const },
                { label: "Share used", key: "shareUsed" as const },
                { label: "Plan upgraded", key: "planUpgraded" as const },
              ].map(({ label, key }) => (
                <button key={key}
                  onClick={() => applyStatUpdate({ [key]: !stats[key] })}
                  style={BTN(!!stats[key], "#4ade80")}>
                  {stats[key] ? "on" : "off"} {label}
                </button>
              ))}
            </div>
          </div>

          <div style={SECTION}>
            <div style={LABEL}>Unlocked Badges</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {unlocked.map(u => (
                <div key={u.id} style={{ padding: "4px 10px", borderRadius: 20, background: "#1a1a1a", border: "1px solid #2a2a2a", fontSize: 11, color: "#888" }}>
                  {u.id}
                </div>
              ))}
              {unlocked.length === 0 && <div style={{ fontSize: 12, color: "#333" }}>No badges yet - simulate some stats above.</div>}
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Analytics tab ── */}
      {tab === "analytics" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {dbStats ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 16 }}>
              <StatCard label="Total Users" value={dbStats.users} color="#60a5fa" />
              <StatCard label="Total Projects" value={dbStats.projects} color="#4ade80" />
              <StatCard label="Signups Today" value={dbStats.signups_today} color="#fbbf24" />
            </div>
          ) : (
          <div style={{ color: "#444", fontSize: 13, marginBottom: 20 }}>Loading DB stats...</div>
          )}

          {/* Funnel */}
          <div style={SECTION}>
            <div style={LABEL}>Your Onboarding Funnel (this device)</div>
            {(() => {
              const dropOff = getDropOffStep();
              return (
                <div style={{ fontSize: 11, color: "#f87171", marginBottom: 12, padding: "8px 12px", background: "rgba(248,113,113,0.06)", borderRadius: 8, border: "1px solid rgba(248,113,113,0.15)" }}>
                  📍 {dropOff.label}
                </div>
              );
            })()}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {getFunnelSummary().map((step, i, arr) => {
                const prev = i > 0 ? arr[i - 1] : null;
                const dropped = prev?.reached && !step.reached;
                return (
                  <div key={step.step} style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                    borderRadius: 8, background: step.reached ? "rgba(74,222,128,0.05)" : dropped ? "rgba(248,113,113,0.05)" : "#0a0a0a",
                    border: `1px solid ${step.reached ? "rgba(74,222,128,0.15)" : dropped ? "rgba(248,113,113,0.15)" : "#111"}`,
                  }}>
                    <span style={{ fontSize: 14 }}>{step.icon}</span>
                    <span style={{ flex: 1, fontSize: 12, color: step.reached ? "#4ade80" : dropped ? "#f87171" : "#333" }}>
                      {step.label}
                    </span>
                    <span style={{ fontSize: 10, color: step.reached ? "#4ade80" : "#333", fontWeight: 600 }}>
                      {step.reached ? (step.ts ? new Date(step.ts).toLocaleDateString() : "reached") : dropped ? "dropped here" : "-"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top pages */}
          <div style={SECTION}>
            <div style={LABEL}>Most Visited Pages (this device)</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {getPageViews().slice(0, 10).map(pv => (
                <div key={pv.path} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", background: "#0f0f0f", borderRadius: 6 }}>
                  <span style={{ fontSize: 11, color: "#888", fontFamily: "monospace" }}>{pv.path}</span>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <span style={{ fontSize: 10, color: "#555" }}>last: {new Date(pv.lastVisit).toLocaleDateString()}</span>
                    <span style={{ fontSize: 12, color: "#a78bfa", fontWeight: 700 }}>{pv.count}x</span>
                  </div>
                </div>
              ))}
              {getPageViews().length === 0 && <div style={{ fontSize: 12, color: "#333" }}>No page views tracked yet.</div>}
            </div>
          </div>

          {/* Quick Links */}
          <div style={SECTION}>
            <div style={LABEL}>Quick Links</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {[
                { label: "Supabase Dashboard", url: "https://supabase.com/dashboard" },
                { label: "Vercel Deployments", url: "https://vercel.com/dashboard" },
                { label: "Paystack", url: "https://dashboard.paystack.com" },
              ].map(l => (
                <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer"
                  style={{ padding: "8px 14px", borderRadius: 8, background: "#111", border: "1px solid #222", color: "#888", fontSize: 12, textDecoration: "none" }}>
                  {l.label}
                </a>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Pages tab ── */}
      {tab === "pages" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div style={SECTION}>
            <div style={LABEL}>All Pages (Owner-unlocked)</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
              {[
                { href: "/today", label: "⚡ Today" },
                { href: "/overview", label: "🗺️ Overview" },
                { href: "/projects", label: "📁 Projects" },
                { href: "/ventures", label: "🏛️ Ventures" },
                { href: "/ai-coach", label: "🤖 AI Coach" },
                { href: "/break-my-startup", label: "💀 Break Startup" },
                { href: "/reports", label: "📊 Reports" },
                { href: "/startup-kit", label: "💡 Startup Kit" },
                { href: "/achievements", label: "🏆 Achievements" },
                { href: "/explore", label: "🔭 Explore" },
                { href: "/upgrade", label: "💳 Upgrade" },
                { href: "/settings", label: "⚙️ Settings" },
                { href: "/onboarding", label: "🚪 Onboarding" },
                { href: "/", label: "🌐 Landing" },
              ].map(p => (
                <a key={p.href} href={p.href}
                  style={{ display: "block", padding: "10px 14px", background: "#0f0f0f", border: "1px solid #1a1a1a", borderRadius: 10, color: "#888", fontSize: 12, textDecoration: "none", transition: "all 0.15s" }}
                  onMouseEnter={e => { (e.target as HTMLElement).style.borderColor = "#3b1f7a"; (e.target as HTMLElement).style.color = "#a78bfa"; }}
                  onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = "#1a1a1a"; (e.target as HTMLElement).style.color = "#888"; }}>
                  {p.label}
                </a>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Env tab ── */}
      {tab === "features" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div style={SECTION}>
            <div style={LABEL}>Environment Variables Status</div>
            {Object.keys(envStatus.vars).length === 0 ? (
              <div style={{ fontSize: 12, color: "#444" }}>Loading env status...</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {Object.entries(envStatus.vars).map(([key, present]) => (
                  <div key={key} style={{ padding: "8px 12px", background: "#111", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 11, color: "#666", fontFamily: "monospace" }}>{key}</span>
                    <span style={{ fontSize: 12, color: present ? "#4ade80" : "#ef4444" }}>{present ? "Set" : "Missing"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={SECTION}>
            <div style={LABEL}>AI Provider Rotation</div>
            {Object.keys(envStatus.aiProviders).length === 0 ? (
              <div style={{ fontSize: 12, color: "#444" }}>No AI providers configured.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {Object.entries(envStatus.aiProviders).map(([role, providers]) => (
                  <div key={role} style={{ background: "#111", border: "1px solid #1d1d1d", borderRadius: 10, padding: "10px 12px" }}>
                    <div style={{ fontSize: 10, color: "#777", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, marginBottom: 8 }}>{role}</div>
                    {providers.length === 0 ? (
                      <div style={{ fontSize: 12, color: "#444" }}>No configured providers in this chain.</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {providers.map((p, i) => (
                          <div key={`${role}-${p.provider}-${p.model}-${i}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                            <span style={{ fontSize: 12, color: "#a78bfa", fontWeight: 700 }}>{i + 1}. {p.provider}</span>
                            <span style={{ fontSize: 11, color: "#888", fontFamily: "monospace", textAlign: "right", overflowWrap: "anywhere" }}>{p.model}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
