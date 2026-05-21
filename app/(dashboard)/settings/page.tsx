"use client";

import { FormEvent, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { ensureUserProfile } from "@/lib/buildmind";
import { FEATURES } from "@/lib/features";
import { PLAN_NAMES, setStoredPlan, fetchAndSyncStoredPlanFromBillingStatus } from "@/lib/plan";
import { PLAN_PRICE_LABEL } from "@/lib/pricing";
import { usePlan } from "@/lib/usePlan";
import { storage } from "@/lib/storage";
import { fetchBehaviorState, persistBehaviorState } from "@/lib/userBehaviorState";
import PushNotificationToggle from "@/components/PushNotificationToggle";
import AvatarUpload from "@/components/AvatarUpload";
import { ProfileCompletenessBar } from "@/components/ProfileCompletenessBar";
import { User, CreditCard, Bell, Bot, Shield, Check, Zap, Globe, Plug2, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";

type Tab = "profile" | "account" | "notifications" | "ai" | "billing" | "integrations" | "public";

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "profile",        label: "Profile",        icon: User       },
  { id: "account",        label: "Account",        icon: Shield     },
  ...(FEATURES.notifications ? [{ id: "notifications" as Tab, label: "Notifications", icon: Bell }] : []),
  { id: "billing",        label: "Billing",        icon: CreditCard },
  { id: "integrations",   label: "Integrations",   icon: Plug2      },
  { id: "ai",             label: "AI Usage",       icon: Bot        },
  { id: "public",         label: "Public Profile", icon: Globe      },
];

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <motion.button onClick={() => onChange(!checked)}
      style={{
        width: 42, height: 24, borderRadius: 12, position: "relative", cursor: "pointer", flexShrink: 0,
        background: checked ? "var(--bm-accent)" : "var(--bm-bg4)",
        border: `1px solid ${checked ? "var(--bm-accent-bd)" : "var(--bm-border2)"}`,
        transition: "background 0.2s, border-color 0.2s",
        boxShadow: checked ? "var(--shadow-accent)" : "none",
      }}>
      <motion.div animate={{ x: checked ? 20 : 2 }} transition={{ type: "spring", stiffness: 400, damping: 25 }}
        style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 2 }} />
    </motion.button>
  );
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return isMobile;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ display: "block", fontSize: 10, color: "var(--bm-text3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
      {children}
    </label>
  );
}

function SettingsInput({ value, onChange, placeholder, type = "text", disabled }: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
}) {
  const isMobile = useIsMobile();
  return (
    <input value={value} onChange={onChange} placeholder={placeholder} type={type} disabled={disabled}
      style={{ width: "100%", background: "var(--bm-bg3)", border: "1px solid var(--bm-border2)", borderRadius: 10, padding: isMobile ? "13px 14px" : "10px 14px", fontSize: isMobile ? 16 : 13, color: "var(--bm-text)", outline: "none", fontFamily: "inherit", boxSizing: "border-box", transition: "border-color 0.15s", opacity: disabled ? 0.5 : 1 }}
      onFocus={e => { e.target.style.borderColor = "var(--bm-accent-bd)"; }}
      onBlur={e => { e.target.style.borderColor = "var(--bm-border2)"; }} />
  );
}

function SaveButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  const isMobile = useIsMobile();
  return (
    <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.97 }} onClick={onClick} disabled={loading}
      style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: isMobile ? "13px 20px" : "10px 20px", borderRadius: 10, border: "none", background: "var(--grad-primary)", color: "#fff", fontWeight: 600, fontSize: isMobile ? 14 : 13, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: loading ? 0.7 : 1, transition: "opacity 0.15s", width: isMobile ? "100%" : "auto" }}>
      {loading ? "Saving…" : <><Check size={14} /> Save changes</>}
    </motion.button>
  );
}

