/**
 * Deterministic Clinical Red Flag Detector
 *
 * Ported from STEMCare `apps/web/src/lib/ai/triage/redFlagDetector.ts` — the
 * full 22-pattern NHS/NICE set including negation handling. The demo-specific
 * rules at the end (anaphylaxis, serotonin toxicity, meningitis, malaria)
 * extend the canonical set for the curated scenarios; the canonical rules and
 * their NHS 999/111 routing are unchanged.
 *
 * Runs as a deterministic pre-generation gate on every patient message:
 * detection terminates the interview immediately, so no model latency sits
 * between an emergency presentation and its escalation guidance.
 */

export type RedFlagUrgency = 'call_999' | 'call_111' | 'same_day_gp';

export interface RedFlagDetection {
  detected: boolean;
  symptom?: string;
  urgency?: RedFlagUrgency;
  headline?: string;
  guidance?: string;
}

interface PatternRule {
  keywords: string[];
  matchType: 'all' | 'any';
  urgency: RedFlagUrgency;
  symptom: string;
  guidance: string;
}

/**
 * Canonical NHS red-flag patterns, ported verbatim from STEMCare.
 * Order matters — more specific patterns come first (e.g. chest pain with
 * cardiac features routes to 999 before the generic chest-pain → 111 rule).
 */
