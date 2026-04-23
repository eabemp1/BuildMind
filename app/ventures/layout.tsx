import { notFound } from "next/navigation";
import { FEATURES } from "@/lib/features";

export default function VenturesLayout({ children }: { children: React.ReactNode }) {
  if (!FEATURES.ventures) notFound();
  return children;
}

