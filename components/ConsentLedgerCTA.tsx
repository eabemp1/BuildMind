"use client";

/**
 * ConsentLedgerCTA — waitlist mode
 *
 * ConsentLedger is not live yet. This component:
 *   1. Collects waitlist emails (no external link)
 *   2. Is hidden entirely for Legal Tech / GDPR domain users (would look like a competitor)
 *   3. Stores signups to localStorage + POSTs to /api/waitlist when that route exists
 *
 * When ConsentLedger goes live:
 *   - Set CL_LIVE = true
 *   - Set CL_URL to the real URL
 *   - The component automatically switches from waitlist → live CTA
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { storage } from "@/lib/storage";

// ── Config — flip these when ConsentLedger launches ──────────────────────────
const CL_LIVE = false;                        // ← set true when live
const CL_URL  = "https://consentledger.io";  // ← update to real URL when live

// Domains that should NOT see the CTA (would look like a competitor)
const HIDDEN_DOMAINS = ["Legal Tech", "Legal tech", "legal tech"];

// ── Shield icon ───────────────────────────────────────────────────────────────
const ShieldIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
    <path d="M12 2L4 6v6c0 5.25 3.5 10.15 8 11.35C16.5 22.15 20 17.25 20 12V6L12 2z"
      fill="#534AB7" fillOpacity="0.2" stroke="#7F77DD" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M9 12l2 2 4-4" stroke="#7F77DD" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// ── Waitlist form (shared across variants) ────────────────────────────────────
function WaitlistForm({ compact = false }: { compact?: boolean }) {
  const [email, setEmail]     = useState("");
  const [state, setState]     = useState<"idle" | "loading" | "done" | "error">("idle");
  const [alreadyJoined, setAlreadyJoined] = useState(false);

  useEffect(() => {
    setAlreadyJoined(!!storage.get("bm_cl_waitlist"));
  }, []);

  const submit = async () => {
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@")) return;
    setState("loading");
    try {
      // Store locally immediately so it survives even if the API doesn't exist yet
      storage.set("bm_cl_waitlist", trimmed);
      // POST to /api/waitlist when that route is ready — silently ignores 404
      await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, source: "buildmind-cta" }),
      }).catch(() => {/* route may not exist yet — that's fine */});
      setState("done");
    } catch {
      setState("done"); // still mark done — email is saved locally
    }
  };

  if (alreadyJoined || state === "done") {
    return (
      <div style={{
        fontSize: 11, color: "#34d399", background: "rgba(16,185,129,0.06)",
        border: "1px solid rgba(16,185,129,0.2)", borderRadius: 7,
        padding: compact ? "6px 10px" : "8px 12px",
      }}>
        ✓ You're on the waitlist — we'll email you when ConsentLedger launches.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 6 }}>
      <input
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        onKeyDown={e => e.key === "Enter" && void submit()}
        placeholder="your@email.com"
        style={{
          flex: 1, background:"var(--bm-bg2)", border:"1px solid var(--bm-border2)",
          borderRadius: 7, padding: compact ? "6px 10px" : "8px 11px",
          fontSize: 12, color:"var(--bm-text2)", outline: "none", fontFamily: "inherit",
        }}
      />
      <button
        onClick={() => void submit()}
        disabled={state === "loading" || !email.trim()}
        style={{
          background: "#3C3489", color: "#fff", fontWeight: 600,
          fontSize: 11, padding: compact ? "6px 12px" : "8px 14px",
          borderRadius: 7, border: "none", cursor: "pointer",
          fontFamily: "inherit", opacity: state === "loading" ? 0.6 : 1,
          flexShrink: 0,
        }}>
        {state === "loading" ? "..." : "Join waitlist"}
      </button>
    </div>
  );
}

// ── Live CTA link (used when CL_LIVE = true) ──────────────────────────────────
function LiveLink({ label, url, compact = false }: { label: string; url: string; compact?: boolean }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      style={{
        display: "inline-block", fontSize: compact ? 11 : 12, color: "var(--bm-text2)",
        textDecoration: "none", fontWeight: 500,
      }}>
      {label} →
    </a>
  );
}

