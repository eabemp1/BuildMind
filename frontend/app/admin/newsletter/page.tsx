"use client";

import { useEffect, useState } from "react";
import { getAdminNewsletter, getAdminNewsletterExport, NewsletterSubscriberData } from "@/lib/api";

export default function AdminNewsletterPage() {
  const [items, setItems] = useState<NewsletterSubscriberData[]>([]);
  const [exported, setExported] = useState<string[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        setItems(await getAdminNewsletter());
      } catch {
        setItems([]);
      }
    };
    void load();
  }, []);

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-slate-900">Admin Newsletter</h2>
      <button type="button" onClick={async () => { const out = await getAdminNewsletterExport(); setExported(out.emails); }} className="rounded-md border border-slate-300 px-3 py-2 text-sm">Export Emails</button>
      {exported.length ? <p className="text-sm text-slate-600">{exported.join(", ")}</p> : null}
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
            {item.email} {item.subscribed ? "(subscribed)" : "(unsubscribed)"}
          </div>
        ))}
      </div>
    </section>
  );
}
