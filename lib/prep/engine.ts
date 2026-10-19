/**
 * lib/prep/engine.ts — server side of "prepared work".
 *
 * Given today's task, work out what kind of work it is and prepare the first
 * draft: content kinds go through the Distribution engine (which learns from
 * this founder's edits and results), research kinds are grounded in live
 * search or in the founder's own record. Every claim is either measured,
 * sourced, or marked [add: ...] for the founder to fill in.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { callModelJSON } from "@/lib/ai-providers";
import { loadConnectedFacts, type ConnectedFacts } from "@/lib/integrations/facts";
import { webSearch } from "@/lib/search";
import { getFounderSnapshot } from "@/lib/server/founderSnapshot";
import { isTodayFlowSession } from "@/lib/todayFlowSessions";
import { draftContent, keepPastBehaviourQuestions, type ProjectCtx } from "@/lib/distribution/engine";
import { PREP_META, hasContent, inferPlatform, normalizePrepared, prepKindFor, type PrepFact, type PrepKind, type Prepared } from "@/lib/prep/kinds";

const DAY = 86_400_000;

export async function loadProject(admin: SupabaseClient, userId: string, projectId?: string | null): Promise<ProjectCtx> {
  const empty: ProjectCtx = { name: "", description: "", problem: "", targetUsers: "", stage: "" };
  try {
    let q = admin.from("projects").select("name,title,description,problem,target_users,startup_stage").eq("user_id", userId);
    q = projectId ? q.eq("id", projectId) : q.order("updated_at", { ascending: false });
    const { data } = await q.limit(1).maybeSingle();
    if (!data) return empty;
    const d = data as Record<string, string | null>;
    return { name: (d.name ?? d.title ?? "").trim(), description: (d.description ?? "").trim().slice(0, 600), problem: (d.problem ?? "").trim().slice(0, 400), targetUsers: (d.target_users ?? "").trim().slice(0, 200), stage: (d.startup_stage ?? "").trim() };
  } catch { return empty; }
}

type LearnRow = { kind: PrepKind; original: string; final: string | null; outcome: string | null; status: string };
type PreparedRow = { kind: PrepKind; payload: Prepared | null; chosen_variant: string | null; final_text: string | null; outcome: string | null; status: string };

function learnedLessons(rows: LearnRow[], kind: PrepKind): string[] {
  const relevant = rows.filter((row) => row.kind === kind).slice(0, 20);
  const edited = relevant.filter((row) => row.final?.trim() && row.final.trim() !== row.original.trim()).length;
  const positive = relevant.filter((row) => ["replied", "call_booked", "got_comments"].includes(row.outcome ?? "")).length;
  const negative = relevant.filter((row) => ["no_reply", "no_response"].includes(row.outcome ?? "")).length;
  const lessons: string[] = [];
  if (edited) lessons.push(`The founder edited ${edited} of ${relevant.length} recent ${kind.replaceAll("_", " ")} drafts; keep language easy to personalize.`);
  if (positive) lessons.push(`${positive} recent ${kind.replaceAll("_", " ")} item(s) had a positive recorded outcome; preserve the concrete approach that the founder chose.`);
  if (negative) lessons.push(`${negative} recent ${kind.replaceAll("_", " ")} item(s) had no response; vary the opening and make the ask specific.`);
  return lessons;
}

/** Recent prepared work, as rows the learning module understands. */
export async function loadLearnRows(admin: SupabaseClient, userId: string): Promise<LearnRow[]> {
  try {
    const { data } = await admin.from("prepared_work").select("kind,payload,chosen_variant,final_text,outcome,status").eq("user_id", userId).order("created_at", { ascending: false }).limit(120);
    return ((data ?? []) as PreparedRow[]).flatMap((r) => {
      const v = r.payload?.variants?.find((x) => x.id === r.chosen_variant) ?? r.payload?.variants?.[0];
      return v ? [{ kind: r.kind, original: v.text, final: r.final_text, outcome: r.outcome, status: r.status }] : [];
    });
  } catch { return []; }
}

