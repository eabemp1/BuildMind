import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: "https://buildmind.live/auth/signup" },
  robots: { index: false, follow: false },
  title: "Sign Up | BuildMind",
  description: "Create your free BuildMind account and get your first AI-powered daily startup action.",
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
