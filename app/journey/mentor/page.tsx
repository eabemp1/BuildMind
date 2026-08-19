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
import {
  Link2,
  Copy,
  Check,
  ShieldAlert,
  Video,
  Github,
  GraduationCap,
  X,
} from "lucide-react";

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

interface PlacementRequest {
  id: string;
  student_name: string | null;
  requested_module_order: number;
  correct_count: number;
  total_questions: number;
  score_pct: number;
  duration_seconds: number;
  tab_switch_count: number;
  tab_away_seconds: number;
  flags: string[];
  created_at: string;
}

interface JourneyCall {
  id: string;
  student_id: string;
  scheduled_at: string;
  status: "scheduled" | "completed" | "canceled";
  notes: string | null;
}

interface CallAgenda {
  sinceLabel: string;
  modulesPassedSince: { moduleOrder: number; title: string }[];
  skillsNeedingReinforcement: { skillId: string; skillName: string }[];
  currentStreak: number;
  achievementsSince: { name: string; unlockedAt: string }[];
  xpEarnedSince: number;
}

const FLAG_LABELS: Record<string, string> = {
  completed_unusually_fast: "Completed unusually fast",
  left_tab_repeatedly: "Left the tab repeatedly",
  spent_significant_time_away: "Spent significant time away from the tab",
};

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

  const [placementRequests, setPlacementRequests] = useState<PlacementRequest[]>([]);
  const [reviewingPlacementId, setReviewingPlacementId] = useState<string | null>(null);

  const [callStudentId, setCallStudentId] = useState<string>("");
  const [callDateTime, setCallDateTime] = useState<string>("");
  const [scheduling, setScheduling] = useState(false);
  const [calls, setCalls] = useState<JourneyCall[]>([]);
  const [agenda, setAgenda] = useState<CallAgenda | null>(null);
  const [agendaStudentId, setAgendaStudentId] = useState<string | null>(null);

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

  const loadPlacementRequests = useCallback(async () => {
    try {
      const res = await fetch("/api/journey/mentor/placement");
      const data = await res.json();
      if (data.ok) setPlacementRequests(data.requests);
    } catch {
      // non-fatal
    }
  }, []);

  async function handleReviewPlacement(requestId: string, approve: boolean) {
    setReviewingPlacementId(requestId);
    try {
      const res = await fetch("/api/journey/mentor/placement/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: requestId, approve }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed to review");
      await loadPlacementRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to review placement request");
    } finally {
      setReviewingPlacementId(null);
    }
  }

  async function handleScheduleCall() {
    if (!callStudentId || !callDateTime) return;
    setScheduling(true);
    setError(null);
    try {
      const res = await fetch("/api/journey/mentor/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student_id: callStudentId, scheduled_at: new Date(callDateTime).toISOString() }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed to schedule");
      setCallDateTime("");
      await loadCallsFor(callStudentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to schedule call");
    } finally {
      setScheduling(false);
    }
  }

  async function loadCallsFor(studentId: string) {
    if (!studentId) return;
    const res = await fetch(`/api/journey/mentor/calls?student_id=${studentId}`);
    const data = await res.json();
    if (data.ok) setCalls(data.calls);
  }

  async function handleShowAgenda(studentId: string) {
    setAgendaStudentId(studentId);
    setAgenda(null);
    const res = await fetch(`/api/journey/mentor/calls/agenda?student_id=${studentId}`);
    const data = await res.json();
    if (data.ok) setAgenda(data.agenda);
  }

  async function handleCompleteCall(callId: string) {
    const res = await fetch(`/api/journey/mentor/calls/${callId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (data.ok && callStudentId) await loadCallsFor(callStudentId);
  }

  async function handleCancelCall(callId: string) {
    const res = await fetch(`/api/journey/mentor/calls/${callId}/cancel`, { method: "POST" });
    const data = await res.json();
    if (data.ok && callStudentId) await loadCallsFor(callStudentId);
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
    loadPlacementRequests();
  }, [load, loadStudents, loadPlacementRequests]);

  useEffect(() => {
    if (callStudentId) loadCallsFor(callStudentId);
  }, [callStudentId]);

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
      <div className="max-w-2xl mx-auto px-6 py-14">
        <p className="text-xs font-mono uppercase tracking-wider text-[var(--bm-text3)] mb-3">Mentor</p>
        <h1 className="font-syne text-3xl font-bold tracking-tight mb-10">Developer Journey</h1>

        {/* ── Student access links ──────────────────────────────────────── */}
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Link2 size={15} className="text-[var(--bm-text3)]" />
            <h2 className="text-xs font-mono uppercase tracking-wider text-[var(--bm-text3)]">Student access links</h2>
          </div>
          <div className="rounded-lg border border-[var(--bm-border)] bg-[var(--bm-bg2)] p-5">
            <div className="flex gap-2 mb-4">
              <input
                value={newStudentName}
                onChange={(e) => setNewStudentName(e.target.value)}
                placeholder="Student name"
                className="flex-1 text-sm bg-[var(--bm-bg3)] border border-[var(--bm-border)] focus:border-[var(--bm-border3)] rounded-md px-3 py-2 outline-none transition-colors placeholder:text-[var(--bm-text3)]"
              />
              <button
                onClick={handleCreateLink}
                disabled={creatingLink || !newStudentName.trim()}
                className="text-sm font-medium bg-[var(--bm-accent)] hover:bg-[var(--bm-accent2)] text-[var(--bm-text-inv)] rounded-md px-4 py-2 disabled:opacity-50 transition-colors shrink-0"
              >
                {creatingLink ? "Creating…" : "Create link"}
              </button>
            </div>
            {students.length > 0 && (
              <div className="space-y-2">
                {students.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between text-sm bg-[var(--bm-bg3)] rounded-md px-3 py-2.5"
                  >
                    <span>
                      {s.name}
                      <span className="text-[var(--bm-text3)] text-xs font-mono ml-2">
                        {s.last_active_at ? `active ${new Date(s.last_active_at).toLocaleDateString()}` : "not yet opened"}
                      </span>
                    </span>
                    <button
                      onClick={() => copyLink(s.access_token)}
                      className="flex items-center gap-1 text-xs border border-[var(--bm-border2)] hover:border-[var(--bm-border3)] rounded-md px-2.5 py-1 transition-colors"
                    >
                      {copiedToken === s.access_token ? (
                        <><Check size={11} className="text-[var(--bm-green)]" /> Copied</>
                      ) : (
                        <><Copy size={11} /> Copy link</>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── Placement requests ────────────────────────────────────────── */}
        {placementRequests.length > 0 && (
          <section className="mb-6">
            <div className="flex items-center gap-2 mb-4">
              <GraduationCap size={15} className="text-[var(--bm-accent)]" />
              <h2 className="text-xs font-mono uppercase tracking-wider text-[var(--bm-accent)]">
                Placement requests awaiting review
              </h2>
            </div>
            <div className="space-y-3">
              {placementRequests.map((r) => (
                <div key={r.id} className="rounded-lg border border-[var(--bm-accent-bd)] bg-[var(--bm-accent-dim)] p-4">
                  <p className="text-sm font-medium mb-1">
                    {r.student_name ?? "Student"} wants to start at Module {r.requested_module_order}
                  </p>
                  <p className="text-xs text-[var(--bm-text3)] font-mono mb-3">
                    Scored {r.correct_count}/{r.total_questions} ({r.score_pct}%) · took {Math.round(r.duration_seconds)}s
                  </p>
                  {r.flags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {r.flags.map((f) => (
                        <span
                          key={f}
                          className="flex items-center gap-1 text-xs bg-[var(--bm-red-dim)] text-[var(--bm-red)] border border-[var(--bm-red-bd)] rounded-full px-2.5 py-0.5"
                        >
                          <ShieldAlert size={11} /> {FLAG_LABELS[f] ?? f}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleReviewPlacement(r.id, true)}
                      disabled={reviewingPlacementId === r.id}
                      className="text-xs font-medium bg-[var(--bm-accent)] hover:bg-[var(--bm-accent2)] text-[var(--bm-text-inv)] rounded-md px-3 py-1.5 disabled:opacity-50 transition-colors"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleReviewPlacement(r.id, false)}
                      disabled={reviewingPlacementId === r.id}
                      className="text-xs border border-[var(--bm-border2)] hover:border-[var(--bm-border3)] rounded-md px-3 py-1.5 disabled:opacity-50 transition-colors"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Video calls ────────────────────────────────────────────────── */}
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Video size={15} className="text-[var(--bm-text3)]" />
            <h2 className="text-xs font-mono uppercase tracking-wider text-[var(--bm-text3)]">Video calls</h2>
          </div>
          <div className="rounded-lg border border-[var(--bm-border)] bg-[var(--bm-bg2)] p-5">
            <div className="flex flex-wrap gap-2 mb-4">
              <select
                value={callStudentId}
                onChange={(e) => setCallStudentId(e.target.value)}
                className="text-sm bg-[var(--bm-bg3)] border border-[var(--bm-border)] rounded-md px-3 py-2 outline-none"
              >
                <option value="">Select student…</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <input
                type="datetime-local"
                value={callDateTime}
                onChange={(e) => setCallDateTime(e.target.value)}
                className="text-sm bg-[var(--bm-bg3)] border border-[var(--bm-border)] rounded-md px-3 py-2 outline-none"
              />
              <button
                onClick={handleScheduleCall}
                disabled={scheduling || !callStudentId || !callDateTime}
                className="text-sm font-medium bg-[var(--bm-accent)] hover:bg-[var(--bm-accent2)] text-[var(--bm-text-inv)] rounded-md px-4 py-2 disabled:opacity-50 transition-colors"
              >
                Schedule
              </button>
            </div>

            {callStudentId && (
              <>
                <button
                  onClick={() => handleShowAgenda(callStudentId)}
                  className="text-xs border border-[var(--bm-border2)] hover:border-[var(--bm-border3)] rounded-md px-3 py-1.5 mb-3 transition-colors"
                >
                  Show review agenda
                </button>

                {agendaStudentId === callStudentId && agenda && (
                  <div className="rounded-md bg-[var(--bm-bg3)] p-4 mb-4 text-sm text-[var(--bm-text2)] space-y-1.5">
                    <p className="text-[10px] font-mono uppercase tracking-wide text-[var(--bm-text3)] mb-2">
                      Since {new Date(agenda.sinceLabel).toLocaleDateString()} · pulled directly from her activity, nothing generated
                    </p>
                    <p><span className="text-[var(--bm-text3)]">Modules passed:</span> {agenda.modulesPassedSince.length === 0 ? "none" : agenda.modulesPassedSince.map((m) => m.title).join(", ")}</p>
                    <p><span className="text-[var(--bm-text3)]">Skills needing reinforcement:</span> {agenda.skillsNeedingReinforcement.length === 0 ? "none" : agenda.skillsNeedingReinforcement.map((s) => s.skillName).join(", ")}</p>
                    <p><span className="text-[var(--bm-text3)]">Current streak:</span> <span className="font-mono">{agenda.currentStreak} days</span></p>
                    <p><span className="text-[var(--bm-text3)]">XP earned:</span> <span className="font-mono">{agenda.xpEarnedSince}</span></p>
                    <p><span className="text-[var(--bm-text3)]">Achievements:</span> {agenda.achievementsSince.length === 0 ? "none" : agenda.achievementsSince.map((a) => a.name).join(", ")}</p>
                  </div>
                )}

                <div className="space-y-2">
                  {calls.map((c) => (
                    <div key={c.id} className="flex items-center justify-between text-sm bg-[var(--bm-bg3)] rounded-md px-3 py-2.5">
                      <span>
                        {new Date(c.scheduled_at).toLocaleString()}
                        <span
                          className={`text-xs font-mono ml-2 ${
                            c.status === "completed" ? "text-[var(--bm-green)]" : c.status === "canceled" ? "text-[var(--bm-text4)]" : "text-[var(--bm-text3)]"
                          }`}
                        >
                          {c.status}
                        </span>
                      </span>
                      {c.status === "scheduled" && (
                        <div className="flex gap-2">
                          <button onClick={() => handleCompleteCall(c.id)} className="flex items-center gap-1 text-xs border border-[var(--bm-border2)] hover:border-[var(--bm-border3)] rounded-md px-2 py-1 transition-colors">
                            <Check size={11} /> Mark done
                          </button>
                          <button onClick={() => handleCancelCall(c.id)} className="flex items-center gap-1 text-xs border border-[var(--bm-border2)] hover:border-[var(--bm-border3)] rounded-md px-2 py-1 transition-colors">
                            <X size={11} /> Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>

        {/* ── Submissions ────────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Github size={15} className="text-[var(--bm-text3)]" />
              <h2 className="text-xs font-mono uppercase tracking-wider text-[var(--bm-text3)]">
                Submissions awaiting review
              </h2>
            </div>
            <span className="text-xs font-mono text-[var(--bm-text3)]">
              {loading ? "…" : submissions.length}
            </span>
          </div>

          {error && <p className="text-xs text-[var(--bm-red)] mb-4">{error}</p>}

          {!loading && submissions.length === 0 && (
            <p className="text-sm text-[var(--bm-text3)]">Nothing to review right now.</p>
          )}

          <div className="space-y-3">
            {submissions.map((s) => (
              <div key={s.id} className="rounded-lg border border-[var(--bm-border)] bg-[var(--bm-bg2)] p-5">
                <p className="text-sm font-medium mb-1">
                  {s.journey_projects?.title ?? "Project"} — v{s.version}
                  {s.student_name && (
                    <span className="text-[var(--bm-text3)] font-normal"> · {s.student_name}</span>
                  )}
                </p>
                <p className="text-xs text-[var(--bm-text3)] font-mono mb-3">
                  Submitted {new Date(s.submitted_at).toLocaleString()}
                </p>
                {s.repository_url && (
                  <a
                    href={s.repository_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-[var(--bm-blue)] hover:underline break-all"
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
                      className="w-full text-sm bg-[var(--bm-bg3)] border border-[var(--bm-border)] focus:border-[var(--bm-border3)] rounded-md px-3 py-2 outline-none transition-colors placeholder:text-[var(--bm-text3)]"
                    />
                    <textarea
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      placeholder="Feedback for the student"
                      rows={3}
                      className="w-full text-sm bg-[var(--bm-bg3)] border border-[var(--bm-border)] focus:border-[var(--bm-border3)] rounded-md px-3 py-2 outline-none transition-colors placeholder:text-[var(--bm-text3)]"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleGrade(s.id)}
                        disabled={saving}
                        className="text-sm font-medium bg-[var(--bm-accent)] hover:bg-[var(--bm-accent2)] text-[var(--bm-text-inv)] rounded-md px-4 py-2 disabled:opacity-50 transition-colors"
                      >
                        {saving ? "Saving…" : "Save grade"}
                      </button>
                      <button
                        onClick={() => setGradingId(null)}
                        className="text-sm text-[var(--bm-text3)] hover:text-[var(--bm-text2)] px-4 py-2 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setGradingId(s.id)}
                    className="text-sm font-medium mt-4 border border-[var(--bm-border2)] hover:border-[var(--bm-border3)] rounded-md px-4 py-2 transition-colors"
                  >
                    Grade
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
