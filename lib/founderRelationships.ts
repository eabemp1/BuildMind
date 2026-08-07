/**
 * lib/founderRelationships.ts — Phase 8: Startup Relationship Model
 *
 * Builds an explicit, typed graph across existing entities:
 *
 *   Goal → Milestone → Task → Action(reflection) → Outcome → Evidence/Assumption
 *        → Decision (deterministic top candidate) → Metric
 *
 * This is intentionally NOT a new ontology or schema. It reuses:
 *   - tasks.milestone_id (already present — see 20260430000000_align_app_schema.sql)
 *   - reflections matched to tasks/milestones by title similarity
 *   - the FounderIntelligenceState already computed by lib/founderIntelligence.ts
 *
 * The objective is reasoning capability (e.g. "why does BuildMind believe
 * this goal is slipping, and what is the evidence chain?"), not theoretical
 * completeness. Consumers: Founder Mirror (lib/founderMirror.ts), and any
 * future UI that wants to show "trace this belief back to its source".
 */

import type { FounderIntelligenceInput, FounderIntelligenceState } from "@/lib/founderIntelligence";

export type RelationshipNodeType =
  | "goal"
  | "milestone"
  | "task"
  | "action"
  | "outcome"
  | "evidence"
  | "assumption"
  | "decision"
  | "metric";

export interface RelationshipNode {
  id: string;
  type: RelationshipNodeType;
  label: string;
  status?: string | null;
  timestamp?: string | null;
}

export interface RelationshipEdge {
  from: string;
  to: string;
  relation: string;
}

export interface StartupRelationshipGraph {
  nodes: RelationshipNode[];
  edges: RelationshipEdge[];
}

export interface RelationshipChain {
  milestone: RelationshipNode | null;
  path: RelationshipNode[];
  narrative: string;
}

const USER_EVIDENCE_KEYWORDS = /\b(user|customer|interview|feedback|talked|called|met|spoke|reply|response|commitment|preorder|paid|payment|signed up|signup)\b/i;

function titleMatch(a: string, b: string): boolean {
  const na = a.toLowerCase().trim();
  const nb = b.toLowerCase().trim();
  if (!na || !nb) return false;
  if (na === nb) return true;
  const shortest = Math.min(na.length, nb.length);
  const probe = shortest < 16 ? shortest : 16;
  return na.slice(0, probe) === nb.slice(0, probe);
}

/**
 * Builds the full relationship graph for a founder/project from raw entities
 * plus the already-derived FounderIntelligenceState (so Goal/Decision/Metric
 * nodes reuse the same synthesis rather than re-deriving it).
 */
