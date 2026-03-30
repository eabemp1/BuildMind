"use client";

import { FormEvent, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { ensureUserProfile, getCurrentUser } from "@/lib/buildmind";
import { FEATURES } from "@/lib/features";

type Tab = "profile" | "account" | "notifications" | "ai";

const inputStyle = {
  background: "#080808", border: "1px solid #1c1c1c",
  borderRadius: 7, padding: "10px 13px", fontSize: 13, color: "#d4d4d4",
  outline: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box" as const,
  transition: "border-color 0.15s",
};

const TABS: { id: Tab; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "account", label: "Account" },
  ...(FEATURES.notifications ? [{ id: "notifications" as Tab, label: "Notifications" }] : []),
  { id: "ai", label: "AI Usage" },
];

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <motion.button
      onClick={() => onChange(!checked)}
      style={{ width: 40, height: 22, borderRadius: 11, background: checked ? "#6366f1" : "#1c1c1c", border: "1px solid #222", position: "relative", cursor: "pointer", flexShrink: 0, transition: "background 0.2s" }}>
      <motion.div
        animate={{ x: checked ? 19 : 2 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff", position: "absolute", top: 2 }} />
    </motion.button>
  );
}

export default function SettingsPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("profile");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
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
      setCurrentPassword(""); setNewPassword("");
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
      const ext = file.name.split(".").pop();
      const path = `${user.id}/avatar.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
      await supabase.auth.updateUser({ data: { avatar_url: publicUrl } });
      setAvatarUrl(publicUrl);
      msg("Avatar updated.");
    } catch { msg("Upload failed.", "err"); } finally { setAvatarUploading(false); }
  };

  const card = { background: "#0d0d0d", border: "1px solid #1c1c1c", borderRadius: 10, padding: "22px 24px" };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      style={{ maxWidth: 680, margin: "0 auto", fontFamily: "system-ui,sans-serif", color: "#e5e5e5", paddingBottom: 40 }}>

      {/* Header */}
      <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid #1c1c1c" }}>
        <div style={{ fontSize: 19, fontWeight: 500, color: "#fff", letterSpacing: "-0.02em" }}>Settings</div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #1c1c1c", marginBottom: 22, gap: 0 }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ background: "none", border: "none", borderBottom: tab === t.id ? "1px solid #fff" : "1px solid transparent", color: tab === t.id ? "#fff" : "#555", fontSize: 13, padding: "8px 18px", cursor: "pointer", fontFamily: "inherit", marginBottom: -1, transition: "color 0.15s" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Toast */}
      <AnimatePresence>
        {message && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{ marginBottom: 14, padding: "10px 16px", borderRadius: 7, fontSize: 12, background: messageType === "ok" ? "rgba(74,222,128,0.08)" : "rgba(248,113,113,0.08)", border: `1px solid ${messageType === "ok" ? "rgba(74,222,128,0.2)" : "rgba(248,113,113,0.2)"}`, color: messageType === "ok" ? "#4ade80" : "#f87171" }}>
            {message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* PROFILE */}
      {tab === "profile" && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <form onSubmit={(e) => void saveProfile(e)} style={{ ...card, display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Avatar */}
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#1a1a1a", border: "1px solid #222", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {avatarUrl
                  ? <img src={avatarUrl} alt="Avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <span style={{ fontSize: 18, color: "#333" }}>{fullName?.[0]?.toUpperCase() ?? "?"}</span>}
              </div>
              <div>
                <label style={{ display: "inline-block", background: "transparent", border: "1px solid #222", color: "#888", fontSize: 12, padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit" }}>
                  {avatarUploading ? "Uploading..." : "Change avatar"}
                  <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadAvatar(f); }} />
                </label>
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#444", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 6 }}>Full name</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" style={inputStyle}
                onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "#333"; }}
                onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "#1c1c1c"; }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#444", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 6 }}>Email</label>
              <input value={email} disabled style={{ ...inputStyle, color: "#444", cursor: "not-allowed" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="submit" style={{ background: "#fff", color: "#000", fontWeight: 600, fontSize: 13, padding: "8px 18px", borderRadius: 7, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                Save profile
              </button>
            </div>
          </form>
        </motion.div>
      )}

      {/* ACCOUNT */}
      {tab === "account" && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <form onSubmit={(e) => void savePassword(e)} style={{ ...card, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: "#fff", marginBottom: 2 }}>Change password</div>
            <div>
              <label style={{ fontSize: 11, color: "#444", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 6 }}>New password</label>
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

      {/* NOTIFICATIONS */}
      {tab === "notifications" && FEATURES.notifications && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <div style={{ ...card, display: "flex", flexDirection: "column", gap: 16 }}>
            {[
              { label: "Milestone notifications", sub: "Get notified when you complete a milestone", val: notifyMilestone, set: setNotifyMilestone },
              { label: "Task reminders", sub: "Daily reminder to complete your action", val: notifyTask, set: setNotifyTask },
            ].map((n) => (
              <div key={n.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, paddingBottom: 16, borderBottom: "1px solid #111" }}>
                <div>
                  <div style={{ fontSize: 13, color: "#d4d4d4", marginBottom: 3 }}>{n.label}</div>
                  <div style={{ fontSize: 12, color: "#444" }}>{n.sub}</div>
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

      {/* AI USAGE */}
      {tab === "ai" && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <div style={{ ...card }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: "#fff", marginBottom: 16 }}>AI usage this month</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 36, fontWeight: 500, color: "#f1f5f9", letterSpacing: "-0.03em" }}>{aiUsage}</span>
              <span style={{ fontSize: 13, color: "#444" }}>requests</span>
            </div>
            <div style={{ height: 3, background: "#111", borderRadius: 9999, overflow: "hidden", marginBottom: 16 }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, (aiUsage / 50) * 100)}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                style={{ height: "100%", background: aiUsage > 40 ? "#f87171" : aiUsage > 20 ? "#fbbf24" : "#4ade80", borderRadius: 9999 }} />
            </div>
            <div style={{ fontSize: 12, color: "#444", lineHeight: 1.6 }}>
              Every request to BuildMini reads your actual project data before responding — so the more you use it, the more context it has.
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
