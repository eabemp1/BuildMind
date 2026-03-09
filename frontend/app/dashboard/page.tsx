"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ActiveProjectsList from "@/components/ActiveProjectsList";
import ExecutionScoreCard from "@/components/ExecutionScoreCard";
import ExecutionStreakCard from "@/components/ExecutionStreakCard";
import NextActionsPanel from "@/components/NextActionsPanel";
import OnboardingTour from "@/components/OnboardingTour";
import RecentActivityFeed from "@/components/RecentActivityFeed";
import StartupJourney from "@/components/StartupJourney";
import {
  BuildmindDashboardData,
  getBuildmindDashboard,
  getCurrentUser,
  getStoredToken,
  updateCurrentUser,
} from "@/lib/api";

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<BuildmindDashboardData | null>(null);
  const [showTour, setShowTour] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      if (!getStoredToken()) {
        router.replace("/projects");
        return;
      }
      try {
        const me = await getCurrentUser();
        setShowTour(!Boolean(me.onboarding_completed));
        const dashboard = await getBuildmindDashboard();
        setData(dashboard);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
      }
    };
    void load();
  }, [router]);

  const onFinishTour = async () => {
    try {
      await updateCurrentUser({ onboarding_completed: true });
    } catch {
      // no-op
    } finally {
      setShowTour(false);
    }
  };

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">BuildMind Dashboard</h2>
        <p className="mt-1 text-sm text-slate-600">Execution command center for your startup journey.</p>
      </div>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <ExecutionScoreCard score={data?.execution_score ?? 0} />
        <ExecutionStreakCard streak={data?.execution_streak ?? 0} />
      </div>
      <StartupJourney progress={data?.journey_progress ?? 0} />
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ActiveProjectsList projects={data?.active_projects ?? []} />
        </div>
        <NextActionsPanel actions={data?.next_actions ?? []} />
      </div>
      <RecentActivityFeed items={data?.recent_activity ?? []} />
      <OnboardingTour visible={showTour} onComplete={onFinishTour} />
    </section>
  );
}
