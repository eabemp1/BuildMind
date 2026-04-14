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

type TopbarProps = { onToggleSidebar?: () => void };

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

    const features = [
      { label: "Dashboard",         href: "/dashboard",       keywords: ["overview", "stats", "execution"] },
      { label: "Today's Action",    href: "/action",          keywords: ["action", "next step", "today"] },
      { label: "Projects",          href: "/projects",        keywords: ["workspace", "roadmap", "milestones"] },
      { label: "AI Coach",          href: "/ai-coach",        keywords: ["ai coach", "chat", "advice"] },
      { label: "Break My Startup",  href: "/break-startup",   keywords: ["break", "analysis", "risk"] },
      { label: "Progress",          href: "/reports",         keywords: ["reports", "weekly report"] },
      { label: "Settings",          href: "/settings",        keywords: ["profile", "preferences"] },
      ...(FEATURES.publicProjects ? [{ label: "Explore", href: "/explore", keywords: ["community"] }] : []),
      ...(FEATURES.notifications   ? [{ label: "Notifications", href: "/notifications", keywords: ["alerts"] }] : []),
    ];

    const recommendations = [
      { label: "Create Project",        href: "/projects",  keywords: ["new project", "start"] },
      { label: "Open Today's Action",   href: "/action",    keywords: ["action", "commit"] },
      { label: "Open AI Coach",         href: "/ai-coach",  keywords: ["ask coach"] },
      { label: "View Weekly Report",    href: "/reports",   keywords: ["weekly"] },
    ];

    return {
      features: features.filter(hasAnyMatch),
      widgets: [] as { label: string }[],
      recommendations: recommendations.filter(hasAnyMatch),
    };
  }, [searchQuery]);

  const signOut = async () => {
    setOpen(false); setSearchOpen(false);
    const supabase = createClient();
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
    <div style={{ display: "flex", alignItems: "center", gap: 12, height: "100%", padding: "0 20px" }}>

      {/* Mobile menu toggle */}
      <button
        onClick={onToggleSidebar}
        style={{
          display: "grid", placeItems: "center",
          width: 34, height: 34, borderRadius: 8,
          border: "1px solid var(--bm-border)",
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
      <div style={{ position: "relative", flex: 1 }} ref={searchRef}>
        <div style={{ position: "relative", maxWidth: 520 }}>
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
              width: "100%", height: 34, paddingLeft: 32, paddingRight: 12,
              background: "var(--bm-bg3)",
              border: "1px solid var(--bm-border)",
              borderRadius: 8, fontSize: 13,
              color: "var(--bm-text)", outline: "none",
              transition: "border-color 0.15s",
              fontFamily: "inherit",
            }}
            onFocusCapture={e => e.currentTarget.style.borderColor = "var(--bm-accent-bd)"}
            onBlurCapture={e => e.currentTarget.style.borderColor = "var(--bm-border)"}
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
                borderRadius: 12, padding: 6,
                boxShadow: "0 16px 48px rgba(0,0,0,0.4)",
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
                  <div style={{ fontSize: 9, color: "var(--bm-text4)", letterSpacing: "0.12em", textTransform: "uppercase", padding: "6px 10px 3px", fontWeight: 600 }}>
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
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
        <NotificationBell />

        {/* Avatar menu */}
        <div style={{ position: "relative" }} ref={menuRef}>
          <button
            onClick={() => setOpen(s => !s)}
            style={{
              width: 34, height: 34, borderRadius: "50%",
              border: "1px solid var(--bm-border2)",
              background: open ? "var(--bm-accent-dim)" : "var(--bm-bg3)",
              color: "var(--bm-text)", fontSize: 12, fontWeight: 600,
              cursor: "pointer", display: "grid", placeItems: "center",
              overflow: "hidden", transition: "border-color 0.15s",
              fontFamily: "inherit",
            }}
            type="button"
          >
            {avatarUrl && !avatarBroken
              ? <img src={avatarUrl} alt="Profile" style={{ width: 34, height: 34, objectFit: "cover" }} onError={() => setAvatarBroken(true)} />
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
                borderRadius: 12, padding: 5,
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
                onMouseEnter={e => e.currentTarget.style.background = "rgba(240,108,108,0.06)"}
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
