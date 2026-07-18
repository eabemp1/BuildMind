"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { RadialGauge } from "@/components/charts/RadialGauge";
import { Sparkline } from "@/components/charts/Sparkline";
import { DotHeatmap } from "@/components/charts/DotHeatmap";
import { BrandMark } from "@/components/layout/logo";

interface DashboardData {
  promoter: { name: string; since: string };
  missions: { key: string; title: string; points: number; instr: string; copy: string }[];
  todaysMission: { key: string; title: string; points: number; instr: string; copy: string };
  completedKeys: string[];
  activity: { mission_key: string; note: string | null; completed_at: string }[];
  stats: {
    momentum: number;
    streak: number;
    completionRate: number;
    activeDays: string[];
    dailyCounts: number[];
    totalLogged: number;
    conversions: number;
    lastConversionAt: string | null;
  };
}

const BG = "var(--bm-bg, #0a0e1a)";
const BG2 = "var(--bm-bg2, #131829)";
const BORDER = "var(--bm-border, #232a3d)";
const TEXT = "var(--bm-text, #e8eaf0)";
const TEXT2 = "var(--bm-text2, #8b93a8)";
const ACCENT = "var(--bm-accent, #6366f1)";

export default function PromoterDashboardPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [logging, setLogging] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [note, setNote] = useState("");
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/promote/${token}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Could not load dashboard");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function logMission(key: string) {
    setLogging(key);
    try {
      const res = await fetch(`/api/promote/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ missionKey: key, note: noteFor === key ? note : undefined }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Could not log");
      setNote("");
      setNoteFor(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not log activity");
    } finally {
      setLogging(null);
    }
  }

  async function getFeedback() {
    setFeedbackLoading(true);
    setFeedback("");
    try {
      const res = await fetch(`/api/promote/${token}/feedback`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Feedback unavailable");
      setFeedback(json.feedback);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Couldn't get feedback right now — try again shortly.");
    } finally {
      setFeedbackLoading(false);
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: BG, color: TEXT2, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
        Loading dashboard…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: "100vh", background: BG, color: TEXT, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8, padding: 24 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Couldn't find this dashboard</div>
        <div style={{ fontSize: 13, color: TEXT2 }}>{error || "Check the link and try again."}</div>
      </div>
    );
  }

  const { promoter, missions, completedKeys, activity, stats } = data;

  return (
    <div style={{ minHeight: "100vh", background: `radial-gradient(circle at 15% 0%, rgba(99,102,241,0.12), transparent 45%), ${BG}`, color: TEXT, padding: "28px 18px 60px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <BrandMark size={22} href="/" />
          <span style={{ fontSize: 13, fontWeight: 600, color: TEXT2 }}>BuildMind Promoter</span>
        </div>
        <h1 style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: 28, marginBottom: 4 }}>
          {promoter.name}'s Dashboard
        </h1>
        <p style={{ color: TEXT2, fontSize: 14, marginBottom: 16 }}>
          Every post you log shows up here. No pressure — just a real record of the effort you're putting in.
        </p>

        {/* Originality warning — the templates below are a starting point, not a script */}
        <div style={{ background: "rgba(251,146,60,0.08)", border: "1px solid rgba(251,146,60,0.3)", borderRadius: 12, padding: "14px 16px", marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#fb923c", marginBottom: 4 }}>Before you post: make it yours</div>
          <p style={{ fontSize: 12.5, color: TEXT2, lineHeight: 1.55 }}>
            The text below each mission is a starting point, not a script. Posting it word-for-word — especially the same line everywhere — tends to get quietly buried by most platforms' algorithms, and readers can usually tell it's copy-pasted anyway. Read it, then rewrite it in how you'd actually say it. Change the opening line, drop a phrase that doesn't sound like you, add something true and specific if you can. Two sentences in your own voice beat a perfect paragraph that isn't.
          </p>
        </div>

        {/* Today's Mission — the actual daily-work answer, not just a list to pick from */}
        <div style={{ background: `linear-gradient(135deg, rgba(99,102,241,0.14), rgba(139,92,246,0.08))`, border: `1px solid ${ACCENT}`, borderRadius: 16, padding: 20, marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: ACCENT, fontFamily: "DM Mono, monospace", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
            Today's mission
          </div>
          <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: 20, marginBottom: 8 }}>
            {data.todaysMission.title}
          </div>
          <p style={{ fontSize: 13, color: TEXT2, marginBottom: 12, lineHeight: 1.5 }}>{data.todaysMission.instr}</p>
          <div style={{ fontSize: 10.5, color: "#fb923c", fontFamily: "DM Mono, monospace", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
            Starting point — rewrite before posting
          </div>
          <div style={{ background: "rgba(0,0,0,0.25)", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "12px 14px", fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap", marginBottom: 12 }}>
            {data.todaysMission.copy}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              onClick={() => {
                navigator.clipboard.writeText(data.todaysMission.copy);
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              }}
              style={{ background: copied ? "#4ade80" : ACCENT, color: copied ? "#0a0e1a" : "white", border: "none", padding: "10px 16px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}
            >
              {copied ? "Copied ✓" : "Copy starting point"}
            </button>
            <button
              onClick={() => setNoteFor(noteFor === data.todaysMission.key ? null : data.todaysMission.key)}
              style={{ background: "transparent", border: `1px solid ${TEXT2}`, color: TEXT, padding: "10px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              {noteFor === data.todaysMission.key ? "Cancel" : "Done — log it"}
            </button>
          </div>
          {noteFor === data.todaysMission.key && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11.5, color: TEXT2, marginBottom: 6 }}>
                Paste what you actually posted (your rewritten version) — helps track that it wasn't just copy-pasted, and gives better feedback below.
              </div>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="What you actually posted…"
                rows={3}
                style={{ width: "100%", background: "#0d1220", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 12px", color: TEXT, fontSize: 13, marginBottom: 10, resize: "vertical" }}
              />
              <button
                onClick={() => logMission(data.todaysMission.key)}
                disabled={logging === data.todaysMission.key}
                style={{ background: ACCENT, color: "white", border: "none", padding: "9px 16px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: logging === data.todaysMission.key ? "default" : "pointer" }}
              >
                {logging === data.todaysMission.key ? "Logging…" : "Confirm log"}
              </button>
            </div>
          )}
        </div>

        {/* Stat cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 24 }}>
          <StatCard label="Signups driven">
            <div style={{ fontFamily: "Syne, sans-serif", fontSize: 36, fontWeight: 800, color: stats.conversions > 0 ? "#4ade80" : TEXT }}>
              {stats.conversions}
            </div>
            <div style={{ fontSize: 12, color: TEXT2 }}>
              {stats.lastConversionAt ? `last ${new Date(stats.lastConversionAt).toLocaleDateString()}` : "from your link"}
            </div>
          </StatCard>
          <StatCard label="Momentum">
            <RadialGauge value={stats.momentum} size={92} label="momentum" />
          </StatCard>
          <StatCard label="Streak">
            <div style={{ fontFamily: "Syne, sans-serif", fontSize: 36, fontWeight: 800, color: stats.streak > 0 ? "#fb923c" : TEXT2 }}>
              {stats.streak}
            </div>
            <div style={{ fontSize: 12, color: TEXT2 }}>{stats.streak === 1 ? "day" : "days"} in a row</div>
          </StatCard>
          <StatCard label="Missions Tried">
            <div style={{ fontFamily: "Syne, sans-serif", fontSize: 36, fontWeight: 800 }}>{stats.completionRate}%</div>
            <div style={{ fontSize: 12, color: TEXT2 }}>{completedKeys.length}/{missions.length} types covered</div>
          </StatCard>
          <StatCard label="Last 14 days">
            <Sparkline data={stats.dailyCounts} color={ACCENT} w={110} h={40} />
            <div style={{ fontSize: 12, color: TEXT2, marginTop: 4 }}>{stats.totalLogged} total logged</div>
          </StatCard>
        </div>

        {/* Heatmap */}
        <div style={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 18, marginBottom: 24 }}>
          <DotHeatmap activeDays={stats.activeDays} streak={stats.streak} title="Activity — Last 4 Weeks" />
        </div>

        {/* AI Feedback */}
        <div style={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 20, marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 15 }}>AI Feedback</div>
            <button
              onClick={getFeedback}
              disabled={feedbackLoading}
              style={{ background: ACCENT, color: "white", border: "none", padding: "8px 14px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: feedbackLoading ? "default" : "pointer", opacity: feedbackLoading ? 0.7 : 1 }}
            >
              {feedbackLoading ? "Thinking…" : "Get feedback"}
            </button>
          </div>
          {feedback ? (
            <p style={{ fontSize: 13.5, color: TEXT, lineHeight: 1.6 }}>{feedback}</p>
          ) : (
            <p style={{ fontSize: 13, color: TEXT2 }}>Tap "Get feedback" any time to see what the pattern in your activity actually looks like.</p>
          )}
        </div>

        {/* Missions */}
        <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Log a mission</div>
        <div style={{ display: "grid", gap: 10, marginBottom: 28 }}>
          {missions.map(m => (
            <div key={m.key} style={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{m.title}</div>
                  <div style={{ fontSize: 11.5, color: TEXT2, fontFamily: "DM Mono, monospace" }}>+{m.points} pts</div>
                </div>
                <button
                  onClick={() => logMission(m.key)}
                  disabled={logging === m.key}
                  style={{ background: "transparent", border: `1px solid ${ACCENT}`, color: ACCENT, padding: "8px 14px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: logging === m.key ? "default" : "pointer", whiteSpace: "nowrap" }}
                >
                  {logging === m.key ? "Logging…" : "Log it"}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Activity table — the "Notion-like" report */}
        <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Recent activity</div>
        <div style={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden" }}>
          {activity.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: TEXT2, fontSize: 13 }}>Nothing logged yet — log your first mission above.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                  <th style={{ textAlign: "left", padding: "10px 14px", color: TEXT2, fontWeight: 500, fontSize: 11.5 }}>DATE</th>
                  <th style={{ textAlign: "left", padding: "10px 14px", color: TEXT2, fontWeight: 500, fontSize: 11.5 }}>MISSION</th>
                  <th style={{ textAlign: "left", padding: "10px 14px", color: TEXT2, fontWeight: 500, fontSize: 11.5 }}>NOTE</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((a, i) => (
                  <tr key={i} style={{ borderBottom: i < activity.length - 1 ? `1px solid ${BORDER}` : "none" }}>
                    <td style={{ padding: "10px 14px", color: TEXT2, fontFamily: "DM Mono, monospace", fontSize: 12 }}>
                      {new Date(a.completed_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: "10px 14px" }}>{missions.find(m => m.key === a.mission_key)?.title ?? a.mission_key}</td>
                    <td style={{ padding: "10px 14px", color: TEXT2 }}>{a.note ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 16, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 6 }}>
      <div style={{ fontSize: 11, color: TEXT2, fontFamily: "DM Mono, monospace", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      {children}
    </div>
  );
}
