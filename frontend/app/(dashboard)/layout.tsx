import DashboardLayout from "@/layouts/dashboard-layout";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
