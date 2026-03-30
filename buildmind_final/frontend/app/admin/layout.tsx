import AppShell from "@/components/layout/app-shell";

export default function AppAdminLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
