"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getFounderProfile, type FounderProfileData } from "@/lib/api";

export default function FounderProfilePage() {
  const params = useParams<{ username: string }>();
  const username = params.username;
  const [profile, setProfile] = useState<FounderProfileData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!username) return;
    const load = async () => {
      try {
        const data = await getFounderProfile(username);
        setProfile(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load founder.");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [username]);

  return (
    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {loading ? <p className="text-sm text-zinc-400">Loading founder...</p> : null}
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}

      {profile ? (
        <>
          <Card className="glass-panel panel-glow">
            <CardContent className="flex flex-wrap items-center gap-4 p-6">
              <div className="h-20 w-20 overflow-hidden rounded-full border border-white/10 bg-white/5">
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt="Avatar" className="h-full w-full object-cover" />
                ) : null}
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-zinc-100">@{profile.username}</h2>
                <p className="text-body mt-1">{profile.bio || "Founder building in public."}</p>
                <p className="text-xs text-zinc-500">{profile.followers} followers</p>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-panel panel-glow">
            <CardHeader>
              <CardTitle className="text-zinc-100">Projects</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              {profile.projects.map((project) => (
                <Link key={project.id} href={`/explore/${project.id}`}>
                  <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                    <p className="text-zinc-100">{project.title}</p>
                    <p className="text-sm text-zinc-400">{project.description || "Public project"}</p>
                    <div className="mt-3 text-xs text-zinc-500">
                      {project.milestones_completed}/{project.milestones_total} milestones • {project.progress}%
                    </div>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>

          <Card className="glass-panel panel-glow">
            <CardHeader>
              <CardTitle className="text-zinc-100">Recent Updates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-zinc-300">
              {profile.recent_updates.length === 0 ? (
                <p className="text-zinc-400">No updates yet.</p>
              ) : (
                profile.recent_updates.map((update) => (
                  <div key={update.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <p>{update.content}</p>
                    <p className="mt-2 text-xs text-zinc-500">{new Date(update.created_at).toLocaleString()}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </motion.section>
  );
}