// ── Feature comparison data ───────────────────────────────────────────────────
const PLAN_FEATURES = [
  { label: "Daily AI action",              free: true,  builder: true  },
  { label: "Reflexion loop (AI learns from outcomes)", free: false, builder: true },
  { label: "Behavioral memory",            free: false, builder: true  },
  { label: "Notion & Linear task sync",    free: false, builder: true  },
  { label: "Unlimited AI Coach messages",  free: false, builder: true  },
  { label: "Weekly performance reports",   free: false, builder: true  },
  { label: "Break My Startup analysis",    free: true,  builder: true  },
  { label: "Morning briefings",            free: false, builder: true  },
];

// ── Integrations Tab ───────────────────────────────────────────────────────────
function IntegrationsTab({ initialStatus }: { initialStatus: string | null }) {
  const isMobile = useIsMobile();
  const [notionStatus, setNotionStatus] = useState<"idle" | "connected" | "error">("idle");
  const [linearStatus, setLinearStatus] = useState<"idle" | "connected" | "error">("idle");
  const [toast, setToast]               = useState<string | null>(null);
  const [loading, setLoading]           = useState(true);

  // Check current connection status from DB on load
  useEffect(() => {
    fetch("/api/integrations/status")
      .then(r => r.ok ? r.json() : null)
      .then((d: { notion?: boolean; linear?: boolean } | null) => {
        if (!d) return;
        if (d.notion) setNotionStatus("connected");
        if (d.linear) setLinearStatus("connected");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Handle OAuth callback query params: ?integration=notion&status=connected
  useEffect(() => {
    if (!initialStatus) return;
    const params = new URLSearchParams(window.location.search);
    const integration = params.get("integration");
    const status      = params.get("status");
    if (!integration || !status) return;

    if (integration === "notion") {
      setNotionStatus(status === "connected" ? "connected" : "error");
      setToast(status === "connected" ? "Notion connected! Your tasks will now feed into your daily AI brief." : "Notion connection failed — try again.");
    } else if (integration === "linear") {
      setLinearStatus(status === "connected" ? "connected" : "error");
      setToast(status === "connected" ? "Linear connected! Your assigned issues will now feed into your daily AI brief." : "Linear connection failed — try again.");
    }

    // Clean the URL so refresh doesn't re-trigger
    const clean = window.location.pathname;
    window.history.replaceState({}, "", `${clean}?tab=integrations`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialStatus]);

  // Auto-clear toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const integrations = [
    {
      id: "notion",
      name: "Notion",
      desc: "Pulls incomplete tasks from your Notion database and feeds them into your daily AI brief. Prevents the AI from suggesting work you're already doing.",
      status: notionStatus,
      connectUrl: "/api/integrations/notion/connect",
      logo: "N",
      logoColor: "#000",
      logoBg: "#f5f5f4",
    },
    {
      id: "linear",
      name: "Linear",
      desc: "Syncs your assigned Linear issues into your daily brief. The AI knows what's already in your sprint before it suggests today's action.",
      status: linearStatus,
      connectUrl: "/api/integrations/linear/connect",
      logo: "L",
      logoColor: "#5e6ad2",
      logoBg: "#ededf6",
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{
              padding: "10px 14px", borderRadius: 10,
              background: "var(--bm-accent-dim)", border: "1px solid var(--bm-accent-bd)",
              fontSize: 13, color: "var(--bm-accent)", fontWeight: 500,
              display: "flex", alignItems: "center", gap: 8,
            }}
          >
            <Check size={14} /> {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header explanation */}
      <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 16, padding: isMobile ? "18px" : "22px 24px" }}>
        <div style={{ fontSize: isMobile ? 15 : 13, fontWeight: 700, color: "var(--bm-text)", marginBottom: 6 }}>
          Task integrations
        </div>
        <div style={{ fontSize: isMobile ? 13 : 12, color: "var(--bm-text3)", lineHeight: 1.6, marginBottom: 0 }}>
          Connect your task manager so BuildMind knows what you&apos;re already working on.
          Your real tasks feed directly into the AI brief — no more generic suggestions.
        </div>
      </div>

      {/* Integration cards */}
      {integrations.map(intg => (
        <div
          key={intg.id}
          style={{
            background: "var(--bm-bg2)",
            border: `1px solid ${intg.status === "connected" ? "var(--bm-accent-bd)" : "var(--bm-border)"}`,
            borderRadius: 16,
            padding: isMobile ? "18px" : "20px 22px",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flexDirection: isMobile ? "column" : "row" }}>
            {/* Logo */}
            <div style={{
              width: 40, height: 40, borderRadius: 10, flexShrink: 0,
              background: intg.logoBg, border: "1px solid var(--bm-border)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, fontWeight: 800, color: intg.logoColor,
            }}>
              {intg.logo}
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--bm-text)" }}>{intg.name}</span>
                {intg.status === "connected" && (
                  <span style={{
                    fontSize: 10, padding: "2px 8px", borderRadius: 20,
                    background: "var(--bm-accent-dim)", color: "var(--bm-accent)",
                    border: "1px solid var(--bm-accent-bd)", fontWeight: 700, letterSpacing: "0.06em",
                  }}>
                    CONNECTED
                  </span>
                )}
                {intg.status === "error" && (
                  <span style={{
                    fontSize: 10, padding: "2px 8px", borderRadius: 20,
                    background: "rgba(224,85,85,0.08)", color: "var(--bm-red)",
                    border: "1px solid rgba(224,85,85,0.2)", fontWeight: 700,
                  }}>
                    CONNECTION FAILED
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: "var(--bm-text3)", lineHeight: 1.6 }}>{intg.desc}</div>
            </div>

            {/* CTA */}
            <div style={{ flexShrink: 0, width: isMobile ? "100%" : "auto" }}>
              {intg.status === "connected" ? (
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--bm-accent)" }}>
                  <Check size={14} /> Active
                </div>
              ) : (
                <a
                  href={intg.connectUrl}
                  style={{
                    display: "block", padding: "9px 18px", borderRadius: 10,
                    border: "1px solid var(--bm-border)",
                    background: "var(--bm-bg3)",
                    color: "var(--bm-text2)", fontSize: 12, fontWeight: 600,
                    textDecoration: "none", textAlign: "center",
                    width: isMobile ? "100%" : "auto",
                    boxSizing: "border-box",
                  }}
                >
                  Connect {intg.name}
                </a>
              )}
            </div>
          </div>
        </div>
      ))}

      {loading && (
        <div style={{ fontSize: 12, color: "var(--bm-text4)", textAlign: "center", padding: "8px 0" }}>
          Checking connection status…
        </div>
      )}
    </div>
  );
}

