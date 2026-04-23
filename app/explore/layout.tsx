import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AppShell from "@/components/layout/app-shell";
import { FEATURES } from "@/lib/features";

export const metadata: Metadata = {
  alternates: { canonical: "https://buildmind.live/explore" },
  title: "Explore Startups | BuildMind",
  description: "Discover what other founders are building. Browse public startup projects on BuildMind.",
};

export default function ExploreLayout({ children }: { children: React.ReactNode }) {
  if (!FEATURES.publicProjects) notFound();
  return <AppShell>{children}</AppShell>;
}
