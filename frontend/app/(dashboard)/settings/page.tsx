"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase/client";
import { getCurrentUser } from "@/lib/buildmind";

type TabKey = "profile" | "account" | "notifications" | "ai";

export default function SettingsPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<TabKey>("profile");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [notifyMilestone, setNotifyMilestone] = useState(true);
  const [notifyTask, setNotifyTask] = useState(true);
  const [aiUsage, setAiUsage] = useState(0);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const user = await getCurrentUser();
        if (!user) return;
        setEmail(user.email ?? "");
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
          .single();
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
    const { error } = await supabase.from("users").update({ full_name: fullName }).eq("id", user.id);
    if (error) throw error;
    setMessage("Profile updated.");
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
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Settings</h2>
        <p className="mt-1 text-sm text-slate-600">Profile, account, notifications, and AI usage.</p>
      </div>

      <Tabs>
        <TabsList>
          <TabsTrigger active={tab === "profile"} onClick={() => setTab("profile")}>Profile</TabsTrigger>
          <TabsTrigger active={tab === "account"} onClick={() => setTab("account")}>Account</TabsTrigger>
          <TabsTrigger active={tab === "notifications"} onClick={() => setTab("notifications")}>Notifications</TabsTrigger>
          <TabsTrigger active={tab === "ai"} onClick={() => setTab("ai")}>AI Usage</TabsTrigger>
        </TabsList>

        <TabsContent className={tab === "profile" ? "" : "hidden"}>
          <Card>
            <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Input placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
              <Button onClick={() => void saveProfile()}>Save Profile</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent className={tab === "account" ? "" : "hidden"}>
          <Card>
            <CardHeader><CardTitle>Account</CardTitle></CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={(e) => void updatePass(e)}>
                <Input value={email} disabled />
                <Input
                  type="password"
                  placeholder="Current password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
                <Input
                  type="password"
                  placeholder="New password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <Button type="submit">Change Password</Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent className={tab === "notifications" ? "" : "hidden"}>
          <Card>
            <CardHeader><CardTitle>Notifications</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-700">
              <label className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                <span>Milestone completed</span>
                <input type="checkbox" checked={notifyMilestone} onChange={(e) => setNotifyMilestone(e.target.checked)} />
              </label>
              <label className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                <span>Task completed</span>
                <input type="checkbox" checked={notifyTask} onChange={(e) => setNotifyTask(e.target.checked)} />
              </label>
              <Button onClick={() => void saveNotificationPrefs()}>Save Notification Settings</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent className={tab === "ai" ? "" : "hidden"}>
          <Card>
            <CardHeader><CardTitle>AI Usage</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-700">
              <p>Monthly usage limit: 20 generations</p>
              <p>Current usage: {aiUsage}/20</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
    </section>
  );
}
