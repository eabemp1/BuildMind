"use client";

/**
 * components/layout/side-pane.tsx
 *
 * Renders the open pane. On wide screens it sits next to the page and the page
 * narrows to make room (drag the left edge to resize). On narrow screens it
 * becomes a sheet over the page. Escape or the close button dismisses it.
 */

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, FolderKanban, Sparkles, BookOpen, X } from "lucide-react";
import { useSidePane, type OpenPane } from "@/components/layout/side-pane-context";

const CoachPane = dynamic(() => import("@/components/layout/panes/CoachPane"), { ssr: false });
const ReaderPane = dynamic(() => import("@/components/layout/panes/ReaderPane"), { ssr: false });
const ProjectPane = dynamic(() => import("@/components/layout/panes/ProjectPane"), { ssr: false });

const WIDE = "(min-width: 1024px)";

function useIsWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(WIDE);
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

function meta(p: OpenPane): { title: string; icon: React.ReactNode; fullHref?: string } {
  if (p.kind === "coach") return { title: p.title ?? "AI coach", icon: <Sparkles size={14} />, fullHref: "/ai-coach" };
  if (p.kind === "project") return { title: p.title ?? "Project", icon: <FolderKanban size={14} />, fullHref: `/projects/${p.projectId}` };
  return { title: p.eyebrow ?? "Details", icon: <BookOpen size={14} />, fullHref: p.href };
}

function PaneBody({ pane }: { pane: OpenPane }) {
  if (pane.kind === "coach") return <CoachPane req={pane} />;
  if (pane.kind === "project") return <ProjectPane req={pane} />;
  return <ReaderPane req={pane} />;
}

function PaneFrame({ pane, onClose, handle }: { pane: OpenPane; onClose: () => void; handle?: React.ReactNode }) {
  const m = meta(pane);
  const scrolls = pane.kind !== "coach"; // the coach manages its own scroll area
  return (
    <div style={{ position: "relative", display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "var(--bm-bg2)" }}>
      {handle}
      <header style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 10px 0 16px", height: 50, flexShrink: 0, borderBottom: "1px solid var(--bm-border)" }}>
        <span style={{ color: "var(--bm-accent)", display: "grid", placeItems: "center" }}>{m.icon}</span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: "var(--bm-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.title}</span>
        {m.fullHref && (
          <Link href={m.fullHref} onClick={onClose} title="Open as full page" aria-label="Open as full page"
            style={{ display: "grid", placeItems: "center", width: 30, height: 30, borderRadius: 8, color: "var(--bm-text3)" }}>
            <ArrowUpRight size={15} />
          </Link>
        )}
        <button type="button" onClick={onClose} aria-label="Close panel"
          style={{ display: "grid", placeItems: "center", width: 30, height: 30, borderRadius: 8, border: 0, background: "transparent", color: "var(--bm-text3)", cursor: "pointer" }}>
          <X size={16} />
        </button>
      </header>
      <div style={{ flex: 1, minHeight: 0, overflowY: scrolls ? "auto" : "hidden" }}>
        <PaneBody key={pane.key} pane={pane} />
      </div>
    </div>
  );
}

export default function SidePaneHost() {
  const { pane, closePane, width, setWidth } = useSidePane();
  const wide = useIsWide();
  const dragging = useRef(false);

  const onPointerMove = useCallback((e: PointerEvent) => {
    if (!dragging.current) return;
    setWidth(window.innerWidth - e.clientX);
  }, [setWidth]);
  const stop = useCallback(() => {
    dragging.current = false;
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  }, []);
  useEffect(() => {
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stop);
    return () => { window.removeEventListener("pointermove", onPointerMove); window.removeEventListener("pointerup", stop); };
  }, [onPointerMove, stop]);

  const handle = (
    <div role="separator" aria-orientation="vertical" aria-label="Resize panel" tabIndex={0}
      onPointerDown={(e) => { e.preventDefault(); dragging.current = true; document.body.style.userSelect = "none"; document.body.style.cursor = "col-resize"; }}
      onKeyDown={(e) => { if (e.key === "ArrowLeft") setWidth(width + 24); if (e.key === "ArrowRight") setWidth(width - 24); }}
      style={{ position: "absolute", left: -3, top: 0, bottom: 0, width: 7, cursor: "col-resize", zIndex: 5 }} />
  );

  if (wide) {
    return (
      <AnimatePresence initial={false}>
        {pane && (
          <motion.aside key="pane" aria-label="Side panel"
            initial={{ width: 0, opacity: 0 }} animate={{ width, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
            style={{ flexShrink: 0, overflow: "hidden", borderLeft: "1px solid var(--bm-border)", height: "100%" }}>
            <div style={{ width, height: "100%" }}><PaneFrame pane={pane} onClose={closePane} handle={handle} /></div>
          </motion.aside>
        )}
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence>
      {pane && (
        <div style={{ position: "fixed", inset: 0, zIndex: 250 }}>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closePane}
            style={{ position: "absolute", inset: 0, background: "rgba(7,8,10,0.6)", backdropFilter: "blur(4px)" }} />
          <motion.aside aria-label="Side panel" initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 340, damping: 34 }}
            style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: "min(100%, 480px)", borderLeft: "1px solid var(--bm-border)" }}>
            <PaneFrame pane={pane} onClose={closePane} />
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
