"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RadialGauge } from "@/components/charts/RadialGauge";

interface PromoterRow {
  name: string;
  url: string;
  createdAt: string;
  momentum: number;
  totalLogged: number;
  conversions: number;
  lastActive: string | null;
}

const BG = "var(--bm-bg, #0a0e1a)";
const BG2 = "var(--bm-bg2, #131829)";
const BORDER = "var(--bm-border, #232a3d)";
const TEXT = "var(--bm-text, #e8eaf0)";
const TEXT2 = "var(--bm-text2, #8b93a8)";
const ACCENT = "var(--bm-accent, #6366f1)";

export default function PromotersAdminPage() {
  const [rows, setRows] = useState<PromoterRow[] | null>(null);
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdUrl, setCreatedUrl] = useState("");

  async function load() {
    try {
      const res = await fetch("/api/promote/list", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Could not load");
      setRows(json.promoters);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  useEffect(() => { load(); }, []);

  async function createPromoter() {
    if (!newName.trim()) return;
    setCreating(true);
    setCreatedUrl("");
    try {
      const res = await fetch("/api/promote/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), email: newEmail.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Could not create");
      setCreatedUrl(json.url);
      setNewName("");
      setNewEmail("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create promoter link");
    } finally {
      setCreating(false);
    }
  }

  if (error) {
    return (
      <div style={{ minHeight: "100vh", background: BG, color: TEXT, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ fontSize: 14, color: TEXT2 }}>{error}</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: BG, color: TEXT, padding: "28px 18px 60px" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: 26, marginBottom: 6 }}>Promoters</div>
        <p style={{ color: TEXT2, fontSize: 13.5, marginBottom: 24 }}>Everyone helping promote BuildMind, at a glance.</p>

        {/* Create new */}
        <div style={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 16, marginBottom: 24, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Name (e.g. Kwame)"
            style={{ flex: 1, minWidth: 160, background: "#0d1220", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 12px", color: TEXT, fontSize: 13.5 }}
          />
          <input
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            placeholder="Email (optional — for reminders)"
            type="email"
            style={{ flex: 1, minWidth: 160, background: "#0d1220", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 12px", color: TEXT, fontSize: 13.5 }}
          />
          <button
            onClick={createPromoter}
            disabled={creating || !newName.trim()}
            style={{ background: ACCENT, color: "white", border: "none", padding: "10px 18px", borderRadius: 8, fontSize: 13.5, fontWeight: 700, cursor: creating ? "default" : "pointer", opacity: creating ? 0.7 : 1 }}
          >
            {creating ? "Creating…" : "+ New promoter link"}
          </button>
        </div>
        {createdUrl && (
          <div style={{ background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.3)", borderRadius: 10, padding: 12, marginBottom: 20, fontSize: 13, fontFamily: "DM Mono, monospace" }}>
            Created: <a href={createdUrl} style={{ color: "#4ade80" }}>{createdUrl}</a>
          </div>
        )}

        {/* List */}
        {!rows ? (
          <div style={{ color: TEXT2, fontSize: 13.5 }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ color: TEXT2, fontSize: 13.5 }}>No promoters yet — create one above.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {rows.map((p) => (
              <Link
                key={p.url}
                href={p.url}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div style={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 16, display: "flex", alignItems: "center", gap: 16 }}>
                  <RadialGauge value={p.momentum} size={56} label="" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: TEXT2 }}>
                      {p.totalLogged} logged · last active {p.lastActive ? new Date(p.lastActive).toLocaleDateString() : "never"}
                    </div>
                  </div>
                  <div style={{ textAlign: "center", flexShrink: 0 }}>
                    <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: 22, color: p.conversions > 0 ? "#4ade80" : TEXT2 }}>
                      {p.conversions}
                    </div>
                    <div style={{ fontSize: 10, color: TEXT2, textTransform: "uppercase", letterSpacing: "0.04em" }}>signups</div>
                  </div>
                  <div style={{ fontSize: 12, color: TEXT2, fontFamily: "DM Mono, monospace" }}>→</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
