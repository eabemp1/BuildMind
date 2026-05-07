"use client";

/**
 * components/layout/logo.tsx — v2
 *
 * Fix #10: All logo nodes/lines now use celadon (#A8D5BA) as the single
 * brand colour. Removed the mixed teal (#4AB8B0) and multi-green palette.
 *
 * Celadon = #A8D5BA (primary brand)
 * Dark celadon = #6BAF8A (secondary nodes)
 * Dim celadon = rgba(168,213,186,*) (lines and glows)
 */

import Link from "next/link";

type BrandMarkProps = {
  size?: number;
  href?: string;
  className?: string;
};

export function BrandMark({ size = 28, href = "/", className }: BrandMarkProps) {
  // Unified celadon palette — no teal, no blue-green
  const C1 = "#A8D5BA"; // bright celadon (hero nodes)
  const C2 = "#7BBFA0"; // mid celadon (secondary nodes)
  const C3 = "#5CA882"; // dark celadon (tertiary nodes)
  const L1 = "rgba(168,213,186,0.55)"; // line primary
  const L2 = "rgba(168,213,186,0.28)"; // line secondary

  const mark = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={["block", className].filter(Boolean).join(" ")}
      role="img"
      aria-label="BuildMind"
    >
      <defs>
        <linearGradient id="bm-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#13131f" />
          <stop offset="100%" stopColor="#0a0a12" />
        </linearGradient>
        <filter id="bm-glow">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Background */}
      <rect width="64" height="64" rx="14" fill="url(#bm-bg)" />
      <rect width="64" height="64" rx="14" fill="none" stroke={`rgba(168,213,186,0.18)`} strokeWidth="1" />

      {/* Left column */}
      <circle cx="14" cy="22" r="3.5" fill={C3} opacity="0.65" />
      <circle cx="14" cy="32" r="3.5" fill={C3} opacity="0.65" />
      <circle cx="14" cy="42" r="3.5" fill={C3} opacity="0.65" />

      {/* Centre column */}
      <circle cx="32" cy="16" r="3.5" fill={C2} opacity="0.75" />
      <circle cx="32" cy="27" r="3.5" fill={C2} opacity="0.75" />
      <circle cx="32" cy="38" r="3.5" fill={C2} opacity="0.75" />
      <circle cx="32" cy="49" r="3.5" fill={C2} opacity="0.75" />

      {/* Right column */}
      <circle cx="50" cy="22" r="3.5" fill={C3} opacity="0.65" />
      <circle cx="50" cy="32" r="3.5" fill={C3} opacity="0.65" />
      <circle cx="50" cy="42" r="3.5" fill={C3} opacity="0.65" />

      {/* Left → Centre connections */}
      <line x1="17.5" y1="22" x2="28.5" y2="16" stroke={L2} strokeWidth="0.8" />
      <line x1="17.5" y1="22" x2="28.5" y2="27" stroke={L2} strokeWidth="0.8" />
      <line x1="17.5" y1="32" x2="28.5" y2="27" stroke={L1} strokeWidth="0.9" />
      <line x1="17.5" y1="32" x2="28.5" y2="38" stroke={L1} strokeWidth="0.9" />
      <line x1="17.5" y1="42" x2="28.5" y2="38" stroke={L2} strokeWidth="0.8" />
      <line x1="17.5" y1="42" x2="28.5" y2="49" stroke={L2} strokeWidth="0.8" />

      {/* Centre → Right connections */}
      <line x1="35.5" y1="16" x2="46.5" y2="22" stroke={L2} strokeWidth="0.8" />
      <line x1="35.5" y1="27" x2="46.5" y2="22" stroke={L1} strokeWidth="1.1" />
      <line x1="35.5" y1="27" x2="46.5" y2="32" stroke={L1} strokeWidth="1.1" />
      <line x1="35.5" y1="38" x2="46.5" y2="32" stroke={L2} strokeWidth="0.8" />
      <line x1="35.5" y1="38" x2="46.5" y2="42" stroke={L2} strokeWidth="0.8" />
      <line x1="35.5" y1="49" x2="46.5" y2="42" stroke={L2} strokeWidth="0.8" />

      {/* Hero connections (bright) */}
      <line x1="17.5" y1="32" x2="28.5" y2="27" stroke={C2} strokeWidth="1.5" opacity="0.85" />
      <line x1="35.5" y1="27" x2="46.5" y2="32" stroke={C2} strokeWidth="1.5" opacity="0.85" />

      {/* Hero nodes (glowing) */}
      <circle cx="14" cy="32" r="3.5" fill={C1} filter="url(#bm-glow)" />
      <circle cx="32" cy="27" r="4"   fill={C1} filter="url(#bm-glow)" />
      <circle cx="50" cy="32" r="3.5" fill={C1} filter="url(#bm-glow)" />
    </svg>
  );

  if (href) {
    return (
      <Link href={href} aria-label="BuildMind home" className="inline-flex items-center">
        {mark}
      </Link>
    );
  }

  return mark;
}
