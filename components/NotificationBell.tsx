"use client";

/**
 * components/NotificationBell.tsx
 *
 * Topbar bell icon with unread count badge.
 * Clicking opens an inline dropdown with all notifications.
 */

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  getAllNotifications, getUnreadCount, markRead, markAllRead, deleteNotification,
  type AppNotification, type NotifPriority,
} from "@/lib/notifications";

const PRIORITY_COLOR: Record<NotifPriority, string> = {
  low: "#555", medium: "#a78bfa", high: "#fbbf24", urgent: "#f87171",
};

function timeAgo(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60000) return "just now";
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`;
  return `${Math.floor(d / 86400000)}d ago`;
}

function NotifItem({ n, onAction, onDelete }: {
  n: AppNotification;
  onAction: (n: AppNotification) => void;
  onDelete: (id: string) => void;
}) {
  const isUnread = !n.readAt;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12 }}
      style={{
        display: "flex", alignItems: "flex-start", gap: 10,
        padding: "12px 14px", borderBottom: "1px solid #111",
        background: isUnread ? "rgba(99,102,241,0.04)" : "transparent",
        cursor: "pointer", transition: "background 0.15s",
        position: "relative",
      }}
      onClick={() => onAction(n)}
    >
      {/* Unread dot */}
      {isUnread && (
        <div style={{
          position: "absolute", top: 14, left: 6,
          width: 5, height: 5, borderRadius: "50%",
          background: PRIORITY_COLOR[n.priority],
        }} />
      )}

      <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{n.emoji}</span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 2 }}>
          <div style={{ fontSize: 12, fontWeight: isUnread ? 600 : 400, color: isUnread ? "#fff" : "#aaa", lineHeight: 1.3 }}>
            {n.title}
          </div>
          <div style={{ fontSize: 10, color: "#444", flexShrink: 0 }}>{timeAgo(n.createdAt)}</div>
        </div>
        <div style={{ fontSize: 11, color: "#666", lineHeight: 1.5, marginBottom: n.actionLabel ? 6 : 0 }}>
          {n.body}
        </div>
        {n.actionLabel && (
          <div style={{ fontSize: 10, color: "#a78bfa", fontWeight: 600 }}>{n.actionLabel}</div>
        )}
      </div>

      {/* Delete button */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(n.id); }}
        style={{ background: "transparent", border: "none", color: "#333", fontSize: 14, cursor: "pointer", padding: "0 2px", flexShrink: 0, lineHeight: 1, marginTop: 2 }}
        aria-label="Dismiss"
      >×</button>
    </motion.div>
  );
}

export default function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const refresh = () => {
    const all = getAllNotifications().sort((a, b) => b.createdAt - a.createdAt);
    setNotifs(all);
    setUnread(all.filter(n => !n.readAt).length);
  };

  useEffect(() => {
    refresh();
    const onStorage = () => refresh();
    const onAdded = () => refresh();
    window.addEventListener("storage", onStorage);
    window.addEventListener("bm_notification_added", onAdded);
    const interval = setInterval(refresh, 15000);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("bm_notification_added", onAdded);
      clearInterval(interval);
    };
  }, []);

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleOpen = () => {
    setOpen(v => !v);
  };

  const handleAction = (n: AppNotification) => {
    markRead(n.id);
    refresh();
    if (n.actionHref) {
      setOpen(false);
      router.push(n.actionHref);
    }
  };

  const handleDelete = (id: string) => {
    deleteNotification(id);
    refresh();
  };

  const handleMarkAll = () => {
    markAllRead();
    refresh();
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Bell button */}
      <motion.button
        whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.94 }}
        onClick={handleOpen}
        style={{
          position: "relative", background: open ? "rgba(99,102,241,0.12)" : "transparent",
          border: `1px solid ${open ? "rgba(99,102,241,0.3)" : "transparent"}`,
          borderRadius: 8, width: 34, height: 34,
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", color: open ? "#a78bfa" : "var(--bm-text3)",
          transition: "all 0.15s",
        }}
        aria-label="Notifications"
      >
        {/* Bell SVG */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>

        {/* Badge */}
        <AnimatePresence>
          {unread > 0 && (
            <motion.div
              initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
              style={{
                position: "absolute", top: -4, right: -4,
                minWidth: 16, height: 16, borderRadius: 8,
                background: "#f87171", border: "2px solid var(--bm-bg)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 9, fontWeight: 700, color: "#fff", padding: "0 3px",
              }}
            >
              {unread > 9 ? "9+" : unread}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            style={{
              position: "absolute", top: "calc(100% + 8px)", right: 0,
              width: 340, maxHeight: 480, overflow: "hidden",
              background: "#0d0d0d", border: "1px solid #1e1e1e",
              borderRadius: 14, boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
              zIndex: 1000, display: "flex", flexDirection: "column",
              fontFamily: "system-ui, sans-serif",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderBottom: "1px solid #111" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>
                Notifications {unread > 0 && <span style={{ fontSize: 10, color: "#a78bfa", marginLeft: 4 }}>({unread} unread)</span>}
              </div>
              {unread > 0 && (
                <button onClick={handleMarkAll}
                  style={{ background: "transparent", border: "none", color: "#555", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
                  Mark all read
                </button>
              )}
            </div>

            {/* List */}
            <div style={{ overflowY: "auto", flex: 1 }}>
              <AnimatePresence>
                {notifs.length === 0 ? (
                  <div style={{ padding: "32px 20px", textAlign: "center", color: "#333", fontSize: 13 }}>
                    <div style={{ fontSize: 28, marginBottom: 10 }}>🔔</div>
                    No notifications yet
                  </div>
                ) : (
                  notifs.map(n => (
                    <NotifItem key={n.id} n={n} onAction={handleAction} onDelete={handleDelete} />
                  ))
                )}
              </AnimatePresence>
            </div>

            {/* Footer */}
            {notifs.length > 0 && (
              <div style={{ padding: "8px 14px", borderTop: "1px solid #111", display: "flex", justifyContent: "center" }}>
                <button
                  onClick={() => { setOpen(false); router.push("/notifications"); }}
                  style={{ background: "transparent", border: "none", color: "#555", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
                  View all notifications →
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
