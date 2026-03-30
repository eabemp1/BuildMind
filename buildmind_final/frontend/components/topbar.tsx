"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { FEATURES } from "@/lib/features";

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 17h5l-1.4-1.4a2 2 0 0 1-.6-1.4V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
      <path d="M9 17a3 3 0 0 0 6 0" />
    </svg>
  );
}

export default function Topbar() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      try {
        const { data } = await supabase.auth.getUser();
        setEmail(data.user?.email ?? "");
      } catch {
        setEmail("");
      }
    };
    void load();
  }, []);

  const initials = useMemo(() => {
    if (!email) return "BM";
    const first = email[0] ?? "B";
    return first.toUpperCase();
  }, [email]);

  const onLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/auth/login");
  };

  return (
    <header className="flex items-center gap-3">
      <div className="relative max-w-xl flex-1">
        <Input placeholder="Search projects, milestones, tasks..." className="h-10 border-slate-300 bg-white pl-10" />
        <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </div>
      {FEATURES.notifications ? (
        <Button variant="outline" className="ml-auto h-10 gap-2 border-slate-300 text-slate-700 hover:bg-slate-100" onClick={() => router.push("/notifications")}>
          <BellIcon />
          <span className="hidden sm:inline">Notifications</span>
        </Button>
      ) : null}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="grid h-10 w-10 place-items-center rounded-full border border-slate-300 bg-gradient-to-br from-slate-900 to-slate-700 text-sm font-semibold text-white shadow"
        >
          {initials}
        </button>
        {open ? (
          <div className="absolute right-0 z-50 mt-2 w-52 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
            <button
              type="button"
              onClick={() => router.push("/settings")}
              className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-slate-100"
            >
              Profile
            </button>
            {FEATURES.adminPortal ? (
              <button
                type="button"
                onClick={() => router.push("/admin")}
                className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-slate-100"
              >
                Admin Portal
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void onLogout()}
              className="block w-full rounded-md px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
            >
              Logout
            </button>
          </div>
        ) : null}
        {email ? <p className="sr-only">{email}</p> : null}
      </div>
    </header>
  );
}
