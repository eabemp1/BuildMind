"use client";

import { useEffect, useState } from "react";
import { deleteAdminFeedback, getAdminFeedback, ProjectFeedbackData } from "@/lib/api";

export default function AdminFeedbackPage() {
  const [items, setItems] = useState<ProjectFeedbackData[]>([]);

  const load = async () => {
    try {
      setItems(await getAdminFeedback("rating"));
    } catch {
      setItems([]);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-slate-900">Admin Feedback</h2>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
            <div>{item.rating || "-"}/5 • {item.category || "general"} • {item.comment || "No comment"}</div>
            <button type="button" onClick={async () => { await deleteAdminFeedback(item.id); await load(); }} className="rounded-md border border-rose-300 px-3 py-1 text-rose-700">Delete</button>
          </div>
        ))}
      </div>
    </section>
  );
}
