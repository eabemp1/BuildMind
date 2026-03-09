"use client";

import { useEffect, useState } from "react";
import { ActivityData, getActivity } from "@/lib/api";

export default function ActivityPage() {
  const [items, setItems] = useState<ActivityData[]>([]);
  useEffect(() => {
    const load = async () => {
      try {
        setItems(await getActivity());
      } catch {
        setItems([]);
      }
    };
    void load();
  }, []);

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-slate-900">Activity Feed</h2>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
            {item.activity_type.replaceAll("_", " ")} • {new Date(item.created_at).toLocaleString()}
          </div>
        ))}
      </div>
    </section>
  );
}