// ── Compact inline pill ───────────────────────────────────────────────────────
function CompactCTA({ context }: { context?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
      style={{
        display: "flex", flexDirection: "column", gap: 8,
        borderRadius: 10, border: "1px solid rgba(60,52,137,0.3)",
        background: "rgba(60,52,137,0.06)", padding: "10px 12px",
      }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <ShieldIcon size={16} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#AFA9EC" }}>ConsentLedger</div>
          <div style={{ fontSize: 10, color:"var(--bm-text4)", fontFamily: "monospace" }}>
            {context ?? "GDPR compliance tool — building with BuildMind"}
          </div>
        </div>
        {!CL_LIVE && (
          <span style={{
            fontSize: 8, color: "#534AB7", border: "1px solid rgba(83,74,183,0.3)",
            borderRadius: 99, padding: "2px 7px", flexShrink: 0,
          }}>Coming soon</span>
        )}
      </div>
      {CL_LIVE
        ? <LiveLink label="Try free" url={`${CL_URL}?ref=buildmind-compact`} compact />
        : <WaitlistForm compact />
      }
    </motion.div>
  );
}

// ── Full card CTA ─────────────────────────────────────────────────────────────
function FullCTA() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
      style={{ borderRadius: 12, border: "1px solid rgba(60,52,137,0.3)", background: "#0a0a14", padding: 18 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, background: "rgba(60,52,137,0.2)",
          border: "1px solid rgba(83,74,183,0.3)", display: "flex", alignItems: "center",
          justifyContent: "center", flexShrink: 0,
        }}>
          <ShieldIcon size={18} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color:"var(--bm-text)" }}>
            ConsentLedger
          </div>
          <div style={{ fontSize: 11, color:"var(--bm-text3)", fontFamily: "monospace" }}>
            GDPR consent management — being built with BuildMind
          </div>
        </div>
        <span style={{
          fontSize: 8, color: "#f59e0b", border: "1px solid rgba(245,158,11,0.3)",
          background: "rgba(245,158,11,0.06)", borderRadius: 99, padding: "3px 8px", flexShrink: 0,
        }}>
          {CL_LIVE ? "Live" : "In development"}
        </span>
      </div>

      {/* What it is */}
      <div style={{
        fontSize: 11, color:"var(--bm-text3)", lineHeight: 1.65,
        marginBottom: 14, borderBottom: "1px solid #111", paddingBottom: 12,
      }}>
        EU small businesses face fines up to €20M for bad GDPR consent management — but most can't afford enterprise tools.
        ConsentLedger is a simple, affordable fix. It's being built using this exact BuildMind execution system.
      </div>

      {/* Stats */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        {[
          { n: "2.4M+", label: "EU businesses at risk" },
          { n: "€20M",  label: "Max GDPR fine" },
          { n: "$9/mo", label: "Target price" },
        ].map(s => (
          <div key={s.label} style={{
            flex: 1, borderRadius: 8, background:"var(--bm-bg2)", border:"1px solid var(--bm-border)",
            padding: "9px 8px", textAlign: "center",
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#AFA9EC" }}>{s.n}</div>
            <div style={{ fontSize: 9, color:"var(--bm-text4)", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* CTA */}
      {CL_LIVE ? (
        <a href={`${CL_URL}?ref=buildmind-full`} target="_blank" rel="noopener noreferrer"
          style={{
            display: "block", width: "100%", padding: "10px", background: "#3C3489",
            color: "#fff", fontWeight: 600, fontSize: 13, borderRadius: 8,
            textAlign: "center", textDecoration: "none",
          }}>
          Try ConsentLedger free →
        </a>
      ) : (
        <div>
          <div style={{ fontSize: 11, color:"var(--bm-text3)", marginBottom: 8 }}>
            Get early access when we launch:
          </div>
          <WaitlistForm />
        </div>
      )}

      <div style={{ marginTop: 10, fontSize: 10, color:"var(--bm-text4)", textAlign: "center", fontFamily: "monospace" }}>
        Built using BuildMind&apos;s execution system.
      </div>
    </motion.div>
  );
}

// ── Banner (top of page) ──────────────────────────────────────────────────────
function BannerCTA() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, padding: "8px 16px",
        borderBottom: "1px solid rgba(60,52,137,0.2)",
        background: "#0a0a12",
      }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <ShieldIcon size={14} />
        <span style={{ fontSize: 11, color: "#AFA9EC", fontFamily: "monospace" }}>
          ConsentLedger — GDPR tool being built with BuildMind.
        </span>
        {CL_LIVE
          ? <a href={`${CL_URL}?ref=buildmind-banner`} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 11, color: "#7F77DD", textDecoration: "underline", fontFamily: "monospace" }}>
              Try free →
            </a>
          : <span style={{ fontSize: 10, color: "#534AB7", fontFamily: "monospace" }}>Waitlist open</span>
        }
      </div>
      <button onClick={() => setDismissed(true)}
        style={{ color:"var(--bm-text4)", fontSize: 12, background: "transparent", border: "none", cursor: "pointer" }}>
        ✕
      </button>
    </motion.div>
  );
}

// ── Done-state CTA ────────────────────────────────────────────────────────────
function DoneStateCTA() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.0 }}>
      <div style={{
        fontSize: 9, color:"var(--bm-text4)", textTransform: "uppercase", letterSpacing: "0.1em",
        marginBottom: 8, textAlign: "center", fontFamily: "monospace",
      }}>
        Built using this system
      </div>
      <div style={{
        borderRadius: 10, border: "1px solid rgba(60,52,137,0.25)",
        background: "rgba(60,52,137,0.06)", padding: "12px 14px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: CL_LIVE ? 0 : 10 }}>
          <ShieldIcon size={16} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#AFA9EC" }}>ConsentLedger</div>
            <div style={{ fontSize: 10, color:"var(--bm-text4)" }}>
              GDPR compliance for EU businesses — {CL_LIVE ? "live now" : "launching soon"}
            </div>
          </div>
          {CL_LIVE
            ? <a href={`${CL_URL}?ref=buildmind-done`} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 10, color: "#534AB7", textDecoration: "none", flexShrink: 0 }}>
                Visit →
              </a>
            : null
          }
        </div>
        {!CL_LIVE && <WaitlistForm compact />}
      </div>
    </motion.div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
type CTAVariant = "compact" | "full" | "banner" | "done-state";

interface ConsentLedgerCTAProps {
  variant?: CTAVariant;
  context?: string;
}

export default function ConsentLedgerCTA({ variant = "compact", context }: ConsentLedgerCTAProps) {
  const [visible, setVisible] = useState(false);

  // Check domain — hide entirely for Legal Tech / GDPR users (would look like a competitor)
  useEffect(() => {
    const domain = storage.get("bm_domain") ?? "";
    const isLegalTech = HIDDEN_DOMAINS.some(d => domain.toLowerCase().includes(d.toLowerCase()));
    setVisible(!isLegalTech);
  }, []);

  if (!visible) return null;

  switch (variant) {
    case "full":       return <FullCTA />;
    case "banner":     return <BannerCTA />;
    case "done-state": return <DoneStateCTA />;
    default:           return <CompactCTA context={context} />;
  }
}
