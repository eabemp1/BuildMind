"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Heart, Users } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { followPublicProject, getPublicProjects, likePublicProject, type PublicProjectData } from "@/lib/api";
import { createNotificationForCurrentUser } from "@/lib/buildmind";
import { FEATURES } from "@/lib/features";

const LIKES_KEY = "bm_liked_projects";
const FOLLOWS_KEY = "bm_followed_projects";

export default function ExplorePage() {
  const router = useRouter();
  const [projects, setProjects] = useState<PublicProjectData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [likedIds, setLikedIds] = useState<Set<number>>(new Set());
  const [followedIds, setFollowedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const likedRaw = window.localStorage.getItem(LIKES_KEY);
      const followedRaw = window.localStorage.getItem(FOLLOWS_KEY);
      const liked = likedRaw ? (JSON.parse(likedRaw) as number[]) : [];
      const followed = followedRaw ? (JSON.parse(followedRaw) as number[]) : [];
      setLikedIds(new Set(liked));
      setFollowedIds(new Set(followed));
    } catch {
      setLikedIds(new Set());
      setFollowedIds(new Set());
    }
  }, []);

  const persistIds = (key: string, ids: Set<number>) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, JSON.stringify(Array.from(ids)));
  };

  useEffect(() => {
    if (!FEATURES.publicProjects) {
      router.replace("/dashboard");
      return;
    }
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
  }, [router]);

  const like = async (projectId: number) => {
    if (likedIds.has(projectId)) return;
    try {
      setError("");
      const result = await likePublicProject(projectId);
      setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, likes: result.likes } : p)));
      const next = new Set(likedIds);
      next.add(projectId);
      setLikedIds(next);
      persistIds(LIKES_KEY, next);
      await createNotificationForCurrentUser("project_liked", "You liked a public founder project.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to like project.");
    }
  };

  const follow = async (projectId: number) => {
    if (followedIds.has(projectId)) return;
    try {
      setError("");
      const result = await followPublicProject(projectId);
      setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, followers: result.followers } : p)));
      const next = new Set(followedIds);
      next.add(projectId);
      setFollowedIds(next);
      persistIds(FOLLOWS_KEY, next);
      await createNotificationForCurrentUser("project_followed", "You followed a public founder project.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to follow project.");
    }
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
                  disabled={likedIds.has(project.id)}
                >
                  <Heart className="mr-2 h-4 w-4" /> {likedIds.has(project.id) ? "Liked" : project.likes}
                </Button>
                <Button
                  variant="outline"
                  className="border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10"
                  onClick={() => void follow(project.id)}
                  disabled={followedIds.has(project.id)}
                >
                  <Users className="mr-2 h-4 w-4" /> {followedIds.has(project.id) ? `Following (${project.followers})` : `Follow (${project.followers})`}
                </Button>
                <Link
                  href={`/explore/${project.id}`}
                  className="inline-flex items-center rounded-md bg-gradient-to-r from-indigo-500 to-purple-500 px-4 py-2 text-sm font-medium text-white"
                >
                  Open
                </Link>
                {project.founder_username ? (
                  <Link
                    href={`/founder/${project.founder_username}`}
                    className="inline-flex items-center rounded-md px-3 py-2 text-sm text-zinc-300 hover:bg-white/5"
                  >
                    Founder
                  </Link>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </motion.section>
  );
}
