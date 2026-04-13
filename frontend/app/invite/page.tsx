"use client";

/**
 * app/invite/page.tsx — Referral System
 *
 * Viral loop: invite a founder → both get 1 month Builder free
 * when the referred founder completes their first 7-day streak.
 *
 * Referral link: buildmind.live/ref/[code]
 * Code is derived from user ID + stored in localStorage.
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";

const MESSAGES = [
  "Hey — I've been using BuildMind to stay accountable on my startup. It gives me one specific action every morning and tracks my streak. Thought you'd find it useful: {link}",
  "If you're building something and struggling with what to do next, BuildMind is worth trying. One action per day, AI-generated for your specific startup. Free to start: {link}",
  "I've been doing daily accountability for my startup on BuildMind. You get a 90-day roadmap, daily actions, weekly AI analysis. Use my link and we both get a free month of Builder: {link}",
];

function generateRefCode(uid: string): string {
  return uid.slice(0, 8).replace(/-/g, "");
}

export default function InvitePage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [refCode, setRefCode] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [msgIdx, setMsgIdx] = useState(0);
  const [referrals, setReferrals] = useState<{ email: string; status: string; joinedAt: string }[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const sb = createClient();
        const { data } = await sb.auth.getUser();
        if (data.user) {
          setUserId(data.user.id);
          const code = generateRefCode(data.user.id);
          setRefCode(code);
          // Load stored referrals from localStorage
          const stored = localStorage.getItem(`bm_referrals_${code}`);
          if (stored) setReferrals(JSON.parse(stored));
        }
      } catch {}
    };
    void load();
  }, []);

  const refLink = refCode ? `https://buildmind.live/ref/${refCode}` : "Loading…";
  const message = MESSAGES[msgIdx].replace("{link}", refLink);

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const shareOptions = [
    { label: "WhatsApp", icon: "💬", href: `https://wa.me/?text=${encodeURIComponent(message)}`, color: "#25d366" },
    { label: "Twitter/X", icon: "𝕏", href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(MESSAGES[0].replace("{link}", refLink))}`, color: "#1da1f2" },
    { label: "LinkedIn", icon: "in", href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(refLink)}`, color: "#0a66c2" },
    { label: "Telegram", icon: "✈️", href: `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent("Daily execution engine for founders")}`, color: "#0088cc" },
  ];

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", fontFamily: "system-ui, sans-serif", padding: "0 0 48px" }}>
      {/* Hero */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        style={{ textAlign: "center", padding: "32px 20px 24px", marginBottom: 8 }}>
        <div style={{ fontSize: 40, marginBottom: 14 }}>🤝</div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "var(--bm-text)", marginBottom: 8 }}>
          Invite a founder
        </h1>
        <p style={{ margin: 0, fontSize: 14, color: "#666", lineHeight: 1.6, maxWidth: 400, marginLeft: "auto", marginRight: "auto" }}>
          When they complete their first 7-day streak, you both get <strong style={{ color: "#a78bfa" }}>1 month of Builder free</strong>. No catch.
        </p>
      </motion.div>

      {/* How it works */}
      <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 12, padding: "16px 20px", marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: 12 }}>How it works</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            { step: "1", text: "Share your referral link with a solo founder you know" },
            { step: "2", text: "They sign up and start their first project" },
            { step: "3", text: "When they complete 7 consecutive daily actions, you both get Builder free for 1 month" },
          ].map(s => (
            <div key={s.step} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#a78bfa", flexShrink: 0 }}>{s.step}</div>
              <div style={{ fontSize: 13, color: "#888", lineHeight: 1.5, paddingTop: 2 }}>{s.text}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Referral link */}
      <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 12, padding: "16px 20px", marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: 10 }}>Your referral link</div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1, background: "#111", border: "1px solid #1a1a1a", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#888", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {refLink}
          </div>
          <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} onClick={() => copy(refLink, "link")}
            style={{ padding: "10px 16px", borderRadius: 8, border: "none", background: copied === "link" ? "#10b981" : "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flexShrink: 0, transition: "background 0.2s" }}>
            {copied === "link" ? "✓ Copied!" : "Copy link"}
          </motion.button>
        </div>
      </div>

      {/* Message templates */}
      <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 12, padding: "16px 20px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>Message templates</div>
          <div style={{ display: "flex", gap: 4 }}>
            {MESSAGES.map((_, i) => (
              <button key={i} onClick={() => setMsgIdx(i)}
                style={{ width: 20, height: 6, borderRadius: 3, border: "none", background: msgIdx === i ? "#a78bfa" : "#222", cursor: "pointer", padding: 0 }} />
            ))}
          </div>
        </div>
        <div style={{ background: "#111", border: "1px solid #1a1a1a", borderRadius: 8, padding: "12px 14px", fontSize: 12, color: "#777", lineHeight: 1.7, fontFamily: "monospace", marginBottom: 10, minHeight: 80 }}>
          {message}
        </div>
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={() => copy(message, "msg")}
          style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #2a2a2a", background: copied === "msg" ? "#10b981" : "transparent", color: copied === "msg" ? "#fff" : "#666", fontSize: 12, cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s" }}>
          {copied === "msg" ? "✓ Copied!" : "Copy message"}
        </motion.button>
      </div>

      {/* Share buttons */}
      <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 12, padding: "16px 20px", marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: 12 }}>Share directly</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
          {shareOptions.map(opt => (
            <a key={opt.label} href={opt.href} target="_blank" rel="noopener noreferrer"
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 8, border: "1px solid #1a1a1a", background: "#111", textDecoration: "none", transition: "all 0.15s" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = opt.color; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "#1a1a1a"; }}>
              <span style={{ fontSize: 16 }}>{opt.icon}</span>
              <span style={{ fontSize: 12, color: "#888", fontWeight: 500 }}>{opt.label}</span>
            </a>
          ))}
        </div>
      </div>

      {/* Referral stats */}
      {referrals.length > 0 ? (
        <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 12, padding: "16px 20px" }}>
          <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: 10 }}>Your referrals</div>
          {referrals.map((r, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: i < referrals.length - 1 ? "1px solid #111" : "none" }}>
              <span style={{ fontSize: 12, color: "#888" }}>{r.email}</span>
              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: r.status === "rewarded" ? "rgba(74,222,128,0.1)" : "#111", color: r.status === "rewarded" ? "#4ade80" : "#555" }}>
                {r.status === "rewarded" ? "✓ Reward earned" : "Pending streak"}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: "20px", fontSize: 12, color: "#333" }}>
          No referrals yet. Your referred founders will appear here.
        </div>
      )}
    </div>
  );
}
