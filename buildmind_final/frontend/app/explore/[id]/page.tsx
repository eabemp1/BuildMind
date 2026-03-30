"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addProjectComment, getPublicProject, type PublicProjectDetailData } from "@/lib/api";

export default function PublicProjectPage() {
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id);
  const [project, setProject] = useState<PublicProjectDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [comment, setComment] = useState("");
  const [commentError, setCommentError] = useState("");
  const [commentLoading, setCommentLoading] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    const load = async () => {
      try {
        const data = await getPublicProject(projectId);
        setProject(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load project.");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [projectId]);

  return (
    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {loading ? <p className="text-sm text-zinc-400">Loading project...</p> : null}
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      {project ? (
        <>
          <div>
            <h2 className="text-2xl font-semibold text-zinc-100">{project.title}</h2>
            <p className="text-body mt-1">{project.description || "Public founder build in progress."}</p>
            {project.founder_username ? (
              <Link href={`/founder/${project.founder_username}`} className="text-sm text-indigo-300">
                @{project.founder_username}
              </Link>
            ) : null}
          </div>

          <Card className="glass-panel panel-glow">
            <CardHeader>
              <CardTitle className="text-zinc-100">Milestones</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-zinc-300">
              {project.milestones.map((ms) => (
                <div key={ms.id} className="rounded-lg border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-zinc-100">{ms.title}</p>
                    <span className="text-xs text-zinc-400">{ms.is_completed ? "Done" : "In progress"}</span>
                  </div>
                  <ul className="mt-2 space-y-1">
                    {ms.tasks.map((task) => (
                      <li key={task.id} className="text-zinc-300">
                        {task.is_completed ? "✓" : "•"} {task.title}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="glass-panel panel-glow">
            <CardHeader>
              <CardTitle className="text-zinc-100">Updates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-zinc-300">
              {project.updates.length === 0 ? (
                <p className="text-zinc-400">No updates yet.</p>
              ) : (
                project.updates.map((update) => (
                  <div key={update.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <p>{update.content}</p>
                    <p className="mt-2 text-xs text-zinc-500">{new Date(update.created_at).toLocaleString()}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="glass-panel panel-glow">
            <CardHeader>
              <CardTitle className="text-zinc-100">Comments</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-zinc-300">
              <div className="space-y-2">
                <Input
                  placeholder="Your name (optional)"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  className="border-white/10 bg-black/20 text-zinc-100 placeholder:text-zinc-500"
                />
                <Input
                  placeholder="Leave a comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="border-white/10 bg-black/20 text-zinc-100 placeholder:text-zinc-500"
                />
                <Button
                  className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white"
                  disabled={commentLoading || !comment.trim()}
                  onClick={async () => {
                    if (!project || !comment.trim()) return;
                    setCommentError("");
                    setCommentLoading(true);
                    try {
                      const data = await addProjectComment(project.id, {
                        author_name: authorName || undefined,
                        content: comment.trim(),
                      });
                      setProject((prev) =>
                        prev
                          ? { ...prev, comments: [data, ...(prev.comments ?? [])] }
                          : prev,
                      );
                      setComment("");
                    } catch (err) {
                      setCommentError(err instanceof Error ? err.message : "Failed to post comment.");
                    } finally {
                      setCommentLoading(false);
                    }
                  }}
                >
                  Post Comment
                </Button>
                {commentError ? <p className="text-sm text-rose-400">{commentError}</p> : null}
              </div>
              {project.comments && project.comments.length > 0 ? (
                project.comments.map((item) => (
                  <div key={item.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <p className="text-zinc-100">{item.author_name || "Founder"}</p>
                    <p className="mt-1">{item.content}</p>
                    <p className="mt-2 text-xs text-zinc-500">{new Date(item.created_at).toLocaleString()}</p>
                  </div>
                ))
              ) : (
                <p className="text-zinc-400">No comments yet.</p>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </motion.section>
  );
}
