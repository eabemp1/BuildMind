"use client";

import { motion } from "framer-motion";
import Sidebar from "@/components/layout/sidebar";
import Topbar from "@/components/layout/topbar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-transparent">
      <aside className="w-64 shrink-0 p-3">
        <Sidebar />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col p-3">
        <Topbar />
        <motion.main
          key="page"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="mt-3 flex-1 overflow-y-auto"
        >
          <div className="mx-auto w-full max-w-[1440px] space-y-6 pb-6">{children}</div>
        </motion.main>
      </div>
    </div>
  );
}
