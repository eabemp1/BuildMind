"use client";

/**
 * app/journey/mentor/page.tsx — Developer Journey: mentor grading queue
 *
 * Visible to anyone with a session — the underlying API routes are what
 * actually enforce isAdminUser(); a non-admin visiting this page will just
 * see every action fail with "Forbidden". Phase 2+ should hide the nav
 * entry itself for non-admins (see lib/nav-config.ts's requiredPlan/
 * unlocksAt pattern for the existing precedent) rather than relying on the
 * API-level check alone as the only UX signal.
 */

import { useEffect, useState, useCallback } from "react";

interface PendingSubmission {
  id: string;
  project_id: string;
  user_id: string | null;
  student_id: string | null;
  student_name: string | null;
  version: number;
  repository_url: string | null;
  notes: string | null;
  submitted_at: string;
  journey_projects?: { title: string; module_order: number };
}

interface StudentLink {
  id: string;
  name: string;
  access_token: string;
  created_at: string;
  last_active_at: string | null;
}

export default function JourneyMentorPage() {
  const [submissions, setSubmissions] = useState<PendingSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gradingId, setGradingId] = useState<string | null>(null);
  const [score, setScore] = useState("");
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);

  const [students, setStudents] = useState<StudentLink[]>([]);
  const [newStudentName, setNewStudentName] = useState("");
  const [creatingLink, setCreatingLink] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const loadStudents = useCallback(async () => {
    try {
      const res = await fetch("/api/journey/mentor/students/create");
      const data = await res.json();
      if (data.ok) setStudents(data.students);
    } catch {
      // non-fatal — the submissions queue below is the primary view
    }
  }, []);

  async function handleCreateLink() {
    if (!newStudentName.trim()) return;
    setCreatingLink(true);
    setError(null);
    try {
      const res = await fetch("/api/journey/mentor/students/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newStudentName.trim() }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed to create link");
      setNewStudentName("");
      await loadStudents();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create link");
    } finally {
      setCreatingLink(false);
    }
  }

  function copyLink(token: string) {
    const url = `${window.location.origin}/journey/s/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
    });
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/journey/mentor/submissions");
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed to load");
      setSubmissions(data.submissions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    loadStudents();
  }, [load, loadStudents]);

  async function handleGrade(submissionId: string) {
    const numericScore = Number(score);
    if (!Number.isFinite(numericScore) || numericScore < 0 || numericScore > 100) {
      setError("Score must be a number between 0 and 100");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/journey/mentor/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submission_id: submissionId, score: numericScore, feedback }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed to grade");
      setGradingId(null);
      setScore("");
      setFeedback("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to grade");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--bm-bg)] text-[var(--bm-text)]">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <section className="border border-[var(--bm-border)] rounded-xl p-5 mb-10">
          <h2 className="text-sm font-semibold mb-3">Student access links</h2>
          <div className="flex gap-2 mb-4">
            <input
              value={newStudentName}
              onChange={(e) => setNewStudentName(e.target.value)}
              placeholder="Student name"
              className="flex-1 text-sm bg-transparent border border-[var(--bm-border)] rounded-lg px-3 py-2 outline-none"
            />
            <button
              onClick={handleCreateLink}
              disabled={creatingLink || !newStudentName.trim()}
              className="text-sm font-medium bg-white text-black rounded-lg px-4 py-2 disabled:opacity-50"
            >
              {creatingLink ? "Creating…" : "Create link"}
            </button>
          </div>
          <div className="space-y-2">
            {students.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between text-sm border border-[var(--bm-border)] rounded-lg px-3 py-2"
              >
                <span>
                  {s.name}
                  <span className="text-[var(--bm-text3)] text-xs ml-2">
                    {s.last_active_at ? `active ${new Date(s.last_active_at).toLocaleDateString()}` : "not yet opened"}
                  </span>
                </span>
                <button
                  onClick={() => copyLink(s.access_token)}
                  className="text-xs border border-[var(--bm-border)] rounded px-2 py-1"
                >
                  {copiedToken === s.access_token ? "Copied!" : "Copy link"}
                </button>
              </div>
            ))}
          </div>
        </section>

        <h1 className="text-2xl font-semibold tracking-tight mb-1">Submissions awaiting review</h1>
        <p className="text-sm text-[var(--bm-text2)] mb-8">
          {loading ? "Loading…" : `${submissions.length} pending`}
        </p>

        {error && <p className="text-xs text-red-400 mb-4">{error}</p>}

        {!loading && submissions.length === 0 && (
          <p className="text-sm text-[var(--bm-text3)]">Nothing to review right now.</p>
        )}

        <div className="space-y-4">
          {submissions.map((s) => (
            <div key={s.id} className="border border-[var(--bm-border)] rounded-xl p-5">
              <p className="text-sm font-medium mb-1">
                {s.journey_projects?.title ?? "Project"} — v{s.version}
                {s.student_name && (
                  <span className="text-[var(--bm-text3)] font-normal"> · {s.student_name}</span>
                )}
              </p>
              <p className="text-xs text-[var(--bm-text3)] mb-2">
                Submitted {new Date(s.submitted_at).toLocaleString()}
              </p>
              {s.repository_url && (
                <a
                  href={s.repository_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-blue-400 underline break-all"
                >
                  {s.repository_url}
                </a>
              )}
              {s.notes && <p className="text-sm text-[var(--bm-text2)] mt-2">{s.notes}</p>}

              {gradingId === s.id ? (
                <div className="mt-4 space-y-2">
                  <input
                    value={score}
                    onChange={(e) => setScore(e.target.value)}
                    placeholder="Score (0-100)"
                    className="w-full text-sm bg-transparent border border-[var(--bm-border)] rounded-lg px-3 py-2 outline-none"
                  />
                  <textarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="Feedback for the student"
                    rows={3}
                    className="w-full text-sm bg-transparent border border-[var(--bm-border)] rounded-lg px-3 py-2 outline-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleGrade(s.id)}
                      disabled={saving}
                      className="text-sm font-medium bg-white text-black rounded-lg px-4 py-2 disabled:opacity-50"
                    >
                      {saving ? "Saving…" : "Save grade"}
                    </button>
                    <button
                      onClick={() => setGradingId(null)}
                      className="text-sm text-[var(--bm-text3)] px-4 py-2"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setGradingId(s.id)}
                  className="text-sm font-medium mt-3 border border-[var(--bm-border)] rounded-lg px-4 py-2"
                >
                  Grade
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
