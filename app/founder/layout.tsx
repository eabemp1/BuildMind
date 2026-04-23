import { notFound } from "next/navigation";
import { FEATURES } from "@/lib/features";

export default function FounderLayout({ children }: { children: React.ReactNode }) {
  if (!FEATURES.publicProjects) notFound();
  return children;
}

