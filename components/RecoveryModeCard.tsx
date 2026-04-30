"use client";
/**
 * RecoveryModeCard — NEW IN V4 (Playbook §4.2)
 * Shown in /today when Recovery Mode is active (3+ days of momentum decay).
 * Pure UI wrapper — all logic lives in lib/recoveryMode.ts + /api/recovery-mode
 */
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

export interface ResetMission {
  task: string;
  rationale: string;
  estimatedMinutes: number;
}

interface Props {
  onComplete?: (newScore: number) => void;
}

export default function RecoveryModeCard({ onComplete }: Props) {
  const router = useRouter();
  const [mission, setMission] = useState<ResetMission | null>(null);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/recovery-mode", { method: "POST" });
        if (res.ok) {
          const { resetMission } = await res.json();
          setMission(resetMission);
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  const handleComplete = async () => {
    setCompleting(true);
    try {
      const res = await fetch("/api/recovery-mode", { method: "PATCH" });
      if (res.ok) {
        const { momentumScore } = await res.json();
        setDone(true);
        onComplete?.(momentumScore);
      }
    } catch {}
    setCompleting(false);
  };

  if (done) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
        style={{ background: "rgba(0,255,135,0.06)", border: "1px solid rgba(0,255,135,0.2)", borderRadius: 14, padding: "18px 20px", marginBottom: 16, textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>✓</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--bm-text)", marginBottom: 4 }}>Reset Mission complete.</div>
        <div style={{ fontSize: 12, color: "var(--bm-text3)" }}>Full mode resumes tomorrow morning. +4 momentum points.</div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      style={{ marginBottom: 16 }}>
      {/* Recovery Mode banner */}
      <div style={{ background: "rgba(240,180,41,0.06)", border: "1px solid rgba(240,180,41,0.2)", borderLeft: "3px solid #F0B429", borderRadius: "10px 10px 0 0", padding: "12px 16px" }}>
        <div style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "#F0B429", marginBottom: 5, fontWeight: 700 }}>Recovery Mode Active</div>
        <div style={{ fontSize: 13, color: "var(--bm-text2)", lineHeight: 1.5 }}>
          Let&apos;s stop the decay right now with one thing. Not your big goal — something that takes 5 minutes.
        </div>
      </div>

      {/* Reset Mission */}
      <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderTop: "none", borderRadius: "0 0 14px 14px", padding: "16px 20px" }}>
        {loading ? (
          <div style={{ fontSize: 12, color: "var(--bm-text4)", textAlign: "center", padding: "12px 0" }}>Finding your reset mission…</div>
        ) : mission ? (
          <>
            <div style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--bm-text4)", marginBottom: 8, fontWeight: 700 }}>
              Reset Mission · {mission.estimatedMinutes} min
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--bm-text)", lineHeight: 1.35, marginBottom: 6 }}>{mission.task}</div>
            <div style={{ fontSize: 12, color: "var(--bm-text3)", marginBottom: 16, fontStyle: "italic" }}>{mission.rationale}</div>
            <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.97 }}
              onClick={handleComplete} disabled={completing}
              style={{ width: "100%", padding: "13px 0", borderRadius: 12, border: "none", background: "linear-gradient(135deg, #F0B429, #D4960D)", color: "#000", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
              {completing ? "Marking done…" : "Mark as Done →"}
            </motion.button>
          </>
        ) : (
          <div style={{ fontSize: 12, color: "var(--bm-text3)" }}>One micro-task is ready when you are. <button onClick={() => router.refresh()} style={{ background: "none", border: "none", color: "var(--bm-accent)", cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>Retry</button></div>
        )}

        <div style={{ marginTop: 12, background: "rgba(255,255,255,0.02)", border: "1px solid var(--bm-border)", borderRadius: 9, padding: "10px 12px", fontSize: 11, color: "var(--bm-text4)", lineHeight: 1.5 }}>
          You&apos;re not falling — you&apos;re holding. Complete the Reset Mission and full mode returns tomorrow morning.
        </div>
      </div>
    </motion.div>
  );
}
