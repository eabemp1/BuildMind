import { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://buildmind.live";
  const now = new Date();
  let founderEntries: MetadataRoute.Sitemap = [];
  let reportEntries: MetadataRoute.Sitemap = [];

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    const { data: founders } = await supabase
      .from("project_summaries")
      .select("username, updated_at")
      .not("username", "is", null)
      .eq("is_public", true)
      .order("updated_at", { ascending: false })
      .limit(50);

    if (founders) {
      founderEntries = founders.map((f) => ({
        url: `${base}/founder/${f.username}`,
        lastModified: new Date(f.updated_at ?? now),
        changeFrequency: "weekly" as const,
        priority: 0.6,
      }));
    }
  } catch {}

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    const { data: reports } = await supabase
      .from("weekly_reports")
      .select("share_token, created_at")
      .not("share_token", "is", null)
      .order("created_at", { ascending: false })
      .limit(100);

    if (reports) {
      reportEntries = reports.map((r) => ({
        url: `${base}/reports/share/${r.share_token}`,
        lastModified: new Date(r.created_at ?? now),
        changeFrequency: "never" as const,
        priority: 0.5,
      }));
    }
  } catch {}

  return [
    // Homepage — highest priority
    {
      url: base,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1.0,
    },
    // Public content pages — indexable
    {
      url: `${base}/try`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.85,
    },
    {
      url: `${base}/upgrade`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${base}/students`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.75,
    },
    {
      url: `${base}/explore`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.8,
    },
    // Legal
    {
      url: `${base}/legal/terms`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${base}/legal/privacy`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    ...founderEntries,
    ...reportEntries,
  ];
}
