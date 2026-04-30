import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: "https://buildmind.live/auth/login" },
  title: "Log In | BuildMind",
  description: "Log in to BuildMind and get your daily action for your startup.",
  robots: { index: false, follow: false },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
