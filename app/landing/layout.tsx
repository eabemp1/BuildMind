import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: "https://buildmind.live" },
  robots: { index: false, follow: true },
  title: "BuildMind — Your next move, already decided",
  description:
    "BuildMind watches your startup context and tells you the one highest-leverage thing to do next. No lists. No frameworks. Just the next move.",
};

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
