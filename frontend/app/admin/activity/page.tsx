"use client";

import { useEffect, useState } from "react";
import { ActivityData, getAdminActivity } from "@/lib/api";

export default function AdminActivityPage() {
  const [items, setItems] = useState<ActivityData[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        setItems(await getAdminActivity());
      } catch {
        setItems([]);
      }
    };
    void load();
  }, []);

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-slate-900">Admin Activity Logs</h2>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
            User #{item.user_id} • {item.activity_type} • {new Date(item.created_at).toLocaleString()}
          </div>
        ))}
      </div>
    </section>
  );
}
