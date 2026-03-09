"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  createProjectFeedback,
  FeedbackGateStatusData,
  getActiveProjectId,
  getFeedbackGateStatus,
  getProjectFeedback,
  ProjectFeedbackData,
  requestProjectFeedback,
} from "@/lib/api";

export default function FeedbackPage() {
  const [items, setItems] = useState<ProjectFeedbackData[]>([]);
  const [rating, setRating] = useState(4);
  const [category, setCategory] = useState<"product" | "UX" | "growth" | "monetization">("product");
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [gate, setGate] = useState<FeedbackGateStatusData | null>(null);

  const projectId = getActiveProjectId();

  const load = async () => {
    if (!projectId) return;
    try {
      const [rows, gateState] = await Promise.all([getProjectFeedback(projectId), getFeedbackGateStatus()]);
      setItems(rows);
      setGate(gateState);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load feedback");
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!projectId) {
      setError("Set an active project first.");
      return;
    }
    try {
      setError("");
      await createProjectFeedback(projectId, rating, category, comment);
      setComment("");
      setMessage("Feedback posted.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post feedback");
    }
  };

  const onRequestFeedback = async () => {
    if (!projectId) {
      setError("Set an active project first.");
      return;
    }
    try {
      setError("");
      const result = await requestProjectFeedback(projectId);
      setMessage(result.message);
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to request feedback";
      setError(msg);
    }
  };

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Feedback</h2>
        <p className="mt-1 text-sm text-slate-600">Collect and post feedback by project category.</p>
      </div>
      {gate && !gate.unlocked ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {gate.message}
        </div>
      ) : null}
      <form onSubmit={onSubmit} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm text-slate-700">
            Rating
            <input type="number" min={1} max={5} value={rating} onChange={(e) => setRating(Number(e.target.value))} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm text-slate-700">
            Category
            <select value={category} onChange={(e) => setCategory(e.target.value as "product" | "UX" | "growth" | "monetization")} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2">
              <option value="product">Product</option>
              <option value="UX">UX</option>
              <option value="growth">Growth</option>
              <option value="monetization">Monetization</option>
            </select>
          </label>
        </div>
        <label className="mt-3 block text-sm text-slate-700">
          Comment
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={4} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
        </label>
        <button type="submit" className="mt-4 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">Post Feedback</button>
        <button
          type="button"
          onClick={onRequestFeedback}
          disabled={!gate?.unlocked}
          className="mt-4 ml-3 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Request Feedback On My Project
        </button>
      </form>
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      <div className="space-y-2">
        {items.map((item) => (
          <article key={item.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-sm font-medium text-slate-900">{item.category || "general"} • {item.rating || "-"}/5</p>
            <p className="mt-1 text-sm text-slate-700">{item.comment || "No comment"}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
