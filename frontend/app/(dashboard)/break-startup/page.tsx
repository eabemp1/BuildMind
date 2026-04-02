"use client";

import { useEffect, useMemo, useState } from "react";
import PageHero from "@/components/layout/page-hero";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  breakMyStartup,
  getActiveProjectId,
  getProjects,
  type BreakMyStartupAnalysis,
  type ProjectData,
} from "@/lib/api";

export default function BreakMyStartupPage() {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<BreakMyStartupAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [searchMeta, setSearchMeta] = useState<{ webSearchUsed: boolean; searchResultCount: number } | null>(null);

  useEffect(() => {
    getProjects()
      .then((data) => setProjects(data))
      .catch(() => {});
  }, []);

  const activeProject = useMemo(() => {
    const activeId = getActiveProjectId();
    if (!activeId) return projects[0] ?? null;
    return projects.find((p) => String(p.id) === activeId) ?? projects[0] ?? null;
  }, [projects]);

  const runAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await breakMyStartup(activeProject?.id);
      setAnalysis(response.analysis);
      setSearchMeta({ webSearchUsed: response.webSearchUsed, searchResultCount: response.searchResultCount });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run analysis.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="space-y-6">
      <PageHero
        kicker="Reality Check"
        title="Break My Startup"
        subtitle="Unfiltered analysis based on your project data and live web search."
        actions={
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300">
            {searchMeta?.webSearchUsed ? `Web search: ${searchMeta.searchResultCount} sources` : "Web search enabled"}
          </span>
        }
      />

      <Card className="glass-panel panel-glow">
        <CardContent className="text-sm text-rose-200">
          No encouragement. No balance. BuildMind will browse the internet for similar startups, analyze what they’re doing better,
          calculate your probability of success compared to them, and list your top 3 failure modes based on real data.
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}

      {!analysis ? (
        <button
          onClick={runAnalysis}
          disabled={loading}
          className="w-full rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-4 text-base font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:cursor-not-allowed"
        >
          {loading ? "Analyzing with web search..." : "Break my startup — tell me the truth"}
        </button>
      ) : null}

      {loading ? (
        <Card className="glass-panel panel-glow">
          <CardHeader>
            <CardTitle>BuildMind is working</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-zinc-300">
            {[
              "Searching for similar products and competitors",
              "Comparing success rates and product positioning",
              "Cross-referencing with your execution data",
              "Drafting the honest assessment",
            ].map((item) => (
              <div key={item} className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-indigo-400" />
                <span>{item}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {analysis ? (
        <>
          <Card className="glass-panel panel-glow">
            <CardHeader>
              <CardTitle>Your 3 most likely failure modes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-zinc-300">
              {analysis.failureReasons.map((reason) => (
                <div key={reason.num} className="rounded-xl border border-rose-400/20 bg-rose-500/5 p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-xl font-bold text-rose-400">{reason.num}</span>
                    <div>
                      <p className="text-sm font-semibold text-rose-200">{reason.title}</p>
                      <p className="mt-1 text-sm text-zinc-300">{reason.body}</p>
                      <p className="mt-3 rounded-lg border border-emerald-400/20 bg-emerald-500/10 p-2 text-xs text-emerald-200">
                        {reason.evidence}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="glass-panel panel-glow">
            <CardHeader>
              <CardTitle>Similar products found</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-zinc-300">
              {analysis.competitors.map((competitor) => (
                <div key={competitor.name} className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-base font-semibold text-zinc-100">{competitor.name}</p>
                      <p className="text-sm text-zinc-400">{competitor.description}</p>
                    </div>
                    <div className="text-right text-xs text-zinc-400">
                      <p>Success rate vs yours</p>
                      <p className="text-sm font-semibold text-rose-300">{competitor.successRate}% vs {competitor.yourSuccessRate}%</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {competitor.betterAt.map((item) => (
                      <span key={item} className="rounded-full border border-rose-400/20 bg-rose-500/10 px-3 py-1 text-xs text-rose-200">
                        {item}
                      </span>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-emerald-200">Source: {competitor.source}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          {analysis.yourMoat ? (
            <Card className="glass-panel panel-glow">
              <CardHeader>
                <CardTitle>Your moat</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-zinc-300">{analysis.yourMoat}</CardContent>
            </Card>
          ) : null}

          <Card className="glass-panel panel-glow">
            <CardContent className="text-sm italic text-rose-200">{analysis.closingStatement}</CardContent>
          </Card>

          <div className="flex flex-wrap gap-3">
            <button
              className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/20"
            >
              Show me how to fix each one
            </button>
            <button
              onClick={() => {
                setAnalysis(null);
                setSearchMeta(null);
              }}
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-300 transition hover:bg-white/10"
            >
              Run again
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}
