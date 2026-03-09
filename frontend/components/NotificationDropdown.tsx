"use client";

import NotificationItem from "@/components/NotificationItem";
import { NotificationData } from "@/lib/api";

type Props = {
  notifications: NotificationData[];
  open: boolean;
  onRead: (id: number) => void;
};

export default function NotificationDropdown({ notifications, open, onRead }: Props) {
  if (!open) return null;
  return (
    <div className="absolute right-0 top-10 z-50 w-80 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Notifications</p>
      <div className="max-h-80 space-y-2 overflow-y-auto">
        {notifications.length ? (
          notifications.map((item) => <NotificationItem key={item.id} item={item} onRead={onRead} />)
        ) : (
          <p className="text-sm text-slate-500">No notifications.</p>
        )}
      </div>
    </div>
  );
}
