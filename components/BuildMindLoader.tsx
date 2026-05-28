"use client";

import { motion } from "framer-motion";

type LoaderVariant = "page" | "card" | "inline";
interface BuildMindLoaderProps {
  variant?: LoaderVariant;
  label?: string;
  sublabel?: string;
}

function AnimatedMark({ size = 72 }: { size?: number }) {
  const nodes = [
    { cx: 14, cy: 22, r: 3.2, delay: 0    },
    { cx: 14, cy: 32, r: 3.2, delay: 0.1  },
    { cx: 14, cy: 42, r: 3.2, delay: 0.2  },
    { cx: 32, cy: 16, r: 3.2, delay: 0.15 },
    { cx: 32, cy: 27, r: 3.8, delay: 0.25 },
    { cx: 32, cy: 38, r: 3.2, delay: 0.35 },
    { cx: 32, cy: 49, r: 3.2, delay: 0.45 },
    { cx: 50, cy: 22, r: 3.2, delay: 0.3  },
    { cx: 50, cy: 32, r: 3.2, delay: 0.4  },
    { cx: 50, cy: 42, r: 3.2, delay: 0.5  },
  ];
  const edges = [
    { x1:17.5,y1:22,x2:28.5,y2:16,o:0.3 }, { x1:17.5,y1:22,x2:28.5,y2:27,o:0.3 },
    { x1:17.5,y1:32,x2:28.5,y2:27,o:0.6 }, { x1:17.5,y1:32,x2:28.5,y2:38,o:0.45},
    { x1:17.5,y1:42,x2:28.5,y2:38,o:0.3 }, { x1:17.5,y1:42,x2:28.5,y2:49,o:0.3 },
    { x1:35.5,y1:16,x2:46.5,y2:22,o:0.3 }, { x1:35.5,y1:27,x2:46.5,y2:22,o:0.5 },
    { x1:35.5,y1:27,x2:46.5,y2:32,o:0.6 }, { x1:35.5,y1:38,x2:46.5,y2:32,o:0.3 },
    { x1:35.5,y1:38,x2:46.5,y2:42,o:0.3 }, { x1:35.5,y1:49,x2:46.5,y2:42,o:0.3 },
  ];

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      {/* Outer pulse ring */}
      <motion.div
        animate={{ scale: [1, 1.5, 1], opacity: [0.15, 0, 0.15] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
        style={{
          position: "absolute", inset: -size * 0.2, borderRadius: "50%",
          background: "transparent",
          pointerEvents: "none",
        }}
      />
      {/* Inner pulse ring */}
      <motion.div
        animate={{ scale: [1, 1.25, 1], opacity: [0.2, 0, 0.2] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut", delay: 0.7 }}
        style={{
          position: "absolute", inset: -size * 0.08, borderRadius: "50%",
          background: "transparent",
          pointerEvents: "none",
        }}
      />
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width={size} height={size} style={{ display: "block" }}>
        <defs>
          <linearGradient id="bml-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#181B21" />
            <stop offset="100%" stopColor="#0C0D0F" />
          </linearGradient>
          <linearGradient id="bml-node" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#C4B5FD" />
            <stop offset="100%" stopColor="#8B5CF6" />
          </linearGradient>
          <filter id="bml-glow">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <rect width="64" height="64" rx="14" fill="url(#bml-bg)" />
        <rect width="64" height="64" rx="14" fill="none" stroke="rgba(139,92,246,0.30)" strokeWidth="1" />

        {edges.map((e, i) => (
          <motion.line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
            stroke={`rgba(167,139,250,${e.o})`} strokeWidth="0.8"
            animate={{ opacity: [e.o * 0.3, e.o, e.o * 0.3] }}
            transition={{ duration: 2.2, repeat: Infinity, delay: i * 0.07, ease: "easeInOut" }}
          />
        ))}

        {/* Highlight edges */}
        <motion.line x1="17.5" y1="32" x2="28.5" y2="27" stroke="#A78BFA" strokeWidth="1.4"
          animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.8, repeat: Infinity }} />
        <motion.line x1="35.5" y1="27" x2="46.5" y2="32" stroke="#A78BFA" strokeWidth="1.4"
          animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.8, repeat: Infinity, delay: 0.3 }} />

        {/* Dim nodes */}
        {nodes.filter((_, i) => i !== 4 && i !== 1 && i !== 8).map((n, i) => (
          <motion.circle key={i} cx={n.cx} cy={n.cy} r={n.r} fill="#8B5CF6" opacity={0.35}
            animate={{ opacity: [0.3, 0.65, 0.3] }}
            transition={{ duration: 2.2, repeat: Infinity, delay: n.delay }}
          />
        ))}

        {/* Hero nodes */}
        <motion.circle cx="14" cy="32" r="3.2" fill="url(#bml-node)" filter="url(#bml-glow)"
          animate={{ opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 1.6, repeat: Infinity }} />
        <motion.circle cx="32" cy="27" r="3.8" fill="#C4B5FD" filter="url(#bml-glow)"
          animate={{ opacity: [0.8, 1, 0.8] }}
          transition={{ duration: 1.4, repeat: Infinity, delay: 0.2 }} />
        <motion.circle cx="50" cy="32" r="3.2" fill="url(#bml-node)" filter="url(#bml-glow)"
          animate={{ opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 1.6, repeat: Infinity, delay: 0.4 }} />

        {/* Traveling signal dot */}
        <motion.circle cx="14" cy="32" r="2" fill="#fff" opacity="0.9" filter="url(#bml-glow)"
          animate={{ opacity: [0, 1, 1, 1, 0] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", times: [0,0.3,0.5,0.7,1] }}
        />
      </svg>
    </div>
  );
}

function PageLoader({ label, sublabel }: { label?: string; sublabel?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{
        position: "fixed", inset: 0, background: "var(--bm-bg, #0C0D0F)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        gap: 32, zIndex: 9990, fontFamily: "inherit",
      }}
    >
      <AnimatedMark size={88} />
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        style={{ textAlign: "center" }}
      >
        {label && <div style={{ fontSize: 14, fontWeight: 500, color: "var(--bm-accent)", letterSpacing: "0.01em", marginBottom: 5 }}>{label}</div>}
        {sublabel && <div style={{ fontSize: 12, color: "var(--bm-text4)", letterSpacing: "0.04em" }}>{sublabel}</div>}
        {!label && <div style={{ fontSize: 11, color: "var(--bm-text4)", letterSpacing: "0.1em", textTransform: "uppercase" }}>BuildMind</div>}
      </motion.div>

      {/* Bottom progress bar */}
      <motion.div
        style={{ position: "fixed", bottom: 0, left: 0, height: 2, background: "var(--bm-accent)", borderRadius: 1 }}
        animate={{ width: ["0%", "90%"] }}
        transition={{ duration: 2.8, ease: "easeOut" }}
      />
    </motion.div>
  );
}

function CardLoader({ label }: { label?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "calc(100vh - 120px)", gap: 20 }}>
      <AnimatedMark size={60} />
      {label && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
          style={{ fontSize: 12, color: "var(--bm-text4)", letterSpacing: "0.05em" }}>
          {label}
        </motion.div>
      )}
    </div>
  );
}

function InlineLoader({ label }: { label?: string }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <AnimatedMark size={22} />
      {label && <span style={{ fontSize: 12, color: "var(--bm-text3)" }}>{label}</span>}
    </div>
  );
}

export default function BuildMindLoader({ variant = "page", label, sublabel }: BuildMindLoaderProps) {
  if (variant === "card")   return <CardLoader label={label} />;
  if (variant === "inline") return <InlineLoader label={label} />;
  return <PageLoader label={label} sublabel={sublabel} />;
}

export { AnimatedMark };
