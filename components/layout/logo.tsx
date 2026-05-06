"use client";

import Link from "next/link";

type BrandMarkProps = {
  size?: number;
  href?: string;
  className?: string;
};

export function BrandMark({ size = 28, href = "/", className }: BrandMarkProps) {
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
        <linearGradient id="bg-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#18181B" />
          <stop offset="100%" stopColor="#09090B" />
        </linearGradient>
        <linearGradient id="node-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#A7F3D0" />
          <stop offset="100%" stopColor="#5CC88A" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#bg-grad)" />
      <rect width="64" height="64" rx="14" fill="none" stroke="rgba(92,200,138,0.3)" strokeWidth="1" />
      <circle cx="14" cy="22" r="3.5" fill="#44A86E" opacity="0.7" />
      <circle cx="14" cy="32" r="3.5" fill="#44A86E" opacity="0.7" />
      <circle cx="14" cy="42" r="3.5" fill="#44A86E" opacity="0.7" />
      <circle cx="32" cy="16" r="3.5" fill="#5CC88A" opacity="0.8" />
      <circle cx="32" cy="27" r="3.5" fill="#5CC88A" opacity="0.8" />
      <circle cx="32" cy="38" r="3.5" fill="#5CC88A" opacity="0.8" />
      <circle cx="32" cy="49" r="3.5" fill="#5CC88A" opacity="0.8" />
      <circle cx="50" cy="22" r="3.5" fill="#4AB8B0" opacity="0.7" />
      <circle cx="50" cy="32" r="3.5" fill="#4AB8B0" opacity="0.7" />
      <circle cx="50" cy="42" r="3.5" fill="#4AB8B0" opacity="0.7" />
      <line x1="17.5" y1="22" x2="28.5" y2="16" stroke="rgba(92,200,138,0.35)" strokeWidth="0.8" />
      <line x1="17.5" y1="22" x2="28.5" y2="27" stroke="rgba(92,200,138,0.35)" strokeWidth="0.8" />
      <line x1="17.5" y1="32" x2="28.5" y2="27" stroke="rgba(92,200,138,0.5)" strokeWidth="0.8" />
      <line x1="17.5" y1="32" x2="28.5" y2="38" stroke="rgba(92,200,138,0.5)" strokeWidth="0.8" />
      <line x1="17.5" y1="42" x2="28.5" y2="38" stroke="rgba(92,200,138,0.35)" strokeWidth="0.8" />
      <line x1="17.5" y1="42" x2="28.5" y2="49" stroke="rgba(92,200,138,0.35)" strokeWidth="0.8" />
      <line x1="35.5" y1="16" x2="46.5" y2="22" stroke="rgba(74,184,176,0.3)" strokeWidth="0.8" />
      <line x1="35.5" y1="27" x2="46.5" y2="22" stroke="rgba(74,184,176,0.55)" strokeWidth="1.2" />
      <line x1="35.5" y1="27" x2="46.5" y2="32" stroke="rgba(74,184,176,0.55)" strokeWidth="1.2" />
      <line x1="35.5" y1="38" x2="46.5" y2="32" stroke="rgba(74,184,176,0.3)" strokeWidth="0.8" />
      <line x1="35.5" y1="38" x2="46.5" y2="42" stroke="rgba(74,184,176,0.3)" strokeWidth="0.8" />
      <line x1="35.5" y1="49" x2="46.5" y2="42" stroke="rgba(74,184,176,0.3)" strokeWidth="0.8" />
      <line x1="17.5" y1="32" x2="28.5" y2="27" stroke="#5CC88A" strokeWidth="1.5" opacity="0.9" />
      <line x1="35.5" y1="27" x2="46.5" y2="32" stroke="#4AB8B0" strokeWidth="1.5" opacity="0.9" />
      <circle cx="14" cy="32" r="3.5" fill="url(#node-grad)" filter="url(#glow)" />
      <circle cx="32" cy="27" r="4" fill="#5CC88A" filter="url(#glow)" />
      <circle cx="50" cy="32" r="3.5" fill="#A7F3D0" filter="url(#glow)" />
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
