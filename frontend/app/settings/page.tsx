"use client";

import { useEffect, useState } from "react";
import { getReminderPreference, saveReminderPreference } from "@/lib/api";

export default function SettingsPage() {
  const [reminderTime, setReminderTime] = useState("09:00");
  const [enabled, setEnabled] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        const pref = await getReminderPreference();
        if (pref) {
          setReminderTime(pref.reminder_time);
          setEnabled(pref.enabled);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load reminder settings");
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, []);

  const onSave = async () => {
    try {
      setIsSaving(true);
      setError("");
      setMessage("");
      await saveReminderPreference(reminderTime, enabled);
      setMessage("Reminder preference saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save reminder preference");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-slate-900">Settings</h2>
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">Daily Reminder</h3>
        <p className="mt-1 text-sm text-slate-600">Set a daily time for your execution check-in reminder.</p>

        {isLoading ? <p className="mt-4 text-sm text-slate-500">Loading settings...</p> : null}

        <div className="mt-4 grid max-w-md gap-4">
          <label className="text-sm font-medium text-slate-700">
            Reminder Time
            <input
              type="time"
              value={reminderTime}
              onChange={(e) => setReminderTime(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-brand-500 focus:ring-2"
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4"
            />
            Enable daily reminder
          </label>

          <button
            type="button"
            onClick={onSave}
            disabled={isSaving}
            className="w-fit rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {isSaving ? "Saving..." : "Save Reminder"}
          </button>
        </div>

        {message ? <p className="mt-3 text-sm text-emerald-700">{message}</p> : null}
        {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
      </div>
    </section>
  );
}
