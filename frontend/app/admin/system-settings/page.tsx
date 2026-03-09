"use client";

import { FormEvent, useEffect, useState } from "react";
import { getAdminSystemSettings, saveAdminSystemSetting } from "@/lib/api";

export default function AdminSystemSettingsPage() {
  const [keyValue, setKeyValue] = useState("platform_announcements");
  const [jsonValue, setJsonValue] = useState('{"message":"Welcome to BuildMind"}');
  const [items, setItems] = useState<Array<{ key: string; value_json: string }>>([]);

  const load = async () => {
    try {
      setItems(await getAdminSystemSettings());
    } catch {
      setItems([]);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    await saveAdminSystemSetting(keyValue, jsonValue);
    await load();
  };

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-slate-900">Admin System Settings</h2>
      <form onSubmit={onSave} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3">
          <input value={keyValue} onChange={(e) => setKeyValue(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2" placeholder="key" />
          <textarea value={jsonValue} onChange={(e) => setJsonValue(e.target.value)} rows={4} className="rounded-md border border-slate-300 px-3 py-2" placeholder='{"enabled": true}' />
        </div>
        <button type="submit" className="mt-4 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">Save</button>
      </form>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.key} className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
            <strong>{item.key}</strong>: {item.value_json}
          </div>
        ))}
      </div>
    </section>
  );
}
