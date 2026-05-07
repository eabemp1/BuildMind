"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { Copy, Check, Users, Gift, Flame, ChevronRight, Zap, ArrowRight } from "lucide-react";

const MESSAGES = [
  "Hey — I've been using BuildMind to stay accountable on my startup. It gives me one specific action every morning and tracks my streak. Thought you'd find it useful: {link}",
  "If you're stuck on what to do next, BuildMind is worth trying. It gives founders one execution move every day, already decided. Free to start: {link}",
  "I've been doing daily accountability for my startup on BuildMind. You get a 90-day roadmap, daily actions, weekly AI analysis. Use my link and we both get a free month of Builder: {link}",
];

function generateRefCode(uid: string): string {
  return uid.slice(0, 8).replace(/-/g, "");
}

function getLocalOrigin(): string {
  if (typeof window !== "undefined" && window.location.hostname === "localhost") {
    return window.location.origin;
  }
  return "https://buildmind.live";
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
        if (localStorage.getItem("bm_dev_auth") === "1") {
          const email = localStorage.getItem("bm_dev_email") ?? "test@buildmind.local";
          setUserId("local-dev-user");
          setRefCode(generateRefCode(`local-${email}`));
          return;
        }

        const sb = createClient();
        const { data } = await sb.auth.getUser();
        if (data.user) {
          setUserId(data.user.id);
          const code = generateRefCode(data.user.id);
          setRefCode(code);
        }
      } catch {}
    };
    load();
  }, []);

  const refLink = refCode ? `${getLocalOrigin()}/ref/${refCode}` : "Loading…";
  const currentMsg = MESSAGES[msgIdx].replace("{link}", refLink);

  function copyText(text: string, key: string) {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div style={{ maxWidth: 600, margin: "0 auto" }}>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Gift size={16} color="#4ade80" />
          <span style={{ fontSize: 10, color: "var(--bm-text4)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>Referrals</span>
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "var(--bm-text)", letterSpacing: "-0.03em", margin: "0 0 6px" }}>
          Invite &amp; Earn
        </h1>
        <p style={{ fontSize: 13, color: "var(--bm-text3)", margin: 0, lineHeight: 1.6 }}>
          Invite a founder → both of you get 1 month of Builder free when they complete their first 7-day streak.
        </p>
      </motion.div>

      {/* How it works */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}
        style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 18, padding: "24px", marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--bm-text)", marginBottom: 18 }}>How it works</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {[
            { step: "1", label: "Share your link", desc: "Copy your referral link and send it to a founder friend.", color: "#4ade80" },
            { step: "2", label: "They join BuildMind", desc: "They sign up free and start their first project.", color: "#818cf8" },
            { step: "3", label: "They hit a 7-day streak", desc: "Once they complete 7 consecutive days of action, the reward unlocks.", color: "#fbbf24" },
            { step: "4", label: "Both get 1 free month", desc: "You both receive 1 month of Builder — automatically applied.", color: "#22d3ee" },
          ].map(({ step, label, desc, color }) => (
            <div key={step} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: color + "15", border: `1px solid ${color}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color }}>{step}</span>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--bm-text2)", marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 12, color: "var(--bm-text4)", lineHeight: 1.5 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Referral link */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.10 }}
        style={{ background: "linear-gradient(135deg, rgba(74,222,128,0.07) 0%, rgba(34,211,238,0.03) 100%)", border: "1px solid rgba(74,222,128,0.20)", borderRadius: 18, padding: "24px", marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "#4ade80", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 12 }}>Your Referral Link</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ flex: 1, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "11px 14px", fontSize: 13, color: "var(--bm-text3)", fontFamily: "var(--font-mono, monospace)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {refLink}
          </div>
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            onClick={() => copyText(refLink, "link")}
            style={{ display: "flex", alignItems: "center", gap: 7, padding: "11px 18px", borderRadius: 10, border: "none", background: copied === "link" ? "rgba(74,222,128,0.15)" : "linear-gradient(135deg, #22c55e, #16a34a)", color: copied === "link" ? "#4ade80" : "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", boxShadow: copied !== "link" ? "0 0 16px rgba(34,197,94,0.2)" : "none" }}>
            {copied === "link" ? <><Check size={13} /> Copied!</> : <><Copy size={13} /> Copy Link</>}
          </motion.button>
        </div>
      </motion.div>

      {/* Message templates */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}
        style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 18, padding: "24px", marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--bm-text)" }}>Outreach Message</div>
          <div style={{ display: "flex", gap: 6 }}>
            {MESSAGES.map((_, i) => (
              <button key={i} onClick={() => setMsgIdx(i)}
                style={{ width: 22, height: 22, borderRadius: "50%", border: `1px solid ${msgIdx === i ? "rgba(74,222,128,0.35)" : "var(--bm-border)"}`, background: msgIdx === i ? "rgba(74,222,128,0.12)" : "transparent", cursor: "pointer", fontSize: 9, fontWeight: 700, color: msgIdx === i ? "#4ade80" : "var(--bm-text4)", fontFamily: "inherit" }}>
                {i + 1}
              </button>
            ))}
          </div>
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={msgIdx} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "14px 16px", marginBottom: 12 }}>
              <p style={{ fontSize: 13, color: "var(--bm-text3)", lineHeight: 1.65, margin: 0, fontStyle: "italic" }}>"{currentMsg}"</p>
            </div>
          </motion.div>
        </AnimatePresence>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => copyText(currentMsg, "msg")}
            style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 9, border: "1px solid var(--bm-border)", background: copied === "msg" ? "rgba(74,222,128,0.06)" : "var(--bm-bg3)", color: copied === "msg" ? "#4ade80" : "var(--bm-text2)", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
            {copied === "msg" ? <><Check size={11} /> Copied!</> : <><Copy size={11} /> Copy message</>}
          </button>
          <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(currentMsg)}`} target="_blank" rel="noopener noreferrer"
            style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 9, border: "1px solid var(--bm-border)", background: "transparent", color: "var(--bm-text2)", fontSize: 12, fontWeight: 500, textDecoration: "none" }}>
            𝕏 Share on X
          </a>
        </div>
      </motion.div>

      {/* Referral stats */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}
        style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 18, padding: "22px 24px" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--bm-text)", marginBottom: 16 }}>Your Referrals</div>
        {referrals.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🤝</div>
            <div style={{ fontSize: 13, color: "var(--bm-text3)", lineHeight: 1.6 }}>No referrals yet. Share your link to start earning free months.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {referrals.map((r, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--bm-border)" }}>
                <div>
                  <div style={{ fontSize: 13, color: "var(--bm-text2)", fontWeight: 500 }}>{r.email}</div>
                  <div style={{ fontSize: 11, color: "var(--bm-text4)" }}>Joined {r.joinedAt}</div>
                </div>
                <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 20, background: r.status === "rewarded" ? "rgba(74,222,128,0.10)" : "var(--bm-bg3)", color: r.status === "rewarded" ? "#4ade80" : "var(--bm-text4)", fontWeight: 600 }}>
                  {r.status === "rewarded" ? "✓ Rewarded" : "Pending streak"}
                </span>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