const RED_FLAG_RULES: PatternRule[] = [
  // === CALL 999 IMMEDIATELY ===
  {
    keywords: ['thunderclap', 'headache'],
    matchType: 'all',
    urgency: 'call_999',
    symptom: 'Thunderclap headache',
    guidance: 'This may indicate a serious neurological emergency. Seek emergency care immediately.',
  },
  {
    keywords: ['worst headache', 'ever'],
    matchType: 'all',
    urgency: 'call_999',
    symptom: 'Worst headache of life',
    guidance: 'This may indicate a serious neurological emergency. Seek emergency care immediately.',
  },
  // Demo extension: "worst headache of my life" is the more common lay
  // phrasing; the canonical rule above keys on "ever".
  {
    keywords: ['worst headache', 'life'],
    matchType: 'all',
    urgency: 'call_999',
    symptom: 'Worst headache of life',
    guidance: 'This may indicate a serious neurological emergency. Seek emergency care immediately.',
  },
  {
    keywords: ['chest pain', 'sweating'],
    matchType: 'all',
    urgency: 'call_999',
    symptom: 'Chest pain with sweating',
    guidance: 'This may indicate a heart attack. Seek emergency care immediately.',
  },
  {
    keywords: ['chest pain', 'arm'],
    matchType: 'all',
    urgency: 'call_999',
    symptom: 'Chest pain radiating to arm',
    guidance: 'This may indicate a heart attack. Seek emergency care immediately.',
  },
  {
    keywords: ['chest pain', 'jaw'],
    matchType: 'all',
    urgency: 'call_999',
    symptom: 'Chest pain radiating to jaw',
    guidance: 'This may indicate a heart attack. Seek emergency care immediately.',
  },
  {
    keywords: ["can't breathe", 'severe'],
    matchType: 'all',
    urgency: 'call_999',
    symptom: 'Severe breathing difficulty',
    guidance: 'This requires immediate medical attention. Seek emergency care now.',
  },
  {
    keywords: ['cannot breathe'],
    matchType: 'any',
    urgency: 'call_999',
    symptom: 'Breathing emergency',
    guidance: 'This requires immediate medical attention. Seek emergency care now.',
  },
  {
    keywords: ['face drooping', 'arm', 'speech'],
    matchType: 'all',
    urgency: 'call_999',
    symptom: 'Possible stroke (FAST symptoms)',
    guidance: 'These are signs of a stroke. Seek emergency care immediately - time is critical.',
  },
  {
    keywords: ['slurred speech', 'weak'],
    matchType: 'all',
    urgency: 'call_999',
    symptom: 'Possible stroke',
    guidance: 'These may be signs of a stroke. Seek emergency care immediately.',
  },
  {
    keywords: ['sudden weakness', 'side'],
    matchType: 'all',
    urgency: 'call_999',
    symptom: 'Sudden one-sided weakness',
    guidance: 'This may indicate a stroke. Seek emergency care immediately.',
  },
  {
    keywords: ['unconscious'],
    matchType: 'any',
    urgency: 'call_999',
    symptom: 'Loss of consciousness',
    guidance: 'This is a medical emergency. Seek emergency care immediately.',
  },
  {
    keywords: ['not responding'],
    matchType: 'any',
    urgency: 'call_999',
    symptom: 'Unresponsive person',
    guidance: 'This is a medical emergency. Seek emergency care immediately.',
  },
  {
    keywords: ['severe bleeding'],
    matchType: 'any',
    urgency: 'call_999',
    symptom: 'Severe bleeding',
    guidance: 'Apply pressure and seek emergency care immediately.',
  },
  {
    keywords: ['choking'],
    matchType: 'any',
    urgency: 'call_999',
    symptom: 'Choking',
    guidance: 'This is a medical emergency. Seek emergency care now.',
  },
  {
    keywords: ['overdose'],
    matchType: 'any',
    urgency: 'call_999',
    symptom: 'Possible overdose',
    guidance: 'Seek emergency care immediately. Do not leave the person alone.',
  },
  {
    keywords: ['suicide', 'kill myself'],
    matchType: 'any',
    urgency: 'call_999',
    symptom: 'Mental health crisis',
    guidance: 'Seek emergency care immediately. You can also call Samaritans on 116 123.',
  },
  {
    keywords: ['self harm', 'hurt myself'],
    matchType: 'any',
    urgency: 'call_111',
    symptom: 'Self-harm concerns',
    guidance: 'Please call 111 for urgent advice. You can also call Samaritans on 116 123.',
  },

  // === CALL 111 URGENT ===
  {
    keywords: ['chest pain'],
    matchType: 'any',
    urgency: 'call_111',
    symptom: 'Chest pain',
    guidance: 'Chest pain should be assessed urgently. Please call 111.',
  },
  {
    keywords: ['difficulty breathing'],
    matchType: 'any',
    urgency: 'call_111',
    symptom: 'Breathing difficulty',
    guidance: 'Please call 111 for urgent assessment.',
  },
  {
    keywords: ['blood', 'vomit'],
    matchType: 'all',
    urgency: 'call_111',
    symptom: 'Vomiting blood',
    guidance: 'This needs urgent assessment. Please call 111.',
  },
  {
    keywords: ['blood', 'stool'],
    matchType: 'all',
    urgency: 'call_111',
    symptom: 'Blood in stool',
    guidance: 'This needs medical assessment. Please call 111.',
  },
  {
    keywords: ['sudden vision', 'loss'],
    matchType: 'all',
    urgency: 'call_111',
    symptom: 'Sudden vision loss',
    guidance: 'This is an urgent symptom. Please call 111 immediately.',
  },

  // === DEMO SCENARIO EXTENSIONS (STEMCare-curated cases; canonical set above is unchanged) ===
  {
    keywords: ['throat', 'closing'],
    matchType: 'all',
    urgency: 'call_999',
    symptom: 'Suspected anaphylaxis',
    guidance: 'Sudden swelling of the tongue or throat is a medical emergency. Use an adrenaline autoinjector if available and dial 999.',
  },
  {
    keywords: ['swollen', 'tongue'],
    matchType: 'all',
    urgency: 'call_999',
    symptom: 'Suspected anaphylaxis',
    guidance: 'Sudden swelling of the tongue or throat is a medical emergency. Use an adrenaline autoinjector if available and dial 999.',
  },
  {
    keywords: ['clonus', 'tramadol'],
    matchType: 'all',
    urgency: 'call_999',
    symptom: 'Suspected Serotonin Syndrome / Neurotoxicity',
    guidance: 'Spontaneous clonus, hyperreflexia, and fever in the context of serotonergic medications indicate potential serotonin toxicity. Seek emergency hospital care now.',
  },
  {
    keywords: ['jerking', 'fever', 'antidepressant'],
    matchType: 'all',
    urgency: 'call_999',
    symptom: 'Suspected Serotonin Syndrome / Neurotoxicity',
    guidance: 'Muscle twitching, high fever, and agitation following medication changes require emergency medical evaluation now.',
  },
  {
    keywords: ['non-blanching', 'glass test'],
    matchType: 'any',
    urgency: 'call_999',
    symptom: 'Meningococcal purpura / Non-blanching rash',
    guidance: 'A rash that does not fade under pressure with fever or neck stiffness requires immediate 999 emergency assessment.',
  },
  {
    keywords: ['malaria', 'rigors', 'travel'],
    matchType: 'all',
    urgency: 'same_day_gp',
    symptom: 'Post-travel febrile illness (suspected falciparum malaria)',
    guidance: 'Fever and chills following travel to an endemic malaria area requires same-day urgent blood film examination. Arrange a same-day urgent GP appointment.',
  },
];

