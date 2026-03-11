"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Moon, Search, Sun } from "lucide-react";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

export default function Topbar() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      setEmail(data.user?.email ?? "");
      setAvatarUrl((data.user?.user_metadata?.avatar_url as string | undefined) ?? null);
    };
    void load();
  }, []);

  const initials = useMemo(() => (email ? email.slice(0, 1).toUpperCase() : "BM"), [email]);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem("bm_theme") : null;
    const nextTheme = stored === "light" ? "light" : "dark";
    setTheme(nextTheme);
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("theme-light", nextTheme === "light");
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("theme-light", nextTheme === "light");
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem("bm_theme", nextTheme);
    }
  };

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/auth/login");
  };

  return (
    <div className="glass-panel panel-glow relative z-50 flex items-center gap-3 p-3">
      <div className="relative max-w-xl flex-1">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <Input
          placeholder="Search projects, milestones, tasks..."
          className="h-10 border-white/10 bg-black/20 pl-9 text-zinc-100 placeholder:text-zinc-500"
        />
      </div>

      <button
        onClick={toggleTheme}
        className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 bg-white/5 text-zinc-200 transition hover:bg-white/10"
        type="button"
      >
        {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
      </button>

      <button
        onClick={() => router.push("/notifications")}
        className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 bg-white/5 text-zinc-200 transition hover:bg-white/10"
        type="button"
      >
        <Bell size={16} />
      </button>

      <div className="relative">
        <button
          onClick={() => setOpen((s) => !s)}
          className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 font-semibold text-white"
          type="button"
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="Profile" className="h-10 w-10 rounded-full object-cover" />
          ) : (
            initials
          )}
        </button>

        {open ? (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-panel absolute right-0 z-[70] mt-2 w-52 p-1"
          >
            <button
              type="button"
              onClick={() => router.push("/settings")}
              className="block w-full rounded-md px-3 py-2 text-left text-sm text-zinc-200 hover:bg-white/10"
            >
              Profile
            </button>
            <button
              type="button"
              onClick={() => router.push("/admin")}
              className="block w-full rounded-md px-3 py-2 text-left text-sm text-zinc-200 hover:bg-white/10"
            >
              Admin Portal
            </button>
            <button
              type="button"
              onClick={() => void signOut()}
              className="block w-full rounded-md px-3 py-2 text-left text-sm text-rose-300 hover:bg-rose-500/10"
            >
              Logout
            </button>
          </motion.div>
        ) : null}
      </div>
    </div>
  );
}
