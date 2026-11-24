"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Menu, PanelLeft, Search, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { clearStoredToken } from "@/lib/api";
import NotificationBell from "@/components/NotificationBell";
import CompanionButton from "@/components/companion/CompanionButton";
import { syncTasksCompletedFromServer } from "@/lib/nav-config";
import { useSidePane } from "@/components/layout/side-pane-context";

type TopbarProps = { onToggleSidebar?: () => void; navOpen?: boolean };

export default function Topbar({ onToggleSidebar, navOpen = true }: TopbarProps) {
  const { pane, openPane, closePane } = useSidePane();
  const router = useRouter();
  const pathname = usePathname();
  const [email, setEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarBroken, setAvatarBroken] = useState(false);

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

  // Keeps the completed-task count fresh for the palette's "unlocks after N tasks" hints.
  useEffect(() => { void syncTasksCompletedFromServer(); }, []);
  const [open, setOpen] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  const [briefCount, setBriefCount] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const initials = useMemo(() => (email ? email.slice(0, 1).toUpperCase() : "BM"), [email]);

  const signOut = async () => {
    setOpen(false);
    const supabase = createClient();
    const { storage } = await import("@/lib/storage");
    storage.onSignOut();
    await supabase.auth.signOut();
    clearStoredToken();
    router.replace("/auth/login");
    router.refresh();
  };

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    const show = () => setBriefOpen(true);
    window.addEventListener("bm:open-brief", show);
    return () => window.removeEventListener("bm:open-brief", show);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (open && menuRef.current && !menuRef.current.contains(t)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  /* ── Shared dropdown item style ── */
  const dropBtn: React.CSSProperties = {
    width: "100%", background: "none", border: "none",
    padding: "7px 10px", borderRadius: 7, textAlign: "left",
    fontSize: 13, color: "var(--bm-text2)", cursor: "pointer",
    fontFamily: "inherit", transition: "background 0.1s",
  };

  return (
    <div
      className="relative flex h-full items-center gap-2 px-3 sm:gap-3 sm:px-6"
      style={{
        background: "color-mix(in srgb, var(--bm-bg) 92%, transparent)",
        backdropFilter: "blur(20px)",
        borderBottom: "1px solid var(--bm-border)",
      }}
    >

      {/* Sidebar drawer toggle (Ctrl/Cmd+B). Phones get the hamburger, desktops the panel icon. */}
      <button
        onClick={onToggleSidebar}
        title={navOpen ? "Unpin sidebar (Ctrl+B)" : "Pin sidebar open (Ctrl+B)"}
        style={{
          display: "grid", placeItems: "center",
          width: 40, height: 40, borderRadius: 8,
          border: "1px solid var(--bm-border2)",
          background: "transparent", color: "var(--bm-text3)",
          cursor: "pointer", flexShrink: 0,
        }}
        type="button"
        aria-label="Toggle navigation"
        aria-expanded={navOpen}
      >
        <Menu size={15} className="md:hidden" />
        <PanelLeft size={15} className="hidden md:block" />
      </button>

      {/* Search: opens the command palette (pages, tools, settings, actions, your projects and tasks) */}
      <div className="hidden min-w-0 flex-1 md:block">
        <button
          type="button" onClick={() => window.dispatchEvent(new Event("bm:open-palette"))} aria-label="Search BuildMind"
          style={{
            display: "flex", alignItems: "center", gap: 9, width: "100%", maxWidth: 460, height: 34, padding: "0 10px 0 12px",
            background: "var(--bm-bg2)", border: "1px solid var(--bm-border2)", borderRadius: "var(--r-sm)",
            color: "var(--bm-text3)", fontSize: 13, fontFamily: "inherit", cursor: "pointer", textAlign: "left",
          }}
        >
          <Search size={14} aria-hidden style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Search or jump to…</span>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10.5, border: "1px solid var(--bm-border2)", borderRadius: 5, padding: "1px 5px", background: "var(--bm-bg3)" }}>Ctrl K</span>
        </button>
      </div>

      {/* Right controls */}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <button type="button" className="md:hidden" onClick={() => window.dispatchEvent(new Event("bm:open-palette"))} aria-label="Search BuildMind"
          style={{ display: "grid", placeItems: "center", width: 40, height: 40, borderRadius: 8, border: "1px solid var(--bm-border2)", background: "transparent", color: "var(--bm-text3)", cursor: "pointer" }}>
          <Search size={15} />
        </button>
        <button type="button" onClick={() => (pane?.kind === "coach" ? closePane() : openPane({ kind: "coach" }))}
          title="Ask your coach beside this page (Ctrl+J)" aria-label="Coach" aria-pressed={pane?.kind === "coach"}
          className="hidden md:inline-flex" style={{ alignItems: "center", justifyContent: "center", gap: 6, height: 40, minWidth: 40, padding: "0 10px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600,
            border: `1px solid ${pane?.kind === "coach" ? "var(--bm-accent-bd)" : "var(--bm-border2)"}`,
            background: pane?.kind === "coach" ? "var(--bm-accent-dim)" : "transparent",
            color: pane?.kind === "coach" ? "var(--bm-accent)" : "var(--bm-text3)" }}>
          <Sparkles size={14} /><span className="hidden sm:inline">Coach</span>
        </button>
        <CompanionButton hideTrigger open={briefOpen} onOpenChange={setBriefOpen} onCount={setBriefCount} />
        <NotificationBell />

        {/* Avatar menu */}
        <div style={{ position: "relative" }} ref={menuRef}>
          <button
            onClick={() => setOpen(s => !s)}
            aria-label="Account menu" aria-expanded={open}
            style={{
              width: 40, height: 40, borderRadius: 8,
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
          {!!briefCount && <span aria-hidden style={{ position: "absolute", top: -3, right: -3, width: 10, height: 10, borderRadius: 5, background: "var(--bm-accent)", border: "2px solid var(--bm-bg)", pointerEvents: "none" }} />}

          {open && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.12 }}
              style={{
                position: "absolute", right: 0, marginTop: 6,
                width: 200, zIndex: 70,
                background: "var(--bm-bg2)",
                border: "1px solid var(--bm-border2)",
                borderRadius: 10, padding: 5,
                boxShadow: "0 16px 48px rgba(0,0,0,0.4)",
              }}
            >
              <button type="button" className="md:hidden" onClick={() => { setOpen(false); pane?.kind === "coach" ? closePane() : openPane({ kind: "coach" }); }} style={{ ...dropBtn, color: "var(--bm-text)", display: "flex", alignItems: "center", gap: 8 }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--bm-bg3)"}
                onMouseLeave={e => e.currentTarget.style.background = "none"}>
                <Sparkles size={14} /> Ask your coach
              </button>
              {briefCount !== null && (
                <button type="button" onClick={() => { setOpen(false); setBriefOpen(true); }} style={{ ...dropBtn, color: "var(--bm-text)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--bm-bg3)"}
                  onMouseLeave={e => e.currentTarget.style.background = "none"}>
                  <span>Daily brief</span>
                  {briefCount > 0 && <span style={{ minWidth: 18, height: 18, borderRadius: 9, background: "var(--bm-accent)", color: "#15130a", fontSize: 10.5, fontWeight: 700, display: "grid", placeItems: "center", padding: "0 5px" }}>{briefCount}</span>}
                </button>
              )}
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
