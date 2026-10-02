"use client";

/**
 * components/CommandPalette.tsx
 *
 * Global "jump anywhere / do anything" palette. Opens with Ctrl/Cmd + K, or the
 * "Jump to…" button on Today (which fires the `bm:open-palette` window event).
 * Entirely client-side and read-only: it navigates and triggers UI events, it
 * never calls an AI model and never writes data.
 *
 * Commands are built from the same allow-list the AI Coach uses for navigation
 * (lib/coachNavigation.ts → NAV_TARGETS), so the two can never disagree about
 * which pages exist.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { NAV_TARGETS } from "@/lib/coachNavigation";

interface Command {
  id: string;
  label: string;
  hint: string;
  keywords: string;
  run: () => void;
}

export default function CommandPalette() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const close = useCallback(() => { setOpen(false); setQuery(""); setIndex(0); }, []);

  const commands = useMemo<Command[]>(() => {
    const go = (href: string) => () => { close(); router.push(href); };
    const quick: Command[] = [
      {
        id: "focus", label: "Start a focus session", hint: "Today", keywords: "focus timer pomodoro start work block",
        run: () => {
          close();
          if (pathname === "/today") window.dispatchEvent(new Event("bm:focus-start"));
          else router.push("/today?focus=1");
        },
      },
      { id: "log", label: "Log today's outcome", hint: "Today", keywords: "check in log outcome complete done finished", run: () => { close(); if (pathname === "/today") document.getElementById("today-action")?.scrollIntoView({ behavior: "smooth" }); else router.push("/today"); } },
      { id: "coach", label: "Ask the AI Coach", hint: "Coach", keywords: "coach ask help chat", run: go("/ai-coach") },
    ];
    const pages: Command[] = NAV_TARGETS.map((t) => ({
      id: `nav:${t.href}`, label: `Go to ${t.label}`, hint: t.href, keywords: `${t.label} ${t.aliases.join(" ")}`.toLowerCase(), run: go(t.href),
    }));
    return [...quick, ...pages];
  }, [close, pathname, router]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands.slice(0, 8);
    return commands
      .map((c) => {
        const hay = `${c.label} ${c.keywords}`.toLowerCase();
        const starts = c.label.toLowerCase().includes(q) ? 2 : 0;
        const words = q.split(/\s+/).every((w) => hay.includes(w)) ? 1 : 0;
        return { c, score: starts + words };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.c)
      .slice(0, 8);
  }, [commands, query]);

  // Global shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen((o) => (o ? (close(), false) : o));
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("bm:open-palette", onOpen);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("bm:open-palette", onOpen); };
  }, [close]);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 0); }, [open]);
  useEffect(() => { setIndex(0); }, [query]);

  if (!open) return null;

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); results[index]?.run(); }
  };

  return (
    <div
      role="dialog" aria-modal="true" aria-label="Command palette"
      onClick={close}
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "12vh 14px 14px", boxSizing: "border-box" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 520, background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 14, overflow: "hidden", boxShadow: "0 24px 60px rgba(0,0,0,0.5)" }}
      >
        <input
          ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onInputKey}
          placeholder="Type a command or page…" aria-label="Search commands"
          style={{ width: "100%", boxSizing: "border-box", padding: "14px 16px", fontSize: 15, background: "transparent", color: "var(--bm-text)", border: "none", borderBottom: "1px solid var(--bm-border)", outline: "none", fontFamily: "inherit" }}
        />
        <ul role="listbox" style={{ listStyle: "none", margin: 0, padding: 6, maxHeight: "52vh", overflowY: "auto" }}>
          {results.length === 0 && <li style={{ padding: "14px 12px", fontSize: 13, color: "var(--bm-text3)" }}>Nothing matches “{query}”.</li>}
          {results.map((c, i) => (
            <li key={c.id} role="option" aria-selected={i === index}>
              <button
                type="button" onClick={c.run} onMouseEnter={() => setIndex(i)}
                style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 9, border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit", fontSize: 13, color: "var(--bm-text)", background: i === index ? "var(--bm-accent-dim)" : "transparent" }}
              >
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.label}</span>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "var(--bm-text4)", flexShrink: 0 }}>{c.hint}</span>
              </button>
            </li>
          ))}
        </ul>
        <div style={{ padding: "8px 14px", borderTop: "1px solid var(--bm-border)", fontFamily: "'DM Mono', monospace", fontSize: 10, color: "var(--bm-text4)", display: "flex", gap: 12, flexWrap: "wrap" }}>
          <span>↑↓ move</span><span>↵ run</span><span>esc close</span>
        </div>
      </div>
    </div>
  );
}
