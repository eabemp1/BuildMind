import type { Metadata } from "next";
import LandingPageClient from "@/components/landing/LandingPageClient";
import { getPublicStats, PUBLIC_STATS_FALLBACK } from "@/lib/server/publicStats";

export const dynamic = "force-dynamic";

// SEO FIX: the homepage previously had no canonical tag, so buildmind.live/
// and www.buildmind.live/ were served as unresolved duplicates in Search
// Console. This, plus the www redirect in next.config.mjs, fixes that.
export const metadata: Metadata = {
  alternates: { canonical: "https://buildmind.live" },
};

export default async function LandingPage() {
  const stats = await getPublicStats().catch(() => PUBLIC_STATS_FALLBACK);

  return <LandingPageClient initialStats={stats} />;
}
