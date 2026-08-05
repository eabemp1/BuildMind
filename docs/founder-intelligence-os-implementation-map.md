# Founder Intelligence OS Implementation Map

This map was produced before implementation to preserve existing BuildMind surfaces and integrate them into a coherent intelligence layer rather than replacing them.

## 1. Current architecture map

| System | Consumes | Derives | Stores | Consumers | Influences recommendations? | Influences future behavior? | Duplication / overlap |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `founder_context` | task completion, reflection, overrides, onboarding, billing/trial state | momentum, inactivity, streak/task counters, repeated topics, active pattern, cognitive load | `founder_context` | Today API, cognition, reports, achievements, recovery, nav | Yes, via prompt context and momentum/cognitive load | Yes, future prompts and scoring | Overlaps with `founder_memory` avoidance/topics and `user_behavior_state` daily state |
| `founder_memory` | founder insight synthesis, archetype, task completion strengths/avoidance, blocker intelligence | personality tags, strengths, avoidance zones, cofounder style, insights, validation receipts | `founder_memory` | Today API, cognition, archetype, reports, weekly pulse | Yes, mainly prompt shaping | Yes, but mostly as flattened arrays/tags | Overlaps with `founder_context.avoidance_zones` and learned patterns |
| `user_behavior_state` | today cache, check-in dates, UI/device state | cached current action, done-state, light daily behavior | `user_behavior_state` | Today page/API, cache, reports | Indirectly via anti-repeat cache | Weakly | Overlaps with action/reflection state but useful for low-latency UI sync |
| `reflexion_learning_log` | action shown, action outcome, verifier/score metadata | completion preferences, avoided action types/platforms, weak output types | `reflexion_learning_log`; derived cache in `founder_context.learned_patterns` | Break My Startup, reports, Today personalization | Partially; stronger in Break My Startup than Today | Yes when outcomes are recorded | Overlaps with reflections/action logs but has recommendation-specific fields |
| `activity_log` | product events | temporal behavior and usage traces | `activity_log` | behavioral layers, cognition | Indirectly via temporal prompt blocks | Yes if surfaced | Overlaps with action logs for execution events |
| `action_logs` | task-complete and cron/report pathways | weekly task outcomes for reporting | `action_logs` | weekly reports, reports page | Not directly | Weakly | Overlaps with reflexion learning log |
| `reflections` | founder daily reflection | outcome, confidence, blocker, learned info, rich reflection fields | `reflections` | Today, cognition, behavioral layers, reports, stage transition | Yes, strongly via prompt context | Yes through pattern extraction and learning closure | Overlaps with action logs and learning log outcome fields |
| `projects` | onboarding/project settings | startup stage/problem/target/users/MRR context | `projects` | Today, dashboard, reports, stage transitions | Yes, as project context and stage goal anchor | Yes | Startup state is broad but not relationship-rich |
| `milestones` | generated roadmap/manual edits | active/incomplete goals, progress | `milestones` | Today, projects, reports, weekly pulse | Weakly, as active goals/pending milestones | Weakly | Acts as goal proxy, but lacks explicit goal semantics |
| `tasks` | generated roadmap/manual edits/completion | task progress and priority | `tasks` | Today, projects, reports, stage transitions | Weakly, as pending task list | Yes through completion state | Task outcomes are fragmented across tasks/reflections/logs |
| Temporal profile | `activity_log` | peak hours, dropout hours, streak fragility, session trend | computed only | behavioral layers | Only via prompt block | Not durable | Duplicates some inactivity/momentum concepts |
| Execution signature | reflections/tasks | strengths, avoidance zones, duration/type completion | computed only | behavioral layers | Via prompt block | Not durable | Overlaps learned patterns and founder memory |
| Founder gap detection | reflections, founder context, user behavior cache | missing user conversations, untested assumptions, busywork, revenue avoidance | computed only | morning briefing | Yes in morning briefing | Not durable | Overlaps with proposed evidence/slippage signals |
| Cognition synthesis | founder context, founder memory, reflections, activity | narrative founder cognition state | in-memory cache only | Today prompt | Yes, as prompt block | Cache expires; not durable | Summarizes signals already elsewhere |
| Reflexion loop | flattened context, prompt blocks, task seed | generated/critic/refined action | result logged/cached | Today API/UI | Primary live recommendation mechanism | Yes if outcome recorded | LLM-heavy; needs structured state upstream |
| Personalization context | learning log, reflections, milestones | recent tasks, recent reflections, blockers, active goals | computed only | Today API/stream | Yes, prompt injection | Not durable | Overlaps cognition and learning |
| Knowledge retrieval | founder knowledge base embeddings/static entries | precedent/advice matches | computed only | Today/agents | Yes, prompt injection and drafts | No | Low overlap; useful context source |
| Morning briefing | founder context, project context, gap detection | win/risk/action/gaps | `morning_briefings` | morning briefing API/push | Yes for briefing action | Limited | Overlaps Today recommendations |
| Weekly systems | score history, founder memory, learning/reflection/action logs, milestones/tasks | weekly reports, pulse, summaries | report/memory fields | reports/cron/emails | Indirect | Yes if summaries injected | Potential overlap with temporal diff layer |
| Score systems | task completion/reflection/activity | momentum, streak, score history, XP | `founder_context`, `score_history` | dashboard/reports/Today | Yes via momentum and emotional triggers | Yes | Multiple score concepts exist but are stabilizing around RPCs |

