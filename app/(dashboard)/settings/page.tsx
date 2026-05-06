"use client";

import { FormEvent, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { ensureUserProfile } from "@/lib/buildmind";
import { FEATURES } from "@/lib/features";
import { PLAN_NAMES, setStoredPlan, fetchAndSyncStoredPlanFromBillingStatus } from "@/lib/plan";
import { PLAN_PRICE_LABEL } from "@/lib/pricing";
import { usePlan } from "@/lib/usePlan";
import PushNotificationToggle from "@/components/PushNotificationToggle";
import { User, CreditCard, Bell, Bot, Shield, Check, Zap, type LucideIcon } from "lucide-react";

type Tab = "profile" | "account" | "notifications" | "ai" | "billing";

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "profile",       label: "Profile",       icon: User       },
  { id: "account",       label: "Account",       icon: Shield     },
  ...(FEATURES.notifications ? [{ id: "notifications" as Tab, label: "Notifications", icon: Bell }] : []),
  { id: "billing",       label: "Billing",       icon: CreditCard },
  { id: "ai",            label: "AI Usage",      icon: Bot        },
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

type CancelStep = "idle" | "confirm" | "reason" | "final";
const CANCEL_REASONS = ["Too expensive right now", "Not using it enough", "Missing a feature I need", "Switching to something else", "Just taking a break", "Other"];

