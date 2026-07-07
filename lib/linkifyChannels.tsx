import type { ReactNode } from "react";

/**
 * linkifyChannels
 *
 * The Reflexion pipeline (lib/reflexion.ts) already recognizes these channel
 * names when applying channel-specific writing style (see CHANNEL_STYLE_EXAMPLES
 * in lib/reflexion.ts). This reuses the same channel set so that when a task's
 * action text mentions one of them, it renders as a clickable link instead of
 * inert text — the founder can jump straight to the platform instead of having
 * to search for it themselves.
 *
 * Usage: linkifyChannels(sanitizeOutput(actionData.action))
 * Returns an array of strings/React nodes safe to render directly in JSX.
 */
const CHANNEL_URLS: Record<string, string> = {
  "WhatsApp": "https://web.whatsapp.com",
  "LinkedIn": "https://www.linkedin.com",
  "Reddit": "https://www.reddit.com",
  "Product Hunt": "https://www.producthunt.com",
  "Indie Hackers": "https://www.indiehackers.com",
  "Twitter/X": "https://twitter.com",
  "Twitter": "https://twitter.com",
  "Email": "mailto:",
};

// Sort longest-first so "Product Hunt" matches before a hypothetical shorter
// overlapping key would, and so "Twitter/X" doesn't get shadowed by "Twitter".
const CHANNEL_KEYS = Object.keys(CHANNEL_URLS).sort((a, b) => b.length - a.length);

// Escape regex special characters in channel names (the "/" in "Twitter/X").
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const CHANNEL_PATTERN = new RegExp(`(${CHANNEL_KEYS.map(escapeRegExp).join("|")})`, "gi");

export function linkifyChannels(text: string): ReactNode[] {
  if (!text) return [text];

  const parts = text.split(CHANNEL_PATTERN);

  return parts.map((part, i) => {
    const matchKey = CHANNEL_KEYS.find(
      (key) => key.toLowerCase() === part.toLowerCase(),
    );
    if (!matchKey) return part;

    return (
      <a
        key={`${matchKey}-${i}`}
        href={CHANNEL_URLS[matchKey]}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: "var(--bm-accent)", textDecoration: "underline", textUnderlineOffset: 2 }}
        onClick={(e) => e.stopPropagation()}
      >
        {part}
      </a>
    );
  });
}
