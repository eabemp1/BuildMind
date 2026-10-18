import type { Metadata } from "next";

// /break is a client page, so its search metadata lives here. It is the main
// public entry point (people share it), so it needs its own title, description
// and canonical instead of inheriting the homepage's.
export const metadata: Metadata = {
  title: "Break My Startup: Free Startup Idea Stress Test",
  description:
    "Paste your startup idea and get a blunt, scored stress test in 30 seconds: why it could fail, the weakest spot to test first, and real competitors already out there. Free, no signup.",
  alternates: { canonical: "https://buildmind.live/break" },
  openGraph: {
    title: "Break My Startup — free startup idea stress test",
    description: "A blunt, scored stress test of your startup idea, with the one test to run this week.",
    url: "https://buildmind.live/break",
  },
};

export default function BreakLayout({ children }: { children: React.ReactNode }) {
  return children;
}
