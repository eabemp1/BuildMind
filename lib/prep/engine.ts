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
import { webSearch, discussionSearch } from "@/lib/search";
import { getFounderSnapshot } from "@/lib/server/founderSnapshot";
import { isTodayFlowSession } from "@/lib/todayFlowSessions";
import { draftContent, keepPastBehaviourQuestions, unsupportedNumbers, type ProjectCtx } from "@/lib/distribution/engine";
import { searchPromptBlock, searchSections } from "@/lib/integrations/searchConsole";
import { fallbackPrep } from "@/lib/prep/fallback";
import { loadInferredContext } from "@/lib/prep/context";
import { learnedLessons, type LearnRow } from "@/lib/prep/learning";
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

type PreparedRow = { kind: PrepKind; payload: Prepared | null; chosen_variant: string | null; final_text: string | null; outcome: string | null; status: string };

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

export async function validationKit(project: ProjectCtx, task: string, inferred = ""): Promise<Prepared> {
  try {
    const raw = await callModelJSON<Record<string, unknown>>([{ role: "user", content: `You are preparing an interview kit for a solo founder doing customer discovery. Ask about past behaviour, never about hypothetical future use of the product. No flattery.

PROJECT: ${project.name}: ${project.description}
Problem: ${project.problem || "not stated"}
Who it is for: ${project.targetUsers || "not stated"}
Task today: ${task}
${inferred}

Return JSON: {"summary":"","sections":[{"heading":"Who to talk to","bullets":["where to find 5 to 10 of them, specific places"]},{"heading":"Screener","bullets":["2 yes/no questions to confirm they fit"]},{"heading":"Interview questions","bullets":["6 questions about what they did last time"]},{"heading":"What counts as evidence","bullets":["3 signals"]},{"heading":"Stop signals","bullets":["2 signals"]}]}` }], { maxTokens: 1400 });
    const p = normalizePrepared(raw, "validation_kit");
    const qs = p.sections.find((s) => /interview questions/i.test(s.heading));
    if (qs?.bullets) qs.bullets = keepPastBehaviourQuestions(qs.bullets);
    if (!qs?.bullets || qs.bullets.length < 4) return validationFallback(project);
    return p;
  } catch { return validationFallback(project); }
}

// ── Pricing and prospects (grounded in live search) ─────────────────────────

type Hit = { title: string; url: string; snippet: string };
const hitText = (h: Hit) => `${h.title} ${h.snippet} ${h.url}`;
const strs = (v: unknown, n: number, len = 220): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, len)).filter(Boolean).slice(0, n) : []);

