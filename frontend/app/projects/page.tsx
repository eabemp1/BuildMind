"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ProjectData,
  createProject,
  generateRoadmap,
  getActiveProjectId,
  getProjects,
  getProject,
  getStoredToken,
  isOnboarded,
  loginUser,
  registerUser,
  setActiveProjectId,
} from "@/lib/api";

export default function ProjectsPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [goal, setGoal] = useState("");
  const [description, setDescription] = useState("");
  const [weeks, setWeeks] = useState(4);
  const [project, setProject] = useState<ProjectData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const load = async () => {
      if (!getStoredToken()) return;
      try {
        setIsLoading(true);
        const projects = await getProjects();
        if (!projects.length) return;
        const activeId = getActiveProjectId();
        const selected = (activeId ? projects.find((p) => p.id === activeId) : undefined) || projects[0];
        if (selected) {
          const result = await getProject(selected.id);
          setProject(result);
          setActiveProjectId(result.id);
        }
      } catch {
        // Ignore stale localStorage id.
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, []);

  const onRegister = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setIsLoading(true);
      setError("");
      setMessage("");
      await registerUser(email, password);
      setMessage("Registration successful.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setIsLoading(false);
    }
  };

  const onLogin = async () => {
    try {
      setIsLoading(true);
      setError("");
      setMessage("");
      await loginUser(email, password);
      setMessage("Login successful.");
      if (isOnboarded()) {
        router.push("/dashboard");
      } else {
        router.push("/onboarding");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  const onCreateProject = async () => {
    try {
      setIsLoading(true);
      setError("");
      setMessage("");
      const result = await createProject(goal, description);
      setProject(result);
      setActiveProjectId(result.id);
      setMessage(`Project created (#${result.id}).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Project creation failed");
    } finally {
      setIsLoading(false);
    }
  };

  const onGenerateRoadmap = async () => {
    if (!project) {
      setError("Create a project first.");
      return;
    }
    try {
      setIsLoading(true);
      setError("");
      setMessage("");
      const result = await generateRoadmap(project.id, weeks);
      setProject(result);
      setMessage("Roadmap generated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Roadmap generation failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Projects</h2>
        <p className="mt-1 text-sm text-slate-600">Define goals, generate roadmap milestones, and track deliverables.</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">Authentication</h3>
        <form onSubmit={onRegister} className="mt-4 grid gap-4">
          <div className="grid gap-2">
            <label htmlFor="email" className="text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="founder@example.com"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-brand-500 focus:ring-2"
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="password" className="text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-brand-500 focus:ring-2"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={isLoading} className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">
              Register
            </button>
            <button type="button" onClick={onLogin} disabled={isLoading} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60">
              Login
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">Create Project</h3>
        <form className="mt-4 grid gap-4">
          <div className="grid gap-2">
            <label htmlFor="goal" className="text-sm font-medium text-slate-700">
              Goal
            </label>
            <input
              id="goal"
              type="text"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Launch MVP in 60 days"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-brand-500 focus:ring-2"
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="description" className="text-sm font-medium text-slate-700">
              Description
            </label>
            <textarea
              id="description"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your project objective and constraints."
              className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-brand-500 focus:ring-2"
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="weeks" className="text-sm font-medium text-slate-700">
              Goal Duration (Weeks)
            </label>
            <input
              id="weeks"
              type="number"
              min={1}
              max={52}
              value={weeks}
              onChange={(e) => setWeeks(Number(e.target.value))}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-brand-500 focus:ring-2"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={onCreateProject} disabled={isLoading} className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">
              Create Project
            </button>
            <button
              type="button"
              onClick={onGenerateRoadmap}
              disabled={isLoading || !project}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
            >
              Generate Roadmap
            </button>
          </div>
        </form>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-slate-900">Milestones & Tasks</h3>
        {isLoading ? <p className="text-sm text-slate-500">Loading...</p> : null}
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
        {(project?.milestones || []).map((milestone) => (
          <article key={milestone.id} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-base font-semibold text-slate-900">
                Week {milestone.week_number}: {milestone.title}
              </h4>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                {milestone.tasks.length} tasks
              </span>
            </div>
            <ul className="mt-4 space-y-2">
              {milestone.tasks.map((task) => (
                <li key={task.id} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                  {task.description}
                </li>
              ))}
            </ul>
          </article>
        ))}
        {!project ? <p className="text-sm text-slate-500">No project loaded yet.</p> : null}
      </div>
    </section>
  );
}
