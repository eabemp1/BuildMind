"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useClearNotificationsMutation, useMarkNotificationMutation, useNotificationsQuery } from "@/lib/queries";
import { FEATURES } from "@/lib/features";

export default function NotificationsPage() {
  const router = useRouter();
  useEffect(() => {
    if (!FEATURES.notifications) {
      router.replace("/dashboard");
    }
  }, [router]);
  if (!FEATURES.notifications) return null;
  const { data: items = [], isLoading, error } = useNotificationsQuery();
  const markReadMutation = useMarkNotificationMutation();
  const clearMutation = useClearNotificationsMutation();

  return (
    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-zinc-100">Notifications</h2>
        <p className="text-body mt-1">Milestone updates, task completions, and AI recommendations.</p>
      </div>

      <Card className="glass-panel panel-glow">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-zinc-100">Inbox</CardTitle>
          <Button
            variant="outline"
            className="border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10"
            onClick={() => void clearMutation.mutateAsync()}
            disabled={clearMutation.isPending || items.length === 0}
          >
            {clearMutation.isPending ? "Clearing..." : "Clear all"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? <p className="text-sm text-zinc-400">Loading notifications...</p> : null}
          {error ? <p className="text-sm text-rose-400">{(error as Error).message}</p> : null}

          {items.map((item) => (
            <div key={item.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2">
              <div>
                <p className="text-sm font-medium text-zinc-100">{item.message}</p>
                <p className="text-xs text-zinc-500">{new Date(item.created_at).toLocaleString()}</p>
              </div>
              {!item.is_read ? (
                <Button
                  variant="outline"
                  className="border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10"
                  onClick={() => void markReadMutation.mutateAsync(item.id)}
                >
                  Mark read
                </Button>
              ) : (
                <span className="text-xs text-zinc-500">Read</span>
              )}
            </div>
          ))}

          {!isLoading && !items.length ? (
            <div className="rounded-lg border border-white/10 bg-white/5 p-4">
              <p className="text-sm font-medium text-zinc-100">No notifications yet.</p>
              <p className="text-sm text-zinc-400">You will see milestone, task, and AI updates here.</p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </motion.section>
  );
}
