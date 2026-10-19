"use client";

import React from "react";
import ConnectCard, { type KeyApp } from "@/components/integrations/ConnectCard";

interface Status { searchConsole?: boolean; searchConsoleSite?: string | null; searchConsoleSites?: string[]; stripe?: boolean; github?: boolean; githubRepo?: string | null; needsReconnect?: { stripe?: boolean; github?: boolean; search_console?: boolean } }

const NAMES: Record<KeyApp, { name: string; line: string }> = {
  stripe: { name: "Stripe", line: "Real revenue and subscribers for investor updates." },
  github: { name: "GitHub", line: "What you actually shipped, for updates, posts and demo scripts." },
};

/** Settings view of the read-only apps. Connect, see state, disconnect. */
export default function ConnectedApps() {
  const [s, setS] = React.useState<Status>({});
  const [open, setOpen] = React.useState<KeyApp | null>(null);
  const load = React.useCallback(() => { fetch("/api/integrations/status").then((r) => (r.ok ? r.json() : null)).then((d) => d && setS(d)).catch(() => {}); }, []);
  React.useEffect(load, [load]);

  async function remove(app: KeyApp) {
    await fetch(`/api/integrations/connect?provider=${app}`, { method: "DELETE" }).catch(() => {});
    setOpen(null); load();
  }

  async function chooseSite(site: string) {
    await fetch("/api/integrations/search-console/site", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ site }) }).catch(() => {});
    load();
  }
  const scBad = Boolean(s.needsReconnect?.search_console);
  const flat: React.CSSProperties = { fontSize: "var(--text-xs)", fontWeight: 600, fontFamily: "inherit", cursor: "pointer", borderRadius: 8, padding: "6px 12px", border: "1px solid var(--bm-border2)", background: "transparent", color: "var(--bm-text2)", textDecoration: "none", display: "inline-block" };

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ border: "1px solid var(--bm-border)", borderRadius: 12, padding: "12px 14px", display: "grid", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--bm-text)" }}>Google Search Console <span style={{ fontWeight: 400, color: "var(--bm-text3)" }}>· read-only</span></div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--bm-text3)" }}>{scBad ? "Access stopped working. Reconnect." : s.searchConsole ? "Connected" : "Starts SEO briefs from queries your site almost ranks for."}</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {(!s.searchConsole || scBad) && <a href="/api/integrations/search-console/connect?return=/settings" style={flat}>{scBad ? "Reconnect" : "Connect"}</a>}
            {s.searchConsole && <button type="button" onClick={() => remove("search_console" as KeyApp)} style={{ ...flat, border: "none", color: "var(--bm-text3)" }}>Disconnect</button>}
          </div>
        </div>
        {s.searchConsole && (s.searchConsoleSites?.length ?? 0) > 1 && (
          <select value={s.searchConsoleSite ?? ""} onChange={(e) => chooseSite(e.target.value)} aria-label="Search Console site" style={{ background: "var(--bm-bg3)", border: "1px solid var(--bm-border2)", borderRadius: 8, padding: "6px 8px", color: "var(--bm-text)", fontFamily: "inherit", fontSize: "var(--text-xs)" }}>
            {s.searchConsoleSites!.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        )}
      </div>
      {(["stripe", "github"] as KeyApp[]).map((app) => {
        const on = Boolean(s[app]); const bad = Boolean(s.needsReconnect?.[app]);
        return (
          <div key={app} style={{ border: "1px solid var(--bm-border)", borderRadius: 12, padding: "12px 14px", display: "grid", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--bm-text)" }}>{NAMES[app].name} <span style={{ fontWeight: 400, color: "var(--bm-text3)" }}>· read-only{app === "github" && s.githubRepo ? ` · ${s.githubRepo}` : ""}</span></div>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--bm-text3)" }}>{bad ? "Access stopped working. Reconnect with a new key." : on ? "Connected" : NAMES[app].line}</div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {(!on || bad) && <button type="button" onClick={() => setOpen(open === app ? null : app)} style={{ fontSize: "var(--text-xs)", fontWeight: 600, fontFamily: "inherit", cursor: "pointer", borderRadius: 8, padding: "6px 12px", border: "1px solid var(--bm-border2)", background: "transparent", color: "var(--bm-text2)" }}>{bad ? "Reconnect" : "Connect"}</button>}
                {on && <button type="button" onClick={() => remove(app)} style={{ fontSize: "var(--text-xs)", fontFamily: "inherit", cursor: "pointer", borderRadius: 8, padding: "6px 12px", border: "none", background: "transparent", color: "var(--bm-text3)" }}>Disconnect</button>}
              </div>
            </div>
            {open === app && <ConnectCard app={app} onCancel={() => setOpen(null)} onConnected={() => { setOpen(null); load(); }} />}
          </div>
        );
      })}
    </div>
  );
}
