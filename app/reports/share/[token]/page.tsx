/**
 * app/reports/share/[token]/page.tsx — Growth Improvement #4
 *
 * Public shareable weekly report page — no authentication required.
 * Founders share this URL on X/LinkedIn/their newsletter.
 * Every view is a BuildMind impression with a CTA to join.
 *
 * Design: obsidian card, celadon green accent, momentum score ring,
 * key stats, and a "Build with BuildMind" CTA at the bottom.
 *
 * SEO: fully server-rendered with OG meta for rich social previews.
 */

import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import type { Metadata } from "next";
import { ShareReportClient } from "./ShareReportClient";

interface ReportData {
  week_start_date: string;
  projects_count: number;
  milestones_completed: number;
  tasks_completed: number;
  ai_summary: string;
  ai_risks: string;
  ai_suggestions: string;
}

interface WeeklyReportRow {
  share_token: string;
  report_data: ReportData;
  ai_summary: string;
  created_at: string;
  // joined from profiles
  display_name?: string;
  avatar_url?: string;
  startup_summary?: string;
}

async function getReportByToken(token: string): Promise<WeeklyReportRow | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  const supabase = createClient(url, key);
  const { data, error } = await supabase
    .from("weekly_reports")
    .select(`
      share_token,
      report_data,
      ai_summary,
      created_at,
      profiles (
        display_name,
        avatar_url
      ),
      founder_context (
        startup_summary
      )
    `)
    .eq("share_token", token)
    .maybeSingle();

  if (error || !data) return null;

  // Flatten joined data
  const profiles = (data as unknown as { profiles?: { display_name?: string; avatar_url?: string } }).profiles;
  const ctx      = (data as unknown as { founder_context?: { startup_summary?: string } }).founder_context;

  return {
    share_token:      data.share_token,
    report_data:      data.report_data as ReportData,
    ai_summary:       data.ai_summary as string,
    created_at:       data.created_at as string,
    display_name:     profiles?.display_name ?? "A founder",
    avatar_url:       profiles?.avatar_url,
    startup_summary:  ctx?.startup_summary ?? undefined,
  };
}

// ── OG metadata ───────────────────────────────────────────────────────────────

export async function generateMetadata(
  { params }: { params: { token: string } },
): Promise<Metadata> {
  const report = await getReportByToken(params.token);
  if (!report) return { title: "Weekly Report | BuildMind" };

  const name   = report.display_name ?? "A founder";
  const tasks  = report.report_data?.tasks_completed ?? 0;
  const weekOf = report.created_at
    ? new Date(report.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric" })
    : "this week";

  const title       = `${name}'s Week — ${tasks} tasks shipped | BuildMind`;
  const description = report.ai_summary?.slice(0, 160) ?? `${name} shipped ${tasks} tasks this week building their startup.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      siteName: "BuildMind",
      type: "article",
    },
    twitter: {
      card:        "summary",
      title,
      description,
      site:        "@buildmind_os",
    },
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ShareReportPage({ params }: { params: { token: string } }) {
  const report = await getReportByToken(params.token);
  if (!report) notFound();

  return <ShareReportClient report={report} />;
}
