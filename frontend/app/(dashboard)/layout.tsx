import AppShell from "@/components/layout/app-shell";
import TourOverlay from "@/components/tour/TourOverlay";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <TourOverlay />
      {children}
    </AppShell>
  );
}
