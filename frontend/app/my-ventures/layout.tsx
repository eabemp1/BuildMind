import { notFound } from "next/navigation";
import { FEATURES } from "@/lib/features";
import AppShell from "@/components/layout/app-shell";

export default function MyVenturesLayout({ children }: { children: React.ReactNode }) {
  if (!FEATURES.ventures) notFound();
  return <AppShell>{children}</AppShell>;
}
