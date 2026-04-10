"use client";

import { FormEvent, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { ensureUserProfile, getCurrentUser } from "@/lib/buildmind";
import { FEATURES } from "@/lib/features";
import { getPlan, PLAN_NAMES, PLAN_PRICES, setStoredPlan } from "@/lib/plan";

type Tab = "profile" | "account" | "notifications" | "ai" | "billing";

const inputStyle = {
  background:"var(--bm-bg3)", border:"1px solid var(--bm-border)",
  borderRadius: 7, padding: "10px 13px", fontSize: 13, color:"var(--bm-text2)",
  outline: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box" as const,
  transition: "border-color 0.15s",
};

const TABS: { id: Tab; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "account", label: "Account" },
  ...(FEATURES.notifications ? [{ id: "notifications" as Tab, label: "Notifications" }] : []),
  { id: "billing", label: "Billing" },
  { id: "ai", label: "AI Usage" },
];

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <motion.button
      onClick={() => onChange(!checked)}
      style={{ width: 40, height: 22, borderRadius: 11, background: checked ? "#6366f1" : "#1c1c1c", border:"1px solid var(--bm-border2)", position: "relative", cursor: "pointer", flexShrink: 0, transition: "background 0.2s" }}>
      <motion.div
        animate={{ x: checked ? 19 : 2 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff", position: "absolute", top: 2 }} />
    </motion.button>
  );
}

// ─── Cancellation prevention flow ────────────────────────────────────────────
type CancelStep = "idle" | "confirm" | "pause_offer" | "reason" | "final";

const CANCEL_REASONS = [
  "Too expensive right now",
  "Not using it enough",
  "Missing a feature I need",
  "Switching to something else",
  "Just taking a break",
  "Other",
];

