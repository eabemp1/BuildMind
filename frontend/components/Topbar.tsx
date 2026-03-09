"use client";

import { useEffect, useState } from "react";
import { clearStoredToken, getActiveProjectId, getStoredToken } from "@/lib/api";
import NotificationBell from "@/components/NotificationBell";

export default function Topbar() {
  const [isAuthed, setIsAuthed] = useState(false);
  const [projectId, setProjectId] = useState<number | null>(null);

  useEffect(() => {
    setIsAuthed(Boolean(getStoredToken()));
    setProjectId(getActiveProjectId());
  }, []);

  const logout = () => {
    clearStoredToken();
    setIsAuthed(false);
  };

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="max-app flex h-16 items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <label htmlFor="project-switcher" className="text-sm font-medium text-slate-600">
            Project
          </label>
          <select
            id="project-switcher"
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none ring-brand-500 focus:ring-2"
            value={projectId ? String(projectId) : ""}
            onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">{projectId ? `Project #${projectId}` : "No active project"}</option>
          </select>
        </div>
        <button onClick={logout} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
          {isAuthed ? "Logout" : "Not logged in"}
        </button>
        <NotificationBell />
      </div>
    </header>
  );
}