/**
 * Negation patterns ported verbatim from STEMCare: a negation word within 50
 * characters before a matched keyword means the patient is DENYING the
 * symptom ("I don't have chest pain") and the rule must not fire.
 */
const NEGATION_PATTERNS = [
  /\b(no|not|don'?t|doesn'?t|haven'?t|hasn'?t|didn'?t|without|denied?|denying|negative|absence of|free of)\b/i,
  /\b(i am not|i'm not|i do not|i don't|i have not|i haven't)\b/i,
  /\bnot\s+(having|experiencing|feeling|suffering)\b/i,
];

function isNegated(text: string, keyword: string): boolean {
  const lowerText = text.toLowerCase();
  const lowerKeyword = keyword.toLowerCase();
  const keywordIndex = lowerText.indexOf(lowerKeyword);

  if (keywordIndex === -1) return false;

  // Clause-scoped negation: a negation word only counts if it appears in the
  // SAME clause as the keyword. Without this, "no headache, but I have chest
  // pain and sweating" would suppress a genuine 999 presentation because the
  // negation of an unrelated symptom sits within the raw 50-char window.
  // (This refines the production detector, which uses the raw window.)
  const clauseStart = lastClauseBoundary(lowerText, keywordIndex);
  const precedingText = lowerText.slice(clauseStart, keywordIndex).slice(-50);

  return NEGATION_PATTERNS.some((pattern) => pattern.test(precedingText));
}

/**
 * Index just after the last clause boundary before `keywordIndex`. Clause
 * boundaries are punctuation, or a contrastive conjunction (but/however/
 * although/though) — the common way patients affirm one symptom while
 * denying another.
 */
function lastClauseBoundary(text: string, keywordIndex: number): number {
  const boundary = /(?:[.;!?]\s*)|(?:,\s*)|(?:\b(?:but|however|although|though)\b\s*)/g;
  let lastEnd = 0;
  let match: RegExpExecArray | null;

  while ((match = boundary.exec(text)) !== null) {
    const boundaryEnd = match.index + match[0].length;
    if (boundaryEnd >= keywordIndex) break;
    lastEnd = boundaryEnd;
  }

  return lastEnd;
}

function headlineForUrgency(urgency: RedFlagUrgency): string {
  switch (urgency) {
    case 'call_999':
      return 'Immediate Emergency Care Required — Call 999';
    case 'call_111':
      return 'Urgent Assessment Needed — Call 111';
    case 'same_day_gp':
      return 'Urgent Same-Day GP Assessment Required';
  }
}

/**
 * Deterministic pre-generation gate. Detection terminates the interview —
 * the caller must surface `guidance` to the patient and capture the flag in
 * the clinician report.
 */
export function detectRedFlags(text: string): RedFlagDetection {
  if (!text || text.trim().length === 0) {
    return { detected: false };
  }

  const normalized = text.toLowerCase();

  for (const rule of RED_FLAG_RULES) {
    const matches = rule.keywords.map((kw) => normalized.includes(kw.toLowerCase()));

    const isMatch = rule.matchType === 'all'
      ? matches.every((m) => m)
      : matches.some((m) => m);

    if (!isMatch) continue;

    // Skip the pattern if any matched keyword is negated (patient denies it).
    const isNegatedMatch = rule.keywords.some(
      (kw) => normalized.includes(kw.toLowerCase()) && isNegated(text, kw),
    );
    if (isNegatedMatch) continue;

    return {
      detected: true,
      symptom: rule.symptom,
      urgency: rule.urgency,
      headline: headlineForUrgency(rule.urgency),
      guidance: rule.guidance,
    };
  }

  return { detected: false };
}
