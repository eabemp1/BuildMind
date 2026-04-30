import type { Metadata } from "next";
import AppShell from "@/components/layout/app-shell";

export const metadata: Metadata = {
  alternates: { canonical: "https://buildmind.live/explore" },
  title: "Explore Startups | BuildMind",
  description: "Discover what other founders are building. Browse public startup projects on BuildMind.",
};

export default function ExploreLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
