"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { getAllNotifications, markRead, markAllRead, deleteNotification, type AppNotification, type NotifPriority } from "@/lib/notifications";
import { Bell, Check, Trash2 } from "lucide-react";

const PRIORITY_STYLES: Record<NotifPriority, { text: string; bg: string; border: string; dot: string }> = {
  low:    { text: "var(--bm-text3)", bg: "transparent",           border: "var(--bm-border)",                dot: "var(--bm-text3)" },
  medium: { text: "#A78BFA",         bg: "rgba(167,139,250,0.05)", border: "rgba(167,139,250,0.18)",          dot: "#A78BFA" },
  high:   { text: "var(--bm-amber)", bg: "rgba(232,160,32,0.05)", border: "rgba(232,160,32,0.18)",           dot: "var(--bm-amber)" },
  urgent: { text: "var(--bm-red)",   bg: "rgba(224,85,85,0.06)",  border: "rgba(224,85,85,0.20)",            dot: "var(--bm-red)" },
};

function timeAgo(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60000)    return "just now";
  if (d < 3600000)  return `${Math.floor(d / 60000)}m ago`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`;
  return `${Math.floor(d / 86400000)}d ago`;
}

function NotifRow({ n, onRead, onDelete }: { n: AppNotification; onRead: (id: string) => void; onDelete: (id: string) => void }) {
  const router = useRouter();
  const isUnread = !n.readAt;
  const s = PRIORITY_STYLES[n.priority];

  return (
    <motion.div
      layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.2 }}
      onClick={() => { onRead(n.id); if (n.actionHref) router.push(n.actionHref); }}
      style={{
        display: "flex", alignItems: "flex-start", gap: 14,
        padding: "15px 18px",
        background: isUnread ? s.bg : "transparent",
        border: `1px solid ${isUnread ? s.border : "var(--bm-border)"}`,
        borderRadius: 14, cursor: n.actionHref ? "pointer" : "default",
        marginBottom: 8, transition: "all 0.15s", position: "relative",
      }}
      onMouseEnter={e => { if (n.actionHref) { e.currentTarget.style.borderColor = isUnread ? s.border : "var(--bm-border2)"; e.currentTarget.style.transform = "translateY(-1px)"; } }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = isUnread ? s.border : "var(--bm-border)"; e.currentTarget.style.transform = "none"; }}
    >
      {isUnread && (
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
          style={{ position: "absolute", top: 18, left: -4, width: 8, height: 8, borderRadius: "50%", background: s.dot, boxShadow: `0 0 8px ${s.dot}` }} />
      )}

      <div style={{
        width: 42, height: 42, borderRadius: 12, flexShrink: 0,
        background: isUnread ? "var(--bm-bg3)" : "var(--bm-bg2)",
        border: `1px solid ${isUnread ? s.border : "var(--bm-border)"}`,
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
      }}>
        {n.emoji}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
          <div style={{ fontSize: 13, fontWeight: isUnread ? 600 : 400, color: isUnread ? "var(--bm-text)" : "var(--bm-text3)", lineHeight: 1.3 }}>
            {n.title}
          </div>
          <span style={{ fontSize: 10, color: "var(--bm-text3)", flexShrink: 0, marginTop: 1 }}>{timeAgo(n.createdAt)}</span>
        </div>
        <div style={{ fontSize: 12, color: isUnread ? "var(--bm-text2)" : "var(--bm-text3)", lineHeight: 1.6, marginBottom: n.actionLabel ? 8 : 0 }}>
          {n.body}
        </div>
        {n.actionLabel && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: s.text, fontWeight: 600, padding: "3px 8px", borderRadius: 6, background: `${s.border}` }}>
            {n.actionLabel}
          </span>
        )}
      </div>

      <button onClick={e => { e.stopPropagation(); onDelete(n.id); }}
        style={{ background: "transparent", border: "none", color: "var(--bm-text3)", cursor: "pointer", padding: "4px 6px", borderRadius: 6, flexShrink: 0, transition: "all 0.15s", display: "flex", alignItems: "center", justifyContent: "center" }}
        onMouseEnter={e => { e.currentTarget.style.background = "rgba(224,85,85,0.10)"; e.currentTarget.style.color = "var(--bm-red)"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--bm-text3)"; }}
        aria-label="Dismiss">
        <Trash2 size={13} />
      </button>
    </motion.div>
  );
}

type Filter = "all" | "unread";

export default function NotificationsPage() {
  const [notifs, setNotifs] = useState<AppNotification[]>([]);
  const [filter, setFilter] = useState<Filter>("all");

  const refresh = () => setNotifs(getAllNotifications().sort((a, b) => b.createdAt - a.createdAt));

  useEffect(() => {
    refresh();
    window.addEventListener("bm_notification_added", refresh);
    return () => window.removeEventListener("bm_notification_added", refresh);
  }, []);

  const handleRead = (id: string) => { markRead(id); refresh(); };
  const handleDelete = (id: string) => { deleteNotification(id); refresh(); };
  const handleMarkAll = () => { markAllRead(); refresh(); };

  const displayed = filter === "unread" ? notifs.filter(n => !n.readAt) : notifs;
  const unreadCount = notifs.filter(n => !n.readAt).length;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "28px 24px" }}>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--bm-text)", letterSpacing: "-0.03em", margin: 0 }}>Notifications</h1>
              {unreadCount > 0 && (
                <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "var(--bm-accent-dim)", color: "var(--bm-accent)", border: "1px solid var(--bm-accent-bd)", fontWeight: 700 }}>
                  {unreadCount} new
                </span>
              )}
            </div>
            <p style={{ fontSize: 12, color: "var(--bm-text3)", margin: 0 }}>Stay up to date with your startup progress.</p>
          </div>
          {unreadCount > 0 && (
            <button onClick={handleMarkAll}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, border: "1px solid var(--bm-border)", background: "transparent", color: "var(--bm-text2)", fontSize: 12, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--bm-bg3)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
              <Check size={12} /> Mark all read
            </button>
          )}
        </div>
      </motion.div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 3, background: "var(--bm-bg3)", borderRadius: 10, padding: 3, width: "fit-content", marginBottom: 20, border: "1px solid var(--bm-border)" }}>
        {(["all", "unread"] as Filter[]).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{
              padding: "6px 16px", borderRadius: 8, fontFamily: "inherit", cursor: "pointer",
              background: filter === f ? "var(--bm-bg2)" : "transparent",
              color: filter === f ? "var(--bm-text)" : "var(--bm-text3)",
              fontSize: 12, fontWeight: filter === f ? 600 : 400,
              border: filter === f ? "1px solid var(--bm-border2)" : "1px solid transparent",
              transition: "all 0.15s",
            }}>
            {f === "all" ? "All" : `Unread${unreadCount > 0 ? ` (${unreadCount})` : ""}`}
          </button>
        ))}
      </div>

      {/* List */}
      <AnimatePresence>
        {displayed.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            style={{ textAlign: "center", padding: "60px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--bm-bg3)", border: "1px solid var(--bm-border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Bell size={22} color="var(--bm-text3)" />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--bm-text2)", marginBottom: 4 }}>
                {filter === "unread" ? "All caught up" : "No notifications yet"}
              </div>
              <div style={{ fontSize: 12, color: "var(--bm-text3)" }}>
                {filter === "unread" ? "You've read everything." : "Notifications will appear here as you use BuildMind."}
              </div>
            </div>
          </motion.div>
        ) : (
          displayed.map(n => (
            <NotifRow key={n.id} n={n} onRead={handleRead} onDelete={handleDelete} />
          ))
        )}
      </AnimatePresence>
    </div>
  );
}
