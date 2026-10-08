import type { EvidenceLayer } from "@/lib/breakEvidence";

export type RiskSeverity = "Critical" | "High" | "Medium" | "Low";

export interface RiskItem {
  category: string;
  severity: RiskSeverity;
  description: string;
  mitigation: string;
  /** Which of the founder's SELECTED focus areas this risk relates to. */
  relatedFocusAreas?: string[];
}

export interface PivotItem {
  title: string;
  description: string;
  target_niche: string;
  why_better: string;
  estimated_score_delta: number;
  key_change: string;
  relatedFocusAreas?: string[];
}

export interface CompetitorRow {
  name: string;
  url?: string;
  weakness: string;
  threat_level: "low" | "medium" | "high";
}

export type FocusAreaCoverage = { selected: string[]; addressed: string[]; unaddressed: string[] };

export interface BreakResult {
  evidence?: EvidenceLayer;
  overallRisk: RiskSeverity;
  summary: string;
  risks: RiskItem[];
  survival_probability?: number;
  brutal_advice?: string;
  gated?: boolean;
  score_note?: string;
  agents?: Array<{ name: string; status: string; summary: string; confidence?: number }>;
  signalBreakdown?: Array<{ key: string; label: string; value: number; tip?: string }>;
  isSynthetic?: boolean;
  focusAreas?: string[];
  executionPlan?: { mvp_roadmap?: string[]; first_10_actions?: string[]; gtm_plan?: string[] } | null;
  pivots?: PivotItem[];
  competitorTable?: CompetitorRow[];
  surviveReasons?: string[];
  surviveReasonTags?: string[][];
  focusAreaCoverage?: FocusAreaCoverage | null;
  signalScores?: { demand: number; competition: number; timing: number; uniqueness: number; risk: number };
  reflexionAction?: {
    action?: string;
    rationale?: string;
    confidence?: number;
    supporting_signals?: string[];
    risks?: string[];
    log_row_id?: string | null;
  } | null;
}
