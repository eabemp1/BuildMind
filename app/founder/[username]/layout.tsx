import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";

interface Props {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;

  let displayName = username;
  let bio = `${username} is building in public on BuildMind.`;

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { data } = await supabase
      .from("project_summaries")
      .select("display_name, tagline")
      .eq("username", username)
      .maybeSingle();
    if (data?.display_name) displayName = data.display_name;
    if (data?.tagline) bio = data.tagline;
  } catch {}

  const title = `${displayName} (@${username}) — Building in public on BuildMind`;
  const description = bio;
  const url = `https://buildmind.live/founder/${username}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "profile",
      images: [{ url: "/logo/buildmind-og-image.png", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/logo/buildmind-og-image.png"],
    },
  };
}

export default function FounderProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}