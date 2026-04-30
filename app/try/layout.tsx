import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: "https://buildmind.live/try" },
  title: "Try BuildMind Free | Daily Action Engine for Founders",
  description: "Try BuildMind for free. Get your first AI-powered daily action based on your startup stage — no credit card required.",
};

export default function TryLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