function BillingTab() {
  const isMobile = useIsMobile();
  const { plan } = usePlan();
  const isPaid = plan !== "free";
  const [loading, setLoading] = useState(true);
  const [cancelStep, setCancelStep] = useState<CancelStep>("idle");
  const [cancelReason, setCancelReason] = useState("");

  useEffect(() => {
    fetchAndSyncStoredPlanFromBillingStatus().finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{
        background: isPaid ? "var(--bm-accent-dim)" : "var(--bm-bg2)",
        border: `1px solid ${isPaid ? "var(--bm-accent-bd)" : "var(--bm-border)"}`,
        borderRadius: 16, padding: isMobile ? "18px" : "22px 24px",
      }}>
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

      {isPaid && (
        <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 16, padding: isMobile ? "18px" : "20px 22px" }}>
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
                <button onClick={() => setCancelStep("final")} disabled={!cancelReason}
                  style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: cancelReason ? "var(--bm-red)" : "var(--bm-bg4)", color: cancelReason ? "#fff" : "var(--bm-text3)", fontSize: 12, fontWeight: 700, cursor: cancelReason ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
                  Confirm cancel
                </button>
                <button onClick={() => setCancelStep("idle")} style={{ padding: "10px 18px", borderRadius: 10, border: "1px solid var(--bm-border)", background: "transparent", color: "var(--bm-text2)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Go back</button>
              </div>
            </motion.div>
          )}
          {cancelStep === "final" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div style={{ fontSize: 13, color: "var(--bm-text3)", lineHeight: 1.6 }}>Your cancellation is being processed. You'll receive an email confirmation shortly.</div>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const isMobile = useIsMobile();
  const { plan } = usePlan();
  const [tab, setTab] = useState<Tab>("profile");
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
          .select("name, username, bio, avatar_url")
          .eq("id", data.user.id)
          .maybeSingle();
        if (profile) {
          setName(profile.name ?? "");
          setUsername(profile.username ?? "");
          setBio(profile.bio ?? "");
          setAvatarUrl(profile.avatar_url ?? "");
        }
        const saved = localStorage.getItem("bm_ai_personality");
        if (saved === "direct" || saved === "supportive" || saved === "challenger") {
          setAiPersonality(saved);
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
      localStorage.setItem("bm_ai_personality", aiPersonality);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {} finally { setSaving(false); }
  }

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: isMobile ? "4px 0 24px" : "28px 24px" }}>
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: isMobile ? 20 : 28 }}>
        <h1 style={{ fontSize: isMobile ? 28 : 22, fontWeight: 800, color: "var(--bm-text)", letterSpacing: "-0.03em", margin: "0 0 4px" }}>Settings</h1>
        <p style={{ fontSize: isMobile ? 14 : 12, color: "var(--bm-text3)", margin: 0 }}>Manage your account, notifications, and AI preferences.</p>
      </motion.div>

      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 18 : 20 }}>
        {/* Sidebar nav */}
        <div style={{ width: isMobile ? "100%" : 160, flexShrink: 0, overflowX: isMobile ? "auto" : "visible", paddingBottom: isMobile ? 4 : 0 }}>
          <nav style={{ display: "flex", flexDirection: isMobile ? "row" : "column", gap: isMobile ? 8 : 2, minWidth: isMobile ? "max-content" : "auto" }}>
            {TABS.map(t => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button key={t.id} onClick={() => setTab(t.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 9, padding: isMobile ? "11px 14px" : "9px 12px", borderRadius: 9,
                    border: `1px solid ${active ? "var(--bm-accent-bd)" : "transparent"}`,
                    background: active ? "var(--bm-accent-dim)" : "transparent",
                    color: active ? "var(--bm-accent)" : "var(--bm-text3)",
                    fontSize: 13, fontWeight: active ? 600 : 400,
                    cursor: "pointer", fontFamily: "inherit", textAlign: "left", width: isMobile ? "auto" : "100%", flexShrink: 0, transition: "all 0.13s",
                  }}
                  onMouseEnter={e => { if (!active) { e.currentTarget.style.background = "var(--bm-bg3)"; e.currentTarget.style.color = "var(--bm-text2)"; }}}
                  onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--bm-text3)"; }}}>
                  <Icon size={14} strokeWidth={active ? 2.2 : 1.6} style={{ flexShrink: 0 }} />
                  {t.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content area */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>

              {tab === "profile" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 16, padding: isMobile ? "18px" : "22px 24px" }}>
                    <div style={{ fontSize: isMobile ? 15 : 13, fontWeight: 700, color: "var(--bm-text)", marginBottom: 20 }}>Public Profile</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 18 : 16 }}>
                      <div>
                        <FieldLabel>Profile Photo</FieldLabel>
                        {/* File upload */}
                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                          <div style={{ position: "relative", width: 56, height: 56, borderRadius: "50%", border: "1px solid var(--bm-border2)", overflow: "hidden", background: "var(--bm-bg3)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {avatarUrl
                              ? <img src={avatarUrl} alt="Avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={() => setAvatarUrl("")} />
                              : <span style={{ fontSize: 18, color: "var(--bm-text3)" }}>👤</span>
                            }
                          </div>
                          <div style={{ flex: 1 }}>
                            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "1px solid var(--bm-border2)", background: "var(--bm-bg3)", color: "var(--bm-text2)", fontSize: 12, fontWeight: 500, cursor: avatarUploading ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: avatarUploading ? 0.6 : 1 }}>
                              {avatarUploading ? "Uploading…" : "Upload photo"}
                              <input
                                type="file"
                                accept="image/*"
                                style={{ display: "none" }}
                                disabled={avatarUploading}
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  if (file.size > 2 * 1024 * 1024) { setAvatarUploadError("Image must be under 2MB"); return; }
                                  setAvatarUploading(true);
                                  setAvatarUploadError(null);
                                  try {
                                    const supabase = createClient();
                                    const { data: { user } } = await supabase.auth.getUser();
                                    if (!user) throw new Error("Not authenticated");
                                    const ext = file.name.split(".").pop() ?? "jpg";
                                    const path = `avatars/${user.id}.${ext}`;
                                    const { error: upErr } = await supabase.storage.from("public").upload(path, file, { upsert: true });
                                    if (upErr) throw upErr;
                                    const { data: urlData } = supabase.storage.from("public").getPublicUrl(path);
                                    // Bust cache with timestamp
                                    setAvatarUrl(`${urlData.publicUrl}?t=${Date.now()}`);
                                  } catch (err) {
                                    setAvatarUploadError(err instanceof Error ? err.message : "Upload failed");
                                  } finally {
                                    setAvatarUploading(false);
                                  }
                                }}
                              />
                            </label>
                            <div style={{ fontSize: 10, color: "var(--bm-text4)", marginTop: 5 }}>JPG, PNG, GIF · Max 2 MB</div>
                            {avatarUploadError && <div style={{ fontSize: 11, color: "var(--bm-red)", marginTop: 4 }}>{avatarUploadError}</div>}
                          </div>
                        </div>
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

            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
