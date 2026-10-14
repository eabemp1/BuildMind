"use client";
import React, { useEffect, useState } from "react";
import { Bell, Send } from "lucide-react";
import { C, Panel } from "./ui";

interface Ev { id: number; kind: string; payload: { email?: string; provider?: string; founding?: boolean }; created_at: string }
interface Info { channels: { ntfy: boolean; telegram: boolean; email: boolean }; instantLimit: number; events: Ev[] }

const KIND: Record<string, { label: string; color: string }> = { signup: { label: "Signup", color: C.a }, upgrade: { label: "Upgrade", color: C.amber } };
const fmt = (s: string) => new Date(s).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function SignupsTab() {
  const [info, setInfo] = useState<Info | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/admin/owner-alerts").then((r) => r.json()).then((j) => (j.channels ? setInfo(j) : setErr(j.error ?? "Failed"))).catch((e) => setErr(String(e)));
  }, []);

  async function test() {
    setBusy(true); setMsg("");
    try {
      const j = await (await fetch("/api/admin/owner-alerts", { method: "POST" })).json();
      setMsg(j.sent?.length ? `Delivered via ${j.sent.join(", ")}.` : "Nothing delivered. Set a channel below first.");
    } catch { setMsg("Request failed."); }
    setBusy(false);
  }

  if (err) return <div style={{ color: C.red, fontSize: 13 }}>{err}</div>;
  if (!info) return <div style={{ color: C.t3, fontSize: 13 }}>Loading…</div>;
  const ch = [
    { id: "ntfy", name: "Phone push (ntfy)", on: info.channels.ntfy, env: "OWNER_NTFY_TOPIC", hint: "Free. Install the ntfy app, subscribe to a long random topic name." },
    { id: "telegram", name: "Telegram", on: info.channels.telegram, env: "TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID", hint: "Message from your own bot." },
    { id: "email", name: "Email", on: info.channels.email, env: "OWNER_EMAIL", hint: "Uses your existing Resend setup." },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Panel title="Alert channels" right={<button onClick={test} disabled={busy} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: C.rMd, border: `1px solid ${C.b}`, background: "transparent", color: C.a, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}><Send size={11} />{busy ? "Sending…" : "Send test"}</button>}>
        <div className="adm-three">
          {ch.map((c) => (
            <div key={c.id} style={{ border: `1px solid ${C.b}`, borderRadius: C.rMd, padding: 12, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: c.on ? C.a : C.t4 }} />{c.name}
              </div>
              <div style={{ fontSize: 11, color: C.t3, marginTop: 6 }}>{c.on ? "Connected" : <>Not set. Add <code style={{ color: C.t2 }}>{c.env}</code> in Vercel.</>}</div>
              <div style={{ fontSize: 11, color: C.t4, marginTop: 4 }}>{c.hint}</div>
            </div>
          ))}
        </div>
        {msg && <div style={{ fontSize: 12, color: C.t2, marginTop: 10 }}>{msg}</div>}
      </Panel>

      <Panel title="How you get notified">
        <div style={{ display: "flex", gap: 10, fontSize: 13, color: C.t2, lineHeight: 1.55 }}>
          <Bell size={15} color={C.a} style={{ flexShrink: 0, marginTop: 3 }} />
          <div>
            Your first <b>{info.instantLimit}</b> signups each ping you instantly. After that you only get a ping at milestones (50, 100, 250, 500…), on every paid upgrade, and when something goes down. Everything else lands in one daily digest at 20:00 UTC, which is skipped on empty days. Change the instant count with <code>OWNER_INSTANT_SIGNUPS</code>.
          </div>
        </div>
      </Panel>

      <Panel title="Event log" right={<span style={{ fontSize: 11, color: C.t3 }}>latest {info.events.length}</span>}>
        {info.events.length === 0 && <div style={{ fontSize: 12, color: C.t3 }}>No events yet. Run the owner_events migration, then signups appear here.</div>}
        {info.events.map((e, i) => {
          const k = KIND[e.kind] ?? { label: e.kind, color: C.t3 };
          return (
            <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: i ? `1px solid ${C.b}` : "none", fontSize: 12 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: k.color, minWidth: 54 }}>{k.label}</span>
              <span style={{ minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.payload?.email ?? "—"}{e.payload?.provider ? <span style={{ color: C.t3 }}> · {e.payload.provider}</span> : null}</span>
              <span style={{ color: C.t3, whiteSpace: "nowrap" }}>{fmt(e.created_at)}</span>
            </div>
          );
        })}
      </Panel>
    </div>
  );
}
