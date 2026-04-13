"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  getAllNotifications, markRead, markAllRead, deleteNotification,
  type AppNotification, type NotifPriority,
} from "@/lib/notifications";

const PRIORITY_COLOR: Record<NotifPriority, { text: string; bg: string; border: string }> = {
  low:    { text: "#555",    bg: "transparent",             border: "#111" },
  medium: { text: "#a78bfa", bg: "rgba(167,139,250,0.05)",  border: "rgba(167,139,250,0.15)" },
  high:   { text: "#fbbf24", bg: "rgba(251,191,36,0.05)",   border: "rgba(251,191,36,0.15)" },
  urgent: { text: "#f87171", bg: "rgba(248,113,113,0.06)",  border: "rgba(248,113,113,0.18)" },
};

function timeAgo(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60000)    return "just now";
  if (d < 3600000)  return `${Math.floor(d / 60000)}m ago`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`;
  return `${Math.floor(d / 86400000)}d ago`;
}

function NotifRow({ n, onRead, onDelete }: {
  n: AppNotification;
  onRead: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const router = useRouter();
  const isUnread = !n.readAt;
  const colors = PRIORITY_COLOR[n.priority];

  const handleClick = () => {
    onRead(n.id);
    if (n.actionHref) router.push(n.actionHref);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.2 }}
      onClick={handleClick}
      style={{
        display: "flex", alignItems: "flex-start", gap: 14,
        padding: "16px 20px",
        background: isUnread ? colors.bg : "transparent",
        border: `1px solid ${isUnread ? colors.border : "#111"}`,
        borderRadius: 12, cursor: n.actionHref ? "pointer" : "default",
        marginBottom: 8, transition: "background 0.15s",
        position: "relative",
      }}
    >
      {/* Unread indicator */}
      {isUnread && (
        <motion.div
          initial={{ scale: 0 }} animate={{ scale: 1 }}
          style={{
            position: "absolute", top: 18, left: -4,
            width: 8, height: 8, borderRadius: "50%",
            background: colors.text,
            boxShadow: `0 0 8px ${colors.text}`,
          }}
        />
      )}

      {/* Emoji */}
      <div style={{
        width: 44, height: 44, borderRadius: 10, flexShrink: 0,
        background: isUnread ? `${colors.border}` : "#111",
        border: `1px solid ${isUnread ? colors.border : "#1a1a1a"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 20,
      }}>
        {n.emoji}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
          <div style={{
            fontSize: 13, fontWeight: isUnread ? 600 : 400,
            color: isUnread ? "#fff" : "#777", lineHeight: 1.3,
          }}>
            {n.title}
          </div>
          <div style={{ fontSize: 10, color: "#333", flexShrink: 0, marginTop: 1 }}>
            {timeAgo(n.createdAt)}
          </div>
        </div>
        <div style={{ fontSize: 12, color: isUnread ? "#888" : "#444", lineHeight: 1.6, marginBottom: n.actionLabel ? 8 : 0 }}>
          {n.body}
        </div>
        {n.actionLabel && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: 11, color: colors.text, fontWeight: 600,
            padding: "3px 8px", borderRadius: 6,
            background: `${colors.border}40`,
          }}>
            {n.actionLabel}
          </div>
        )}
      </div>

      {/* Delete */}
      <button
        onClick={e => { e.stopPropagation(); onDelete(n.id); }}
        style={{
          background: "transparent", border: "none", color: "#222",
          fontSize: 18, cursor: "pointer", lineHeight: 1,
          flexShrink: 0, padding: 4, borderRadius: 4,
          transition: "color 0.15s",
        }}
        onMouseEnter={e => (e.currentTarget.style.color = "#ef4444")}
        onMouseLeave={e => (e.currentTarget.style.color = "#222")}
        aria-label="Dismiss"
      >
        ×
      </button>
    </motion.div>
  );
}

type Filter = "all" | "unread";

export default function NotificationsPage() {
  const [notifs, setNotifs] = useState<AppNotification[]>([]);
  const [filter, setFilter] = useState<Filter>("all");

  const refresh = () => {
    setNotifs(getAllNotifications().sort((a, b) => b.createdAt - a.createdAt));
  };

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
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      style={{ maxWidth: 680, margin: "0 auto", fontFamily: "system-ui,sans-serif", paddingBottom: 40 }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "var(--bm-text)" }}>
            🔔 Notifications
          </h1>
          <div style={{ fontSize: 12, color: "var(--bm-text3)", marginTop: 3 }}>
            {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
          </div>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAll}
            style={{
              background: "transparent", border: "1px solid #222",
              borderRadius: 8, padding: "7px 14px",
              color: "#666", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
              transition: "all 0.15s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "#444"; (e.currentTarget as HTMLElement).style.color = "#fff"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "#222"; (e.currentTarget as HTMLElement).style.color = "#666"; }}
          >
            Mark all read
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
        {(["all", "unread"] as Filter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: "6px 14px", borderRadius: 20, fontSize: 12, cursor: "pointer",
              fontFamily: "inherit", fontWeight: filter === f ? 600 : 400,
              background: filter === f ? "#1a1a3a" : "transparent",
              border: `1px solid ${filter === f ? "#3b3b7a" : "#1a1a1a"}`,
              color: filter === f ? "#a78bfa" : "#555",
              transition: "all 0.15s",
            }}
          >
            {f === "all" ? `All (${notifs.length})` : `Unread (${unreadCount})`}
          </button>
        ))}
      </div>

      {/* Notification list */}
      <AnimatePresence mode="popLayout">
        {displayed.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{
              textAlign: "center", padding: "60px 20px",
              background: "#0a0a0a", border: "1px solid #111",
              borderRadius: 16,
            }}
          >
            <div style={{ fontSize: 40, marginBottom: 14 }}>
              {filter === "unread" ? "✅" : "🔔"}
            </div>
            <div style={{ fontSize: 14, color: "#555" }}>
              {filter === "unread" ? "No unread notifications" : "No notifications yet"}
            </div>
            {filter === "unread" && notifs.length > 0 && (
              <button
                onClick={() => setFilter("all")}
                style={{ marginTop: 12, background: "transparent", border: "none", color: "#a78bfa", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
              >
                View all →
              </button>
            )}
          </motion.div>
        ) : (
          displayed.map(n => (
            <NotifRow key={n.id} n={n} onRead={handleRead} onDelete={handleDelete} />
          ))
        )}
      </AnimatePresence>

      {/* Hint */}
      {notifs.length > 0 && (
        <div style={{ textAlign: "center", marginTop: 16, fontSize: 11, color: "#2a2a2a" }}>
          Notifications are stored locally on this device.
        </div>
      )}
    </motion.div>
  );
}
