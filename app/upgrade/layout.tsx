import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: "https://buildmind.live/upgrade" },
  title: "BuildMind Builder Plan — $19/month | Unlimited AI Coaching",
  description: "Upgrade to BuildMind Builder. Unlimited daily actions, AI Coach, weekly reports, and full Break My Startup analysis.",
};

export default function UpgradeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
