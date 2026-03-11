"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Heart, Users } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { followPublicProject, getPublicProjects, likePublicProject, type PublicProjectData } from "@/lib/api";

export default function ExplorePage() {
  const [projects, setProjects] = useState<PublicProjectData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getPublicProjects();
        setProjects(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load public projects.");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const like = async (projectId: number) => {
    const result = await likePublicProject(projectId);
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, likes: result.likes } : p)));
  };

  const follow = async (projectId: number) => {
    const result = await followPublicProject(projectId);
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, followers: result.followers } : p)));
  };

  return (
    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-zinc-100">Explore Founders</h2>
        <p className="text-body mt-1">Discover public startup projects and follow their progress.</p>
      </div>

      {loading ? <p className="text-sm text-zinc-400">Loading public projects...</p> : null}
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {projects.map((project) => (
          <Card key={project.id} className="glass-panel panel-glow">
            <CardHeader className="space-y-1">
              <CardTitle className="text-zinc-100">{project.title}</CardTitle>
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                {project.founder_name}
              </p>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-zinc-300">
              <p>{project.description || "Public founder build in progress."}</p>
              <div className="grid gap-2 text-xs text-zinc-400">
                <div className="flex items-center justify-between">
                  <span>Progress</span>
                  <span className="text-zinc-200">{project.progress}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Milestones</span>
                  <span className="text-zinc-200">
                    {project.milestones_completed}/{project.milestones_total}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  className="border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10"
                  onClick={() => void like(project.id)}
                >
                  <Heart className="mr-2 h-4 w-4" /> {project.likes}
                </Button>
                <Button
                  variant="outline"
                  className="border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10"
                  onClick={() => void follow(project.id)}
                >
                  <Users className="mr-2 h-4 w-4" /> Follow
                </Button>
                <Button className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white" asChild>
                  <Link href={`/explore/${project.id}`}>Open</Link>
                </Button>
                {project.founder_username ? (
                  <Button variant="ghost" className="text-zinc-300" asChild>
                    <Link href={`/founder/${project.founder_username}`}>Founder</Link>
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </motion.section>
  );
}
