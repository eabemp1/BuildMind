import AdminLayout from "@/layouts/admin-layout";

export default function AppAdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayout>{children}</AdminLayout>;
}
