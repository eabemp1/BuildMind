import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BuildMind",
  description: "BuildMind - Startup operating system in the EvolvAI ecosystem"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