/** Real numbers from the founder's own record. A fact is omitted when it could not be read. */
export async function investorFacts(admin: SupabaseClient, userId: string, projectId?: string | null, project?: ProjectCtx): Promise<PrepFact[]> {
  const facts: PrepFact[] = [];
  const since = new Date(Date.now() - 30 * DAY).toISOString();
  const [snap, log, refl, work] = await Promise.allSettled([
    getFounderSnapshot(userId, projectId ?? undefined),
    admin.from("reflexion_learning_log").select("outcome, session_id, prediction_source").eq("user_id", userId).gte("created_at", since).limit(400),
    admin.from("reflections").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since),
    admin.from("prepared_work").select("status, outcome").eq("user_id", userId).gte("created_at", since).limit(400),
  ]);
  if (project?.stage) facts.push({ label: "Stage", value: project.stage });
  if (log.status === "fulfilled") {
    const rows = ((log.value.data ?? []) as Array<{ outcome: string | null; session_id: string | null; prediction_source: string | null }>).filter((r) => isTodayFlowSession(r.session_id ?? "") && r.prediction_source !== "founder_intelligence");
    const done = rows.filter((r) => r.outcome === "completed" || r.outcome === "partial").length;
    if (rows.length) facts.push({ label: "Tasks completed, last 30 days", value: `${done} of ${rows.length} shown` });
  }
  if (snap.status === "fulfilled") {
    facts.push({ label: "Current streak", value: `${snap.value.streak} day${snap.value.streak === 1 ? "" : "s"}` });
    facts.push({ label: "Active days this week", value: String(snap.value.activeDaysThisWeek) });
  }
  if (refl.status === "fulfilled" && typeof refl.value.count === "number" && refl.value.count > 0) facts.push({ label: "Reflections written, last 30 days", value: String(refl.value.count) });
  if (work.status === "fulfilled") {
    const rows = (work.value.data ?? []) as Array<{ status: string; outcome: string | null }>;
    const sent = rows.filter((r) => r.status === "sent").length;
    const replied = rows.filter((r) => r.outcome === "replied" || r.outcome === "call_booked").length;
    if (sent) facts.push({ label: "Outreach messages sent, last 30 days", value: String(sent) });
    if (replied) facts.push({ label: "Replies or calls from them", value: String(replied) });
  }
  return facts;
}

// ── Research kinds ──────────────────────────────────────────────────────────

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** Competitors named by the model are kept only if the source they cite actually names them. */
export function groundedCompetitors(raw: unknown, hits: Array<{ title: string; url: string; snippet: string }>): Array<{ name: string; what: string; gap: string; source: number }> {
  const list = Array.isArray((raw as { competitors?: unknown })?.competitors) ? ((raw as { competitors: unknown[] }).competitors) : [];
  const out: Array<{ name: string; what: string; gap: string; source: number }> = [];
  for (const c of list.slice(0, 6)) {
    const o = (c ?? {}) as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim().slice(0, 60) : "";
    const source = Number(o.source);
    const hit = Number.isInteger(source) ? hits[source - 1] : undefined;
    if (!name || !hit) continue;
    const first = norm(name).split(" ")[0];
    if (!first || !norm(`${hit.title} ${hit.snippet} ${hit.url}`).includes(first)) continue;
    out.push({ name, what: typeof o.what === "string" ? o.what.trim().slice(0, 220) : "", gap: typeof o.gap === "string" ? o.gap.trim().slice(0, 220) : "", source });
  }
  return out;
}

