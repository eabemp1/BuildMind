import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "@/components/providers";
import PwaProvider from "@/components/PwaProvider";

// ─── SEO METADATA ──────────────────────────────────────────────────────────
// Domain: buildmind.live (GitHub Student Developer Pack)
// Strategy: own "founder daily action", "startup accountability app",
//           "solo founder tool", "build in public tracker"
export const metadata: Metadata = {
  metadataBase: new URL("https://buildmind.live"),
  title: {
    default: "BuildMind — One Decision. Already Made. | Daily Action Engine for Founders",
    template: "%s | BuildMind",
  },
  description:
    "BuildMind gives solo founders one clear action every day — decided by AI based on your startup stage, yesterday's reflection, and your streak. No planning paralysis. Just the next move.",
  keywords: [
    "daily action for founders",
    "startup accountability app",
    "solo founder productivity",
    "founder os",
    "build in public tracker",
    "indie hacker daily planner",
    "startup execution tool",
    "founder streak app",
    "validate startup idea free",
    "startup stage tracker",
    "solofounder app",
    "founder accountability partner",
    "daily startup task",
    "mvp launch checklist",
    "startup growth tracker",
    "buildmind",
    "build mind app",
    "founder daily routine",
  ],
  authors: [{ name: "BuildMind", url: "https://buildmind.live" }],
  creator: "BuildMind",
  publisher: "BuildMind",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "BuildMind",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://buildmind.live",
    siteName: "BuildMind",
    title: "BuildMind — One Decision. Already Made.",
    description:
      "Wake up. Open BuildMind. Your next move is already there — specific to your startup, based on what you did yesterday. No planning paralysis. Just execute.",
    images: [
      {
        url: "/logo/buildmind-og-image.svg",
        width: 1200,
        height: 630,
        alt: "BuildMind — Daily Action Engine for Founders",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "BuildMind — One Decision. Already Made.",
    description:
      "The daily action engine for solo founders. One move. Already decided. Based on your stage and what happened yesterday.",
    images: ["/logo/buildmind-og-image.svg"],
    creator: "@buildmind_os",
  },
  // canonical is set per-page via metadata.alternates in each page file
  verification: {
    // Add your Google Search Console verification token here
    // google: "YOUR_GOOGLE_VERIFICATION_TOKEN",
  },
};

export const viewport: Viewport = {
  themeColor: "#0C0D0F",
};

// ─── STRUCTURED DATA (JSON-LD) ─────────────────────────────────────────────
// Multiple schema types = more Google features (rich results, sitelinks, etc.)
const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "BuildMind",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: "https://buildmind.live",
    description:
      "BuildMind is a daily action engine for solo founders and indie hackers. It gives you one obvious task per day based on your startup stage — validation, prototype, MVP, launch, or revenue — and holds you accountable with streaks and reflections.",
    featureList: [
      "AI-powered daily action based on startup stage",
      "Reflect loop — yesterday's outcome changes today's action",
      "Founder streak tracking",
      "AI Coach with real project data",
      "Break My Startup — adversarial analysis",
      "Weekly share card for build-in-public",
    ],
    offers: [
      {
        "@type": "Offer",
        name: "Starter",
        price: "0",
        priceCurrency: "USD",
        description: "7 actions/week, 3 AI messages/day",
      },
      {
        "@type": "Offer",
        name: "Builder",
        price: "19",
        priceCurrency: "USD",
        description: "Unlimited actions, AI Coach, weekly reports, startup kit, and full Break My Startup analysis",
      },
    ],
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.9",
      reviewCount: "12",
    },
    creator: {
      "@type": "Person",
      name: "BuildMind Team",
      sameAs: "https://x.com/buildmind_os",
    },
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    url: "https://buildmind.live",
    name: "BuildMind",
    description: "Daily action engine for founders",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: "https://buildmind.live/explore?q={search_term_string}",
      },
      "query-input": "required name=search_term_string",
    },
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "What is BuildMind?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "BuildMind is a daily execution tool for solo founders. Every morning it gives you one specific action based on your startup stage. You reflect on it at night. The next day's action is personalised based on what happened. It's an accountability system that learns from you.",
        },
      },
      {
        "@type": "Question",
        name: "How is BuildMind different from a to-do app?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "BuildMind doesn't ask you to plan. It tells you what to do. The action is already decided — by AI, based on your startup stage, your project data, and yesterday's reflection. You don't manage a list. You show up and execute.",
        },
      },
      {
        "@type": "Question",
        name: "Is BuildMind free?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes. BuildMind has a free tier with 3 AI messages per day. Builder plan ($19/month) unlocks unlimited actions, the AI Coach, weekly reports, startup kit generation, and full Break My Startup analysis.",
        },
      },
      {
        "@type": "Question",
        name: "Who is BuildMind for?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Solo founders, indie hackers, and first-time entrepreneurs who have an idea or early startup and want to stop planning and start executing. BuildMind works best for people in the idea, validation, prototype, MVP, or launch stage.",
        },
      },
    ],
  },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Some browser extensions (e.g. Grammarly) inject attributes into <body>
    // before React hydrates, which can trigger a hydration mismatch warning.
    <html lang="en" suppressHydrationWarning>
      <head>
        {jsonLd.map((schema, i) => (
          <script
            key={i}
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
          />
        ))}
        {/* Per-page canonical tags are set via metadata.alternates.canonical in each page */}
        {/* Performance */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600&family=DM+Serif+Display:ital@0;1&display=swap" />
        <link rel="dns-prefetch" href="https://api.anthropic.com" />
        {/* Icons */}
        <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=3" />
        <link rel="shortcut icon" href="/favicon.svg?v=3" />
        <link rel="apple-touch-icon" href="/favicon.svg?v=3" />
        {/* Theme */}
        <meta name="theme-color" media="(prefers-color-scheme: light)" content="#f2f3f9" />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0C0D0F" />
        <meta name="color-scheme" content="light dark" />
        {/* Mobile */}
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="BuildMind" />
        {/* Geo targeting (helps local/regional discovery) */}
        <meta name="geo.region" content="GH" />
      </head>
      <body suppressHydrationWarning>
        <Providers>
          <PwaProvider>{children}</PwaProvider>
        </Providers>
      </body>
    </html>
  );
}
