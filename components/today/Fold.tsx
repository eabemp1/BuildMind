"use client";

import React from "react";
import { storage } from "@/lib/storage";

/**
 * A one-line, closed-by-default row that holds secondary cards so the daily task stays first on screen.
 * Renders nothing when its children render nothing (several of the cards only appear on some days), so a
 * founder never sees an "Also today" row that opens onto an empty space. The open/closed choice is remembered
 * per device.
 */
export default function Fold({ label, storageKey, children }: { label: string; storageKey: string; children: React.ReactNode }) {
  const body = React.useRef<HTMLDivElement | null>(null);
  const [hasContent, setHasContent] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    try { setOpen(storage.get(storageKey) === "1"); } catch { /* storage unavailable: stay closed */ }
  }, [storageKey]);

  // The cards load their data on their own, so watch the body instead of checking once.
  React.useEffect(() => {
    const el = body.current;
    if (!el) return;
    const check = () => setHasContent((el.textContent ?? "").trim().length > 0 || el.querySelector("button,a,input,img,svg") !== null);
    check();
    const mo = new MutationObserver(check);
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    return () => mo.disconnect();
  }, []);

  return (
    <div style={{ display: hasContent ? "block" : "none", marginBottom: 10 }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => { const next = !open; setOpen(next); try { storage.set(storageKey, next ? "1" : "0"); } catch { /* ignore */ } }}
        style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 36, padding: "0 2px", background: "none", border: 0, cursor: "pointer", color: "var(--bm-text3)", fontSize: "var(--text-sm)", fontWeight: 600 }}
      >
        <span aria-hidden style={{ display: "inline-block", transition: "transform .15s", transform: open ? "rotate(90deg)" : "none" }}>›</span>
        {label}
      </button>
      {/* Always mounted (hidden, not removed) so the cards keep loading and the emptiness check keeps working. */}
      <div ref={body} style={{ display: open ? "block" : "none", marginTop: 4 }}>{children}</div>
    </div>
  );
}
