"use client";

import { FormEvent, useEffect, useState } from "react";
import { getCurrentUser, updateCurrentUser } from "@/lib/api";

export default function ProfilePage() {
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const user = await getCurrentUser();
        setUsername(user.username || "");
        setBio(user.bio || "");
        setAvatarUrl(user.avatar_url || "");
      } catch {
        // no-op
      }
    };
    void load();
  }, []);

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    await updateCurrentUser({ username, bio, avatar_url: avatarUrl });
    setMessage("Profile updated.");
  };

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-slate-900">Profile</h2>
      <form onSubmit={onSave} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3">
          <label className="text-sm text-slate-700">Username
            <input value={username} onChange={(e) => setUsername(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm text-slate-700">Avatar URL
            <input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm text-slate-700">Bio
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={4} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
        </div>
        <button type="submit" className="mt-4 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">Save Profile</button>
        {message ? <p className="mt-3 text-sm text-emerald-700">{message}</p> : null}
      </form>
    </section>
  );
}
