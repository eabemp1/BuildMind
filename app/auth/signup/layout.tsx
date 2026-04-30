import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: "https://buildmind.live/auth/login" },
  robots: { index: false, follow: false },
  title: "BuildMind",
  description: "BuildMind account access.",
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
