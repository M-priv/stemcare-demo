/**
 * MedGemma Assistive-Only Guardrails (demo port)
 *
 * Adapted from STEMCare (`apps/web/src/lib/policy/medgemmaSafetyPolicy.ts` +
 * `apps/web/src/lib/ai/medgemma/assistiveOnlyGuardrails.ts`).
 *
 * Scope note (honest deltas from the production surface):
 * - Production wraps this policy in the Unified Guardian
 *   (`apps/web/src/lib/ai/guardian/`) with fail-closed semantics: Guardian
 *   WARN ⇒ abstain, UNSAFE ⇒ abstain, and every decision emits a compliance
 *   record. The Guardian depends on server-side registry/telemetry
 *   infrastructure and cannot run in this static demo — the fail-closed
 *   WARN path is therefore NOT present here.
 * - The interviewer's "question only" output contract is enforced by
 *   `validateGeneratedQuestion` in `interviewPrioritization.ts`.
 * - This module gates the demo's reviewer-role output (the differential
 *   hypothesis cards) exactly as the production policy gates reviewer
 *   output, so any later content change that drifts into definitive
 *   diagnosis or prescribing language is caught at runtime.
 */

export type AssistiveGuardrailAction = 'allow' | 'abstain' | 'escalate';

export interface AssistiveGuardrailDecision {
  action: AssistiveGuardrailAction;
  reason?: string;
  triggeredRules?: string[];
}

// Ported verbatim from STEMCare medgemmaSafetyPolicy.ts ESCALATION_PATTERNS.
const ESCALATION_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /call\s*(999|911)\s*(now|immediately|right away)/i, reason: 'Emergency language detected that requires immediate clinician escalation.' },
  { pattern: /go\s*to\s*(a&e|emergency department|er)\s*(now|immediately|right away)/i, reason: 'Emergency department directive detected; requires clinician-led escalation.' },
  { pattern: /medical\s+emergency/i, reason: 'Output frames presentation as a medical emergency and must be escalated.' },
  { pattern: /suicidal\s+ideation|self-harm|homicidal/i, reason: 'Acute safety-risk language detected and must be escalated.' },
];

// Ported verbatim from STEMCare medgemmaSafetyPolicy.ts ABSTAIN_PATTERNS.
const ABSTAIN_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\b(definitive|confirmed|final)\s+diagnosis\b/i, reason: 'Definitive diagnosis language detected; the harness must remain assistive.' },
  { pattern: /\byou\s+(definitely|certainly)?\s*have\b/i, reason: 'Patient-level definitive diagnosis detected; clinician confirmation is required.' },
  { pattern: /\b(diagnosis\s+is|this\s+is\s+diagnosed\s+as)\b/i, reason: 'Autonomous diagnosis statement detected; the harness must abstain.' },
  { pattern: /\b(start|prescribe|initiate|increase|stop)\b[^.\n]{0,80}\b\d+\s?(mg|mcg|g|ml)\b/i, reason: 'Direct prescribing instruction with dose detected; requires clinician decision.' },
];

/**
 * Reviewer-role policy gate. Escalation and abstention patterns run first,
 * matching the production policy's rule order. Low-certainty abstention and
 * ambiguity scoring are production-side (ambiguityScoring) and are not
 * reproduced here; this demo's hypothesis content is curated and the gate
 * exists to catch drifted language, not to score certainty.
 */
export function evaluateAssistiveOnlyGuardrails(text: string): AssistiveGuardrailDecision {
  const triggered: string[] = [];

  for (const check of ESCALATION_PATTERNS) {
    if (check.pattern.test(text)) {
      triggered.push(check.reason);
      return {
        action: 'escalate',
        reason: check.reason,
        triggeredRules: triggered,
      };
    }
  }

  for (const check of ABSTAIN_PATTERNS) {
    if (check.pattern.test(text)) {
      triggered.push(check.reason);
      return {
        action: 'abstain',
        reason: check.reason,
        triggeredRules: triggered,
      };
    }
  }

  return {
    action: 'allow',
    triggeredRules: [],
  };
}

// Ported from STEMCare assistiveOnlyGuardrails.ts.
export function buildAssistiveOnlyEscalationNote(reason: string): string {
  return `Assistive-only guardrail escalated this AI output. Reason: ${reason} Clinician-led assessment is required.`;
}

export function buildAssistiveOnlyAbstainNote(reason: string): string {
  return `Assistive-only guardrail abstained from returning AI guidance. Reason: ${reason} Please proceed with manual clinician review.`;
}
