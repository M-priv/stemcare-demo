/**
 * Triage suggestion for the clinician review gate.
 *
 * Assistive-only: the suggestion is derived from the selected hypothesis's
 * own recommended action (the same evidence the clinician is reading), is
 * always displayed WITH its reason, and never blocks the clinician from
 * authorizing any disposition they choose.
 */

import type { DifferentialHypothesis } from '../types';

export type ActionPathway =
  | 'same_day_gp'
  | 'routine_gp'
  | 'specialist_referral'
  | 'emergency_transfer'
  | 'self_care_safety_net';

export interface TriageSuggestion {
  pathway: ActionPathway;
  reason: string;
}

const PATHWAY_LABELS: Record<ActionPathway, string> = {
  same_day_gp: 'Same-Day Urgent GP Review',
  routine_gp: 'Routine GP Consultation',
  specialist_referral: 'Direct Specialist Referral',
  emergency_transfer: 'Emergency Transfer (A&E / 999)',
  self_care_safety_net: 'Self-Care + Safety-Net',
};

export function suggestTriage(
  hypothesis: DifferentialHypothesis | undefined,
  hasRedFlag = false,
): TriageSuggestion {
  if (hasRedFlag) {
    return {
      pathway: 'emergency_transfer',
      reason: 'An emergency red flag was detected during intake; escalation overrides routine disposition.',
    };
  }

  if (!hypothesis) {
    return {
      pathway: 'same_day_gp',
      reason: 'No differential available; default to prompt in-person assessment.',
    };
  }

  const action = hypothesis.recommendedAction.toLowerCase();
  const bucket = hypothesis.confidenceBucket;
  const label = PATHWAY_LABELS;

  if (/\b(emergency|999|a&e|immediate (?:escalation|transfer))\b/.test(action)) {
    return {
      pathway: 'emergency_transfer',
      reason: `Primary hypothesis "${hypothesis.condition}" (${bucket} plausibility) carries an emergency escalation instruction.`,
    };
  }
  if (/\b(same.?day|urgent|prompt|priority| expedite)/i.test(action)) {
    return {
      pathway: 'same_day_gp',
      reason: `Recommended action for "${hypothesis.condition}" (${bucket} plausibility) asks for prompt in-person review.`,
    };
  }
  if (/\b(referral|refer|specialist|secondary care)\b/.test(action)) {
    return {
      pathway: 'specialist_referral',
      reason: `Recommended action for "${hypothesis.condition}" (${bucket} plausibility) points to specialist input.`,
    };
  }
  if (/\b(self.?care|safety.?net|advice only|no treatment)\b/.test(action)) {
    return {
      pathway: 'self_care_safety_net',
      reason: `Recommended action for "${hypothesis.condition}" (${bucket} plausibility) supports advice with safety-netting.`,
    };
  }

  // No explicit routing language: bucket-based fallback. A high-plausibility
  // primary hypothesis warrants prompt review; otherwise routine.
  if (bucket === 'high') {
    return {
      pathway: 'same_day_gp',
      reason: `Top hypothesis "${hypothesis.condition}" is high plausibility; prompt review avoids delay while the picture is active.`,
    };
  }
  return {
    pathway: 'routine_gp',
    reason: `Top hypothesis "${hypothesis.condition}" is ${bucket} plausibility with no urgency markers; routine review is appropriate.`,
  };
}

export function pathwayLabel(pathway: ActionPathway): string {
  return PATHWAY_LABELS[pathway];
}
