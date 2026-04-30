export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Keep a single app-shell for all authenticated pages (Today/Reports/etc) so
  // styling + navigation behavior stays consistent across the product.
  const AppShell = require("@/components/layout/app-shell").default as (p: { children: React.ReactNode }) => React.ReactNode;
  return <AppShell>{children}</AppShell>;
}
