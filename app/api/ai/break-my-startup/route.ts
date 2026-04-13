import { NextResponse } from "next/server";
import { enforceAndTrackAIUsage, groqJSON, hasAdminEnv } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";

async function scrapeCompetitors(query: string): Promise<{ title: string; url: string; snippet: string }[]> {
  try {
    const encoded = encodeURIComponent(query);
    const res = await fetch(`https://lite.duckduckgo.com/lite/?q=${encoded}`, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "en-US,en;q=0.9" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const linkMatches = [...html.matchAll(/class="result-link"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
    const snippetMatches = [...html.matchAll(/class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi)];
    const results: { title: string; url: string; snippet: string }[] = [];
    for (let i = 0; i < Math.min(linkMatches.length, 6); i++) {
      const href = linkMatches[i]?.[1] ?? "";
      const rawTitle = (linkMatches[i]?.[2] ?? "").replace(/<[^>]+>/g, "").trim();
      const rawSnippet = (snippetMatches[i]?.[1] ?? "").replace(/<[^>]+>/g, "").trim();
      let url = href;
      if (href.includes("uddg=")) {
        const match = href.match(/uddg=([^&]+)/);
        if (match?.[1]) url = decodeURIComponent(match[1]);
      }
      if (!url.startsWith("http") || !rawTitle) continue;
      results.push({ title: rawTitle, url, snippet: rawSnippet });
    }
    return results;
  } catch { return []; }
}

function signalScore(taskRate: number, milestoneRate: number, strengths: string[], weaknesses: string[], execScore: number, valScore: number): number {
  return Math.round(taskRate * 0.25 + milestoneRate * 0.20 + Math.min(strengths.length * 5, 20) * 0.20 + Math.max(0, 10 - weaknesses.length * 2) * 0.15 + execScore * 0.10 + valScore * 0.10);
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const userId = String(body?.userId ?? "");
    const projectId = String(body?.projectId ?? "");
    if (!userId || !projectId) return NextResponse.json({ success: false, error: "userId and projectId are required" }, { status: 400 });

    await enforceAndTrackAIUsage(userId);

    if (!hasAdminEnv()) {
      return NextResponse.json({ success: true, data: {
        reasoning: ["No live data — Supabase not configured", "Using generic analysis"],
        verdict: "Analysis requires live project data.",
        kill_reasons: ["No user interviews recorded", "No paying customers yet"],
        survive_reasons: ["Founder is taking this seriously"],
        brutal_advice: "Talk to 10 potential users before writing any more code.",
        survival_probability: 40,
        differentiation_plan: ["Identify one thing none of your 3 closest competitors do", "Make that your only marketing message for 30 days", "Price differently — not cheaper, differently positioned"],
        competitors: [], competitor_summary: "Configure Supabase to enable live competitor scan.",
      }});
    }

    const supabase = createAdminClient();
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("title,description,target_users,problem,startup_stage,validation_strengths,validation_weaknesses,validation_score,execution_score")
      .eq("id", projectId).eq("user_id", userId).single();
    if (projectError) throw new Error(projectError.message);

    const { data: milestones } = await supabase.from("milestones").select("id,title,is_completed").eq("project_id", projectId);
    const milestoneIds = (milestones ?? []).map(m => m.id);
    const { data: tasks } = milestoneIds.length
      ? await supabase.from("tasks").select("title,is_completed").in("milestone_id", milestoneIds)
      : { data: [] };

    const completedTasks = (tasks ?? []).filter(t => t.is_completed).length;
    const totalTasks = (tasks ?? []).length;
    const completedMilestones = (milestones ?? []).filter(m => m.is_completed).length;
    const totalMilestones = (milestones ?? []).length;
    const taskRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    const milestoneRate = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;
    const strengths = project.validation_strengths ?? [];
    const weaknesses = project.validation_weaknesses ?? [];
    const stage = project.startup_stage ?? "Idea";
    const execScore = project.execution_score ?? 0;
    const valScore = project.validation_score ?? 0;
    const baseSignal = signalScore(taskRate, milestoneRate, strengths, weaknesses, execScore, valScore);

    const [directResults, broadResults] = await Promise.allSettled([
      scrapeCompetitors(`${project.title ?? ""} ${project.problem ?? ""} startup site:producthunt.com OR site:crunchbase.com`),
      scrapeCompetitors(`${project.problem ?? project.description ?? ""} startup tool software`),
    ]);

    const rawCompetitors = [
      ...(directResults.status === "fulfilled" ? directResults.value : []),
      ...(broadResults.status === "fulfilled" ? broadResults.value : []),
    ];
    const seen = new Set<string>();
    const competitors = rawCompetitors.filter(c => {
      try { const d = new URL(c.url).hostname; if (seen.has(d)) return false; seen.add(d); return true; } catch { return false; }
    }).slice(0, 5);

    const competitorContext = competitors.length > 0
      ? `\nLive competitor data:\n${competitors.map((c, i) => `${i + 1}. ${c.title} — ${c.url}\n   ${c.snippet}`).join("\n")}`
      : "\nNo direct competitors found in live search.";

    const systemPrompt = `You are a brutally honest startup advisor. Return ONLY valid JSON with exactly these keys:
{
  "reasoning": ["step 1 (8-15 words)", "step 2", "step 3", "step 4"],
  "verdict": "2-3 honest sentences about this specific startup",
  "kill_reasons": ["reason 1", "reason 2", "reason 3"],
  "survive_reasons": ["reason 1", "reason 2"],
  "brutal_advice": "the single most important thing to do RIGHT NOW — be specific",
  "survival_probability": <integer 0-100 based on real signals, never 20 as default>,
  "competitor_summary": "1-2 sentences on competitive landscape from live data",
  "differentiation_plan": [
    "Specific thing competitors are NOT doing that this founder could own",
    "How to position differently — not cheaper, but differently angled",
    "One concrete action to stand out in the next 30 days"
  ]
}

survival_probability: base on signal score ${baseSignal}. Adjust up/down based on data quality.
differentiation_plan: MUST be specific to this startup's actual problem/target users and the live competitors found. Not generic. Reference actual competitor names if found.
No preamble. No markdown. Only JSON.`;

    const userPrompt = `Startup: ${project.title ?? "Untitled"}
Problem: ${project.problem ?? "Not defined"}
Target users: ${project.target_users ?? "Not defined"}
Description: ${project.description ?? "Not defined"}
Stage: ${stage} | Exec score: ${execScore}/100 | Val score: ${valScore}/100
Tasks: ${completedTasks}/${totalTasks} (${taskRate}%) | Milestones: ${completedMilestones}/${totalMilestones} (${milestoneRate}%)
Strengths: ${strengths.join(", ") || "None"} | Weaknesses: ${weaknesses.join(", ") || "None"}
Signal score: ${baseSignal}
${competitorContext}`;

    const defaultResult = {
      reasoning: [`Reading ${completedTasks}/${totalTasks} tasks`, `Found ${competitors.length} competitor(s) via live web scan`, `Signal score ${baseSignal}`, "Identifying kill risk and differentiation path"],
      verdict: "Analysis temporarily unavailable.",
      kill_reasons: ["Execution data insufficient", "Validation not confirmed", "Competitive landscape unclear"],
      survive_reasons: ["Founder is analyzing risks proactively"],
      brutal_advice: "Talk to 10 real potential users this week.",
      survival_probability: baseSignal,
      competitor_summary: competitors.length > 0 ? `Found ${competitors.length} potential competitors — differentiation is critical.` : "No clear competitors found — needs more specific search terms.",
      differentiation_plan: ["Identify what each competitor ignores in their product", "Find the user segment they serve badly and own that segment completely", "Build one feature or workflow no competitor has, validate it with 5 users this week"],
    };

    let result = defaultResult;
    try {
      const ai = await groqJSON<typeof defaultResult>(systemPrompt, userPrompt);
      if (ai?.verdict && typeof ai.survival_probability === "number") {
        result = {
          ...ai,
          survival_probability: Math.min(100, Math.max(1, Math.round(ai.survival_probability))),
          reasoning: Array.isArray(ai.reasoning) && ai.reasoning.length > 0 ? ai.reasoning : defaultResult.reasoning,
          differentiation_plan: Array.isArray(ai.differentiation_plan) && ai.differentiation_plan.length > 0 ? ai.differentiation_plan : defaultResult.differentiation_plan,
        };
      }
    } catch { /* use default */ }

    return NextResponse.json({ success: true, data: { ...result, competitors } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Analysis failed";
    return NextResponse.json({ success: false, error: msg }, { status: msg.toLowerCase().includes("limit") ? 429 : 500 });
  }
}
