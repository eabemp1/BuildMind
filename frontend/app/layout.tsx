import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/providers";

export const metadata: Metadata = {
  title: "BuildMind",
  description: "BuildMind - Startup operating system in the EvolvAI ecosystem",
  icons: {
    icon: "/brand/bui.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gradient-to-br from-zinc-950 via-slate-950 to-black text-zinc-100">
        <Providers>
          <div className="relative min-h-screen">
            <div className="pointer-events-none absolute -left-32 top-20 h-72 w-72 rounded-full bg-indigo-500/10 blur-[140px]" />
            <div className="pointer-events-none absolute right-0 top-0 h-80 w-80 rounded-full bg-purple-500/10 blur-[160px]" />
            <div className="pointer-events-none absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-sky-500/10 blur-[160px]" />
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
