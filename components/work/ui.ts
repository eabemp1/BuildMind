import type React from "react";

export const card: React.CSSProperties = { background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 14, padding: 16 };
export const muted: React.CSSProperties = { fontSize: 12.5, color: "var(--bm-text3)", lineHeight: 1.5, margin: 0 };
export const input: React.CSSProperties = { width: "100%", boxSizing: "border-box", background: "var(--bm-bg3)", border: "1px solid var(--bm-border2)", borderRadius: 9, padding: "10px 12px", color: "var(--bm-text)", fontFamily: "inherit", fontSize: 14, lineHeight: 1.5 };
export const label: React.CSSProperties = { display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--bm-text2)", marginBottom: 6 };
export const btn = (primary = false, on = false): React.CSSProperties => ({
  minHeight: 36, padding: "0 14px", borderRadius: 9, fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer",
  border: `1px solid ${primary || on ? "var(--bm-text)" : "var(--bm-border2)"}`,
  background: primary ? "var(--bm-text)" : on ? "var(--bm-bg3)" : "transparent",
  color: primary ? "var(--bm-bg)" : "var(--bm-text2)",
});

export async function api<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; data?: T; error?: string; upgrade?: boolean }> {
  try {
    const r = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.ok !== false) return { ok: true, data: j as T };
    return { ok: false, upgrade: Boolean((j as { upgradeUrl?: string }).upgradeUrl) || r.status === 402, error: (j as { error?: string }).error ?? (r.status === 429 ? "You have used your AI allowance for now." : "Something went wrong. Please try again.") };
  } catch { return { ok: false, error: "Could not reach BuildMind. Check your connection and try again." }; }
}
