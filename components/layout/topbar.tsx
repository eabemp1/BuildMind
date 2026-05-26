"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Menu, Search } from "lucide-react";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { clearStoredToken, searchGlobal, type SearchResultsData } from "@/lib/api";
import { FEATURES } from "@/lib/features";
import NotificationBell from "@/components/NotificationBell";
import { NAV, hasPlanAccess } from "@/components/layout/sidebar-nav";
import { getTasksCompleted, syncTasksCompletedFromServer } from "@/lib/nav-config";
import { usePlan } from "@/lib/usePlan";

type TopbarProps = { onToggleSidebar?: () => void };

export default function Topbar({ onToggleSidebar }: TopbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [email, setEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarBroken, setAvatarBroken] = useState(false);
  const { plan } = usePlan();
  const [tasksCompleted, setTasksCompleted] = useState(0);

  // Load user email + avatar from profile on mount
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      setEmail(data.user.email ?? "");
      const authAvatar =
        typeof data.user.user_metadata?.avatar_url === "string"
          ? data.user.user_metadata.avatar_url
          : typeof data.user.user_metadata?.picture === "string"
            ? data.user.user_metadata.picture
            : null;
      // Fetch avatar_url from profiles table
      const { data: profile } = await supabase
        .from("profiles")
        .select("avatar_url")
        .eq("id", data.user.id)
        .maybeSingle();
      setAvatarUrl(profile?.avatar_url ?? authAvatar);
    });
  }, []);

  useEffect(() => {
    setTasksCompleted(getTasksCompleted());
    void syncTasksCompletedFromServer().finally(() => setTasksCompleted(getTasksCompleted()));
    const refresh = () => setTasksCompleted(getTasksCompleted());
    window.addEventListener("storage", refresh);
    window.addEventListener("bm_tasks_completed_updated", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("bm_tasks_completed_updated", refresh);
    };
  }, []);
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResultsData | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLDivElement | null>(null);
  const initials = useMemo(() => (email ? email.slice(0, 1).toUpperCase() : "BM"), [email]);

  const keywordResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return { features: [], widgets: [], recommendations: [] };
    const matches = (v: string) => v.toLowerCase().includes(query);
    const hasAnyMatch = (item: { label: string; description?: string; keywords?: string[] }) =>
      matches(item.label) ||
      (item.description ? matches(item.description) : false) ||
      (item.keywords ? item.keywords.some(k => matches(k)) : false);
    const navAccessibleHrefs = new Set(
      NAV.filter(navItem => {
        if (!navItem.enabled) return false;
        if (tasksCompleted < (navItem.unlocksAt ?? 0)) return false;
        if (navItem.requiredPlan && !hasPlanAccess(plan, navItem.requiredPlan)) return false;
        if (navItem.href === "/upgrade" && plan !== "free") return false;
        return true;
      }).map(i => i.href)
    );
    const isAccessible = (href: string) => navAccessibleHrefs.has(href);

    const features = [
      { label: "Execution",         href: "/overview",        keywords: ["overview", "stats", "execution"] },
      { label: "Today",             href: "/today",           keywords: ["action", "next step", "today"] },
      { label: "Projects",          href: "/projects",        keywords: ["workspace", "roadmap", "milestones"] },
      { label: "Intelligence",      href: "/ai-coach",        keywords: ["ai coach", "chat", "advice", "intelligence"] },
      { label: "Break My Startup",  href: "/break-my-startup", keywords: ["break", "analysis", "risk"] },
      { label: "Progress",          href: "/reports",         keywords: ["reports", "weekly report"] },
      { label: "Settings",          href: "/settings",        keywords: ["profile", "preferences"] },
      ...(FEATURES.publicProjects ? [{ label: "Explore", href: "/explore", keywords: ["community"] }] : []),
      ...(FEATURES.notifications   ? [{ label: "Notifications", href: "/notifications", keywords: ["alerts"] }] : []),
    ];

    const recommendations = [
      { label: "Create Project",        href: "/projects",  keywords: ["new project", "start"] },
      { label: "Open Today",            href: "/today",     keywords: ["action", "commit"] },
      { label: "Open Intelligence",     href: "/ai-coach",  keywords: ["ask coach"] },
      { label: "View Weekly Report",    href: "/reports",   keywords: ["weekly"] },
    ];

    return {
      features: features.filter((item) => isAccessible(item.href)).filter(hasAnyMatch),
      widgets: [] as { label: string }[],
      recommendations: recommendations.filter((item) => isAccessible(item.href)).filter(hasAnyMatch),
    };
  }, [plan, searchQuery, tasksCompleted]);

  const signOut = async () => {
    setOpen(false); setSearchOpen(false);
    const supabase = createClient();
    const { storage } = await import("@/lib/storage");
    storage.onSignOut();
    await supabase.auth.signOut();
    clearStoredToken();
    router.replace("/auth/login");
    router.refresh();
  };

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults(null); setSearchOpen(false); setSearchError(null); return; }
    setSearchOpen(true); setSearchError(null);
    const handle = window.setTimeout(async () => {
      setSearchLoading(true);
      try { setSearchResults(await searchGlobal(searchQuery.trim())); }
      catch { setSearchResults(null); setSearchError("Search failed."); }
      finally { setSearchLoading(false); }
    }, 300);
    return () => window.clearTimeout(handle);
  }, [searchQuery]);

  useEffect(() => { setOpen(false); setSearchOpen(false); }, [pathname]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (open && menuRef.current && !menuRef.current.contains(t)) setOpen(false);
      if (searchOpen && searchRef.current && !searchRef.current.contains(t)) setSearchOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, searchOpen]);

  const goToProject = (id: string | number) => { setSearchOpen(false); setSearchQuery(""); router.push(`/projects/${id}`); };
  const goToFeature = (href: string)         => { setSearchOpen(false); setSearchQuery(""); router.push(href); };

  /* ── Shared dropdown item style ── */
  const dropBtn: React.CSSProperties = {
    width: "100%", background: "none", border: "none",
    padding: "7px 10px", borderRadius: 7, textAlign: "left",
    fontSize: 13, color: "var(--bm-text2)", cursor: "pointer",
    fontFamily: "inherit", transition: "background 0.1s",
  };

  return (
    <div
      className="flex h-full items-center gap-2 px-3 sm:gap-3 sm:px-6"
      style={{
        background: "color-mix(in srgb, var(--bm-bg) 92%, transparent)",
        backdropFilter: "blur(20px)",
        borderBottom: "1px solid var(--bm-border)",
      }}
    >

      {/* Mobile menu toggle */}
      <button
        onClick={onToggleSidebar}
        style={{
          display: "grid", placeItems: "center",
          width: 32, height: 32, borderRadius: 6,
          border: "1px solid var(--bm-border2)",
          background: "transparent", color: "var(--bm-text3)",
          cursor: "pointer", flexShrink: 0,
        }}
        className="md:hidden"
        type="button"
        aria-label="Toggle navigation"
      >
        <Menu size={15} />
      </button>

      {/* Search */}
      <div className="relative hidden min-[440px]:block min-w-0 flex-1" ref={searchRef}>
        <div style={{ position: "relative", maxWidth: 460 }}>
          <Search
            size={13}
            style={{
              position: "absolute", left: 11, top: "50%",
              transform: "translateY(-50%)",
              color: "var(--bm-text4)", pointerEvents: "none",
            }}
          />
          <input
            placeholder="Search projects, milestones, tasks…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onFocus={() => { if (searchQuery.trim()) setSearchOpen(true); }}
            onKeyDown={e => {
              if (e.key === "Escape") { setSearchOpen(false); setSearchQuery(""); setSearchError(null); }
            }}
            style={{
              width: "100%", height: 32, paddingLeft: 32, paddingRight: 12,
              background: "var(--bm-bg2)",
              border: "1px solid var(--bm-border2)",
              borderRadius: "var(--r-sm)", fontSize: 13,
              color: "var(--bm-text)", outline: "none",
              transition: "border-color 0.15s",
              fontFamily: "inherit",
            }}
            onFocusCapture={e => e.currentTarget.style.borderColor = "var(--bm-accent-bd)"}
            onBlurCapture={e => e.currentTarget.style.borderColor = "var(--bm-border2)"}
          />

          {/* Search dropdown */}
          {searchOpen && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                position: "absolute", left: 0, right: 0,
                top: "calc(100% + 6px)", zIndex: 60,
                maxHeight: 320, overflowY: "auto",
                background: "var(--bm-bg2)",
                border: "1px solid var(--bm-border2)",
                borderRadius: 10, padding: 6,
                boxShadow: "0 24px 70px rgba(0,0,0,0.48)",
                scrollbarWidth: "none",
              }}
            >
              {searchLoading && <p style={{ padding: "8px 10px", fontSize: 12, color: "var(--bm-text3)" }}>Searching…</p>}
              {searchError  && <p style={{ padding: "8px 10px", fontSize: 12, color: "var(--bm-red)" }}>{searchError}</p>}

              {[
                { key: "projects",  label: "Projects",  items: searchResults?.projects ?? [],  onClick: (i: any) => goToProject(i.id),    display: (i: any) => i.title },
                { key: "milestones",label: "Milestones",items: searchResults?.milestones ?? [],onClick: (i: any) => goToProject(i.project_id), display: (i: any) => i.title },
                { key: "tasks",     label: "Tasks",     items: searchResults?.tasks ?? [],     onClick: (i: any) => goToProject(i.project_id), display: (i: any) => i.title },
                { key: "features",  label: "Features",  items: keywordResults.features,        onClick: (i: any) => goToFeature(i.href),   display: (i: any) => i.label },
                { key: "recommended",label:"Recommended",items: keywordResults.recommendations, onClick: (i: any) => goToFeature(i.href),  display: (i: any) => i.label },
              ].filter(g => g.items.length > 0).map(group => (
                <div key={group.key} style={{ marginBottom: 4 }}>
                  <div style={{ fontSize: 9, color: "var(--bm-text4)", letterSpacing: "0.12em", textTransform: "uppercase", padding: "6px 10px 3px", fontWeight: 600, fontFamily: "'DM Mono', monospace" }}>
                    {group.label}
                  </div>
                  {group.items.map((item: any, idx: number) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => group.onClick(item)}
                      style={dropBtn}
                      onMouseEnter={e => e.currentTarget.style.background = "var(--bm-bg3)"}
                      onMouseLeave={e => e.currentTarget.style.background = "none"}
                    >
                      {group.display(item)}
                    </button>
                  ))}
                </div>
              ))}

              {!searchLoading && !searchError &&
                searchResults?.projects.length === 0 &&
                searchResults?.milestones.length === 0 &&
                searchResults?.tasks.length === 0 &&
                keywordResults.features.length === 0 &&
                keywordResults.recommendations.length === 0 && (
                <p style={{ padding: "10px", fontSize: 12, color: "var(--bm-text3)", textAlign: "center" }}>No results found.</p>
              )}
            </motion.div>
          )}
        </div>
      </div>

      {/* Right controls */}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <NotificationBell />

        {/* Avatar menu */}
        <div style={{ position: "relative" }} ref={menuRef}>
          <button
            onClick={() => setOpen(s => !s)}
            style={{
              width: 32, height: 32, borderRadius: 8,
              border: "1px solid var(--bm-border2)",
              background: open ? "var(--bm-accent-dim)" : "var(--bm-bg2)",
              color: "var(--bm-text)", fontSize: 12, fontWeight: 600,
              cursor: "pointer", display: "grid", placeItems: "center",
              overflow: "hidden", transition: "border-color 0.15s",
              fontFamily: "inherit",
            }}
            type="button"
          >
            {avatarUrl && !avatarBroken
              ? <img src={avatarUrl} alt="Profile" style={{ width: 32, height: 32, objectFit: "cover" }} onError={() => setAvatarBroken(true)} />
              : initials
            }
          </button>

          {open && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.12 }}
              style={{
                position: "absolute", right: 0, marginTop: 6,
                width: 180, zIndex: 70,
                background: "var(--bm-bg2)",
                border: "1px solid var(--bm-border2)",
                borderRadius: 10, padding: 5,
                boxShadow: "0 16px 48px rgba(0,0,0,0.4)",
              }}
            >
              <button type="button" onClick={() => { setOpen(false); router.push("/settings"); }} style={{ ...dropBtn, color: "var(--bm-text)" }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--bm-bg3)"}
                onMouseLeave={e => e.currentTarget.style.background = "none"}>
                Profile & Settings
              </button>
              <div style={{ height: 1, background: "var(--bm-border)", margin: "4px 0" }} />
              <button type="button" onClick={() => void signOut()} style={{ ...dropBtn, color: "var(--bm-red)" }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(176,72,72,0.08)"}
                onMouseLeave={e => e.currentTarget.style.background = "none"}>
                Logout
              </button>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
