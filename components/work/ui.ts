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

/** Hover and keyboard focus can't be written inline, so the Work screens share this small sheet. */
export const WORK_CSS = `
.wk-list{border:1px solid var(--bm-border2);border-radius:14px;background:var(--bm-bg2);overflow:hidden}
.wk-row{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;box-sizing:border-box;padding:13px 16px;background:transparent;border:0;border-top:1px solid var(--bm-border2);text-align:left;cursor:pointer;font-family:inherit;color:inherit;text-decoration:none;min-height:52px}
.wk-row:first-child{border-top:0}
.wk-row:hover{background:var(--bm-bg3)}
.wk-row:hover .wk-go{color:var(--bm-text);transform:translateX(2px)}
.wk-go{color:var(--bm-text3);font-size:18px;line-height:1;transition:transform .15s,color .15s;flex-shrink:0}
.wk-row:focus-visible,.wk-btn:focus-visible,.wk-tab:focus-visible,.wk-hero:focus-visible{outline:2px solid var(--bm-accent);outline-offset:-2px}
.wk-hero{display:block;text-decoration:none;position:relative;padding:18px;border:1px solid var(--bm-border2);border-radius:14px;background:var(--bm-bg2)}
.wk-hero:hover{background:var(--bm-bg3)}
.wk-tabs{display:inline-flex;gap:2px;padding:3px;border-radius:11px;background:var(--bm-bg3)}
.wk-tab{border:0;background:transparent;color:var(--bm-text2);font-family:inherit;font-size:13px;font-weight:600;padding:7px 16px;border-radius:8px;cursor:pointer}
.wk-tab[aria-selected="true"]{background:var(--bm-bg2);color:var(--bm-text);box-shadow:0 0 0 1px var(--bm-border2)}
.wk-search:focus{outline:2px solid var(--bm-accent);outline-offset:1px}
.wk-fade{animation:wkIn .22s ease-out}
@keyframes wkIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.wk-fade{animation:none}.wk-go{transition:none}.wk-row:hover .wk-go{transform:none}}
`;

export async function api<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; data?: T; error?: string; upgrade?: boolean }> {
  try {
    const r = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.ok !== false) return { ok: true, data: j as T };
    return { ok: false, upgrade: Boolean((j as { upgradeUrl?: string }).upgradeUrl) || r.status === 402, error: (j as { error?: string }).error ?? (r.status === 429 ? "You have used your AI allowance for now." : "Something went wrong. Please try again.") };
  } catch { return { ok: false, error: "Could not reach BuildMind. Check your connection and try again." }; }
}
