import AppShell from "@/components/layout/app-shell";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Single app-shell for all authenticated pages — consistent nav, sidebar,
  // and daily loop status bar across Today/Reports/Overview/etc.
  // Import is static so Next.js App Router can tree-shake and SSR correctly.
  return <AppShell>{children}</AppShell>;
}
