"use client";

import { NotificationData } from "@/lib/api";

type Props = { item: NotificationData; onRead: (id: number) => void };

export default function NotificationItem({ item, onRead }: Props) {
  return (
    <button
      type="button"
      onClick={() => onRead(item.id)}
      className={`w-full rounded-lg border px-3 py-2 text-left ${item.is_read ? "border-slate-200 bg-white" : "border-brand-200 bg-brand-50"}`}
    >
      <p className="text-sm font-medium text-slate-900">{item.message}</p>
      <p className="mt-1 text-xs text-slate-500">{new Date(item.created_at).toLocaleString()}</p>
    </button>
  );
}