export function buildStartupRelationshipGraph(
  input: FounderIntelligenceInput,
  state: FounderIntelligenceState,
): StartupRelationshipGraph {
  const nodes: RelationshipNode[] = [];
  const edges: RelationshipEdge[] = [];
  const milestones = input.milestones ?? [];
  const tasks = input.tasks ?? [];
  const reflections = input.reflections ?? [];

  const goalId = "goal:current";
  nodes.push({ id: goalId, type: "goal", label: state.startup.current_goal ?? "current startup goal" });

  const project = input.project ?? {};
  if (project.problem) {
    const id = "assumption:problem";
    nodes.push({ id, type: "assumption", label: `Target users have this problem: ${project.problem}` });
    edges.push({ from: goalId, to: id, relation: "depends_on_assumption" });
  }
  if (project.target_users) {
    const id = "assumption:target_users";
    nodes.push({ id, type: "assumption", label: `Target segment: ${project.target_users}` });
    edges.push({ from: goalId, to: id, relation: "depends_on_assumption" });
  }

  milestones.forEach((m, i) => {
    const milestoneId = m.id != null ? `milestone:${m.id}` : `milestone:idx:${i}`;
    nodes.push({ id: milestoneId, type: "milestone", label: String(m.title ?? "Untitled milestone"), status: m.status ?? null, timestamp: m.updated_at ?? m.created_at ?? null });
    edges.push({ from: goalId, to: milestoneId, relation: "advances_goal" });

    const linkedTasks = m.id != null ? tasks.filter((t) => t.milestone_id === m.id) : [];
    for (const t of linkedTasks) {
      const taskId = t.id != null ? `task:${t.id}` : `task:${milestoneId}:${t.title}`;
      nodes.push({ id: taskId, type: "task", label: String(t.title ?? "Untitled task"), status: t.is_completed || t.status === "completed" ? "completed" : t.status ?? "pending", timestamp: t.updated_at ?? t.created_at ?? null });
      edges.push({ from: milestoneId, to: taskId, relation: "contains_task" });

      const matchedReflections = reflections.filter((r) => titleMatch(String(r.today_action ?? ""), String(t.title ?? "")));
      matchedReflections.forEach((r, ri) => {
        const actionId = `action:${taskId}:${ri}`;
        nodes.push({ id: actionId, type: "action", label: String(r.today_action ?? t.title), timestamp: r.created_at ?? null });
        edges.push({ from: taskId, to: actionId, relation: "produced_action" });

        const outcomeId = `outcome:${actionId}`;
        nodes.push({ id: outcomeId, type: "outcome", label: String(r.outcome ?? "pending"), timestamp: r.created_at ?? null });
        edges.push({ from: actionId, to: outcomeId, relation: "resulted_in" });

        const evidenceText = String(r.what_learned ?? r.what_happened ?? r.note ?? "");
        if (evidenceText && USER_EVIDENCE_KEYWORDS.test(`${r.today_action ?? ""} ${evidenceText}`)) {
          const evidenceId = `evidence:${actionId}`;
          nodes.push({ id: evidenceId, type: "evidence", label: evidenceText.slice(0, 160), timestamp: r.created_at ?? null });
          edges.push({ from: outcomeId, to: evidenceId, relation: "produced_evidence" });
        }
      });
    }
  });

  if (state.decision.top_candidate) {
    const decisionId = "decision:top_candidate";
    nodes.push({ id: decisionId, type: "decision", label: state.decision.top_candidate.action, timestamp: state.generated_at });
    edges.push({ from: goalId, to: decisionId, relation: "next_recommended_step" });
  }

  Object.entries(state.startup.metrics).forEach(([key, value]) => {
    if (value === null || value === undefined) return;
    const metricId = `metric:${key}`;
    nodes.push({ id: metricId, type: "metric", label: `${key}: ${value}`, timestamp: state.generated_at });
    edges.push({ from: goalId, to: metricId, relation: "measured_by" });
  });

  return { nodes, edges };
}

/**
 * Traces the chain for a specific milestone (or the first active one) so a
 * belief ("this goal is slipping") can be explained as a path of evidence
 * rather than a bare assertion. Used by the Founder Mirror's "why" field.
 */
export function traceRelationshipChain(graph: StartupRelationshipGraph, milestoneLabel?: string | null): RelationshipChain {
  const milestone = milestoneLabel
    ? graph.nodes.find((n) => n.type === "milestone" && n.label === milestoneLabel) ?? null
    : graph.nodes.find((n) => n.type === "milestone") ?? null;

  if (!milestone) {
    return { milestone: null, path: [], narrative: "No milestone data available to trace." };
  }

  const path: RelationshipNode[] = [milestone];
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  let frontier = [milestone.id];
  const visited = new Set(frontier);

  // Breadth-first walk forward through downstream edges (task -> action -> outcome -> evidence).
  while (frontier.length) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const edge of graph.edges.filter((e) => e.from === id)) {
        if (visited.has(edge.to)) continue;
        visited.add(edge.to);
        const node = byId.get(edge.to);
        if (node && node.type !== "goal") {
          path.push(node);
          next.push(edge.to);
        }
      }
    }
    frontier = next;
  }

  const narrative = path
    .map((n) => `${n.type}(${n.label.slice(0, 60)})`)
    .join(" → ");

  return { milestone, path, narrative };
}
