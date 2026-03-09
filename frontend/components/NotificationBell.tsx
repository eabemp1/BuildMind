"use client";

import { useEffect, useState } from "react";
import NotificationDropdown from "@/components/NotificationDropdown";
import { getNotifications, markNotificationRead, NotificationData } from "@/lib/api";

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationData[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getNotifications();
        setItems(data);
      } catch {
        setItems([]);
      }
    };
    void load();
  }, []);

  const unread = items.filter((n) => !n.is_read).length;

  const onRead = async (id: number) => {
    try {
      await markNotificationRead(id);
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, is_read: true } : item)));
    } catch {
      // no-op
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-full border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
      >
        Notifications
        {unread ? <span className="ml-2 rounded-full bg-brand-600 px-2 py-0.5 text-xs text-white">{unread}</span> : null}
      </button>
      <NotificationDropdown notifications={items} open={open} onRead={onRead} />
    </div>
  );
}
