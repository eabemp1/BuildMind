"use client";

/**
 * Command palette: one place to find and open anything in BuildMind.
 *
 * Opens from the top bar search, Ctrl/Cmd+K, or "/" outside a text field.
 * It finds pages, every Work tool, settings sections and actions (lib/commandIndex.ts),
 * and the founder's own projects, milestones, tasks and saved Work items.
 * It navigates and triggers UI events. It never calls an AI model and never writes data.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Lock, Search, X, FolderKanban, Flag, ListChecks, FileText, CornerDownLeft, type LucideIcon } from "lucide-react";
import { buildCommands, type Command, type CommandGroup } from "@/lib/commandIndex";
import { rank, pushRecent, scoreMatch } from "@/lib/commandSearch";
import { searchGlobal, clearStoredToken, setActiveProjectId, type SearchResultsData } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import { usePlan } from "@/lib/usePlan";
import { getTasksCompleted } from "@/lib/nav-config";
import { useTheme } from "@/components/layout/theme-provider";
import { useSidePane } from "@/components/layout/side-pane-context";

const RECENT_KEY = "bm_palette_recent";
const GROUPS: CommandGroup[] = ["Actions", "Pages", "Work tools", "Settings", "Help"];
const PER_GROUP_SEARCH = 5;

interface Row {
  id: string; group: string; label: string; hint: string; icon: LucideIcon;
  run: () => void; locked?: string; shortcut?: string;
}

function readRecent(): string[] {
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 6) : []; } catch { return []; }
}

export default function CommandPalette() {
  const router = useRouter();
  const pathname = usePathname();
  const { plan } = usePlan();
  const { theme, toggle } = useTheme();
  const { pane, openPane, closePane } = useSidePane();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const [data, setData] = useState<SearchResultsData | null>(null);
  const [work, setWork] = useState<Array<{ id: string; title: string; kind: string; project?: string | null; project_id?: string | null; task?: string; source?: string }>>([]);
  const [dataBusy, setDataBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const workLoaded = useRef(false);
  const isOpen = useRef(false);
  isOpen.current = open;

  const close = useCallback(() => {
    setOpen(false); setQuery(""); setActive(0); setData(null);
    window.setTimeout(() => returnTo.current?.focus?.(), 0);
  }, []);

  const commands = useMemo(() => buildCommands({ plan, tasksCompleted: open ? getTasksCompleted() : 0, theme }), [plan, theme, open]);

  const signOut = useCallback(async () => {
    const supabase = createClient();
    const { storage } = await import("@/lib/storage");
    storage.onSignOut();
    await supabase.auth.signOut();
    clearStoredToken();
    router.replace("/auth/login"); router.refresh();
  }, [router]);

  const runCommand = useCallback((c: Command) => {
    setRecent((r) => { const n = pushRecent(r, c.id); try { localStorage.setItem(RECENT_KEY, JSON.stringify(n)); } catch { /* private mode */ } return n; });
    close();
    if (c.href) { router.push(c.href); return; }
    switch (c.action) {
      case "focus": if (pathname === "/today") window.dispatchEvent(new Event("bm:focus-start")); else router.push("/today?focus=1"); break;
      case "log": if (pathname === "/today") document.getElementById("today-action")?.scrollIntoView({ behavior: "smooth" }); else router.push("/today"); break;
      case "tour": router.push("/today"); window.setTimeout(() => window.dispatchEvent(new Event("bm:start-tour")), 250); break;
      case "coach": pane?.kind === "coach" ? closePane() : openPane({ kind: "coach" }); break;
      case "brief": window.dispatchEvent(new Event("bm:open-brief")); break;
      case "theme": toggle(); break;
      case "signout": void signOut(); break;
    }
  }, [close, router, pathname, pane, openPane, closePane, toggle, signOut]);

  const toRow = useCallback((c: Command): Row => ({
    id: c.id, group: c.group, label: c.label, hint: c.locked ? c.locked.reason : c.hint, icon: c.icon, shortcut: c.shortcut,
    locked: c.locked?.reason,
    run: () => { if (c.locked) { if (c.locked.href) { close(); router.push(c.locked.href); } return; } runCommand(c); },
  }), [runCommand, close, router]);

  const rows = useMemo<Row[]>(() => {
    const q = query.trim();
    const out: Row[] = [];
    if (!q) {
      const byId = new Map(commands.map((c) => [c.id, c]));
      for (const id of recent) { const c = byId.get(id); if (c) out.push({ ...toRow(c), group: "Recent" }); }
      for (const c of commands.filter((x) => x.group === "Actions")) if (!recent.includes(c.id)) out.push(toRow(c));
      for (const c of commands.filter((x) => x.group === "Pages" && !x.id.includes("?tab=")).slice(0, 8)) if (!recent.includes(c.id)) out.push(toRow(c));
      return out;
    }
    // The group holding the best match comes first, so "landing" lists the Landing page tool before the Work page.
    const found = GROUPS.map((g, gi) => ({ g, gi, hits: rank(commands.filter((x) => x.group === g), q, PER_GROUP_SEARCH) }))
      .filter((x) => x.hits.length)
      .map((x) => ({ ...x, top: scoreMatch(q, x.hits[0]) }))
      .sort((a, b) => b.top - a.top || a.gi - b.gi);
    for (const f of found) for (const c of f.hits) out.push(toRow(c));
    const lq = q.toLowerCase();
    for (const p of (data?.projects ?? []).slice(0, 5)) out.push({ id: `p:${p.id}`, group: "Projects", label: p.title, hint: "Project", icon: FolderKanban, run: () => { close(); router.push(`/projects/${p.id}`); } });
    for (const m of (data?.milestones ?? []).slice(0, 5)) out.push({ id: `m:${m.id}`, group: "Milestones", label: m.title, hint: "Milestone", icon: Flag, run: () => { close(); router.push(`/projects/${m.project_id}?focus=${m.id}`); } });
    for (const t of (data?.tasks ?? []).slice(0, 5)) out.push({ id: `t:${t.id}`, group: "Tasks", label: t.title, hint: "Task", icon: ListChecks, run: () => { close(); router.push(`/projects/${t.project_id}?focus=${t.id}`); } });
    // Saved drafts and the drafts Today prepared (an interview kit, say). Searched by title, kind and the task they were made for.
    for (const w of work.filter((x) => (x.source === "prep" || /^[0-9a-f-]{36}$/i.test(x.id)) && `${x.title} ${x.kind} ${x.task ?? ""}`.toLowerCase().includes(lq)).slice(0, 5)) {
      const prep = w.source === "prep" && w.task;
      const href = prep ? `/work?task=${encodeURIComponent(w.task ?? "")}&mk=${encodeURIComponent(w.kind)}` : `/work?item=${w.id}`;
      out.push({ id: `w:${w.id}`, group: "Saved work", label: w.title, hint: w.project ? `${prep ? "Prepared" : "Work"} · ${w.project}` : prep ? "Prepared draft" : "Work", icon: FileText, run: () => {
        close();
        if (w.project_id) setActiveProjectId(w.project_id); // the draft opens under its own project
        router.push(href);
      } });
    }
    return out;
  }, [query, commands, recent, data, work, toRow, close, router]);

  // Group headers for display, in order of first appearance.
  const sections = useMemo(() => {
    const s: Array<{ title: string; items: Array<{ row: Row; index: number }> }> = [];
    rows.forEach((row, index) => {
      let sec = s.find((x) => x.title === row.group);
      if (!sec) { sec = { title: row.group, items: [] }; s.push(sec); }
      sec.items.push({ row, index });
    });
    return s;
  }, [rows]);

  // Open / close wiring
  useEffect(() => {
    const typing = (t: EventTarget | null) => { const el = t as HTMLElement | null; return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable); };
    const show = () => { returnTo.current = document.activeElement as HTMLElement | null; setRecent(readRecent()); setOpen(true); };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); if (isOpen.current) close(); else show(); }
      else if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !typing(e.target)) { e.preventDefault(); show(); }
      else if (e.key === "Escape" && isOpen.current) close();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("bm:open-palette", show);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("bm:open-palette", show); };
  }, [close]);

  useEffect(() => { if (open) window.setTimeout(() => inputRef.current?.focus(), 0); }, [open]);
  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => { if (open) close(); }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lock page scroll behind the palette
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Saved Work items: load once, search locally.
  useEffect(() => {
    if (!open || workLoaded.current) return;
    workLoaded.current = true;
    fetch("/api/work/items", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j?.items) setWork(j.items); }).catch(() => { workLoaded.current = false; });
  }, [open]);

  // Projects, milestones and tasks: ask the server after a pause.
  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2) { setData(null); setDataBusy(false); return; }
    setDataBusy(true);
    let live = true;
    const t = window.setTimeout(async () => {
      try { const r = await searchGlobal(q); if (live) setData(r); } catch { if (live) setData(null); }
      finally { if (live) setDataBusy(false); }
    }, 220);
    return () => { live = false; window.clearTimeout(t); };
  }, [query, open]);

  useEffect(() => { listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active, rows]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    const n = rows.length;
    if (e.key === "ArrowDown" || (e.ctrlKey && e.key === "n")) { e.preventDefault(); setActive((i) => (n ? (i + 1) % n : 0)); }
    else if (e.key === "ArrowUp" || (e.ctrlKey && e.key === "p")) { e.preventDefault(); setActive((i) => (n ? (i - 1 + n) % n : 0)); }
    else if (e.key === "Home") { e.preventDefault(); setActive(0); }
    else if (e.key === "End") { e.preventDefault(); setActive(Math.max(0, n - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); rows[active]?.run(); }
  };

  const kbd: React.CSSProperties = { fontFamily: "'DM Mono', monospace", fontSize: 10.5, color: "var(--bm-text3)", border: "1px solid var(--bm-border2)", borderRadius: 5, padding: "1px 5px", background: "var(--bm-bg3)" };

  return (
    <div role="presentation" onMouseDown={close} className="bm-pal-overlay">
      <style>{`
        .bm-pal-overlay{position:fixed;inset:0;z-index:1000;background:rgba(8,10,14,.55);backdrop-filter:blur(3px);display:flex;align-items:flex-start;justify-content:center;padding:11vh 16px 16px;box-sizing:border-box}
        .bm-pal{width:100%;max-width:640px;max-height:min(560px,76vh);display:flex;flex-direction:column;background:var(--bm-bg2);border:1px solid var(--bm-border2);border-radius:16px;overflow:hidden;box-shadow:0 28px 80px rgba(0,0,0,.45)}
        .bm-pal-row{display:flex;align-items:center;gap:12px;width:100%;min-height:44px;padding:8px 10px;border:0;border-radius:10px;background:transparent;color:var(--bm-text);text-align:left;cursor:pointer;font-family:inherit;font-size:14px}
        .bm-pal-row[aria-selected="true"]{background:var(--bm-accent-dim);box-shadow:inset 2px 0 0 var(--bm-accent)}
        .bm-pal-row[data-locked="true"]{color:var(--bm-text3)}
        @media (max-width:640px){.bm-pal-overlay{padding:0}.bm-pal{max-width:none;max-height:none;height:100dvh;border-radius:0;border:0}.bm-pal-desktop{display:none!important}}
        @media (min-width:641px){.bm-pal-mobile{display:none!important}}
        .bm-pal-x{display:grid}
        .bm-pal-foot{display:flex;gap:14px;align-items:center;padding:9px 14px;border-top:1px solid var(--bm-border);font-size:12px;color:var(--bm-text3);white-space:nowrap}
        .bm-pal-foot>span{display:inline-flex;align-items:center;gap:5px}
      `}</style>
      <div className="bm-pal" role="dialog" aria-modal="true" aria-label="Command palette" onMouseDown={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 14px", borderBottom: "1px solid var(--bm-border)", minHeight: 54 }}>
          <Search size={17} aria-hidden style={{ color: "var(--bm-text3)", flexShrink: 0 }} />
          <input
            ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKeyDown}
            role="combobox" aria-expanded="true" aria-controls="bm-pal-list" aria-activedescendant={rows[active] ? `bm-pal-${active}` : undefined} aria-autocomplete="list"
            placeholder="Search pages, tools, projects, tasks and actions" aria-label="Search BuildMind" autoComplete="off" spellCheck={false} enterKeyHint="go"
            style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: "var(--bm-text)", fontSize: 16, fontFamily: "inherit", height: 52 }}
          />
          {dataBusy && <span aria-live="polite" style={{ fontSize: 12, color: "var(--bm-text3)" }}>Searching…</span>}
          <span className="bm-pal-desktop" style={kbd}>esc</span>
          <button type="button" className="bm-pal-mobile bm-pal-x" onClick={close} aria-label="Close search" style={{ placeItems: "center", width: 40, height: 40, borderRadius: 8, border: "1px solid var(--bm-border2)", background: "transparent", color: "var(--bm-text3)", cursor: "pointer" }}><X size={16} /></button>
        </div>

        <div ref={listRef} id="bm-pal-list" role="listbox" aria-label="Results" style={{ overflowY: "auto", padding: "4px 6px 8px", flex: 1 }}>
          {rows.length === 0 && (
            <p style={{ margin: 0, padding: "28px 14px", textAlign: "center", fontSize: 13.5, color: "var(--bm-text3)", lineHeight: 1.5 }}>
              {dataBusy ? "Searching your projects and tasks…" : <>Nothing matches “{query.trim()}”.<br />Try a feature name, like “landing page”, or something you saved.</>}
            </p>
          )}
          {sections.map((sec) => (
            <div key={sec.title} role="group" aria-label={sec.title}>
              <div style={{ padding: "10px 10px 4px", fontSize: 12, fontWeight: 600, color: "var(--bm-text3)" }}>{sec.title}</div>
              {sec.items.map(({ row, index }) => {
                const Icon = row.icon;
                return (
                  <button key={row.id} id={`bm-pal-${index}`} data-i={index} type="button" role="option" aria-selected={index === active} aria-disabled={!!row.locked}
                    data-locked={row.locked ? "true" : undefined} className="bm-pal-row" onClick={row.run} onMouseMove={() => active !== index && setActive(index)}>
                    <span aria-hidden style={{ width: 30, height: 30, borderRadius: 8, display: "grid", placeItems: "center", background: "var(--bm-bg3)", color: index === active ? "var(--bm-accent)" : "var(--bm-text3)", flexShrink: 0 }}><Icon size={15} /></span>
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>{row.label}</span>
                    {row.locked && <Lock size={12} aria-hidden style={{ flexShrink: 0 }} />}
                    <span style={{ fontSize: 12, color: "var(--bm-text3)", flexShrink: 0, maxWidth: "40%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.hint}</span>
                    {row.shortcut && <span className="bm-pal-desktop" style={kbd}>{row.shortcut}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="bm-pal-desktop bm-pal-foot">
          <span><span style={kbd}>↑</span> <span style={kbd}>↓</span> move</span>
          <span><span style={{ ...kbd, display: "inline-flex", alignItems: "center" }}><CornerDownLeft size={10} /></span> open</span>
          <span style={{ marginLeft: "auto" }}>Press <span style={kbd}>/</span> or <span style={kbd}>Ctrl K</span> anywhere</span>
        </div>
      </div>
    </div>
  );
}