export async function competitorBrief(project: ProjectCtx): Promise<Prepared | null> {
  let res;
  try { res = await webSearch(`${project.name} ${project.description.slice(0, 90)} alternatives competitors`.trim(), 6); } catch { return null; }
  const hits = res.results.filter((r) => /^https?:\/\//.test(r.url)).slice(0, 6);
  if (!res.scraped || !hits.length) return null;
  const src = hits.map((h, i) => `[${i + 1}] ${h.title} (${h.url}): ${h.snippet.slice(0, 220)}`).join("\n");
  let raw: unknown;
  try {
    raw = await callModelJSON<unknown>([{ role: "user", content: `You are preparing a competitor brief for a solo founder. Use ONLY these search results. Never add facts that are not in them.

PROJECT: ${project.name}: ${project.description}
Who it is for: ${project.targetUsers || "not stated"}

SEARCH RESULTS:
${src}

Return JSON: {"summary":"one sentence","competitors":[{"name":"product or company name as written in the result","what":"what it does, from the result","gap":"a possible gap for this founder to check (a hypothesis, not a fact)","source":1}],"opening":"one sentence on where this founder could differ, as a suggestion"}
Only include products that are actually competitors for this project.` }], { maxTokens: 1200 });
  } catch { return null; }
  const comps = groundedCompetitors(raw, hits);
  if (!comps.length) return null;
  const o = (raw ?? {}) as Record<string, unknown>;
  return normalizePrepared({
    title: "Competitor brief",
    summary: typeof o.summary === "string" ? o.summary : "Who comes up when someone searches for what you do.",
    sections: [
      { heading: "Who you are up against", bullets: comps.map((c) => `${c.name}: ${c.what || "see source"}`), links: comps.map((c) => ({ title: hits[c.source - 1].title, url: hits[c.source - 1].url })) },
      ...(comps.some((c) => c.gap) ? [{ heading: "Possible gaps (check these, they are not facts)", bullets: comps.filter((c) => c.gap).map((c) => `${c.name}: ${c.gap}`) }] : []),
      ...(typeof o.opening === "string" && o.opening.trim() ? [{ heading: "A way in (a suggestion)", body: o.opening.trim() }] : []),
    ],
  }, "competitor_brief", {});
}

export function validationFallback(project: ProjectCtx): Prepared {
  return normalizePrepared({
    title: "Interview kit",
    summary: "Questions about what already happened, so you hear real behaviour instead of polite opinions.",
    sections: [
      { heading: "Interview questions", bullets: [
        "Tell me about the last time this came up for you. What happened?",
        "What did you try first, and what was frustrating about it?",
        "How are you handling it today, and what does that cost you in time or money?",
        "Who else was involved, and how did you decide what to do?",
        "What have you already paid for, built or tried to deal with it?",
        "What is the one thing you would change about how that went?",
      ] },
      { heading: "What counts as evidence", bullets: ["They describe a specific recent time it happened.", "They have already spent time or money on it.", "They ask when they can use what you are building."] },
      { heading: "Stop signals", bullets: ["Everyone says it sounds nice but cannot name the last time it happened.", "Nobody has tried anything to solve it."] },
    ],
  }, "validation_kit");
}

export async function validationKit(project: ProjectCtx, task: string): Promise<Prepared> {
  try {
    const raw = await callModelJSON<Record<string, unknown>>([{ role: "user", content: `You are preparing an interview kit for a solo founder doing customer discovery. Ask about past behaviour, never about hypothetical future use of the product. No flattery.

PROJECT: ${project.name}: ${project.description}
Problem: ${project.problem || "not stated"}
Who it is for: ${project.targetUsers || "not stated"}
Task today: ${task}

Return JSON: {"summary":"","sections":[{"heading":"Who to talk to","bullets":["where to find 5 to 10 of them, specific places"]},{"heading":"Screener","bullets":["2 yes/no questions to confirm they fit"]},{"heading":"Interview questions","bullets":["6 questions about what they did last time"]},{"heading":"What counts as evidence","bullets":["3 signals"]},{"heading":"Stop signals","bullets":["2 signals"]}]}` }], { maxTokens: 1400 });
    const p = normalizePrepared(raw, "validation_kit");
    const qs = p.sections.find((s) => /interview questions/i.test(s.heading));
    if (qs?.bullets) qs.bullets = keepPastBehaviourQuestions(qs.bullets);
    if (!qs?.bullets || qs.bullets.length < 4) return validationFallback(project);
    return p;
  } catch { return validationFallback(project); }
}

// ── Orchestrator ────────────────────────────────────────────────────────────

export interface PrepResult { kind: PrepKind; platform: string; prepared: Prepared }

export async function generatePrep(
  admin: SupabaseClient,
  userId: string,
  input: { task: string; missionKind?: string | null; projectId?: string | null; firstStep?: string },
): Promise<PrepResult | null> {
  const kind = prepKindFor(input.task, input.missionKind);
  if (!kind) return null;
  const project = await loadProject(admin, userId, input.projectId);
  const platform = inferPlatform(input.task);
  let prepared: Prepared | null = null;
  let connected: ConnectedFacts | null = null;
  const connectedKinds = new Set<PrepKind>(["investor_update", "video_script", "post", "landing"]);

  if (kind === "competitor_brief") prepared = await competitorBrief(project);
  else if (kind === "validation_kit") prepared = await validationKit(project, input.task);
  else {
    const rows = PREP_META[kind].learns ? await loadLearnRows(admin, userId) : [];
    const lessons = learnedLessons(rows, kind);
    const ctx = { kind, task: input.task, firstStep: input.firstStep, platform, project, lessons } as Parameters<typeof draftContent>[0];
    if (kind === "investor_update") ctx.facts = await investorFacts(admin, userId, input.projectId, project);
    if (connectedKinds.has(kind)) {
      connected = await loadConnectedFacts(admin, userId);
      if (kind === "investor_update") ctx.facts = [...connected.facts, ...(ctx.facts ?? [])];
      ctx.shipped = connected.shipped;
    }
    if (kind === "seo") {
      try { const r = await webSearch(`${project.name} ${project.problem || project.description}`.slice(0, 120), 6); ctx.serp = r.scraped ? r.results.filter((x) => /^https?:\/\//.test(x.url)).slice(0, 6).map((x) => ({ title: x.title, url: x.url, snippet: x.snippet })) : []; } catch { ctx.serp = []; }
    }
    prepared = await draftContent(ctx);
    if (prepared && kind === "seo" && ctx.serp?.length) {
      const sec = prepared.sections.find((s) => /what ranks now/i.test(s.heading));
      if (sec) sec.links = ctx.serp.map((s) => ({ title: s.title.slice(0, 120), url: s.url }));
    }
  }
  if (!prepared || !hasContent(prepared)) return null;

  const needs = [...prepared.needs];
  const has = (p: "stripe" | "github") => Boolean(connected?.connected.includes(p));
  if (kind === "investor_update") {
    if (!has("stripe")) needs.push({ label: "Connect Stripe for real revenue", why: "BuildMind reads your monthly recurring revenue, subscribers and last 30 days of payments, read-only, so the numbers are exact instead of placeholders.", connect: "stripe" });
    if (!has("github")) needs.push({ label: "Connect GitHub for what you shipped", why: "Merged pull requests become the \"what we shipped\" lines, read-only, for one repository.", connect: "github" });
    if (!has("stripe")) needs.push({ label: "Users and signups", why: "BuildMind only knows what you do inside it. Add those numbers where the draft says [add: ...]." });
  }
  if ((kind === "video_script" || kind === "post" || kind === "landing") && !has("github")) needs.push({ label: "Connect GitHub so this is about what you really shipped", why: "Read-only, one repository. Recent merged pull requests ground the script and the copy in real work.", connect: "github" });
  if (connected?.stale.length) needs.push({ label: "A connected app needs attention", why: `Could not read ${connected.stale.join(" and ")} just now, so older or no numbers were used. Reconnect it in Settings if this keeps happening.` });
  if (kind === "video_script") needs.push({ label: "Your screen recordings", why: "BuildMind writes the script and shot list. Record the clips on your phone or computer, then edit them with the captions below." });
  if (kind === "seo" && !prepared.sections.some((s) => s.links?.length)) needs.push({ label: "Live search results", why: "Search was unavailable, so this brief is general. Run it again later for one grounded in what ranks now." });
  return { kind, platform, prepared: { ...prepared, needs } };
}
