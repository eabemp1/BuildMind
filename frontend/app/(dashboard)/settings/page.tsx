"use client";

import { FormEvent, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { ensureUserProfile, getCurrentUser } from "@/lib/buildmind";
import { FEATURES } from "@/lib/features";

type Tab = "profile" | "account" | "notifications" | "ai";

const inputStyle = {
  background: "#0a0a0a", border: "1px solid #222", borderRadius: 6,
  padding: "9px 12px", fontSize: 13, color: "#d4d4d4", outline: "none",
  fontFamily: "inherit", width: "100%", boxSizing: "border-box" as const,
};

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

  const saveProfile = async () => {
    const user = await getCurrentUser();
    if (!user) return;
    try {
      await ensureUserProfile(user);
      const { error } = await supabase.from("users").update({ full_name: fullName }).eq("id", user.id);
      if (error) throw error;
      const { error: authError } = await supabase.auth.updateUser({ data: { avatar_url: avatarUrl || null } });
      if (authError) throw authError;
      msg("Profile updated.");
    } catch (e) { msg(e instanceof Error ? e.message : "Failed to update.", "err"); }
  };

  const uploadAvatar = async (file: File) => {
    const user = await getCurrentUser();
    if (!user) return;
    setAvatarUploading(true);
    try {
      if (!file.type.startsWith("image/")) throw new Error("Please upload an image file.");
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "");
      const path = `${user.id}/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = data?.publicUrl ?? "";
      setAvatarUrl(publicUrl);
      await supabase.auth.updateUser({ data: { avatar_url: publicUrl || null } });
      msg("Avatar updated.");
    } catch (e) { msg(e instanceof Error ? e.message : "Failed to upload.", "err"); }
    finally { setAvatarUploading(false); }
  };

  const saveNotifications = async () => {
    const user = await getCurrentUser();
    if (!user) return;
    const { error } = await supabase.from("users").update({ notify_milestone: notifyMilestone, notify_task: notifyTask }).eq("id", user.id);
    if (error) { msg("Failed to save.", "err"); return; }
    msg("Saved.");
  };

  const updatePass = async (e: FormEvent) => {
    e.preventDefault();
    if (!newPassword || !currentPassword.trim()) return;
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) { msg(error.message, "err"); return; }
    setCurrentPassword(""); setNewPassword("");
    msg("Password updated.");
  };

  const TABS: { key: Tab; label: string; show: boolean }[] = [
    { key: "profile", label: "Profile", show: true },
    { key: "account", label: "Account", show: true },
    { key: "notifications", label: "Notifications", show: FEATURES.notifications },
    { key: "ai", label: "AI usage", show: true },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      style={{ maxWidth: 680, margin: "0 auto", fontFamily: "system-ui,sans-serif", color: "#e5e5e5" }}>

      <div style={{ marginBottom: 24, paddingBottom: 18, borderBottom: "1px solid #1c1c1c" }}>
        <div style={{ fontSize: 20, fontWeight: 500, color: "#fff", letterSpacing: "-0.02em" }}>Settings</div>
        <div style={{ fontSize: 12, color: "#888", marginTop: 3 }}>Profile, account, and preferences</div>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", borderBottom: "1px solid #1c1c1c", marginBottom: 24 }}>
        {TABS.filter((t) => t.show).map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ background: "none", border: "none", borderBottom: tab === t.key ? "1px solid #fff" : "1px solid transparent", color: tab === t.key ? "#fff" : "#666", fontSize: 13, padding: "8px 16px", cursor: "pointer", fontFamily: "inherit", marginBottom: -1 }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Profile */}
      {tab === "profile" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 18px", border: "1px solid #1c1c1c", borderRadius: 8, background: "#080808" }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#1c1c1c", border: "1px solid #222", overflow: "hidden", flexShrink: 0 }}>
              {avatarUrl && <img src={avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: "#d4d4d4", marginBottom: 6 }}>{email}</div>
              <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadAvatar(f); }} disabled={avatarUploading}
                style={{ fontSize: 12, color: "#666", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 }} />
              {avatarUploading && <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>Uploading...</div>}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 6 }}>Full name</div>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" style={inputStyle} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 6 }}>Avatar URL</div>
            <input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://..." style={inputStyle} />
          </div>
          <button onClick={() => void saveProfile()}
            style={{ background: "#fff", color: "#000", fontSize: 13, fontWeight: 500, padding: "8px 16px", borderRadius: 6, border: "none", cursor: "pointer", fontFamily: "inherit", alignSelf: "flex-start" }}>
            Save changes
          </button>
        </div>
      )}

      {/* Account */}
      {tab === "account" && (
        <form onSubmit={(e) => void updatePass(e)} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 6 }}>Email</div>
            <input value={email} disabled style={{ ...inputStyle, color: "#444", cursor: "not-allowed" }} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 6 }}>Current password</div>
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="••••••••" style={inputStyle} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 6 }}>New password</div>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" style={inputStyle} />
          </div>
          <button type="submit"
            style={{ background: "#fff", color: "#000", fontSize: 13, fontWeight: 500, padding: "8px 16px", borderRadius: 6, border: "none", cursor: "pointer", fontFamily: "inherit", alignSelf: "flex-start" }}>
            Update password
          </button>
        </form>
      )}

      {/* Notifications */}
      {tab === "notifications" && FEATURES.notifications && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            { label: "Milestone completed", value: notifyMilestone, set: setNotifyMilestone },
            { label: "Task completed", value: notifyTask, set: setNotifyTask },
          ].map((n) => (
            <div key={n.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", border: "1px solid #1c1c1c", borderRadius: 8, background: "#080808" }}>
              <span style={{ fontSize: 13, color: "#aaa" }}>{n.label}</span>
              <div onClick={() => n.set(!n.value)}
                style={{ width: 36, height: 20, borderRadius: 10, background: n.value ? "#fff" : "#222", position: "relative", cursor: "pointer", transition: "background 0.2s" }}>
                <div style={{ position: "absolute", top: 2, left: n.value ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: n.value ? "#000" : "#555", transition: "left 0.2s" }} />
              </div>
            </div>
          ))}
          <button onClick={() => void saveNotifications()}
            style={{ background: "#fff", color: "#000", fontSize: 13, fontWeight: 500, padding: "8px 16px", borderRadius: 6, border: "none", cursor: "pointer", fontFamily: "inherit", alignSelf: "flex-start", marginTop: 4 }}>
            Save
          </button>
        </div>
      )}

      {/* AI usage */}
      {tab === "ai" && (
        <div style={{ border: "1px solid #1c1c1c", borderRadius: 8, overflow: "hidden" }}>
          <div style={{ padding: "11px 18px", borderBottom: "1px solid #1c1c1c", background: "#080808", fontSize: 12, color: "#888" }}>Monthly usage</div>
          <div style={{ padding: "20px 18px" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
              <div style={{ fontSize: 30, fontWeight: 500, color: "#fff", letterSpacing: "-0.03em" }}>{aiUsage}</div>
              <div style={{ fontSize: 14, color: "#666" }}>/ 20 generations</div>
            </div>
            <div style={{ height: 4, background: "#1c1c1c", borderRadius: 9999, overflow: "hidden", marginBottom: 8, maxWidth: 280 }}>
              <div style={{ height: "100%", width: `${Math.min((aiUsage / 20) * 100, 100)}%`, background: aiUsage >= 18 ? "#f87171" : aiUsage >= 14 ? "#fbbf24" : "#fff", borderRadius: 9999, transition: "width 0.6s" }} />
            </div>
            <div style={{ fontSize: 12, color: "#666" }}>{20 - aiUsage} remaining this month</div>
          </div>
        </div>
      )}

      {message && <div style={{ marginTop: 16, fontSize: 12, color: messageType === "ok" ? "#4ade80" : "#f87171" }}>{message}</div>}
    </motion.div>
  );
}
