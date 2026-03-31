import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/providers";

export const metadata: Metadata = {
  metadataBase: new URL("https://buildmind.app"),
  title: {
    default: "BuildMind — Your Daily Action Engine for Founders",
    template: "%s | BuildMind",
  },
  description:
    "BuildMind gives you one clear action every day based on your startup stage. No dashboards, no complexity — just the single most important thing to do right now.",
  keywords: [
    "startup founder tools",
    "founder productivity",
    "daily action for founders",
    "indie hacker tools",
    "startup accountability",
    "founder os",
    "validate startup idea",
    "startup execution",
    "product hunt alternative",
    "solofounder app",
  ],
  authors: [{ name: "BuildMind" }],
  creator: "BuildMind",
  publisher: "BuildMind",
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://buildmind.app",
    siteName: "BuildMind",
    title: "BuildMind — Your Daily Action Engine for Founders",
    description:
      "One clear action every day. Already decided for you. No willpower required. BuildMind forces you to validate before you build — and holds you accountable every day after.",
    images: [
      {
        url: "/logo/buildmind-og-image.svg",
        width: 1200,
        height: 630,
        alt: "BuildMind — Founder OS",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "BuildMind — Your Daily Action Engine for Founders",
    description:
      "One clear action every day. Already decided for you. No willpower required.",
    images: ["/logo/buildmind-og-image.svg"],
    creator: "@emma_bem",
  },
  alternates: {
    canonical: "https://buildmind.app",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "BuildMind",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  url: "https://buildmind.app",
  description:
    "BuildMind is a daily action engine for startup founders. It gives you one obvious task per day based on your startup stage — validation, prototype, MVP, launch, or revenue — and holds you accountable.",
  offers: {
    "@type": "Offer",
    price: "10",
    priceCurrency: "USD",
    priceValidUntil: "2026-12-31",
  },
  aggregateRating: {
    "@type": "AggregateRating",
    ratingValue: "4.9",
    reviewCount: "4",
  },
  creator: {
    "@type": "Person",
    name: "Emma",
    sameAs: "https://x.com/emma_bem",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {/* Preconnect for performance */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=2" />
        <link rel="shortcut icon" href="/favicon.svg?v=2" />
        <meta name="theme-color" media="(prefers-color-scheme: light)" content="#f8fafc" />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#09090b" />
        <meta name="color-scheme" content="light dark" />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
