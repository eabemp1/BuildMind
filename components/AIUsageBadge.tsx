"use client";

import { useEffect, useState } from "react";

interface Usage {
  unlimited?: boolean;
  used?: number;
  limit?: number;
  remaining?: number;
}

export default function AIUsageBadge() {
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    fetch("/api/user/ai-usage", { cache: "no-store" })
      .then((r) => r.json())
      .then(setUsage)
      .catch(() => {});
  }, []);

  if (!usage || usage.unlimited) return null;

  const used = usage.used ?? 0;
  const limit = usage.limit ?? 30;
  const remaining = usage.remaining ?? Math.max(0, limit - used);
  const pct = Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  const color = remaining > 10 ? "var(--bm-green)" : remaining > 3 ? "var(--bm-amber)" : "var(--bm-red)";

  return (
    <div style={{ padding: "8px 12px", borderRadius: 10, background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", fontSize: 12, color: "var(--bm-text2)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
        <span style={{ fontWeight: 600 }}>AI messages this month</span>
        <span style={{ color, fontWeight: 700 }}>{remaining} left</span>
      </div>
      <div style={{ height: 4, background: "var(--bm-bg4)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", borderRadius: 2, background: color, width: `${pct}%`, transition: "width 0.3s" }} />
      </div>
      {remaining <= 5 && (
        <div style={{ marginTop: 8, fontSize: 11, color: "var(--bm-text3)", lineHeight: 1.45 }}>
          {remaining === 0 ? "Limit reached. " : `${remaining} message${remaining !== 1 ? "s" : ""} left. `}
          <a href="/upgrade" style={{ color: "var(--bm-accent)", textDecoration: "none" }}>
            Upgrade to Builder for unlimited AI
          </a>
        </div>
      )}
    </div>
  );
}
