"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { BuildMindCalibrating } from "@/components/BuildMindCalibrating";

type TabKey = "week" | "patterns";

function TabButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "10px 14px",
        borderRadius: 999,
        border: `1px solid ${active ? "var(--bm-accent-bd)" : "var(--bm-border)"}`,
        background: active ? "var(--bm-accent-dim)" : "var(--bm-bg3)",
        color: active ? "var(--bm-accent)" : "var(--bm-text3)",
        fontSize: 12,
        fontWeight: active ? 700 : 500,
        fontFamily: "inherit",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

export default function ProgressPage() {
  const [tab, setTab] = useState<TabKey>("week");
  const [reflectionCount, setReflectionCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCount() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { count } = await supabase.from("reflections").select("id", { count: "exact", head: true }).eq("user_id", user.id);
        setReflectionCount(count ?? 0);
      } catch {
        // non-fatal
      } finally {
        setLoading(false);
      }
    }
    fetchCount();
  }, []);

  if (!loading && reflectionCount < 7) {
    return <BuildMindCalibrating count={reflectionCount} surface="patterns" />;
  }

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: "24px 20px 40px" }}>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 18 }}>
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--bm-text4)", margin: "0 0 6px" }}>Progress</p>
        <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.03em", color: "var(--bm-text)", margin: 0 }}>This week and your patterns</h1>
        <p style={{ fontSize: 13, color: "var(--bm-text3)", margin: "6px 0 0" }}>A tighter view of execution and behavior, without the clutter.</p>
      </motion.div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <TabButton active={tab === "week"} onClick={() => setTab("week")}>This Week</TabButton>
        <TabButton active={tab === "patterns"} onClick={() => setTab("patterns")}>Patterns</TabButton>
      </div>

      <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 18, overflow: "hidden", minHeight: 760 }}>
        {tab === "week" ? (
          <iframe
            title="This Week"
            src="/reports?embed=1"
            style={{ width: "100%", height: "100%", minHeight: 760, border: 0, display: "block", background: "transparent" }}
          />
        ) : (
          <iframe
            title="Patterns"
            src="/insights?embed=1"
            style={{ width: "100%", height: "100%", minHeight: 760, border: 0, display: "block", background: "transparent" }}
          />
        )}
      </div>
    </div>
  );
}