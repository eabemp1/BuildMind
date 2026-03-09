"use client";

import { useEffect, useState } from "react";
import { AdminUserData, deleteAdminUser, getAdminUsers, suspendAdminUser } from "@/lib/api";

export default function AdminUsersPage() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<AdminUserData[]>([]);

  const load = async (query?: string) => {
    try {
      setItems(await getAdminUsers(query));
    } catch {
      setItems([]);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-slate-900">Admin Users</h2>
      <div className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search users" className="rounded-md border border-slate-300 px-3 py-2" />
        <button type="button" onClick={() => void load(q)} className="rounded-md border border-slate-300 px-3 py-2 text-sm">Search</button>
      </div>
      <div className="space-y-2">
        {items.map((user) => (
          <div key={user.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
            <div>{user.email} {user.is_active ? "" : "(Suspended)"}</div>
            <div className="flex gap-2">
              <button type="button" onClick={async () => { await suspendAdminUser(user.id); await load(q); }} className="rounded-md border border-slate-300 px-3 py-1">Suspend</button>
              <button type="button" onClick={async () => { await deleteAdminUser(user.id); await load(q); }} className="rounded-md border border-rose-300 px-3 py-1 text-rose-700">Delete</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
