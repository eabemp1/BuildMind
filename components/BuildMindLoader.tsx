"use client";

/**
 * components/BuildMindLoader.tsx
 *
 * Branded full-screen (or inline) loading animation.
 * Uses the BuildMind logo with a layered pulse + node-travel animation.
 *
 * Variants:
 *   "page"   — full-screen centred, used for route-level loading
 *   "card"   — fills its container, used inside cards/panels
 *   "inline" — small inline spinner with optional label
 */

import { motion } from "framer-motion";

type LoaderVariant = "page" | "card" | "inline";

interface BuildMindLoaderProps {
  variant?: LoaderVariant;
  label?: string;
  sublabel?: string;
}

// ── The animated logo mark ────────────────────────────────────────────────────
function AnimatedMark({ size = 72 }: { size?: number }) {
  // Node positions matching the real logo (scaled to 64x64 viewBox)
  const nodes = [
    // Left column
    { cx: 14, cy: 22, r: 3.5, fill: "#4F46E5", delay: 0 },
    { cx: 14, cy: 32, r: 3.5, fill: "#4F46E5", delay: 0.1 },
    { cx: 14, cy: 42, r: 3.5, fill: "#4F46E5", delay: 0.2 },
    // Middle column
    { cx: 32, cy: 16, r: 3.5, fill: "#7C3AED", delay: 0.15 },
    { cx: 32, cy: 27, r: 4,   fill: "#A78BFA", delay: 0.25 }, // hero node
    { cx: 32, cy: 38, r: 3.5, fill: "#7C3AED", delay: 0.35 },
    { cx: 32, cy: 49, r: 3.5, fill: "#7C3AED", delay: 0.45 },
    // Right column
    { cx: 50, cy: 22, r: 3.5, fill: "#A78BFA", delay: 0.3 },
    { cx: 50, cy: 32, r: 3.5, fill: "#A78BFA", delay: 0.4 },
    { cx: 50, cy: 42, r: 3.5, fill: "#A78BFA", delay: 0.5 },
  ];

  const edges = [
    { x1: 17.5, y1: 22, x2: 28.5, y2: 16, o: 0.35 },
    { x1: 17.5, y1: 22, x2: 28.5, y2: 27, o: 0.35 },
    { x1: 17.5, y1: 32, x2: 28.5, y2: 27, o: 0.6  },
    { x1: 17.5, y1: 32, x2: 28.5, y2: 38, o: 0.5  },
    { x1: 17.5, y1: 42, x2: 28.5, y2: 38, o: 0.35 },
    { x1: 17.5, y1: 42, x2: 28.5, y2: 49, o: 0.35 },
    { x1: 35.5, y1: 16, x2: 46.5, y2: 22, o: 0.3  },
    { x1: 35.5, y1: 27, x2: 46.5, y2: 22, o: 0.55 },
    { x1: 35.5, y1: 27, x2: 46.5, y2: 32, o: 0.6  },
    { x1: 35.5, y1: 38, x2: 46.5, y2: 32, o: 0.3  },
    { x1: 35.5, y1: 38, x2: 46.5, y2: 42, o: 0.3  },
    { x1: 35.5, y1: 49, x2: 46.5, y2: 42, o: 0.3  },
  ];

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      {/* Outer glow ring — Supabase-style expanding pulse */}
      <motion.div
        animate={{ scale: [1, 1.55, 1], opacity: [0.18, 0, 0.18] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        style={{
          position: "absolute",
          inset: -size * 0.22,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(124,58,237,0.35) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />
      {/* Inner glow ring */}
      <motion.div
        animate={{ scale: [1, 1.28, 1], opacity: [0.3, 0, 0.3] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
        style={{
          position: "absolute",
          inset: -size * 0.1,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(99,102,241,0.28) 0%, transparent 65%)",
          pointerEvents: "none",
        }}
      />

      {/* The SVG logo */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 64 64"
        width={size}
        height={size}
        style={{ display: "block" }}
      >
        <defs>
          <linearGradient id="bml-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#18181B" />
            <stop offset="100%" stopColor="#09090B" />
          </linearGradient>
          <linearGradient id="bml-node" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#C4B5FD" />
            <stop offset="100%" stopColor="#7C3AED" />
          </linearGradient>
          <filter id="bml-glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect width="64" height="64" rx="14" fill="url(#bml-bg)" />
        <rect width="64" height="64" rx="14" fill="none" stroke="rgba(139,92,246,0.3)" strokeWidth="1" />

        {/* Edges */}
        {edges.map((e, i) => (
          <motion.line
            key={i}
            x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
            stroke={`rgba(99,91,255,${e.o})`}
            strokeWidth="0.9"
            initial={{ opacity: 0.2 }}
            animate={{ opacity: [e.o * 0.4, e.o, e.o * 0.4] }}
            transition={{ duration: 2, repeat: Infinity, delay: i * 0.08, ease: "easeInOut" }}
          />
        ))}

        {/* Highlight edges */}
        <motion.line x1="17.5" y1="32" x2="28.5" y2="27" stroke="#7C3AED" strokeWidth="1.5"
          animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }} />
        <motion.line x1="35.5" y1="27" x2="46.5" y2="32" stroke="#A78BFA" strokeWidth="1.5"
          animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.8, repeat: Infinity, delay: 0.3, ease: "easeInOut" }} />

        {/* Dim nodes */}
        {nodes.filter((_, i) => i !== 4 && i !== 1 && i !== 8).map((n, i) => (
          <motion.circle
            key={i} cx={n.cx} cy={n.cy} r={n.r} fill={n.fill}
            animate={{ opacity: [0.5, 0.85, 0.5], r: [n.r, n.r + 0.4, n.r] }}
            transition={{ duration: 2.2, repeat: Infinity, delay: n.delay, ease: "easeInOut" }}
          />
        ))}

        {/* Hero nodes — brighter pulse */}
        <motion.circle cx="14" cy="32" r="3.5" fill="url(#bml-node)" filter="url(#bml-glow)"
          animate={{ r: [3.5, 4.4, 3.5], opacity: [0.8, 1, 0.8] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }} />
        <motion.circle cx="32" cy="27" r="4" fill="#A78BFA" filter="url(#bml-glow)"
          animate={{ r: [4, 5.2, 4], opacity: [0.9, 1, 0.9] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut", delay: 0.2 }} />
        <motion.circle cx="50" cy="32" r="3.5" fill="#C4B5FD" filter="url(#bml-glow)"
          animate={{ r: [3.5, 4.4, 3.5], opacity: [0.8, 1, 0.8] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut", delay: 0.4 }} />

        {/* Traveling signal dot — moves left→centre→right */}
        <motion.circle r="2" fill="#fff" opacity="0.9" filter="url(#bml-glow)"
          animate={{
            cx: [14, 32, 50, 32, 14],
            cy: [32, 27, 32, 27, 32],
            opacity: [0, 1, 1, 1, 0],
            r: [1.5, 2.2, 2.2, 2.2, 1.5],
          }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", times: [0, 0.3, 0.5, 0.7, 1] }}
        />
      </svg>
    </div>
  );
}

// ── Page loader — full screen ─────────────────────────────────────────────────
function PageLoader({ label, sublabel }: { label?: string; sublabel?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      style={{
        position: "fixed", inset: 0,
        background: "var(--bm-bg, #000)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        gap: 28, zIndex: 9990,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <AnimatedMark size={88} />

      <div style={{ textAlign: "center" }}>
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          {label && (
            <div style={{ fontSize: 14, fontWeight: 500, color: "#a78bfa", letterSpacing: "0.02em", marginBottom: 4 }}>
              {label}
            </div>
          )}
          {sublabel && (
            <div style={{ fontSize: 12, color: "#444", letterSpacing: "0.04em" }}>
              {sublabel}
            </div>
          )}
          {!label && (
            <div style={{ fontSize: 12, color: "#333", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              BuildMind
            </div>
          )}
        </motion.div>
      </div>

      {/* Bottom progress bar */}
      <motion.div
        style={{
          position: "fixed", bottom: 0, left: 0, height: 2,
          background: "linear-gradient(90deg, #6366f1, #a78bfa, #6366f1)",
          backgroundSize: "200% 100%",
        }}
        animate={{ width: ["0%", "85%"], backgroundPosition: ["0% 0%", "100% 0%"] }}
        transition={{ duration: 2.5, ease: "easeOut" }}
      />
    </motion.div>
  );
}

// ── Card loader — fills container ─────────────────────────────────────────────
function CardLoader({ label }: { label?: string }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      minHeight: 200, gap: 20,
      fontFamily: "system-ui, sans-serif",
    }}>
      <AnimatedMark size={64} />
      {label && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
          style={{ fontSize: 12, color: "#555", letterSpacing: "0.05em" }}
        >
          {label}
        </motion.div>
      )}
    </div>
  );
}

// ── Inline loader — small, beside text ───────────────────────────────────────
function InlineLoader({ label }: { label?: string }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 10, fontFamily: "system-ui, sans-serif" }}>
      <AnimatedMark size={24} />
      {label && <span style={{ fontSize: 12, color: "#666" }}>{label}</span>}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function BuildMindLoader({ variant = "page", label, sublabel }: BuildMindLoaderProps) {
  if (variant === "card")   return <CardLoader label={label} />;
  if (variant === "inline") return <InlineLoader label={label} />;
  return <PageLoader label={label} sublabel={sublabel} />;
}

/**
 * Convenience wrappers for common use cases:
 *
 *   <PageLoader />                     — route-level loading
 *   <BuildMindLoader variant="card" /> — inside a card/panel
 *   <BuildMindLoader variant="inline" label="Thinking..." /> — inline
 */
export { AnimatedMark };
