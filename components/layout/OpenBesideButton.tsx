"use client";

import React from "react";
import { PanelRight } from "lucide-react";
import { useSidePane, type PaneRequest } from "@/components/layout/side-pane-context";

/**
 * A small "open this next to the page" button. Pages hand it the request to
 * show; it owns no state of its own.
 */
export function OpenBesideButton({
  request, label = "Open beside", compact = false, style,
}: { request: PaneRequest; label?: string; compact?: boolean; style?: React.CSSProperties }) {
  const { openPane } = useSidePane();
  return (
    <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); openPane(request); }}
      title={compact ? label : undefined} aria-label={label}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", fontFamily: "inherit",
        fontSize: 12, fontWeight: 600, color: "var(--bm-text3)", background: "transparent",
        border: "1px solid var(--bm-border2)", borderRadius: 8, padding: compact ? "5px 7px" : "5px 10px", ...style,
      }}>
      <PanelRight size={13} />{!compact && label}
    </button>
  );
}
