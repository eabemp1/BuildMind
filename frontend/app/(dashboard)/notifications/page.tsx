"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BuildMindNotification, getNotificationsForCurrentUser, markNotificationAsRead } from "@/lib/buildmind";

export default function NotificationsPage() {
  const [items, setItems] = useState<BuildMindNotification[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        setItems(await getNotificationsForCurrentUser());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load notifications");
        setItems([]);
      }
    };
    void load();
  }, []);

  const markRead = async (id: string) => {
    await markNotificationAsRead(id);
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, is_read: true } : x)));
  };

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Notifications</h2>
        <p className="mt-1 text-sm text-slate-600">System notifications and milestone reminders.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Inbox</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          {items.map((item) => (
            <div key={item.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
              <div>
                <p className="text-sm font-medium text-slate-900">{item.message}</p>
                <p className="text-xs text-slate-500">{new Date(item.created_at).toLocaleString()}</p>
              </div>
              {!item.is_read ? (
                <Button variant="outline" onClick={() => void markRead(item.id)}>
                  Mark read
                </Button>
              ) : (
                <span className="text-xs text-slate-400">Read</span>
              )}
            </div>
          ))}
          {!items.length ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-800">No notifications yet.</p>
              <p className="text-sm text-slate-600">Milestone reminders and product updates will appear here.</p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
