"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  changePassword,
  deleteCurrentAccount,
  getNotificationPreferences,
  getReminderPreference,
  saveNotificationPreferences,
  saveReminderPreference,
  unsubscribeNewsletter,
} from "@/lib/api";

export default function SettingsPage() {
  const [reminderTime, setReminderTime] = useState("09:00");
  const [enabled, setEnabled] = useState(true);
  const [feedbackReceived, setFeedbackReceived] = useState(true);
  const [milestoneCompleted, setMilestoneCompleted] = useState(true);
  const [taskAssigned, setTaskAssigned] = useState(true);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const reminder = await getReminderPreference();
        if (reminder) {
          setReminderTime(reminder.reminder_time);
          setEnabled(reminder.enabled);
        }
        const notification = await getNotificationPreferences();
        setFeedbackReceived(notification.feedback_received);
        setMilestoneCompleted(notification.milestone_completed);
        setTaskAssigned(notification.task_assigned);
      } catch {
        // no-op
      }
    };
    void load();
  }, []);

  const onSavePreferences = async () => {
    try {
      setError("");
      await saveReminderPreference(reminderTime, enabled);
      await saveNotificationPreferences(feedbackReceived, milestoneCompleted, taskAssigned);
      setMessage("Settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    }
  };

  const onPasswordChange = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setError("");
      await changePassword(currentPassword, newPassword);
      setMessage("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change password");
    }
  };

  const onDeleteAccount = async () => {
    try {
      await deleteCurrentAccount();
      setMessage("Account deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete account");
    }
  };

  const onUnsubscribeNewsletter = async () => {
    if (!newsletterEmail.trim()) return;
    await unsubscribeNewsletter(newsletterEmail);
    setMessage("Newsletter unsubscribed.");
  };

  return (
    <section className="space-y-6">
      <h2 className="text-2xl font-semibold text-slate-900">Settings</h2>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">Notification Preferences</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-slate-700">
            Reminder Time
            <input type="time" value={reminderTime} onChange={(e) => setReminderTime(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            Enable daily reminder
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={feedbackReceived} onChange={(e) => setFeedbackReceived(e.target.checked)} />
            Feedback received
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={milestoneCompleted} onChange={(e) => setMilestoneCompleted(e.target.checked)} />
            Milestone completed
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={taskAssigned} onChange={(e) => setTaskAssigned(e.target.checked)} />
            Task assigned
          </label>
        </div>
        <button type="button" onClick={onSavePreferences} className="mt-4 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          Save Preferences
        </button>
      </div>

      <form onSubmit={onPasswordChange} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">Password Change</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <input type="password" placeholder="Current password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2" />
          <input type="password" placeholder="New password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2" />
        </div>
        <button type="submit" className="mt-4 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          Change Password
        </button>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">Newsletter</h3>
        <div className="mt-4 flex flex-wrap gap-3">
          <input
            type="email"
            value={newsletterEmail}
            onChange={(e) => setNewsletterEmail(e.target.value)}
            placeholder="email@example.com"
            className="min-w-64 rounded-md border border-slate-300 px-3 py-2"
          />
          <button type="button" onClick={onUnsubscribeNewsletter} className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100">
            Unsubscribe
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-rose-200 bg-rose-50 p-5">
        <h3 className="text-lg font-semibold text-rose-700">Delete Account</h3>
        <button type="button" onClick={onDeleteAccount} className="mt-3 rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700">
          Delete Account
        </button>
      </div>

      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
    </section>
  );
}