type CancelStep = "idle" | "confirm" | "reason" | "final";
const CANCEL_REASONS = [
  "Too expensive right now",
  "Not using it enough",
  "Missing a feature I need",
  "Switching to something else",
  "Just taking a break",
  "Other",
];

function BillingTab() {
  const isMobile = useIsMobile();
  const { plan } = usePlan();
  const isPaid = plan !== "free";
  const [loading, setLoading] = useState(true);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelStep, setCancelStep] = useState<CancelStep>("idle");
  const [cancelReason, setCancelReason] = useState("");

  useEffect(() => {
    fetchAndSyncStoredPlanFromBillingStatus().finally(() => setLoading(false));
  }, []);

  async function confirmCancel() {
    if (!cancelReason || cancelLoading) return;
    setCancelLoading(true);
    setCancelError(null);
    try {
      const res = await fetch("/api/billing/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "cancel", reason: cancelReason }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body.error ?? "Cancellation failed");
      setStoredPlan("free");
      await fetchAndSyncStoredPlanFromBillingStatus();
      setCancelStep("final");
    } catch (e) {
      setCancelError(e instanceof Error ? e.message : "Cancellation failed");
    } finally {
      setCancelLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ background: isPaid ? "var(--bm-accent-dim)" : "var(--bm-bg2)", border: `1px solid ${isPaid ? "var(--bm-accent-bd)" : "var(--bm-border)"}`, borderRadius: 16, padding: isMobile ? "18px" : "22px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexDirection: isMobile ? "column" : "row", gap: 16 }}>
          <div>
            <div style={{ fontSize: 10, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 8 }}>Current Plan</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "var(--bm-text)", letterSpacing: "-0.02em", marginBottom: 4 }}>{PLAN_NAMES[plan] ?? plan}</div>
            {isPaid && <div style={{ fontSize: 12, color: "var(--bm-text3)" }}>{PLAN_PRICE_LABEL.builder} · Renews monthly</div>}
          </div>
          {isPaid ? (
            <span style={{ fontSize: 10, padding: "4px 12px", borderRadius: 20, background: "var(--bm-accent-dim)", color: "var(--bm-accent)", border: "1px solid var(--bm-accent-bd)", fontWeight: 700, letterSpacing: "0.06em" }}>ACTIVE</span>
          ) : (
            <a href="/upgrade" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "12px 18px", borderRadius: 11, border: "none", background: "var(--grad-primary)", color: "#fff", fontWeight: 700, fontSize: 13, textDecoration: "none", width: isMobile ? "100%" : "auto" }}>
              <Zap size={13} /> Upgrade to Builder
            </a>
          )}
        </div>
      </div>

      <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 16, padding: isMobile ? "18px" : "22px 24px" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--bm-text2)", marginBottom: 4 }}>Manage subscription</div>
        <div style={{ fontSize: 12, color: "var(--bm-text3)", marginBottom: 16 }}>Cancel or pause your Builder plan.</div>
        {cancelStep === "idle" && (
          <button onClick={() => setCancelStep("confirm")}
            style={{ padding: "9px 18px", borderRadius: 10, border: "1px solid rgba(224,85,85,0.25)", background: "rgba(224,85,85,0.06)", color: "var(--bm-red)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Cancel subscription
          </button>
        )}
        {cancelStep === "confirm" && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--bm-text)", marginBottom: 8 }}>Before you go…</div>
            <p style={{ fontSize: 13, color: "var(--bm-text3)", marginBottom: 16, lineHeight: 1.6 }}>Cancelling will immediately end your Builder access.</p>
            <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 8 }}>
              <button onClick={() => setCancelStep("reason")} style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: "var(--bm-red)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Still cancel</button>
              <button onClick={() => setCancelStep("idle")} style={{ padding: "10px 18px", borderRadius: 10, border: "1px solid var(--bm-border)", background: "transparent", color: "var(--bm-text2)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Keep Builder</button>
            </div>
          </motion.div>
        )}
        {cancelStep === "reason" && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--bm-text2)", marginBottom: 12 }}>What's the main reason?</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 16 }}>
              {CANCEL_REASONS.map(r => (
                <button key={r} onClick={() => setCancelReason(r)}
                  style={{ padding: "10px 14px", borderRadius: 10, border: `1px solid ${cancelReason === r ? "var(--bm-accent-bd)" : "var(--bm-border)"}`, background: cancelReason === r ? "var(--bm-accent-dim)" : "transparent", color: cancelReason === r ? "var(--bm-accent)" : "var(--bm-text2)", fontSize: 12, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                  {r}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 8 }}>
              <button onClick={confirmCancel} disabled={!cancelReason || cancelLoading}
                style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: cancelReason ? "var(--bm-red)" : "var(--bm-bg4)", color: cancelReason ? "#fff" : "var(--bm-text3)", fontSize: 12, fontWeight: 700, cursor: cancelReason && !cancelLoading ? "pointer" : "not-allowed", fontFamily: "inherit", opacity: cancelLoading ? 0.7 : 1 }}>
                {cancelLoading ? "Cancelling..." : "Confirm cancel"}
              </button>
              <button onClick={() => setCancelStep("idle")} style={{ padding: "10px 18px", borderRadius: 10, border: "1px solid var(--bm-border)", background: "transparent", color: "var(--bm-text2)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Go back</button>
            </div>
            {cancelError && <div style={{ fontSize: 11, color: "var(--bm-red)", marginTop: 10 }}>{cancelError}</div>}
          </motion.div>
        )}
        {cancelStep === "final" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div style={{ fontSize: 13, color: "var(--bm-text3)", lineHeight: 1.6 }}>Your subscription has been cancelled. Your account is now on the free plan.</div>
          </motion.div>
        )}
      </div>

      {loading && <div style={{ fontSize: 12, color: "var(--bm-text4)", textAlign: "center" }}>Loading billing status…</div>}
    </div>
  );
}

