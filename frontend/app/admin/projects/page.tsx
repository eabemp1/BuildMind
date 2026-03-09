"use client";

import { useEffect, useState } from "react";
import { AdminProjectData, getAdminProjects } from "@/lib/api";

export default function AdminProjectsPage() {
  const [items, setItems] = useState<AdminProjectData[]>([]);
  const [stage, setStage] = useState("");

  const load = async () => {
    try {
      setItems(await getAdminProjects(stage || undefined));
    } catch {
      setItems([]);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-slate-900">Admin Projects</h2>
      <div className="flex gap-2">
        <input value={stage} onChange={(e) => setStage(e.target.value)} placeholder="Filter by stage" className="rounded-md border border-slate-300 px-3 py-2" />
        <button type="button" onClick={() => void load()} className="rounded-md border border-slate-300 px-3 py-2 text-sm">Apply</button>
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
            {item.title} • {item.stage} • {Math.round(item.progress)}%
          </div>
        ))}
      </div>
    </section>
  );
}
