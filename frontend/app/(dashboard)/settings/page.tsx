"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase/client";
import { ensureUserProfile, getCurrentUser } from "@/lib/buildmind";
import { FEATURES } from "@/lib/features";
import PageHero from "@/components/layout/page-hero";

type TabKey = "profile" | "account" | "notifications" | "ai";

export default function SettingsPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<TabKey>("profile");
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

  useEffect(() => {
    if (!FEATURES.notifications && tab === "notifications") {
      setTab("profile");
    }
    const load = async () => {
      try {
        const user = await getCurrentUser();
        if (!user) return;
        await ensureUserProfile(user);
        setEmail(user.email ?? "");
        setAvatarUrl((user.user_metadata?.avatar_url as string | undefined) ?? "");
        const { data: profile } = await supabase.from("users").select("full_name").eq("id", user.id).single();
        setFullName(profile?.full_name ?? "");
        const { data: settings } = await supabase
          .from("users")
          .select("notify_milestone,notify_task")
          .eq("id", user.id)
          .single();
        setNotifyMilestone(Boolean(settings?.notify_milestone ?? true));
        setNotifyTask(Boolean(settings?.notify_task ?? true));
        const d = new Date();
        const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
        const { data: usage } = await supabase
          .from("ai_usage")
          .select("count")
          .eq("user_id", user.id)
          .eq("month", month)
          .maybeSingle();
        setAiUsage(usage?.count ?? 0);
      } catch {
        setMessage("Failed to load settings.");
      }
    };
    void load();
  }, [supabase]);

  const saveProfile = async () => {
    const user = await getCurrentUser();
    if (!user) return;
    setMessage("");
    try {
      await ensureUserProfile(user);
      const { error } = await supabase.from("users").update({ full_name: fullName }).eq("id", user.id);
      if (error) throw error;
      const { error: authError } = await supabase.auth.updateUser({
        data: { avatar_url: avatarUrl || null },
      });
      if (authError) throw authError;
      setMessage("Profile updated.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update profile.";
      setMessage(message);
    }
  };

  const uploadAvatar = async (file: File) => {
    const user = await getCurrentUser();
    if (!user) return;
    setAvatarUploading(true);
    setMessage("");
    try {
      if (!file.type.startsWith("image/")) {
        throw new Error("Please upload an image file.");
      }
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "");
      const path = `${user.id}/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = data?.publicUrl ?? "";
      setAvatarUrl(publicUrl);
      const { error: authError } = await supabase.auth.updateUser({
        data: { avatar_url: publicUrl || null },
      });
      if (authError) throw authError;
      setMessage("Avatar updated.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to upload avatar.";
      setMessage(message);
    } finally {
      setAvatarUploading(false);
    }
  };

  const onAvatarFile = (file?: File | null) => {
    if (!file) return;
    void uploadAvatar(file);
  };

  const saveNotificationPrefs = async () => {
    const user = await getCurrentUser();
    if (!user) return;
    const { error } = await supabase
      .from("users")
      .update({ notify_milestone: notifyMilestone, notify_task: notifyTask })
      .eq("id", user.id);
    if (error) throw error;
    setMessage("Notification preferences updated.");
  };

  const updatePass = async (e: FormEvent) => {
    e.preventDefault();
    if (!newPassword) return;
    if (!currentPassword.trim()) return;
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
    setCurrentPassword("");
    setNewPassword("");
    setMessage("Password updated.");
  };

  return (
    <section className="space-y-6">
      <PageHero
        kicker="Settings"
        title="Account & Preferences"
        subtitle="Profile, account, notifications, and AI usage."
      />

      <Tabs>
        <TabsList>
          <TabsTrigger active={tab === "profile"} onClick={() => setTab("profile")}>Profile</TabsTrigger>
          <TabsTrigger active={tab === "account"} onClick={() => setTab("account")}>Account</TabsTrigger>
          {FEATURES.notifications ? (
            <TabsTrigger active={tab === "notifications"} onClick={() => setTab("notifications")}>Notifications</TabsTrigger>
          ) : null}
          <TabsTrigger active={tab === "ai"} onClick={() => setTab("ai")}>AI Usage</TabsTrigger>
        </TabsList>

        <TabsContent className={tab === "profile" ? "" : "hidden"}>
          <Card className="glass-panel panel-glow">
            <CardHeader><CardTitle className="text-zinc-100">Profile</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 overflow-hidden rounded-full border border-white/10 bg-white/5">
                  {avatarUrl ? <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" /> : null}
                </div>
                <div className="space-y-2">
                  <Input
                    placeholder="Avatar URL"
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    className="border-white/10 bg-black/20 text-zinc-100 placeholder:text-zinc-500"
                  />
                  <input
                    type="file"
                    accept="image/*"
                    className="text-sm text-zinc-400"
                    onChange={(e) => onAvatarFile(e.target.files?.[0])}
                    disabled={avatarUploading}
                  />
                  {avatarUploading ? <p className="text-xs text-zinc-400">Uploading...</p> : null}
                </div>
              </div>
              <Input
                placeholder="Full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="border-white/10 bg-black/20 text-zinc-100 placeholder:text-zinc-500"
              />
              <Button className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white" onClick={() => void saveProfile()}>
                Save Profile
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent className={tab === "account" ? "" : "hidden"}>
          <Card className="glass-panel panel-glow">
            <CardHeader><CardTitle className="text-zinc-100">Account</CardTitle></CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={(e) => void updatePass(e)}>
                <Input value={email} disabled className="border-white/10 bg-black/20 text-zinc-100 placeholder:text-zinc-500" />
                <Input
                  type="password"
                  placeholder="Current password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="border-white/10 bg-black/20 text-zinc-100 placeholder:text-zinc-500"
                />
                <Input
                  type="password"
                  placeholder="New password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="border-white/10 bg-black/20 text-zinc-100 placeholder:text-zinc-500"
                />
                <Button type="submit" className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white">
                  Change Password
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {FEATURES.notifications ? (
          <TabsContent className={tab === "notifications" ? "" : "hidden"}>
          <Card className="glass-panel panel-glow">
            <CardHeader><CardTitle className="text-zinc-100">Notifications</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm text-zinc-300">
              <label className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                <span>Milestone completed</span>
                <input type="checkbox" checked={notifyMilestone} onChange={(e) => setNotifyMilestone(e.target.checked)} />
              </label>
              <label className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                <span>Task completed</span>
                <input type="checkbox" checked={notifyTask} onChange={(e) => setNotifyTask(e.target.checked)} />
              </label>
              <Button className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white" onClick={() => void saveNotificationPrefs()}>
                Save Notification Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
        ) : null}

        <TabsContent className={tab === "ai" ? "" : "hidden"}>
          <Card className="glass-panel panel-glow">
            <CardHeader><CardTitle className="text-zinc-100">AI Usage</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm text-zinc-300">
              <p>Monthly usage limit: 20 generations</p>
              <p>Current usage: {aiUsage}/20</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {message ? <p className="text-sm text-emerald-300">{message}</p> : null}
    </section>
  );
}