export default function SettingsPage() {
  const isMobile = useIsMobile();
  const { plan } = usePlan();
  const searchParams = useSearchParams();
  // If redirected from OAuth callback, default to integrations tab
  const initialIntegrationStatus = searchParams.get("integration");
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window !== "undefined" && searchParams.get("tab") === "integrations") return "integrations";
    if (initialIntegrationStatus) return "integrations";
    return "profile";
  });
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarUploadError, setAvatarUploadError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [notifs, setNotifs] = useState({ streakReminder: true, weeklyReport: true, coachTips: false });
  const [aiPersonality, setAiPersonality] = useState<"direct" | "supportive" | "challenger">("direct");
  const [userId, setUserId] = useState<string>("");
  // Public profile state
  const [publicProfile, setPublicProfile] = useState(false);
  const [publicUsername, setPublicUsername] = useState("");
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [publicSaving, setPublicSaving] = useState(false);
  const [publicSaved, setPublicSaved] = useState(false);
  // For ProfileCompletenessBar in profile tab
  const [activeProject, setActiveProject] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const sb = createClient();
        const { data } = await sb.auth.getUser();
        if (!data.user) return;
        setUserId(data.user.id);
        setEmail(data.user.email ?? "");
        await ensureUserProfile({ id: data.user.id, email: data.user.email ?? "" });
        const { data: profile } = await sb
          .from("profiles")
          .select("name, username, bio, avatar_url, public_profile")
          .eq("id", data.user.id)
          .maybeSingle();
        if (profile) {
          setName(profile.name ?? "");
          setUsername(profile.username ?? "");
          setPublicUsername(profile.username ?? "");
          setBio(profile.bio ?? "");
          setAvatarUrl(profile.avatar_url ?? "");
          setPublicProfile(profile.public_profile ?? false);
        }
        // Fetch active project for ProfileCompletenessBar
        const { data: project } = await sb
          .from("projects")
          .select("description, startup_summary, stage, startup_stage, target_users, problem")
          .eq("user_id", data.user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (project) setActiveProject(project as Record<string, unknown>);
        const saved = storage.get("bm_ai_personality");
        if (saved === "direct" || saved === "supportive" || saved === "challenger") {
          setAiPersonality(saved);
        }
        const behavior = await fetchBehaviorState<{ ai_personality: "direct" | "supportive" | "challenger" }>(["ai_personality"]);
        if (behavior.ai_personality === "direct" || behavior.ai_personality === "supportive" || behavior.ai_personality === "challenger") {
          storage.set("bm_ai_personality", behavior.ai_personality);
          setAiPersonality(behavior.ai_personality);
        }
      } catch {}
    };
    load();
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const sb = createClient();
      const { data } = await sb.auth.getUser();
      if (!data.user) return;
      await sb.from("profiles").upsert({
        id: data.user.id,
        name: name.trim(),
        username: username.trim().toLowerCase(),
        bio: bio.trim(),
        avatar_url: avatarUrl.trim() || null,
        updated_at: new Date().toISOString(),
      });
      storage.set("bm_ai_personality", aiPersonality);
      persistBehaviorState({ ai_personality: aiPersonality });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {} finally { setSaving(false); }
  }

  async function handlePublicSave() {
    setUsernameError(null);
    const slug = publicUsername.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!slug) { setUsernameError("Username is required to enable a public profile."); return; }
    if (slug.length < 3) { setUsernameError("Username must be at least 3 characters."); return; }

    setPublicSaving(true);
    try {
      const sb = createClient();
      const { data } = await sb.auth.getUser();
      if (!data.user) return;

      // Check uniqueness (only if changed)
      if (slug !== username) {
        const { data: existing } = await sb
          .from("profiles")
          .select("id")
          .eq("username", slug)
          .neq("id", data.user.id)
          .maybeSingle();
        if (existing) { setUsernameError("That username is taken. Try another."); return; }
      }

      await sb.from("profiles").upsert({
        id:             data.user.id,
        username:       slug,
        public_profile: publicProfile,
        updated_at:     new Date().toISOString(),
      });
      setUsername(slug);
      setPublicSaved(true);
      setTimeout(() => setPublicSaved(false), 2500);
    } catch { setUsernameError("Save failed — please try again."); }
    finally { setPublicSaving(false); }
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-0 py-1 sm:px-6 sm:py-7">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        <PageHeader
          title="Settings"
          subtitle="Manage your account, notifications, and AI preferences."
        />
      </motion.div>

      <div className="flex flex-col gap-5 lg:flex-row">
        {/* Sidebar nav */}
        <div className="w-full shrink-0 overflow-x-auto pb-1 lg:w-40 lg:overflow-visible">
          <nav className="flex min-w-max flex-row gap-2 lg:min-w-0 lg:flex-col">
            {TABS.map(t => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`flex h-9 shrink-0 cursor-pointer items-center gap-2.5 rounded-none border-b-2 px-3.5 text-left text-[13px] transition-colors lg:w-full lg:rounded-lg lg:border-b-0 lg:border-l-2 ${
                    active
                      ? "border-[var(--bm-accent)] bg-[var(--bm-accent-dim)] font-semibold text-[var(--bm-accent)]"
                      : "border-transparent bg-transparent font-normal text-[var(--bm-text3)] hover:bg-[var(--bm-bg3)] hover:text-[var(--bm-text2)]"
                  }`}>
                  <Icon size={14} strokeWidth={active ? 2.2 : 1.6} style={{ flexShrink: 0 }} />
                  {t.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content area */}
        <div className="min-w-0 flex-1">
          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>

              {tab === "profile" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {/* Profile completeness card (full card) */}
                  <ProfileCompletenessBar
                    fields={{
                      startupSummary:   (activeProject?.startup_summary as string) ?? (activeProject?.description as string) ?? "",
                      stage:            (activeProject?.stage as string) ?? (activeProject?.startup_stage as string) ?? "",
                      targetUsers:      (activeProject?.target_users as string) ?? "",
                      problem:          (activeProject?.problem as string) ?? "",
                      revenueModel:     "",
                      weeklyRevenueGoal: 0,
                      avoidanceZones:   [],
                      personalityTags:  [],
                    }}
                  />
                  <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 16, padding: isMobile ? "18px" : "22px 24px" }}>
                    <div style={{ fontSize: isMobile ? 15 : 13, fontWeight: 700, color: "var(--bm-text)", marginBottom: 20 }}>Public Profile</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 18 : 16 }}>
                      <div>
                        <FieldLabel>Profile Photo</FieldLabel>
                        <AvatarUpload currentUrl={avatarUrl} onUpload={setAvatarUrl} />
                        {/* Or paste URL */}
                        <div style={{ fontSize: 10, color: "var(--bm-text4)", marginBottom: 6 }}>or paste an image URL</div>
                        <SettingsInput value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://..." />
                      </div>
                      <div><FieldLabel>Full Name</FieldLabel><SettingsInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex Johnson" /></div>
                      <div><FieldLabel>Username</FieldLabel><SettingsInput value={username} onChange={(e) => setUsername(e.target.value)} placeholder="alexbuilds" /></div>
                      <div>
                        <FieldLabel>Bio</FieldLabel>
                        <textarea value={bio} onChange={e => setBio(e.target.value)} rows={3} placeholder="Building in public. Founder of [startup]."
                          style={{ width: "100%", background: "var(--bm-bg3)", border: "1px solid var(--bm-border2)", borderRadius: 10, padding: isMobile ? "13px 14px" : "10px 14px", fontSize: isMobile ? 16 : 13, color: "var(--bm-text)", outline: "none", fontFamily: "inherit", resize: "none", boxSizing: "border-box", lineHeight: 1.55, transition: "border-color 0.15s" }}
                          onFocus={e => { e.target.style.borderColor = "var(--bm-accent-bd)"; }}
                          onBlur={e => { e.target.style.borderColor = "var(--bm-border2)"; }} />
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", alignItems: isMobile ? "stretch" : "center", flexDirection: isMobile ? "column" : "row", gap: 14 }}>
                    <AnimatePresence>
                      {saved && (
                        <motion.span initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                          style={{ fontSize: 12, color: "var(--bm-accent)", display: "flex", alignItems: "center", gap: 6 }}>
                          <Check size={12} /> Saved
                        </motion.span>
                      )}
                    </AnimatePresence>
                    <SaveButton loading={saving} onClick={handleSave} />
                  </div>
                </div>
              )}

              {tab === "account" && (
                <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 16, padding: isMobile ? "18px" : "22px 24px" }}>
                  <div style={{ fontSize: isMobile ? 15 : 13, fontWeight: 700, color: "var(--bm-text)", marginBottom: 20 }}>Account</div>
                  <div><FieldLabel>Email Address</FieldLabel><SettingsInput value={email} onChange={() => {}} disabled placeholder="you@example.com" /></div>
                  <div style={{ fontSize: 11, color: "var(--bm-text3)", marginTop: 8 }}>Email is managed through your auth provider.</div>
                </div>
              )}

              {tab === "notifications" && FEATURES.notifications && (
                <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 16, padding: isMobile ? "18px" : "22px 24px" }}>
                  <div style={{ fontSize: isMobile ? 15 : 13, fontWeight: 700, color: "var(--bm-text)", marginBottom: 20 }}>Notifications</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                    {[
                      { key: "streakReminder", label: "Streak Reminder", desc: "Daily reminder to complete your action" },
                      { key: "weeklyReport", label: "Weekly Report", desc: "AI summary of your week every Sunday" },
                      { key: "coachTips", label: "AI Coach Tips", desc: "Occasional startup insights from your coach" },
                    ].map(({ key, label, desc }) => (
                      <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, padding: isMobile ? "18px 0" : "16px 0", borderBottom: "1px solid var(--bm-border)" }}>
                        <div>
                          <div style={{ fontSize: isMobile ? 14 : 13, fontWeight: 500, color: "var(--bm-text2)", marginBottom: 2 }}>{label}</div>
                          <div style={{ fontSize: isMobile ? 12 : 11, color: "var(--bm-text3)", lineHeight: 1.45 }}>{desc}</div>
                        </div>
                        <Toggle checked={notifs[key as keyof typeof notifs]} onChange={v => setNotifs(n => ({ ...n, [key]: v }))} />
                      </div>
                    ))}
                  </div>
                  {userId ? <div style={{ marginTop: 20 }}><PushNotificationToggle userId={userId} /></div> : null}
                </div>
              )}

              {tab === "ai" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 16, padding: isMobile ? "18px" : "22px 24px" }}>
                    <div style={{ fontSize: isMobile ? 15 : 13, fontWeight: 700, color: "var(--bm-text)", marginBottom: 6 }}>AI Coach Personality</div>
                    <div style={{ fontSize: isMobile ? 13 : 12, color: "var(--bm-text3)", marginBottom: 18 }}>Choose how your AI Coach communicates with you.</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                      {([ 
                        { id: "direct" as const, label: "Direct & Honest", desc: "Straight talk. No sugarcoating. Highest clarity." },
                        { id: "supportive" as const, label: "Supportive", desc: "Encouraging tone with actionable feedback." },
                        { id: "challenger" as const, label: "Challenger", desc: "Pushes your thinking hard. High intensity." },
                      ] satisfies { id: "direct" | "supportive" | "challenger"; label: string; desc: string }[]).map(opt => (
                        <button key={opt.id} onClick={() => setAiPersonality(opt.id)}
                          style={{ padding: isMobile ? "15px" : "13px 16px", borderRadius: 12, border: `1px solid ${aiPersonality === opt.id ? "var(--bm-accent-bd)" : "var(--bm-border)"}`, background: aiPersonality === opt.id ? "var(--bm-accent-dim)" : "var(--bm-bg3)", cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "all 0.15s" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div>
                              <div style={{ fontSize: isMobile ? 14 : 13, fontWeight: aiPersonality === opt.id ? 700 : 500, color: aiPersonality === opt.id ? "var(--bm-accent)" : "var(--bm-text2)", marginBottom: 3 }}>{opt.label}</div>
                              <div style={{ fontSize: isMobile ? 12 : 11, color: "var(--bm-text3)", lineHeight: 1.45 }}>{opt.desc}</div>
                            </div>
                            {aiPersonality === opt.id && <Check size={14} color="var(--bm-accent)" />}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <SaveButton loading={saving} onClick={handleSave} />
                  </div>
                </div>
              )}

              {tab === "billing" && <BillingTab />}

              {tab === "integrations" && (
                <IntegrationsTab initialStatus={initialIntegrationStatus} />
              )}

              {tab === "public" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 16, padding: isMobile ? "18px" : "22px 24px" }}>
                    <div style={{ fontSize: isMobile ? 15 : 13, fontWeight: 700, color: "var(--bm-text)", marginBottom: 6 }}>Public Founder Score</div>
                    <div style={{ fontSize: isMobile ? 13 : 12, color: "var(--bm-text3)", lineHeight: 1.55, marginBottom: 20 }}>
                      Share your Momentum Score publicly at <code style={{ background: "var(--bm-bg3)", padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>buildmind.live/founder/{publicUsername || "your-username"}</code>
                    </div>

                    <div style={{ marginBottom: 16 }}>
                      <FieldLabel>Username</FieldLabel>
                      <SettingsInput
                        value={publicUsername}
                        onChange={e => { setPublicUsername(e.target.value); setUsernameError(null); }}
                        placeholder="alexbuilds"
                      />
                      {publicUsername && (
                        <div style={{ fontSize: 11, color: "var(--bm-text3)", marginTop: 6 }}>
                          Preview: <span style={{ color: "var(--bm-accent)" }}>buildmind.live/founder/{publicUsername.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "")}</span>
                        </div>
                      )}
                      {usernameError && <div style={{ fontSize: 11, color: "var(--bm-red)", marginTop: 6 }}>{usernameError}</div>}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, padding: "16px 0", borderTop: "1px solid var(--bm-border)" }}>
                      <div>
                        <div style={{ fontSize: isMobile ? 14 : 13, fontWeight: 500, color: "var(--bm-text2)", marginBottom: 2 }}>Show my Momentum Score publicly</div>
                        <div style={{ fontSize: isMobile ? 12 : 11, color: "var(--bm-text3)", lineHeight: 1.45 }}>
                          {FEATURES.publicFounderScore
                            ? "Anyone with your link can see your score and stage."
                            : "Currently gated — activate via FEATURES.publicFounderScore when ready."}
                        </div>
                      </div>
                      <Toggle checked={publicProfile} onChange={setPublicProfile} />
                    </div>

                    {!FEATURES.publicFounderScore && (
                      <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(232,160,32,0.06)", border: "1px solid rgba(232,160,32,0.18)", borderRadius: 8, fontSize: 12, color: "var(--bm-amber)" }}>
                        🔒 Public profiles are currently in private beta. Your settings will go live when this feature activates.
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 14 }}>
                    <AnimatePresence>
                      {publicSaved && (
                        <motion.span initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                          style={{ fontSize: 12, color: "var(--bm-accent)", display: "flex", alignItems: "center", gap: 6 }}>
                          <Check size={12} /> Saved
                        </motion.span>
                      )}
                    </AnimatePresence>
                    <SaveButton loading={publicSaving} onClick={handlePublicSave} />
                  </div>
                </div>
              )}

            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
