import LandingPageClient from "@/components/landing/LandingPageClient";
import { getPublicStats, PUBLIC_STATS_FALLBACK } from "@/lib/server/publicStats";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const stats = await getPublicStats().catch(() => PUBLIC_STATS_FALLBACK);

  return <LandingPageClient initialStats={stats} />;
}
