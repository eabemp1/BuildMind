"use client";

import React from "react";
import ConnectCard, { type KeyApp } from "@/components/integrations/ConnectCard";

interface Status { searchConsole?: boolean; searchConsoleSite?: string | null; searchConsoleSites?: string[]; stripe?: boolean; github?: boolean; githubRepo?: string | null; needsReconnect?: { stripe?: boolean; github?: boolean; search_console?: boolean } }

interface SeeRow { query: string; clicks: number; impressions: number; position: number }
interface SeeState { state: string; site?: string; note?: string; summary?: { range: { start: string; end: string; }; asOf: string; topQueries: SeeRow[]; nearMisses: SeeRow[]; unclicked: SeeRow[] } }
const SEE_MESSAGES: Record<string, string> = {
  reconnect: "Google stopped accepting the saved access. Reconnect above.",
  site_denied: "Google would not let BuildMind read this site. Pick another site above, or reconnect.",
  no_site: "No site is selected yet.",
  error: "Could not read Search Console just now. Try again in a minute.",
  not_connected: "Search Console is not connected.",
};
const rowLine = (r: SeeRow) => `${r.query} · position ${r.position} · ${r.impressions} shown, ${r.clicks} clicked`;

interface KeySee { state: string; asOf?: string; used?: string; facts?: Array<{ label: string; value: string }>; shipped?: string[] }
const KEY_MESSAGES: Record<string, string> = {
  reconnect: "This app stopped accepting the saved key. Disconnect and connect it again with a new key.",
  error: "Could not read this app just now. Try again in a minute.",
  not_connected: "Not connected.",
};

/** "What BuildMind sees" for Stripe and GitHub. Loads only when opened, so Settings stays fast. */
function KeyAppSees({ app, flat }: { app: "stripe" | "github"; flat: React.CSSProperties }) {
  const [open, setOpen] = React.useState(false);
  const [see, setSee] = React.useState<KeySee | null>(null);
  React.useEffect(() => {
    if (!open) return;
    setSee(null);
    fetch(`/api/integrations/summary?provider=${app}`).then((r) => (r.ok ? r.json() : null)).then((d) => setSee(d ?? { state: "error" })).catch(() => setSee({ state: "error" }));
  }, [open, app]);
  return (
    <div>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} style={{ ...flat, border: "none", padding: "4px 0", color: "var(--bm-text3)" }}>{open ? "Hide" : "What BuildMind sees"} {open ? "▴" : "▾"}</button>
      {open && (
        <div style={{ display: "grid", gap: 6, marginTop: 6, fontSize: "var(--text-xs)", color: "var(--bm-text2)", lineHeight: 1.5 }}>
          {!see && <div style={{ color: "var(--bm-text3)" }}>Reading...</div>}
          {see && !see.facts && <div>{KEY_MESSAGES[see.state] ?? KEY_MESSAGES.error}</div>}
          {see?.facts && (
            <>
              {see.state === "cached" && see.asOf && <div style={{ color: "var(--bm-text3)" }}>Saved copy from {see.asOf.slice(0, 10)}. The app did not answer just now.</div>}
              {see.facts.map((f) => <div key={f.label}><span style={{ color: "var(--bm-text3)" }}>{f.label}:</span> {f.value}</div>)}
              {(see.shipped?.length ?? 0) > 0 && (
                <div>
                  <div style={{ fontWeight: 600, color: "var(--bm-text)" }}>Recently shipped</div>
                  {see.shipped!.map((t) => <div key={t} style={{ color: "var(--bm-text3)" }}>{t}</div>)}
                </div>
              )}
              {see.used && <div style={{ color: "var(--bm-text3)" }}>{see.used}</div>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

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
  const [seeOpen, setSeeOpen] = React.useState(false);
  const [see, setSee] = React.useState<SeeState | null>(null);
  React.useEffect(() => {
    if (!seeOpen || !s.searchConsole) return;
    setSee(null);
    fetch("/api/integrations/search-console/summary").then((r) => (r.ok ? r.json() : null)).then((d) => setSee(d ?? { state: "error" })).catch(() => setSee({ state: "error" }));
  }, [seeOpen, s.searchConsole, s.searchConsoleSite]);
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
        {s.searchConsole && s.searchConsoleSite && (
          <div style={{ fontSize: "var(--text-xs)", color: "var(--bm-text3)" }}>Reading: <span style={{ color: "var(--bm-text2)" }}>{s.searchConsoleSite}</span>{(s.searchConsoleSites?.length ?? 0) > 1 ? "" : " (the only site on this Google account)"}</div>
        )}
        {s.searchConsole && !scBad && (
          <div>
            <button type="button" aria-expanded={seeOpen} onClick={() => setSeeOpen(!seeOpen)} style={{ ...flat, border: "none", padding: "4px 0", color: "var(--bm-text3)" }}>{seeOpen ? "Hide" : "What BuildMind sees"} {seeOpen ? "▴" : "▾"}</button>
            {seeOpen && (
              <div style={{ display: "grid", gap: 8, marginTop: 6, fontSize: "var(--text-xs)", color: "var(--bm-text2)", lineHeight: 1.5 }}>
                {!see && <div style={{ color: "var(--bm-text3)" }}>Reading your Search Console...</div>}
                {see && !see.summary && <div>{SEE_MESSAGES[see.state] ?? SEE_MESSAGES.error}</div>}
                {see?.summary && (
                  <>
                    <div style={{ color: "var(--bm-text3)" }}>{see.summary.range.start} to {see.summary.range.end}{see.state === "cached" ? ` · saved copy from ${see.summary.asOf.slice(0, 10)}, Google did not answer just now` : ""}</div>
                    {see.note && <div>{see.note}</div>}
                    {([["Almost ranking", see.summary.nearMisses], ["Seen but never clicked", see.summary.unclicked], ["Already getting clicks", see.summary.topQueries.filter((r) => r.clicks > 0).slice(0, 4)]] as Array<[string, SeeRow[]]>).filter(([, rows]) => rows.length).map(([title, rows]) => (
                      <div key={title}>
                        <div style={{ fontWeight: 600, color: "var(--bm-text)" }}>{title}</div>
                        {rows.slice(0, 5).map((r) => <div key={r.query} style={{ color: "var(--bm-text3)" }}>{rowLine(r)}</div>)}
                      </div>
                    ))}
                    <div style={{ color: "var(--bm-text3)" }}>These are used when today's task is an SEO task. They do not change which task you are given.</div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
        {s.searchConsole && (s.searchConsoleSites?.length ?? 0) > 1 && (
          <select value={s.searchConsoleSite ?? ""} onChange={(e) => chooseSite(e.target.value)} aria-label="Search Console site" style={{ background: "var(--bm-bg3)", border: "1px solid var(--bm-border2)", borderRadius: 8, padding: "6px 8px", color: "var(--bm-text)", fontFamily: "inherit", fontSize: "var(--text-xs)" }}>
            {s.searchConsoleSites!.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        )}
      </div>
      <div style={{ fontSize: "var(--text-xs)", color: "var(--bm-text3)", marginTop: 4 }}>Optional. Only if you take payments with Stripe or keep your project's code on GitHub. BuildMind works fully without them.</div>
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
            {on && !bad && <KeyAppSees app={app as "stripe" | "github"} flat={flat} />}
            {open === app && <ConnectCard app={app} onCancel={() => setOpen(null)} onConnected={() => { setOpen(null); load(); }} />}
          </div>
        );
      })}
    </div>
  );
                }