## 2. Intelligence dependency graph

```text
Raw events/data
  ├─ projects/milestones/tasks
  ├─ reflections
  ├─ activity_log
  ├─ reflexion_learning_log
  ├─ action_logs
  ├─ founder_context
  ├─ founder_memory
  └─ user_behavior_state

Existing derived intelligence
  ├─ temporal profile
  ├─ execution signature
  ├─ learned patterns
  ├─ gap detection
  ├─ cognition synthesis
  ├─ behavioral layers
  ├─ score/momentum systems
  └─ Today personalization

New coherence layer
  ├─ FounderState
  ├─ StartupState
  ├─ StrategyState
  ├─ ExecutionState
  ├─ TemporalState
  ├─ IntelligenceSignal[]
  └─ ranked DecisionCandidate[]

Consumers
  ├─ Today API / Today UI
  ├─ Reflexion prompt context
  ├─ Morning briefing
  ├─ Founder Mirror
  ├─ Reports / weekly systems
  └─ future learning/evaluation
```

## 3. Data-flow problems

1. Many systems compute useful intelligence but return prompt strings rather than typed machine-readable state.
2. Learned patterns are stronger than recent-history prompt blocks but are not central enough to Today.
3. Goals are inferred from milestones and hardcoded stage objectives, not modeled as explicit strategic state.
4. Outcome logs are fragmented across reflections, action logs, learning logs, tasks, and user behavior cache.
5. Temporal change is mostly implicit; weekly/daily deltas are not available as shared state.
6. Recommendations are selected by the LLM rather than by deterministic candidate ranking with explanations.
7. Founder memory collapses observations into arrays/tags without confidence, evidence, lifecycle, or decay.
8. Existing intelligence can be generated but not surfaced or used consistently.

## 4. Proposed coherence architecture

Add a thin orchestration layer in `lib/founderIntelligence.ts` that derives structured state from existing systems without replacing them:

- `FounderIntelligenceState`
- `FounderState`
- `StartupState`
- `StrategyState`
- `ExecutionState`
- `TemporalCoherenceState`
- `IntelligenceSignal`
- `DecisionCandidate`
- `DecisionState`

This layer should:

1. Load existing rows from current tables.
2. Reuse existing pure intelligence modules where possible.
3. Produce typed signals with evidence and confidence.
4. Generate/rank candidate actions deterministically.
5. Provide a compact prompt block for Reflexion.
6. Return a user-facing summary that Today can expose.

## 5. Exact files/modules to modify

- Add `lib/founderIntelligence.ts`.
- Add tests in `__tests__/lib/founderIntelligence.test.ts`.
- Update `app/api/ai/today-action/route.ts` to load and inject the coherence layer.
- Add this architecture map document.

## 6. New data structures required

No new database tables in the first increment.

New TypeScript structures only:

- `IntelligenceSignal`
- `FounderState`
- `StartupState`
- `StrategyState`
- `ExecutionState`
- `TemporalCoherenceState`
- `DecisionCandidate`
- `DecisionState`
- `FounderIntelligenceState`

## 7. Existing infrastructure reused

- `buildExecutionSignature`
- `buildTemporalProfile`
- `deriveLearnedPatterns`
- founder context/memory
- reflections
- milestones/tasks
- activity logs
- learning logs
- action logs
- Today personalization and Reflexion

## 8. What will not be changed

- No major product surface will be removed.
- Reflexion will not be removed.
- Behavioral layers will not be removed.
- Founder memory/context systems will not be replaced.
- Existing task/action UX remains intact.
- No new heavyweight schema ontology will be introduced in this increment.

## 9. Implementation sequence

1. Create coherence-layer types and pure derivation functions.
2. Add typed signal generation for repeated avoidance, evidence gaps, busywork, goal slippage, momentum change, recommendation rejection, and founder behavior change.
3. Add deterministic candidate generation and ranking.
4. Add prompt rendering for structured intelligence.
5. Wire Today API to include the coherence-layer prompt and response metadata.
6. Add tests for signal derivation and candidate ranking.
7. Run typecheck/tests.

## 10. Risk assessment

- **Risk:** More data fetching in Today API. **Mitigation:** use bounded queries and parallel fetches.
- **Risk:** Duplicated interpretation. **Mitigation:** derive from existing modules and keep the coherence layer read-only.
- **Risk:** Overconfident signals. **Mitigation:** every signal has confidence, severity, and evidence.
- **Risk:** LLM ignores structured state. **Mitigation:** inject concise ranked decision brief and expose structured response data.
- **Risk:** UI not yet upgraded. **Mitigation:** API response includes `intelligence` metadata for future Today UI layering.