async function search(q: string, n: number): Promise<Hit[]> {
  try { const r = await webSearch(q.slice(0, 140), n); return r.scraped ? r.results.filter((x) => /^https?:\/\//.test(x.url)).slice(0, n).map((x) => ({ title: x.title, url: x.url, snippet: x.snippet })) : []; } catch { return []; }
}

/** A price shown to the founder must appear in the source it cites. */
export function groundedPrices(raw: unknown, hits: Hit[]): Array<{ name: string; price: string; source: number }> {
  const list = Array.isArray((raw as { others?: unknown })?.others) ? (raw as { others: unknown[] }).others : [];
  const out: Array<{ name: string; price: string; source: number }> = [];
  for (const c of list.slice(0, 6)) {
    const o = (c ?? {}) as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim().slice(0, 60) : "";
    const price = typeof o.price === "string" ? o.price.trim().slice(0, 80) : "";
    const hit = Number.isInteger(Number(o.source)) ? hits[Number(o.source) - 1] : undefined;
    if (!name || !price || !hit) continue;
    const first = norm(name).split(" ")[0];
    const text = norm(hitText(hit));
    if (!first || !text.includes(first) || !text.includes(norm(price))) continue;
    out.push({ name, price, source: Number(o.source) });
  }
  return out;
}

export async function pricingTest(project: ProjectCtx, task: string, inferred: string): Promise<Prepared | null> {
  const hits = await search(`${project.name} ${project.description.slice(0, 80)} alternatives pricing plans`, 6);
  const src = hits.map((h, i) => `[${i + 1}] ${h.title} (${h.url}): ${h.snippet.slice(0, 240)}`).join("\n");
  let raw: unknown;
  try {
    raw = await callModelJSON<unknown>([{ role: "user", content: `You are preparing a pricing test for a solo founder. Never state a price unless it appears in the search results below. Suggest tests as relative positions (for example "a little under [name]'s paid plan") or as [add: your price]. Ask about past behaviour (what they pay now, what they tried), never about hypothetical future purchases. No flattery.

PROJECT: ${project.name}: ${project.description}
Who it is for: ${project.targetUsers || "not stated"}
Task today: ${task}
${inferred}

SEARCH RESULTS:
${src || "(none available)"}

Return JSON: {"summary":"one sentence","others":[{"name":"product as written in the result","price":"the price exactly as written in the result","source":1}],"tests":["3 ways to test price this week, each one sentence"],"questions":["5 questions about what they pay for today and what they tried"],"signals":["3 things that would count as real willingness to pay"]}` }], { maxTokens: 1300 });
  } catch { return null; }
  const o = (raw ?? {}) as Record<string, unknown>;
  const others = groundedPrices(raw, hits);
  const allowed = `${hits.map(hitText).join(" ")} ${task}`;
  const tests = strs(o.tests, 3).filter((t) => !unsupportedNumbers(t, allowed).length);
  const qs = keepPastBehaviourQuestions(strs(o.questions, 6));
  const signals = strs(o.signals, 3).filter((t) => !unsupportedNumbers(t, allowed).length);
  if (!tests.length && !qs.length) return null;
  const needs = hits.length ? [] : [{ label: "Live pricing data", why: "Search was unavailable, so no competitor prices are shown. Run it again later to see what others charge." }];
  return normalizePrepared({
    title: "Pricing test",
    summary: typeof o.summary === "string" && o.summary.trim() ? o.summary : "A way to learn what people will pay before you set a price.",
    sections: [
      ...(others.length ? [{ heading: "What others charge", bullets: others.map((c) => `${c.name}: ${c.price}`), links: others.map((c) => ({ title: hits[c.source - 1].title, url: hits[c.source - 1].url })) }] : []),
      ...(tests.length ? [{ heading: "Ways to test a price this week", bullets: tests }] : []),
      ...(qs.length >= 3 ? [{ heading: "Ask these (about what they do today)", bullets: qs }] : []),
      ...(signals.length ? [{ heading: "What counts as a real signal", bullets: signals }] : []),
    ],
  }, "pricing_test", { needs });
}

const THREAD_HOST_RE = /^https?:\/\/(?:www\.|old\.)?(?:reddit\.com\/r\/[^/]+\/comments\/|news\.ycombinator\.com\/item\?id=)/i;

/** Real, current discussion threads (Reddit, Hacker News) on the problem. Only results that were actually fetched; never invented. */
export async function discussionThreads(q: string): Promise<Hit[]> {
  try {
    const r = await discussionSearch(q.slice(0, 140), 8);
    if (!r.scraped) return [];
    return r.results.filter((x) => THREAD_HOST_RE.test(x.url)).slice(0, 4).map((x) => ({ title: x.title.slice(0, 120), url: x.url, snippet: x.snippet }));
  } catch { return []; }
}

export async function prospectMap(project: ProjectCtx, task: string, inferred: string): Promise<Prepared | null> {
  const who = project.targetUsers || project.name;
  const [a, b, threads] = await Promise.all([
    search(`where do ${who} discuss ${project.problem || project.description.slice(0, 60)} community forum subreddit`, 6),
    search(`${who} newsletter OR slack OR discord OR group`, 5),
    discussionThreads(`${who} ${project.problem || project.description.slice(0, 60)}`),
  ]);
  const seen = new Set<string>();
  const hits = [...a, ...b].filter((h) => { const k = h.url.replace(/^https?:\/\/(www\.)?/, "").split("?")[0]; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 8);
  const src = hits.map((h, i) => `[${i + 1}] ${h.title} (${h.url}): ${h.snippet.slice(0, 200)}`).join("\n");
  let raw: unknown;
  try {
    raw = await callModelJSON<unknown>([{ role: "user", content: `You are helping a solo founder find the first ten people to talk to. Name a place only if it appears in the search results below, and cite its number. Never invent a community, a person or a link. No flattery.

PROJECT: ${project.name}: ${project.description}
Who it is for: ${who}
Task today: ${task}
${inferred}

SEARCH RESULTS:
${src || "(none available)"}

Return JSON: {"summary":"one sentence","places":[{"name":"place as written in the result","why":"why these people are there, from the result","source":1}],"profile":["4 traits of someone worth messaging, specific to this project"],"queries":["4 searches the founder can run today to find individuals"],"start":"one sentence on how to open a first conversation there without pitching"}` }], { maxTokens: 1200 });
  } catch { return null; }
  const o = (raw ?? {}) as Record<string, unknown>;
  const placesRaw = Array.isArray(o.places) ? o.places : [];
  const places: Array<{ name: string; why: string; source: number }> = [];
  for (const x of placesRaw.slice(0, 6)) {
    const q = (x ?? {}) as Record<string, unknown>;
    const name = typeof q.name === "string" ? q.name.trim().slice(0, 70) : "";
    const hit = Number.isInteger(Number(q.source)) ? hits[Number(q.source) - 1] : undefined;
    const first = norm(name).split(" ")[0];
    if (!name || !hit || !first || !norm(hitText(hit)).includes(first)) continue;
    places.push({ name, why: typeof q.why === "string" ? q.why.trim().slice(0, 160) : "", source: Number(q.source) });
  }
  const profile = strs(o.profile, 4); const queries = strs(o.queries, 4, 140);
  if (!places.length && !profile.length) return null;
  return normalizePrepared({
    title: "Prospect map",
    summary: typeof o.summary === "string" && o.summary.trim() ? o.summary : "Where the people you want to talk to already are.",
    sections: [
      ...(places.length ? [{ heading: "Where they are", bullets: places.map((c) => `${c.name}${c.why ? `: ${c.why}` : ""}`), links: places.map((c) => ({ title: hits[c.source - 1].title, url: hits[c.source - 1].url })) }] : []),
      ...(threads.length ? [{ heading: "Conversations you can join today", bullets: threads.map((t) => t.title), links: threads.map((t) => ({ title: t.title, url: t.url })) }] : []),
      ...(profile.length ? [{ heading: "Who is worth messaging", bullets: profile }] : []),
      ...(queries.length ? [{ heading: "Searches to run today", bullets: queries }] : []),
      ...(typeof o.start === "string" && o.start.trim() ? [{ heading: "How to start", body: o.start.trim().slice(0, 260) }] : []),
    ],
  }, "prospects", { needs: places.length ? [] : [{ label: "Live search results", why: "Search was unavailable, so no specific communities are named. Run it again later for places that exist right now." }] });
}

// ── Orchestrator ────────────────────────────────────────────────────────────

export interface PrepResult { kind: PrepKind; platform: string; prepared: Prepared }

export async function generatePrep(
  admin: SupabaseClient,
  userId: string,
  input: { task: string; missionKind?: string | null; projectId?: string | null; firstStep?: string; idea?: string },
): Promise<PrepResult | null> {
  const kind = prepKindFor(input.task, input.missionKind);
  if (!kind) return null;
  // A founder testing an idea that is not a saved project gets prepared work about THAT idea, not their latest project.
  const project = input.idea ? { ...(await loadProject(admin, userId, input.projectId)), name: input.idea.split("\n")[0].slice(0, 80), description: input.idea.slice(0, 600), problem: "", targetUsers: "" } : await loadProject(admin, userId, input.projectId);
  const platform = inferPlatform(input.task);
  let prepared: Prepared | null = null;
  let connected: ConnectedFacts | null = null;
  const connectedKinds = new Set<PrepKind>(["investor_update", "video_script", "post", "landing", "launch_plan", "seo"]);

  const inferred = await loadInferredContext(admin, userId);
  if (kind === "competitor_brief") prepared = await competitorBrief(project);
  else if (kind === "validation_kit") prepared = await validationKit(project, input.task, inferred);
  else if (kind === "pricing_test") prepared = await pricingTest(project, input.task, inferred);
  else if (kind === "prospects") prepared = await prospectMap(project, input.task, inferred);
  else {
    const rows = PREP_META[kind].learns ? await loadLearnRows(admin, userId) : [];
    const lessons = learnedLessons(rows, kind);
    const ctx = { kind, task: input.task, firstStep: input.firstStep, platform, project, lessons, inferred } as Parameters<typeof draftContent>[0];
    if (kind === "investor_update") ctx.facts = await investorFacts(admin, userId, input.projectId, project);
    if (connectedKinds.has(kind)) {
      connected = await loadConnectedFacts(admin, userId);
      if (kind === "investor_update") ctx.facts = [...connected.facts, ...(ctx.facts ?? [])];
      ctx.shipped = connected.shipped;
      if (connected.search) ctx.searchData = searchPromptBlock(connected.search);
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
  if (!prepared || !hasContent(prepared)) return { kind, platform, prepared: fallbackPrep(kind, input.task, input.firstStep) };
  if (kind === "seo" && connected?.search) prepared = { ...prepared, sections: [...searchSections(connected.search), ...prepared.sections] };

  const needs = [...prepared.needs];
  const has = (p: "payments" | "github" | "search_console") => Boolean(p === "payments" ? connected?.revenue.length : connected?.connected.includes(p));
  if (kind === "investor_update") {
    if (!has("payments")) needs.push({ label: "Optional: connect your payment tool for exact revenue", why: "Stripe, Polar or Paystack, read-only, or type your own numbers. BuildMind then uses your real revenue, customers and last 30 days of payments instead of placeholders.", connect: "stripe" });
    if (!has("github")) needs.push({ label: "Optional: connect GitHub for what you shipped", why: "Merged pull requests become the \"what we shipped\" lines, read-only, for one repository.", connect: "github" });
    if (!has("payments")) needs.push({ label: "Users and signups", why: "BuildMind only knows what you do inside it. Add those numbers where the draft says [add: ...]." });
  }
    if (kind === "seo" && !has("search_console")) needs.push({ label: "Optional: connect Search Console", why: "Read-only. The brief then starts from queries your site already almost ranks for, using your own numbers instead of general advice.", connect: "search_console" });
  if (connected?.stale.length) needs.push({ label: "A connected app needs attention", why: `Could not read ${connected.stale.join(" and ")} just now, so older or no numbers were used. Reconnect it in Settings if this keeps happening.` });
  if (kind === "video_script") needs.push({ label: "Your screen recordings", why: "BuildMind writes the script and shot list. Record the clips on your phone or computer, then edit them with the captions below." });
  if (kind === "seo" && !prepared.sections.some((s) => s.links?.length)) needs.push({ label: "Live search results", why: "Search was unavailable, so this brief is general. Run it again later for one grounded in what ranks now." });
  return { kind, platform, prepared: { ...prepared, needs } };
}
