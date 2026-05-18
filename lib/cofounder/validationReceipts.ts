/**
 * lib/cofounder/validationReceipts.ts
 *
 * CoFounder Core — Module 2: Validation Receipt System
 *
 * Builds a "receipt bank" of real human responses over time.
 * Every idea logged in BuildMind generates:
 *   - A pre-written cold DM template for one target user
 *   - A question to post in a relevant community (Reddit, Discord, X)
 *   - A one-liner problem hypothesis
 *
 * When a human responds, their response is logged as a ValidationReceipt
 * and stored in founderMemory. During competitor spirals, the coach pulls
 * these receipts to ground the founder in real evidence.
 */

import { ValidationReceipt } from "./competitorReframe";
import { getLimits } from "@/lib/plan";
import { storage } from "@/lib/storage";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ValidationAction {
  coldDmTemplate: string;
  communityQuestion: string;
  problemHypothesis: string;
  suggestedChannels: string[]; // e.g. ["r/startups", "Indie Hackers", "Twitter/X"]
  targetPersonaDescription: string;
}

export interface ValidationActionRequest {
  ideaTitle: string;
  ideaDescription: string;
  targetUser: string;
  problemStatement: string;
  stage: string; // "idea" | "validation" | "building" | "launched"
}

// ─── Local storage layer ──────────────────────────────────────────────────────

const RECEIPTS_KEY = "bm_validation_receipts";

export function getValidationReceipts(): ValidationReceipt[] {
  if (typeof window === "undefined") return [];
  return storage.getJSON<ValidationReceipt[]>(RECEIPTS_KEY, []);
}

export function saveValidationReceipt(receipt: Omit<ValidationReceipt, "id">): ValidationReceipt {
  const full: ValidationReceipt = {
    ...receipt,
    id: `vr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  };
  const existing = getValidationReceipts();
  existing.unshift(full); // newest first
  if (typeof window !== "undefined") {
    storage.setJSON(RECEIPTS_KEY, existing);
  }
  return full;
}

export function deleteValidationReceipt(id: string): void {
  if (typeof window === "undefined") return;
  storage.setJSON(RECEIPTS_KEY, getValidationReceipts().filter(r => r.id !== id));
}

/** Returns receipts where a human confirmed the problem exists */
export function getConfirmedReceipts(): ValidationReceipt[] {
  return getValidationReceipts().filter(r => r.problemConfirmed);
}

/** Formats receipts as a readable summary for AI context injection */
export function formatReceiptsForAIContext(receipts: ValidationReceipt[]): string {
  if (!receipts.length) return "No validation receipts yet.";
  return receipts
    .slice(0, 5) // top 5 most recent
    .map(r => `- ${r.personName} (${r.channel}, ${r.date.slice(0, 10)}): "${r.quote}"`)
    .join("\n");
}

// ─── Validation action generator ──────────────────────────────────────────────

/**
 * Generates a ValidationAction for a given idea.
 * On free plan: returns a basic template only.
 * On Builder plan: calls /api/cofounder/validation-action for AI-generated, personalised outreach.
 */
export async function generateValidationAction(
  req: ValidationActionRequest
): Promise<ValidationAction> {
  const limits = getLimits();

  if (!limits.unlimitedAITasks) {
    // Free plan: return generic template structure
    return {
      coldDmTemplate: `Hi [Name], I'm working on a tool that helps ${req.targetUser} with ${req.problemStatement}. Would you be open to sharing how you currently handle this? Takes 5 minutes. Happy to share what I'm building in return.`,
      communityQuestion: `Anyone here deal with ${req.problemStatement}? I'm researching this for a potential tool — would love to hear how you currently handle it.`,
      problemHypothesis: `${req.targetUser} struggle with ${req.problemStatement} and currently have no efficient solution.`,
      suggestedChannels: ["Reddit", "Indie Hackers", "Twitter/X"],
      targetPersonaDescription: req.targetUser,
    };
  }

  // Builder plan: full AI-generated personalised outreach
  const res = await fetch("/api/cofounder/validation-action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });

  if (!res.ok) throw new Error("Validation action API failed");
  return res.json();
}
