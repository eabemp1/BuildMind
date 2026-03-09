"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { sendAdminNotification } from "@/lib/admin";

export default function AdminNotificationsPage() {
  const [message, setMessage] = useState("");
  const [type, setType] = useState("platform_announcement");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    try {
      setBusy(true);
      setError("");
      const sentCount = await sendAdminNotification(message.trim(), type);
      setStatus(`Notification sent to ${sentCount} users.`);
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send notification");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Platform Notifications</h1>
        <p className="mt-1 text-sm text-slate-600">Send announcements and maintenance notices to all active users.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Send Notification</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={onSubmit}>
            <Input
              value={type}
              onChange={(e) => setType(e.target.value)}
              placeholder="Notification type (example: platform_announcement)"
            />
            <textarea
              className="min-h-28 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-slate-500"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder='Message (example: "New feature released")'
            />
            <Button disabled={busy || !message.trim()}>{busy ? "Sending..." : "Send Notification"}</Button>
          </form>

          {status ? <p className="mt-3 text-sm text-emerald-700">{status}</p> : null}
          {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}

          <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <p className="font-medium text-slate-900">Examples:</p>
            <p>"New feature released"</p>
            <p>"System maintenance"</p>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
