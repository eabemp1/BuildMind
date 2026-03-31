"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Menu, Search } from "lucide-react";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { clearStoredToken, searchGlobal, type SearchResultsData } from "@/lib/api";
import { getUnreadNotificationCount } from "@/lib/buildmind";
import { identifyUser } from "@/lib/analytics";
import { FEATURES } from "@/lib/features";

type TopbarProps = {
  onToggleSidebar?: () => void;
};

export default function Topbar({ onToggleSidebar }: TopbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [email, setEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarBroken, setAvatarBroken] = useState(false);
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResultsData | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      setEmail(data.user?.email ?? "");
      const rawAvatar = (data.user?.user_metadata?.avatar_url as string | undefined) ?? null;
      const normalized = rawAvatar && rawAvatar.trim().length > 0 ? rawAvatar : null;
      setAvatarUrl(normalized);
      setAvatarBroken(false);
      if (data.user?.id) {
        identifyUser(data.user.id, data.user?.email ?? null);
      }
    };
    void load();
  }, []);

  useEffect(() => {
    let mounted = true;
    const fetchCount = async () => {
      try {
        const count = await getUnreadNotificationCount();
        if (mounted) setUnreadCount(count);
      } catch {
        if (mounted) setUnreadCount(0);
      }
    };
    void fetchCount();
    const timer = window.setInterval(fetchCount, 30000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  const initials = useMemo(() => (email ? email.slice(0, 1).toUpperCase() : "BM"), [email]);
  const keywordResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return { features: [], widgets: [], recommendations: [] };
    const matches = (value: string) => value.toLowerCase().includes(query);
    const hasAnyMatch = (item: { label: string; description?: string; keywords?: string[] }) => {
      if (matches(item.label)) return true;
      if (item.description && matches(item.description)) return true;
      if (item.keywords && item.keywords.some((keyword) => matches(keyword))) return true;
      return false;
    };
    const features = [
      { label: "Dashboard", href: "/dashboard", keywords: ["overview", "stats", "execution", "startup score", "next best action"] },
      { label: "Today's Action", href: "/action", keywords: ["action", "next step", "today", "commitment"] },
      { label: "Projects", href: "/projects", keywords: ["workspace", "roadmap", "milestones", "tasks"] },
      { label: "BuildMini", href: "/ai-coach", keywords: ["ai coach", "chat", "advice"] },
      { label: "Break My Startup", href: "/break-startup", keywords: ["break", "analysis", "competitors", "risk"] },
      { label: "Progress", href: "/reports", keywords: ["reports", "weekly report", "analytics"] },
      { label: "Settings", href: "/settings", keywords: ["profile", "preferences"] },
    ];
    if (FEATURES.publicProjects) {
      features.push({ label: "Explore", href: "/explore", keywords: ["public projects", "community"] });
    }
    if (FEATURES.notifications) {
      features.push({ label: "Notifications", href: "/notifications", keywords: ["alerts", "activity"] });
    }
    if (FEATURES.analytics) {
      features.push({ label: "Analytics", href: "/analytics", keywords: ["metrics", "usage"] });
    }

    const widgets = [
      { label: "Next Best Action", keywords: ["recommendation", "next step", "action"] },
      { label: "Startup Score", keywords: ["execution score", "validation score", "progress score"] },
      { label: "Founder Execution Streak", keywords: ["streak", "consistency", "tasks completed"] },
      { label: "Milestone Timeline", keywords: ["timeline", "stage", "progress"] },
      { label: "Milestones Progress", keywords: ["completion", "progress bar"] },
      { label: "AI Validation", keywords: ["feedback", "analysis", "buildmind ai"] },
      { label: "Strengths", keywords: ["validation strengths"] },
      { label: "Weaknesses", keywords: ["validation weaknesses"] },
      { label: "Suggestions", keywords: ["validation suggestions"] },
      { label: "Task List", keywords: ["tasks", "execution", "notes"] },
      { label: "Quick BuildMini", keywords: ["ask buildmini", "coach"] },
      { label: "Recent Activity", keywords: ["activity", "feed"] },
      { label: "Weekly Founder Report", keywords: ["weekly report", "summary"] },
      { label: "Startup Timeline", keywords: ["idea", "validation", "mvp", "launch", "growth"] },
    ];

    const recommendations = [
      { label: "Create Project", href: "/projects", keywords: ["new project", "start", "workspace"] },
      { label: "Open Today's Action", href: "/action", keywords: ["action", "commit"] },
      { label: "Open BuildMini", href: "/ai-coach", keywords: ["ask coach", "advice"] },
      { label: "View Weekly Report", href: "/reports", keywords: ["weekly", "report", "summary"] },
    ];

    return {
      features: features.filter(hasAnyMatch),
      widgets: widgets.filter(hasAnyMatch),
      recommendations: recommendations.filter(hasAnyMatch),
    };
  }, [searchQuery]);

  const signOut = async () => {
    setOpen(false);
    setSearchOpen(false);
    const supabase = createClient();
    await supabase.auth.signOut();
    clearStoredToken();
    router.replace("/auth/login");
    router.refresh();
  };

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      setSearchOpen(false);
      setSearchError(null);
      return;
    }
    setSearchOpen(true);
    setSearchError(null);
    const handle = window.setTimeout(async () => {
      setSearchLoading(true);
      try {
        const data = await searchGlobal(searchQuery.trim());
        setSearchResults(data);
        setSearchError(null);
      } catch {
        setSearchResults(null);
        setSearchError("Search failed. Check your connection or API settings.");
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => window.clearTimeout(handle);
  }, [searchQuery]);

  const goToProject = (projectId: string | number) => {
    setSearchOpen(false);
    setSearchError(null);
    setSearchQuery("");
    router.push(`/projects/${projectId}`);
  };

  const goToFeature = (href: string) => {
    setSearchOpen(false);
    setSearchError(null);
    setSearchQuery("");
    router.push(href);
  };

  useEffect(() => {
    setOpen(false);
    setSearchOpen(false);
  }, [pathname]);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const target = event.target as Node;
      if (open && menuRef.current && !menuRef.current.contains(target)) {
        setOpen(false);
      }
      if (searchOpen && searchRef.current && !searchRef.current.contains(target)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, searchOpen]);

  return (
    <div className="relative z-50 flex h-full w-full items-center gap-3 px-4">
      <button
        onClick={onToggleSidebar}
        className="grid h-9 w-9 place-items-center rounded-lg border border-[#1c1c1c] bg-[#0d0d0d] text-zinc-200 transition hover:bg-white/5 md:hidden"
        type="button"
        aria-label="Toggle navigation"
      >
        <Menu size={16} />
      </button>

      <div className="relative flex-1" ref={searchRef}>
        <div className="relative w-full max-w-[560px]">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <Input
            placeholder="Search projects, milestones, tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => {
              if (searchQuery.trim()) setSearchOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setSearchOpen(false);
                setSearchQuery("");
                setSearchError(null);
              }
            }}
            className="h-10 border-[#1c1c1c] bg-[#0d0d0d] pl-9 text-zinc-100 placeholder:text-zinc-500"
          />
        {searchOpen ? (
          <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 max-h-80 overflow-auto rounded-xl border border-[#1c1c1c] bg-[#0d0d0d] p-2 text-sm shadow-2xl">
            {searchLoading ? <p className="px-2 py-2 text-zinc-400">Searching...</p> : null}
            {searchError ? <p className="px-2 py-2 text-rose-400">{searchError}</p> : null}
            {searchResults &&
            searchResults.projects.length === 0 &&
            searchResults.milestones.length === 0 &&
            searchResults.tasks.length === 0 &&
            keywordResults.features.length === 0 &&
            keywordResults.widgets.length === 0 &&
            keywordResults.recommendations.length === 0 &&
            !searchLoading &&
            !searchError ? (
              <p className="px-2 py-2 text-zinc-400">No results found.</p>
            ) : null}
            {searchResults && searchResults.projects.length > 0 ? (
              <div className="space-y-1">
                <p className="px-2 pt-2 text-xs uppercase tracking-[0.2em] text-zinc-400">Projects</p>
                {searchResults.projects.map((item) => (
                  <button
                    key={`p-${item.id}`}
                    type="button"
                    onClick={() => goToProject(item.id)}
                    className="w-full rounded-md px-2 py-2 text-left text-zinc-200 hover:bg-white/5"
                  >
                    {item.title}
                  </button>
                ))}
              </div>
            ) : null}
            {searchResults && searchResults.milestones.length > 0 ? (
              <div className="space-y-1 pt-2">
                <p className="px-2 pt-2 text-xs uppercase tracking-[0.2em] text-zinc-400">Milestones</p>
                {searchResults.milestones.map((item) => (
                  <button
                    key={`m-${item.id}`}
                    type="button"
                    onClick={() => goToProject(item.project_id)}
                    className="w-full rounded-md px-2 py-2 text-left text-zinc-200 hover:bg-white/5"
                  >
                    {item.title}
                  </button>
                ))}
              </div>
            ) : null}
            {searchResults && searchResults.tasks.length > 0 ? (
              <div className="space-y-1 pt-2">
                <p className="px-2 pt-2 text-xs uppercase tracking-[0.2em] text-zinc-400">Tasks</p>
                {searchResults.tasks.map((item) => (
                  <button
                    key={`t-${item.id}`}
                    type="button"
                    onClick={() => goToProject(item.project_id)}
                    className="w-full rounded-md px-2 py-2 text-left text-zinc-200 hover:bg-white/5"
                  >
                    {item.title}
                  </button>
                ))}
              </div>
            ) : null}
            {keywordResults.features.length > 0 ? (
              <div className="space-y-1 pt-2">
                <p className="px-2 pt-2 text-xs uppercase tracking-[0.2em] text-zinc-400">Features</p>
                {keywordResults.features.map((item) => (
                  <button
                    key={`f-${item.href}`}
                    type="button"
                    onClick={() => goToFeature(item.href)}
                    className="w-full rounded-md px-2 py-2 text-left text-zinc-200 hover:bg-white/5"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ) : null}
            {keywordResults.widgets.length > 0 ? (
              <div className="space-y-1 pt-2">
                <p className="px-2 pt-2 text-xs uppercase tracking-[0.2em] text-zinc-400">Widgets</p>
                {keywordResults.widgets.map((item) => (
                  <div
                    key={`w-${item.label}`}
                    className="w-full rounded-md px-2 py-2 text-left text-zinc-200"
                  >
                    {item.label}
                  </div>
                ))}
              </div>
            ) : null}
            {keywordResults.recommendations.length > 0 ? (
              <div className="space-y-1 pt-2">
                <p className="px-2 pt-2 text-xs uppercase tracking-[0.2em] text-zinc-400">Recommended</p>
                {keywordResults.recommendations.map((item) => (
                  <button
                    key={`r-${item.label}`}
                    type="button"
                    onClick={() => goToFeature(item.href)}
                    className="w-full rounded-md px-2 py-2 text-left text-zinc-200 hover:bg-white/5"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        </div>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <button
          onClick={() => router.push("/notifications")}
          className="relative grid h-10 w-10 place-items-center rounded-lg border border-[#1c1c1c] bg-[#0d0d0d] text-zinc-200 transition hover:bg-white/5"
          type="button"
        >
          <Bell size={16} />
          {unreadCount > 0 ? (
            <span className="absolute -right-1 -top-1 grid h-5 min-w-[20px] place-items-center rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 px-1 text-[11px] font-semibold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </button>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setOpen((s) => !s)}
            className="grid h-10 w-10 place-items-center rounded-full border border-[#1c1c1c] bg-[#0d0d0d] font-semibold text-zinc-100"
            type="button"
          >
            {avatarUrl && !avatarBroken ? (
              <img
                src={avatarUrl}
                alt="Profile"
                className="h-10 w-10 rounded-full object-cover"
                onError={() => setAvatarBroken(true)}
              />
            ) : (
              initials
            )}
          </button>

          {open ? (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute right-0 z-[70] mt-2 w-52 rounded-xl border border-[#1c1c1c] bg-[#0d0d0d] p-1 shadow-2xl"
            >
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  router.push("/settings");
                }}
                className="block w-full rounded-md px-3 py-2 text-left text-sm text-zinc-200 hover:bg-white/5"
              >
                Profile
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
    </div>
  );
}
