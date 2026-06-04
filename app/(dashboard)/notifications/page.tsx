"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { getAllNotifications, markRead, markAllRead, deleteNotification, type AppNotification, type NotifPriority } from "@/lib/notifications";
import { Bell, Check, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { sanitizeOutput } from "@/lib/sanitizeOutput";

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
            {sanitizeOutput(n.title)}
          </div>
          <span style={{ fontSize: 10, color: "var(--bm-text3)", flexShrink: 0, marginTop: 1 }}>{timeAgo(n.createdAt)}</span>
        </div>
        <div style={{ fontSize: 12, color: isUnread ? "var(--bm-text2)" : "var(--bm-text3)", lineHeight: 1.6, marginBottom: n.actionLabel ? 8 : 0 }}>
          {sanitizeOutput(n.body)}
        </div>
        {n.actionLabel && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: s.text, fontWeight: 600, padding: "3px 8px", borderRadius: 6, background: `${s.border}` }}>
            {sanitizeOutput(n.actionLabel)}
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
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-7 sm:px-6">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        <PageHeader
          title="Notifications"
          subtitle="Stay up to date with your startup progress."
          action={
            <>
              {unreadCount > 0 && (
                <span className="rounded-full border border-[var(--bm-accent-bd)] bg-[var(--bm-accent-dim)] px-2 py-0.5 text-[10px] font-bold text-[var(--bm-accent)]">
                  {unreadCount} new
                </span>
              )}
              {unreadCount > 0 && (
                <button onClick={handleMarkAll}
                  className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--bm-border)] bg-transparent px-3.5 py-2 text-[12px] text-[var(--bm-text2)] transition-colors hover:bg-[var(--bm-bg3)]">
                  <Check size={12} /> Mark all read
                </button>
              )}
            </>
          }
        />
      </motion.div>

      {/* Filter tabs */}
      <div className="flex w-fit gap-1 rounded-lg border border-[var(--bm-border)] bg-[var(--bm-bg3)] p-1">
        {(["all", "unread"] as Filter[]).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`cursor-pointer rounded-md border px-4 py-1.5 text-[12px] transition-colors ${filter === f ? "border-[var(--bm-border2)] bg-[var(--bm-bg2)] font-semibold text-[var(--bm-text)]" : "border-transparent bg-transparent font-normal text-[var(--bm-text3)]"}`}>
            {f === "all" ? "All" : `Unread${unreadCount > 0 ? ` (${unreadCount})` : ""}`}
          </button>
        ))}
      </div>

      {/* List */}
      <AnimatePresence>
        {displayed.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <EmptyState
              icon={Bell}
              title={filter === "unread" ? "All caught up" : "No notifications yet"}
              body={filter === "unread" ? "You've read everything." : "Notifications will appear here as you use BuildMind."}
            />
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
