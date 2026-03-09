"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ProjectTable from "@/components/project-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  BuildMindProject,
  createProjectWithRoadmap,
  getProjectsForCurrentUser,
} from "@/lib/buildmind";

function stageFromProject(project: BuildMindProject): string {
  if (project.validation_strengths.length >= 3) return "Validation";
  if (project.validation_strengths.length > 0) return "Discovery";
  return "Idea";
}

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<BuildMindProject[]>([]);
  const [projectName, setProjectName] = useState("");
  const [ideaDescription, setIdeaDescription] = useState("");
  const [targetUsers, setTargetUsers] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  const rows = useMemo(
    () =>
      projects.map((p) => ({
        id: p.id,
        title: p.title,
        stage: stageFromProject(p),
        milestones: 5,
        progress: p.validation_strengths.length > 0 ? 25 : 5,
      })),
    [projects]
  );

  useEffect(() => {
    const load = async () => {
      try {
        setProjects(await getProjectsForCurrentUser());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load projects");
      }
    };
    void load();
  }, []);

  const onCreate = async () => {
    if (!projectName.trim() || !ideaDescription.trim() || !targetUsers.trim()) return;
    try {
      setSaving(true);
      setError("");
      const created = await createProjectWithRoadmap({
        project_name: projectName,
        idea_description: ideaDescription,
        target_users: targetUsers,
        problem: ideaDescription,
      });
      setModalOpen(false);
      router.push(`/projects/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-6 fade-up">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Projects</h2>
          <p className="mt-1 text-sm text-slate-600">Manage startup ideas, milestones, and execution progress.</p>
        </div>
        <Button className="bg-slate-900 hover:bg-slate-800" onClick={() => setModalOpen(true)}>Create Project</Button>
      </div>

      {projects.length === 0 ? (
        <Card className="overflow-hidden border-slate-200/80 bg-white/90">
          <div className="bg-gradient-to-r from-blue-600 to-cyan-600 px-6 py-4 text-white">
            <p className="text-xs uppercase tracking-[0.2em] text-blue-100">Workspace Setup</p>
            <p className="mt-1 text-lg font-semibold">No projects yet</p>
          </div>
          <CardHeader><CardTitle>Create your first startup idea.</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600">Start with one clear idea and BuildMind will scaffold milestones, tasks, and AI guidance.</p>
          </CardContent>
        </Card>
      ) : (
        <ProjectTable rows={rows} />
      )}

      {modalOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-xl border-slate-200/80">
            <CardHeader>
              <CardTitle>Create Project</CardTitle>
              <p className="text-sm text-slate-500">Define your startup briefly and we will generate an execution-ready workspace.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input placeholder="Project name" value={projectName} onChange={(e) => setProjectName(e.target.value)} />
              <textarea
                className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500"
                placeholder="Idea description"
                value={ideaDescription}
                onChange={(e) => setIdeaDescription(e.target.value)}
              />
              <Input placeholder="Target users" value={targetUsers} onChange={(e) => setTargetUsers(e.target.value)} />
              {error ? <p className="text-sm text-rose-600">{error}</p> : null}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
                <Button onClick={() => void onCreate()} disabled={saving}>{saving ? "Generating roadmap..." : "Create Project"}</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </section>
  );
}
