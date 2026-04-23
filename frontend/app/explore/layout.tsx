import AppShell from "@/components/layout/app-shell";
import { notFound } from "next/navigation";
import { FEATURES } from "@/lib/features";

export default function ExploreLayout({ children }: { children: React.ReactNode }) {
  if (!FEATURES.publicProjects) notFound();
  return <AppShell>{children}</AppShell>;
}
