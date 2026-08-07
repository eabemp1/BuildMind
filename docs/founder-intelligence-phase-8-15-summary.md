# Founder Intelligence OS — Phases 8-15 Summary

This continues `docs/founder-intelligence-os-implementation-map.md` (Codex's
Phase 1-7 work: the coherence layer, typed signals, temporal comparison, and
the deterministic decision layer wired into `/api/ai/today-action`). This
document covers Phases 8-15.

## Files changed / added this pass

| File | Phase | What |
|---|---|---|
| `lib/founderRelationships.ts` | 8 | Explicit Goal→Milestone→Task→Action→Outcome→Evidence/Assumption→Decision→Metric graph, derived from existing `tasks.milestone_id` — no new schema. |
| `lib/founderMirror.ts` | 9 | Behavior-derived founder model with evidence trails, confidence, and honest "may be wrong about" section. |
| `app/api/founder-context/mirror/route.ts` | 9 | GET endpoint exposing the Founder Mirror. |
| `lib/learningLoop.ts` | 11 | PREDICT/OBSERVE/COMPARE/LEARN loop, built on the existing `reflexion_learning_log` table. |
| `supabase/migrations/20260605000000_founder_intelligence_learning_loop.sql` | 11 | Adds prediction columns to `reflexion_learning_log` + `intelligence_accuracy` to `founder_context`. No new tables. |
| `app/api/ai/today-action/route.ts` | 11 | Wired `recordFounderIntelligencePrediction` (PREDICT) after the coherence layer computes its top candidate. |
| `app/api/ai/today-action/stream/route.ts` | 10, 11 | **This is the primary Today path** (the non-stream route is a fallback). Codex's Phase 1-7 work had only wired the fallback route — the coherence layer was not actually influencing what most founders see. Wired `loadFounderIntelligence`, the prompt block, PREDICT, and `intelligence` in the client payload here too. |
| `app/api/founder-context/task-complete/route.ts` | 11 | Wired `compareFounderIntelligenceOutcome` (OBSERVE + COMPARE) after an outcome is recorded. |
| `lib/founderIntelligence.ts` | 11 | `FounderState.confidence` and `behavioral_trends` now factor in the rolling prediction accuracy from the learning loop, so confidence is earned over time rather than being a static function of row counts. |
| `app/today/components/IntelligencePanel.tsx` | 10 | Additive, collapsible "What BuildMind noticed" panel — layered above the existing task card, renders nothing if there's no signal yet. |
| `app/today/page.tsx` | 10 | Mounted `IntelligencePanel` above the existing action card; extended `ActionData` with an optional `intelligence` field. Nothing existing was removed or restructured. |
| `__tests__/lib/founderRelationships.test.ts`, `founderMirror.test.ts`, `learningLoop.test.ts` | 8, 9, 11 | Unit tests for the new modules. |
| `__tests__/eval/founderIntelligenceEval.test.ts` | 15 | Evaluation suite — synthetic scenario answering the spec's 11 test questions, plus explicit "current build baseline is weak" checks. |

All 57 tests in the above suites pass; `npm run lint` (the project's strict
`tsc` check) and a full `tsc --noEmit` across the repo are both clean.

---

## Phase 12 — Product surface preservation audit

Nothing was removed. Specifically checked:

- **Today** — the existing task card, streak/checkin UI, debt suppression
  flow, draft message editor, and reflexion metadata are all untouched. The
  new panel is a sibling element above the card, gated on data presence, and
  collapsed by default.
- **Reflexion Loop** (Generator/Critic/Refiner) — unchanged. The coherence
  layer only adds a prompt block (`founderIntelligencePromptBlock`) alongside
  the existing `cognitionBlock`, `lastReflectionContext`, and debt context.
  It does not replace any Reflexion stage.
- **Break My Startup** — untouched; `recordActionShown`/`compareFounderIntelligenceOutcome`
  are additive and use a distinct `prediction_source` so they don't collide
  with Break My Startup's existing learning-log rows.
- **Morning briefing, weekly systems, score systems** — not touched by this
  pass.

## Phase 13 — Model cost control audit

The coherence layer, relationship graph, Founder Mirror, and learning-loop
comparison are **all deterministic** — no LLM calls:

- `loadFounderIntelligence` / `deriveIntelligenceSignals` / `buildTemporalComparison` — pure computation over rows already fetched for other purposes.
- `buildStartupRelationshipGraph` / `traceRelationshipChain` — pure graph construction.
- `buildFounderMirror` — pure synthesis over `FounderIntelligenceState`.
- `compareFounderIntelligenceOutcome` / `updateIntelligenceAccuracy` — deterministic keyword-overlap scoring, no LLM.

The only LLM cost added is that `founderIntelligencePromptBlock` is now part
of the existing Generator prompt (`systemA`) in both today-action routes —
this is *context*, not an extra model call. No new LLM calls were introduced
by this pass, consistent with Phase 13's "don't use an LLM where deterministic
computation is sufficient."

## Phase 14 — Architectural debt identified (not yet resolved)

1. **Duplicated Today pipeline.** `app/api/ai/today-action/route.ts` and
   `app/api/ai/today-action/stream/route.ts` are two independent
   implementations of essentially the same Generator/Critic prompt assembly.
   Codex's Phase 1-7 pass only wired the coherence layer into the
   non-streaming fallback, which meant it had no effect on the primary path.
   This is now fixed for the coherence layer specifically, but the underlying
   duplication remains and is a real maintenance risk — every future prompt
   change has to be made twice. Recommend extracting a shared
   `buildTodayGeneratorPrompt()` in a future pass.
2. **Evidence-gap detection is keyword-only, not outcome-aware.** In
   `lib/founderIntelligence.ts`, `startup.evidence` is populated by matching
   `USER_EVIDENCE_KEYWORDS` against reflection text regardless of whether the
   reflection's outcome was `completed` or `blocked`. A founder who
   repeatedly *attempts and fails* to run interviews currently reads as
   "evidence exists" rather than "evidence attempted but not obtained." This
   was surfaced directly by the Phase 15 eval suite. Recommend filtering
   evidence extraction to non-blocked outcomes in a follow-up pass — flagged
   here rather than changed silently, since it affects existing signal
   thresholds Codex tuned.
3. **`reflexion_learning_log` now serves two purposes** (Break My Startup's
   original action-shown log, and the Founder Intelligence prediction log),
   distinguished only by the new nullable `prediction_source` column. This
   was the right call per "avoid unnecessary schema duplication," but if a
   third prediction source is ever added, this table should be revisited.
4. **No UI yet for the Founder Mirror API** (Phase 9's `/api/founder-context/mirror`
   route exists and is tested at the data layer, but there's no page
   surfacing it — Today only shows a condensed inline version via
   `IntelligencePanel`). Recommended next iteration.

## Remaining weaknesses / recommended next iteration

- Build a dedicated Founder Mirror page/surface consuming `/api/founder-context/mirror`.
- Resolve the Today pipeline duplication (debt item 1).
- Tighten evidence-gap detection to be outcome-aware (debt item 2).
- Extend the relationship graph (Phase 8) to also link `reflexion_learning_log`
  predictions as first-class nodes, so the Founder Mirror can show "this
  belief's accuracy over time," not just its origin.
- The eval suite (Phase 15) currently covers one synthetic scenario in depth;
  it should grow to 3-4 scenarios (healthy momentum, full stall, recovering
  founder) before being trusted as a regression gate.
