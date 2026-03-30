"use client";

import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import Sidebar from "./sidebar";
import BottomNav from "./bottom-nav";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#000" }}>
      {/* Desktop sidebar — hidden on mobile */}
      <div style={{
        width: 200,
        flexShrink: 0,
        display: "none",
        height: "100vh",
        position: "sticky",
        top: 0,
      }} className="bm-sidebar">
        <Sidebar />
      </div>

      {/* Main content */}
      <main style={{
        flex: 1,
        minWidth: 0,
        paddingBottom: 64,  // space for bottom nav on mobile
        overflowX: "hidden",
      }} className="bm-main">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Mobile bottom nav — hidden on desktop */}
      <div className="bm-bottom-nav" style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
      }}>
        <BottomNav />
      </div>

      <style>{`
        @media (min-width: 768px) {
          .bm-sidebar { display: flex !important; flex-direction: column; }
          .bm-bottom-nav { display: none !important; }
          .bm-main { padding-bottom: 0 !important; }
        }
      `}</style>
    </div>
  );
}
