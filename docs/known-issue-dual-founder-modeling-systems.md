# Known issue: two independent founder-modeling pipelines

**Status:** open — logged, not fixed. Mirror Moment was wired into Founder
Mirror surface-only (see below); reconciliation is future work.
**Severity:** medium — no user-facing contradiction has been observed yet,
but nothing currently prevents one.

## The two systems

1. **`lib/founderIntelligence.ts` → `FounderIntelligenceState`**
   Powers: beliefs, skills, signals, decision ranking on the Founder Mirror
   page (`lib/founderMirror.ts`), Today's recommendation.
   Inputs: `projects`, `milestones`, `tasks`, `reflections`,
   `reflexion_learning_log`, `activity_log`, `action_logs`.
   Method: rule-derived strengths/avoidance patterns + a Thompson-Sampling
   Beta posterior (`sampleBeta`) over decision candidates, gated by
   evidence-based `IntelligenceSignal`s.

2. **`lib/behavioralLayers.ts` → `BehavioralContext`** ("seven-layer
   orchestrator": temporal, linguistic, execution/outcome-correlation,
   external anchors, mirror-moment, social, proactive-delivery)
   Powers: founder archetype, signature card, 30-day pattern report
   (`lib/mirrorMoment.ts`), surfaced on `/overview`, `/progress`,
   `/weekly-share`, and — as of this change — the Founder Mirror page.
   Inputs: `activity_log`, `reflections`, `founder_context`,
   `founder_memory`, `morning_briefing_cache`.
   Method: separate temporal/linguistic/execution analysis, its own
   archetype-selection logic.

Both independently compute a version of "what is this founder good at /
what do they avoid" from overlapping raw data, through different code paths.
Nothing currently checks that their conclusions agree.

## Why this matters

This is the same failure class already tracked in the core-invariants
doc — duplicate systems computing the same thing differently. Concretely: a
founder could see `FounderIntelligenceState` claim "strong at customer
discovery" in the Beliefs section while `BehavioralContext`'s execution
signature flags outreach as an avoidance zone in the Behavioral Archetype
section, on the same page, with no explanation of why they differ.

## What was done now (surface-only wiring)

`app/api/founder-context/mirror/route.ts` now also calls
`loadBehavioralContext()` and returns `data.behavioral`. The Founder Mirror
page renders it as its own clearly-labeled "Behavioral signature" section
(archetype name/tagline/strength/blind spot, signature card, pattern
report), visually and structurally separate from the Beliefs section, with
no attempt at reconciliation. This was the deliberate choice — it ships the
archetype/signature-card "wow" factor immediately without pretending the
two systems have been unified.

## Recommended fix path (not started)

Ranked by effort, from the original strategy discussion:

1. **Reconcile at read time** — before rendering, diff the two systems'
   conclusions (e.g. compare `BehavioralContext.execution`'s avoidance
   zones against `FounderIntelligenceState.founder.avoidance_patterns`);
   where they disagree, surface the tension explicitly (fits naturally into
   the existing "what may be wrong about" section) instead of silently
   picking one.
2. **Actually unify** — fold the seven-layer signals into
   `FounderIntelligenceState` as one more input (or the reverse), so there
   is one canonical founder model and the page renders slices of it. This
   is the option consistent with the project's own "one function, many
   callers" invariant philosophy, but it's a real refactor: both systems
   have independent test coverage and independent consumers
   (`today-action`, `/overview`, `/progress`, `/weekly-share`) that would
   need to be re-verified against the merged model.

Do not assume the Beliefs and Behavioral Archetype sections agree until one
of the above is done.