function BillingTab() {
  const [plan, setPlan] = useState(getPlan());
  const isPaid = plan !== "free";
  const [statusLoading, setStatusLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<"" | "pause" | "cancel">("");
  const [actionError, setActionError] = useState("");
  const [cancelStep, setCancelStep] = useState<CancelStep>("idle");
  const [pauseChosen, setPauseChosen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [streak] = useState(() => {
    if (typeof window === "undefined") return 0;
    return Number(localStorage.getItem("bm_streak") ?? "0");
  });
  const [tasksDone] = useState(() => {
    if (typeof window === "undefined") return 0;
    return Number(localStorage.getItem("bm_tasks_done") ?? "0");
  });

  useEffect(() => {
    const loadBilling = async () => {
      try {
        const res = await fetch("/api/billing/status", { cache: "no-store" });
        const payload = (await res.json().catch(() => null)) as { ok?: boolean; plan?: "free" | "builder" } | null;
        if (res.ok && payload?.ok && payload.plan) {
          setPlan(payload.plan);
          setStoredPlan(payload.plan);
        }
      } finally {
        setStatusLoading(false);
      }
    };
    void loadBilling();
  }, []);

  const runBillingAction = async (mode: "pause" | "cancel", reason?: string) => {
    setActionError("");
    setActionLoading(mode);
    try {
      const res = await fetch("/api/billing/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, reason }),
      });
      const payload = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !payload?.ok) {
        throw new Error(payload?.error ?? "Billing update failed.");
      }

      if (mode === "cancel") {
        setStoredPlan("free");
        setPlan("free");
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Billing update failed.");
      throw err;
    } finally {
      setActionLoading("");
    }
  };

  const card = { background:"var(--bm-bg2)", border:"1px solid var(--bm-border)", borderRadius: 10, padding: "22px 24px" };

  if (!isPaid && !statusLoading) {
    return (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 500, color: "#fff", marginBottom: 8 }}>Current plan</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <span style={{ fontSize: 24, fontWeight: 600, color:"var(--bm-text)" }}>Starter</span>
            <span style={{ fontSize: 13, color:"var(--bm-text4)" }}>$0 / month</span>
          </div>
          <div style={{ fontSize: 12, color:"var(--bm-text3)", lineHeight: 1.7, marginBottom: 20 }}>
            {"You're on the free plan. Upgrade to Builder ($19/mo) to unlock unlimited AI messages, weekly progress reports, startup kit generation, and outcome learning."}
          </div>
          <a href="/upgrade" style={{ display: "inline-block", background: "#6366f1", color: "#fff", fontWeight: 600, fontSize: 13, padding: "10px 20px", borderRadius: 8, textDecoration: "none" }}>
            Upgrade to Builder →
          </a>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Current plan card */}
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 500, color: "#fff", marginBottom: 8 }}>Current plan</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <span style={{ fontSize: 24, fontWeight: 600, color:"var(--bm-text)" }}>{PLAN_NAMES[plan]}</span>
          <span style={{ fontSize: 13, color:"var(--bm-text4)" }}>{PLAN_PRICES[plan]} / month</span>
          <span style={{ fontSize: 10, background: "rgba(99,102,241,0.12)", color: "#818cf8", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 99, padding: "2px 8px" }}>Active</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20, padding: "14px 0", borderTop: "1px solid #111", borderBottom: "1px solid #111" }}>
          {[
            { label: "Day streak", value: streak, color: "#f59e0b", icon: "🔥" },
            { label: "Tasks done", value: tasksDone, color: "#10b981", icon: "✅" },
            { label: "Plan month", value: 1, color: "#6366f1", icon: "📅" },
          ].map((stat) => (
            <div key={stat.label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 600, color: stat.color }}>{stat.icon} {stat.value}</div>
              <div style={{ fontSize: 10, color:"var(--bm-text4)", marginTop: 3 }}>{stat.label}</div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 12, color:"var(--bm-text3)", marginBottom: 16 }}>
          Next billing date: {new Date(Date.now() + 30 * 86400000).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
        </div>

        {cancelStep === "idle" && (
          <button onClick={() => setCancelStep("confirm")}
            style={{ background: "transparent", border:"1px solid var(--bm-border2)", color:"var(--bm-text3)", fontSize: 12, padding: "7px 14px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit" }}>
            Cancel plan
          </button>
        )}
      </div>

      {/* Step 1: Confirm */}
      <AnimatePresence>
        {cancelStep === "confirm" && (
          <motion.div key="confirm" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{ ...card, borderColor: "rgba(239,68,68,0.15)", background: "rgba(239,68,68,0.03)" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 8 }}>{"Before you go — here's what you'll lose"}</div>

            {streak > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)", borderRadius: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 22 }}>🔥</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#fbbf24" }}>{streak}-day streak</div>
                  <div style={{ fontSize: 11, color: "#78716c" }}>This gets wiped on cancellation</div>
                </div>
              </div>
            )}

            {tasksDone > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.15)", borderRadius: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 22 }}>✅</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#34d399" }}>{tasksDone} execution tasks completed</div>
                  <div style={{ fontSize: 11, color: "#4b5563" }}>Your progress history is tied to your active plan</div>
                </div>
              </div>
            )}

            <div style={{ fontSize: 12, color:"var(--bm-text3)", marginBottom: 20, lineHeight: 1.7 }}>
              Cancelling removes access to AI Coach, weekly reports, startup kit tools, and outcome tracking.
              Your account data is kept for 90 days if you change your mind.
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setCancelStep("pause_offer")}
                style={{ flex: 1, background: "transparent", border:"1px solid var(--bm-border2)", color: "#f87171", fontSize: 12, padding: "9px 14px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit" }}>
                Continue cancelling
              </button>
              <button onClick={() => setCancelStep("idle")}
                style={{ flex: 1, background: "#fff", color: "#000", fontWeight: 600, fontSize: 12, padding: "9px 14px", borderRadius: 7, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                Keep my plan
              </button>
            </div>
          </motion.div>
        )}

        {/* Step 2: Pause offer */}
        {cancelStep === "pause_offer" && !pauseChosen && (
          <motion.div key="pause" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{ ...card, borderColor: "rgba(99,102,241,0.2)", background: "rgba(99,102,241,0.03)" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 4 }}>Want to pause instead?</div>
            <div style={{ fontSize: 12, color:"var(--bm-text3)", marginBottom: 20, lineHeight: 1.7 }}>
              Pause your plan for 30 days — no charge, no access lost, streak preserved.
              Resume anytime. This is free to do once per year.
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              {[
                { title: "Pause 30 days", items: ["✓ No charge this month", "✓ Streak preserved", "✓ All data kept", "✓ Resumes automatically"], color: "#4ade80", bg: "rgba(74,222,128,0.04)", border: "rgba(74,222,128,0.12)" },
                { title: "Cancel now", items: ["✗ Streak lost", "✗ No AI access", "✗ No weekly report", "✗ Re-subscribe to restart"], color:"var(--bm-text3)", bg: "#0a0a0a", border: "rgba(239,68,68,0.1)" },
              ].map((col) => (
                <div key={col.title} style={{ padding: 14, background: col.bg, border: `1px solid ${col.border}`, borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color:"var(--bm-text3)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>{col.title}</div>
                  {col.items.map((item) => (
                    <div key={item} style={{ fontSize: 12, color: col.color, lineHeight: 1.8 }}>{item}</div>
                  ))}
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => {
                void runBillingAction("pause", cancelReason || undefined)
                  .then(() => setPauseChosen(true))
                  .catch(() => {});
              }}
                disabled={actionLoading === "pause"}
                style={{ flex: 1, background: "#6366f1", color: "#fff", fontWeight: 600, fontSize: 13, padding: "10px 14px", borderRadius: 7, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                {actionLoading === "pause" ? "Pausing..." : "Pause for 30 days"}
              </button>
              <button onClick={() => setCancelStep("reason")}
                style={{ flex: 1, background: "transparent", border:"1px solid var(--bm-border2)", color:"var(--bm-text3)", fontSize: 12, padding: "10px 14px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit" }}>
                No, cancel anyway
              </button>
            </div>
          </motion.div>
        )}

        {cancelStep === "pause_offer" && pauseChosen && (
          <motion.div key="paused" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
            style={{ ...card, textAlign: "center", borderColor: "rgba(99,102,241,0.2)" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⏸️</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 8 }}>Plan paused for 30 days</div>
            <div style={{ fontSize: 12, color:"var(--bm-text3)", lineHeight: 1.7 }}>
              {"Your streak is safe. No charge this billing cycle. Your plan resumes automatically on "}
              {new Date(Date.now() + 30 * 86400000).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}.
              {" You can still log in and view your history."}
            </div>
            <button onClick={() => setCancelStep("idle")}
              style={{ marginTop: 20, background: "#fff", color: "#000", fontWeight: 600, fontSize: 13, padding: "10px 20px", borderRadius: 7, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
              Got it →
            </button>
          </motion.div>
        )}

        {/* Step 3: Reason */}
        {cancelStep === "reason" && (
          <motion.div key="reason" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={card}>
            <div style={{ fontSize: 14, fontWeight: 500, color: "#fff", marginBottom: 4 }}>One last thing — why are you cancelling?</div>
            <div style={{ fontSize: 12, color:"var(--bm-text3)", marginBottom: 16 }}>This takes 5 seconds and genuinely helps improve the product.</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
              {CANCEL_REASONS.map((reason) => (
                <button key={reason} onClick={() => setCancelReason(reason)}
                  style={{ textAlign: "left", padding: "10px 14px", background: cancelReason === reason ? "rgba(99,102,241,0.1)" : "#0a0a0a", border: `1px solid ${cancelReason === reason ? "rgba(99,102,241,0.3)" : "#1c1c1c"}`, borderRadius: 7, color: cancelReason === reason ? "#818cf8" : "#888", fontSize: 13, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
                  {cancelReason === reason ? "● " : "○ "}{reason}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => {
                if (!cancelReason) return;
                void runBillingAction("cancel", cancelReason)
                  .then(() => setCancelStep("final"))
                  .catch(() => {});
              }}
                disabled={!cancelReason || actionLoading === "cancel"}
                style={{ flex: 1, background: cancelReason ? "#f87171" : "#222", color: cancelReason ? "#fff" : "#555", fontWeight: 600, fontSize: 13, padding: "10px 14px", borderRadius: 7, border: "none", cursor: cancelReason ? "pointer" : "default", fontFamily: "inherit", transition: "all 0.15s" }}>
                {actionLoading === "cancel" ? "Cancelling..." : "Confirm cancellation"}
              </button>
              <button onClick={() => setCancelStep("idle")}
                style={{ background: "transparent", border:"1px solid var(--bm-border2)", color:"var(--bm-text3)", fontSize: 12, padding: "10px 14px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit" }}>
                Go back
              </button>
            </div>
          </motion.div>
        )}

        {/* Final */}
        {cancelStep === "final" && (
          <motion.div key="final" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
            style={{ ...card, textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>👋</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 8 }}>Cancellation confirmed</div>
            <div style={{ fontSize: 12, color:"var(--bm-text3)", lineHeight: 1.7, marginBottom: 20 }}>
              {"Your plan is cancelled. You have Builder access until the end of this billing period. Your data is kept for 90 days — you can resubscribe anytime to pick up where you left off."}
              {cancelReason === "Too expensive right now" && (
                <span style={{ display: "block", marginTop: 10, color: "#818cf8" }}>
                  {"If budget is the issue — we have a lower-cost tier coming soon. We'll email you when it's live."}
                </span>
              )}
              {cancelReason === "Missing a feature I need" && (
                <span style={{ display: "block", marginTop: 10, color: "#818cf8" }}>
                  {"We read every cancellation reason. Reply to any BuildMind email to tell us what was missing — it goes straight to the founder."}
                </span>
              )}
            </div>
            <a href="/dashboard"
              style={{ display: "inline-block", background:"var(--bm-bg3)", border:"1px solid var(--bm-border2)", color:"var(--bm-text2)", fontSize: 13, padding: "10px 20px", borderRadius: 7, textDecoration: "none" }}>
              Back to dashboard
            </a>
          </motion.div>
        )}
      </AnimatePresence>
      {actionError ? (
        <div style={{ fontSize: 12, color: "#f87171" }}>{actionError}</div>
      ) : null}
    </motion.div>
  );
}

// ─── Main settings page ───────────────────────────────────────────────────────
export default function SettingsPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("profile");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [notifyMilestone, setNotifyMilestone] = useState(true);
  const [notifyTask, setNotifyTask] = useState(true);
  const [aiUsage, setAiUsage] = useState(0);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"ok" | "err">("ok");

  const msg = (text: string, type: "ok" | "err" = "ok") => {
    setMessage(text); setMessageType(type);
    setTimeout(() => setMessage(""), 3000);
  };

  useEffect(() => {
    if (!FEATURES.notifications && tab === "notifications") setTab("profile");
    const load = async () => {
      try {
        const user = await getCurrentUser();
        if (!user) return;
        await ensureUserProfile(user);
        setEmail(user.email ?? "");
        setAvatarUrl((user.user_metadata?.avatar_url as string | undefined) ?? "");
        const { data: profile } = await supabase.from("users").select("full_name").eq("id", user.id).single();
        setFullName((profile as { full_name?: string } | null)?.full_name ?? "");
        const { data: settings } = await supabase.from("users").select("notify_milestone,notify_task").eq("id", user.id).single();
        const s = settings as { notify_milestone?: boolean; notify_task?: boolean } | null;
        setNotifyMilestone(Boolean(s?.notify_milestone ?? true));
        setNotifyTask(Boolean(s?.notify_task ?? true));
        const d = new Date();
        const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
        const { data: usage } = await supabase.from("ai_usage").select("count").eq("user_id", user.id).eq("month", month).maybeSingle();
        setAiUsage((usage as { count?: number } | null)?.count ?? 0);
      } catch { msg("Failed to load settings.", "err"); }
    };
    void load();
  }, [supabase, tab]);

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const user = await getCurrentUser();
      if (!user) return;
      await supabase.from("users").update({ full_name: fullName }).eq("id", user.id);
      msg("Profile saved.");
    } catch { msg("Failed to save.", "err"); }
  };

  const savePassword = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword("");
      msg("Password updated.");
    } catch (err) { msg(err instanceof Error ? err.message : "Failed.", "err"); }
  };

  const saveNotifications = async () => {
    try {
      const user = await getCurrentUser();
      if (!user) return;
      await supabase.from("users").update({ notify_milestone: notifyMilestone, notify_task: notifyTask }).eq("id", user.id);
      msg("Preferences saved.");
    } catch { msg("Failed.", "err"); }
  };

  const uploadAvatar = async (file: File) => {
    setAvatarUploading(true);
    try {
      const user = await getCurrentUser();
      if (!user) return;
      const nameExt = file.name.split(".").pop();
      const typeExt = file.type?.split("/").pop();
      const ext = (nameExt && nameExt !== file.name ? nameExt : typeExt || "png").toLowerCase();
      const path = `${user.id}/avatar.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, {
        upsert: true, cacheControl: "3600", contentType: file.type || "image/png",
      });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
      const busted = `${publicUrl}?v=${Date.now()}`;
      await supabase.auth.updateUser({ data: { avatar_url: busted } });
      setAvatarUrl(busted);
      msg("Avatar updated.");
    } catch (err) {
      msg(err instanceof Error ? err.message : "Upload failed.", "err");
    } finally { setAvatarUploading(false); }
  };

  const card = { background:"var(--bm-bg2)", border:"1px solid var(--bm-border)", borderRadius: 10, padding: "22px 24px" };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      style={{ maxWidth: 680, margin: "0 auto", fontFamily: "system-ui,sans-serif", color:"var(--bm-text)", paddingBottom: 40 }}>

      <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid #1c1c1c" }}>
        <div style={{ fontSize: 19, fontWeight: 500, color: "#fff", letterSpacing: "-0.02em" }}>Settings</div>
      </div>

      <div style={{ display: "flex", borderBottom: "1px solid #1c1c1c", marginBottom: 22, gap: 0 }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ background: "none", border: "none", borderBottom: tab === t.id ? "1px solid #fff" : "1px solid transparent", color: tab === t.id ? "#fff" : "#555", fontSize: 13, padding: "8px 18px", cursor: "pointer", fontFamily: "inherit", marginBottom: -1, transition: "color 0.15s" }}>
            {t.label}
          </button>
        ))}
      </div>

      <AnimatePresence>
        {message && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{ marginBottom: 14, padding: "10px 16px", borderRadius: 7, fontSize: 12, background: messageType === "ok" ? "rgba(74,222,128,0.08)" : "rgba(248,113,113,0.08)", border: `1px solid ${messageType === "ok" ? "rgba(74,222,128,0.2)" : "rgba(248,113,113,0.2)"}`, color: messageType === "ok" ? "#4ade80" : "#f87171" }}>
            {message}
          </motion.div>
        )}
      </AnimatePresence>

      {tab === "profile" && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <form onSubmit={(e) => void saveProfile(e)} style={{ ...card, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ width: 52, height: 52, borderRadius: "50%", background:"var(--bm-bg4)", border:"1px solid var(--bm-border2)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {avatarUrl
                  ? <img src={avatarUrl} alt="Avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <span style={{ fontSize: 18, color:"var(--bm-text4)" }}>{fullName?.[0]?.toUpperCase() ?? "?"}</span>}
              </div>
              <label style={{ display: "inline-block", background: "transparent", border:"1px solid var(--bm-border2)", color:"var(--bm-text2)", fontSize: 12, padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit" }}>
                {avatarUploading ? "Uploading..." : "Change avatar"}
                <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadAvatar(f); }} />
              </label>
            </div>
            <div>
              <label style={{ fontSize: 11, color:"var(--bm-text4)", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 6 }}>Full name</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" style={inputStyle}
                onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "#333"; }}
                onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "#1c1c1c"; }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color:"var(--bm-text4)", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 6 }}>Email</label>
              <input value={email} disabled style={{ ...inputStyle, color:"var(--bm-text4)", cursor: "not-allowed" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="submit" style={{ background: "#fff", color: "#000", fontWeight: 600, fontSize: 13, padding: "8px 18px", borderRadius: 7, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                Save profile
              </button>
            </div>
          </form>
        </motion.div>
      )}

      {tab === "account" && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <form onSubmit={(e) => void savePassword(e)} style={{ ...card, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: "#fff", marginBottom: 2 }}>Change password</div>
            <div>
              <label style={{ fontSize: 11, color:"var(--bm-text4)", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 6 }}>New password</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="8+ characters" style={inputStyle}
                onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "#333"; }}
                onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "#1c1c1c"; }} />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="submit" style={{ background: "#fff", color: "#000", fontWeight: 600, fontSize: 13, padding: "8px 18px", borderRadius: 7, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                Update password
              </button>
            </div>
          </form>
        </motion.div>
      )}

      {tab === "notifications" && FEATURES.notifications && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <div style={{ ...card, display: "flex", flexDirection: "column", gap: 16 }}>
            {[
              { label: "Milestone notifications", sub: "Get notified when you complete a milestone", val: notifyMilestone, set: setNotifyMilestone },
              { label: "Task reminders", sub: "Daily reminder to complete your action", val: notifyTask, set: setNotifyTask },
            ].map((n) => (
              <div key={n.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, paddingBottom: 16, borderBottom: "1px solid #111" }}>
                <div>
                  <div style={{ fontSize: 13, color:"var(--bm-text2)", marginBottom: 3 }}>{n.label}</div>
                  <div style={{ fontSize: 12, color:"var(--bm-text4)" }}>{n.sub}</div>
                </div>
                <Toggle checked={n.val} onChange={n.set} />
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => void saveNotifications()}
                style={{ background: "#fff", color: "#000", fontWeight: 600, fontSize: 13, padding: "8px 18px", borderRadius: 7, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                Save preferences
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {tab === "billing" && <BillingTab />}

      {tab === "ai" && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <div style={card}>
            <div style={{ fontSize: 14, fontWeight: 500, color: "#fff", marginBottom: 16 }}>AI usage this month</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 36, fontWeight: 500, color:"var(--bm-text)", letterSpacing: "-0.03em" }}>{aiUsage}</span>
              <span style={{ fontSize: 13, color:"var(--bm-text4)" }}>requests</span>
            </div>
            <div style={{ height: 3, background:"var(--bm-bg3)", borderRadius: 9999, overflow: "hidden", marginBottom: 16 }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, (aiUsage / 50) * 100)}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                style={{ height: "100%", background: aiUsage > 40 ? "#f87171" : aiUsage > 20 ? "#fbbf24" : "#4ade80", borderRadius: 9999 }} />
            </div>
            <div style={{ fontSize: 12, color:"var(--bm-text4)", lineHeight: 1.6 }}>
              Every request to BuildMind AI reads your actual project data before responding — so the more you use it, the more context it has.
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
