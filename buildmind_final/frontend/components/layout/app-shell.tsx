"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/layout/sidebar";
import Topbar from "@/components/layout/topbar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="relative flex h-screen overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05] mix-blend-soft-light"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)' opacity='0.6'/%3E%3C/svg%3E\")",
        }}
      />
      <div className="pointer-events-none absolute -left-40 top-20 h-80 w-80 rounded-full bg-indigo-500/15 blur-[140px]" />
      <div className="pointer-events-none absolute right-0 top-10 h-96 w-96 rounded-full bg-purple-500/15 blur-[180px]" />
      <div className="pointer-events-none absolute bottom-0 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-sky-500/10 blur-[200px]" />
      <aside className="sticky top-0 hidden h-screen w-[240px] shrink-0 border-r border-white/10 md:flex">
        <Sidebar />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <div className="relative h-full w-[240px] border-r border-white/10 bg-black">
            <Sidebar />
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 h-[60px] border-b border-white/10 bg-black/30 backdrop-blur">
          <Topbar onToggleSidebar={() => setMobileOpen((prev) => !prev)} />
        </header>
        <AnimatePresence mode="wait">
        <motion.main
          key={pathname}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15, ease: "easeInOut" }}
          className="flex-1 overflow-y-auto px-6 py-6"
        >
          <div className="mx-auto w-full max-w-[1440px] space-y-6">{children}</div>
        </motion.main>
        </AnimatePresence>
      </div>
    </div>
  );
}
