/**
 * BuildMindLogo
 * SVG recreation of the BuildMind logo with transparent background.
 * Gradient: purple (#cc44ff) → blue (#44aaff)
 * Includes: brain, rocket, swoosh, bar chart, wordmark
 */

interface BuildMindLogoProps {
  size?: number;
  showWordmark?: boolean;
  className?: string;
}

export function BuildMindLogo({
  size = 40,
  showWordmark = false,
  className = "",
}: BuildMindLogoProps) {
  const ratio = size / 40;
  return (
    <div
      className={`flex items-center gap-2 ${className}`}
      style={{ lineHeight: 1 }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="bm-purple-blue" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#cc44ff" />
            <stop offset="55%" stopColor="#7755ff" />
            <stop offset="100%" stopColor="#44aaff" />
          </linearGradient>
          <linearGradient id="bm-bar-grad" x1="0" y1="30" x2="40" y2="30" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#9966ff" />
            <stop offset="100%" stopColor="#44aaff" />
          </linearGradient>
          <linearGradient id="bm-swoosh" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#aa55ee" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#6688ff" stopOpacity="0.4" />
          </linearGradient>
        </defs>

        {/* Brain left lobe */}
        <path
          d="M7 14.5C7 10 10.5 8 14 9C15 5.5 18.5 4.5 20 8.5V32C17 32 14 30 14 27C12 27 10 25.5 10 23C8 22.5 6.5 21 7.5 19C5.5 17.5 5.5 15.5 7 14.5Z"
          fill="url(#bm-purple-blue)"
          opacity="0.9"
        />
        {/* Brain right lobe */}
        <path
          d="M33 14.5C33 10 29.5 8 26 9C25 5.5 21.5 4.5 20 8.5V32C23 32 26 30 26 27C28 27 30 25.5 30 23C32 22.5 33.5 21 32.5 19C34.5 17.5 34.5 15.5 33 14.5Z"
          fill="url(#bm-purple-blue)"
          opacity="0.78"
        />
        {/* Brain center divider */}
        <rect x="19" y="9" width="2" height="23" rx="1" fill="url(#bm-purple-blue)" opacity="0.45" />
        {/* Brain detail lines */}
        <path d="M13 10C14 13 13 17 11 19" stroke="#ee88ff" strokeWidth="0.8" fill="none" opacity="0.5" strokeLinecap="round" />
        <path d="M11 23C12 25 11 27 11 27" stroke="#ee88ff" strokeWidth="0.7" fill="none" opacity="0.4" strokeLinecap="round" />

        {/* Swoosh arc */}
        <path
          d="M12 27C14.5 29.5 18 30.5 21.5 29C25.5 27 29 23 32 19"
          stroke="url(#bm-swoosh)"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
          opacity="0.85"
        />
        <path
          d="M11.5 26C14 28.5 17.5 30 22 28C26 26 29.5 22 32.5 18"
          stroke="url(#bm-swoosh)"
          strokeWidth="1.2"
          fill="none"
          strokeLinecap="round"
          opacity="0.45"
        />

        {/* Bar chart - 3 ascending bars */}
        <rect x="14" y="23" width="3.2" height="7" rx="0.8" fill="url(#bm-bar-grad)" opacity="0.95" />
        <rect x="18.2" y="20" width="3.2" height="10" rx="0.8" fill="url(#bm-bar-grad)" opacity="0.95" />
        <rect x="22.4" y="17" width="3.2" height="13" rx="0.8" fill="url(#bm-bar-grad)" opacity="0.95" />

        {/* Rocket */}
        <g transform="translate(27,8) rotate(-42)">
          <ellipse cx="0" cy="0" rx="2.2" ry="5.5" fill="url(#bm-purple-blue)" opacity="0.95" />
          <path d="M-2.2,-3 Q0,-8.5 2.2,-3Z" fill="url(#bm-purple-blue)" />
          <path d="M-2.2,3 L-4.2,6.5 L-1.2,5Z" fill="url(#bm-purple-blue)" opacity="0.75" />
          <path d="M2.2,3 L4.2,6.5 L1.2,5Z" fill="url(#bm-purple-blue)" opacity="0.75" />
          <circle cx="0" cy="-0.5" r="1.2" fill="#0d0d1a" opacity="0.5" />
          <path d="M-1,5 Q0,8.5 1,5 Q0.5,6.5 0,6 Q-0.5,6.5 -1,5Z" fill="#ffaa44" opacity="0.85" />
        </g>
      </svg>

      {showWordmark && (
        <div style={{ lineHeight: 1 }}>
          <div
            style={{
              fontSize: size * 0.45,
              fontWeight: 900,
              background: "linear-gradient(135deg, #cc44ff, #7755ff, #44aaff)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              letterSpacing: "-0.02em",
              fontFamily: "system-ui, sans-serif",
            }}
          >
            BuildMind
          </div>
          <div
            style={{
              fontSize: size * 0.16,
              color: "#64748b",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              fontFamily: "system-ui, sans-serif",
              marginTop: 1,
            }}
          >
            Founder OS
          </div>
        </div>
      )}
    </div>
  );
}

export default BuildMindLogo;
