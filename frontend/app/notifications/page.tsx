"use client";

import { useEffect, useState } from "react";
import { getNotifications, markNotificationRead, NotificationData } from "@/lib/api";

export default function NotificationsPage() {
  const [items, setItems] = useState<NotificationData[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        setItems(await getNotifications());
      } catch {
        setItems([]);
      }
    };
    void load();
  }, []);

  const onRead = async (id: number) => {
    try {
      await markNotificationRead(id);
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, is_read: true } : item)));
    } catch {
      // no-op
    }
  };

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-slate-900">Notifications</h2>
      <div className="space-y-2">
        {items.map((item) => (
          <button key={item.id} type="button" onClick={() => onRead(item.id)} className={`w-full rounded-lg border px-4 py-3 text-left text-sm ${item.is_read ? "border-slate-200 bg-white text-slate-700" : "border-brand-200 bg-brand-50 text-slate-900"}`}>
            <p className="font-medium">{item.message}</p>
            <p className="mt-1 text-xs">{new Date(item.created_at).toLocaleString()}</p>
          </button>
        ))}
      </div>
    </section>
  );
}
