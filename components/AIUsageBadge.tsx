"use client";

import { useEffect, useState } from "react";

const WARN_AT = 5;

interface Usage {
  unlimited?: boolean;
  bucket?: "general" | "core";
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

  // Quiet by default: this only appears as a warning when 5 or fewer calls are
  // left this month (it used to sit in the sidebar showing "30 left" forever).
  if (remaining > WARN_AT) return null;

  const what = usage.bucket === "core" ? "daily-action AI" : "AI messages";
  const color = remaining > 2 ? "var(--bm-amber)" : "var(--bm-red)";

  return (
    <div role="status" style={{ padding: "8px 12px", borderRadius: 10, background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", fontSize: 12, color: "var(--bm-text2)", lineHeight: 1.45 }}>
      <span style={{ color, fontWeight: 700 }}>
        {remaining === 0 ? `You've used all your ${what} this month.` : `Only ${remaining} ${what} left this month.`}
      </span>{" "}
      <a href="/upgrade" style={{ color: "var(--bm-accent)", textDecoration: "none", whiteSpace: "nowrap" }}>
        Upgrade to Builder for far more AI
      </a>
    </div>
  );
}
