import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: "https://buildmind.live/upgrade" },
  title: "BuildMind Builder Plan — $39/month | AI Coaching",
  description: "Upgrade to BuildMind Builder. Daily actions, AI Coach, weekly reports, and full Break My Startup analysis.",
};

export default function UpgradeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
