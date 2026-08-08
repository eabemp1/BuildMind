"use client";

/**
 * components/ui/WhyReveal.tsx
 *
 * Shared "Why?" interaction (spec §26 — Global Intelligence Surface).
 * Any intelligence card (Insights signal, Strategy alignment, Founder
 * Mirror trait, recommendation) can attach one of these to let the founder
 * inspect concise, user-facing evidence — never raw model reasoning.
 *
 * Usage:
 *   <WhyReveal
 *     items={[
 *       { label: "Observed", value: "5 tasks logged, 0 customer interviews" },
 *       { label: "Compared to", value: "Your stated priority: customer validation" },
 *       { label: "Confidence", value: "High — consistent for 3 weeks" },
 *     ]}
 *   />
 */

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export type WhyEvidenceItem = {
  label: string;
  value: string;
};

export function WhyReveal({
  items,
  triggerLabel = "Why?",
  align = "left",
}: {
  items: WhyEvidenceItem[];
  triggerLabel?: string;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);

  if (!items.length) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: align === "right" ? "flex-end" : "flex-start" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 transition-colors"
        style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 10,
          letterSpacing: "0.03em",
          color: "var(--bm-intel)",
          background: "transparent",
          cursor: "pointer",
        }}
      >
        {triggerLabel}
        <ChevronDown
          size={11}
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            style={{ overflow: "hidden", width: "100%" }}
          >
            <div
              style={{
                marginTop: 8,
                padding: "10px 12px",
                borderRadius: "var(--r-md)",
                background: "var(--bm-intel-dim)",
                border: "1px solid var(--bm-intel-bd)",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              {items.map((item, i) => (
                <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, lineHeight: 1.5 }}>
                  <span style={{ color: "var(--bm-text3)", flexShrink: 0, minWidth: 90 }}>{item.label}</span>
                  <span style={{ color: "var(--bm-text)" }}>{item.value}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default WhyReveal;
