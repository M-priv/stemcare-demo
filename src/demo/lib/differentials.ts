/**
 * Differential Hypotheses Engine (demo port)
 *
 * Adapted from STEMCare (`apps/web/src/lib/ai/medgemma/hypothesisService.ts`).
 * Generates probability-ranked differential hypotheses from a pre-consultation
 * report for the clinician review surface.
 *
 * Mode behavior:
 * - Deterministic (default): curated scenario answers plus a keyword
 *   reasoner; no network. Probabilities are illustrative ranking constants,
 *   NOT calibrated estimates.
 * - Live (VITE_DEMO_LIVE_MODE): hypothesis generation runs through the
 *   server proxy (/api/gemini, role "differentials") where the prompt is
 *   built and every card is gated with the assistive-only policy before it
 *   may return. Any failure falls back to the deterministic reasoner.
 * - Every card — from any source — passes `applyAssistiveOnlyGate` before
 *   rendering.
 */

import type { DifferentialHypothesis } from '../types';
import { DEMO_SCENARIOS } from './scenarios';
import {
  evaluateAssistiveOnlyGuardrails,
  buildAssistiveOnlyAbstainNote,
} from './assistiveOnlyGuardrails';
import { isLiveMode, requestDifferentials } from './demoApi';

// =============================================================================
// GATING LOGIC (ported from STEMCare hypothesisService.ts)
// =============================================================================

/**
 * Check if hypothesis generation is blocked due to red flags.
 * Per spec: Red flag is a hard gate ahead of generation.
 *
 * IMPORTANT: We only block on CLEARLY POSITIVE red flag indicators.
 * Standard report sections like "Red Flags: None identified" should NOT block.
 */
export function isHypothesisGenerationBlocked(reportMarkdown: string): {
  blocked: boolean;
  reason?: string;
} {
  // Pattern 1: Only block on EXPLICIT positive red flag indicators
  const positiveRedFlagPatterns = [
    /⚠️\s*red flag/i,
    /🚨/,
    /\*\*warning\*\*.*red flag/i,
    /red flag:\s*yes/i,
    /red flag identified/i,
    /red flag detected/i,
    /positive red flag/i,
    /seek emergency care immediately/i,
    /seek immediate medical attention/i,
    /go to (the\s+)?emergency/i,
    /attend a&e immediately/i,
    /call\s*(999|911)\s*now/i,
    /call 911 now/i,
  ];

  for (const pattern of positiveRedFlagPatterns) {
    if (pattern.test(reportMarkdown)) {
      return {
        blocked: true,
        reason: 'Red flag detected in report - requires emergency clinician-led assessment',
      };
    }
  }

  // Pattern 2: Block only if emergency services are mentioned in urgent context
  const emergencyContextPatterns = [
    /call (999|911|emergency)\s*(immediately|now|right away)/i,
    /immediately\s*(call|phone|dial)\s*(999|911)/i,
    /this is (a\s+)?(medical\s+)?emergency/i,
  ];

  for (const pattern of emergencyContextPatterns) {
    if (pattern.test(reportMarkdown)) {
      return {
        blocked: true,
        reason: 'Report indicates medical emergency',
      };
    }
  }

  return { blocked: false };
}

// =============================================================================
// PROMPT CONTRACT (ported from STEMCare hypothesisService.ts — used only by
// the server-side live engine; kept here so the contract has one home)
// =============================================================================

export const HYPOTHESIS_SYSTEM_PROMPT = `You are a clinical decision support assistant. Your task is to analyze a pre-consultation report and generate up to 3 differential hypotheses for the clinician to consider.

IMPORTANT RULES:
1. Generate exactly 1-3 hypotheses, ordered by probability (highest first)
2. Each hypothesis must be grounded in evidence from the report
3. Never present as a definitive diagnosis - these are HYPOTHESES for clinical consideration
4. Include supporting evidence references from the report sections
5. Assign confidence buckets: high (>70% probability), medium (30-70%), low (<30%)

OUTPUT FORMAT (JSON):
{
  "hypotheses": [
    {
      "label": "Short diagnosis name",
      "rationale": "1-3 sentences explaining why this hypothesis fits, grounded in the report",
      "supporting_evidence_refs": ["Chief Complaint", "HPI: duration", "PMH: relevant condition"],
      "confidence_bucket": "high|medium|low"
    }
  ]
}`;

export function buildHypothesisPrompt(reportMarkdown: string): string {
  return `Analyze the following pre-consultation report and generate differential hypotheses:

---
${reportMarkdown}
---

Generate up to 3 differential hypotheses with supporting rationale. Return ONLY valid JSON.`;
}

// =============================================================================
// GENERATION RESULT INTERFACES
// =============================================================================

export interface GenerateDifferentialsResult {
  blocked: boolean;
  blockedReason?: string;
  hypotheses: DifferentialHypothesis[];
  source: 'gemini_llm' | 'scenario_benchmark' | 'clinical_reasoner';
}

/**
 * Primary hypothesis generator.
 * Called automatically after a pre-consultation report is finalized.
 */
export async function generateDifferentialHypotheses(
  reportMarkdown: string,
  scenarioId?: string,
): Promise<GenerateDifferentialsResult> {
  // 1. Safety Gate Check (STEMCare contract)
  const gateCheck = isHypothesisGenerationBlocked(reportMarkdown);
  if (gateCheck.blocked) {
    return {
      blocked: true,
      blockedReason: gateCheck.reason,
      hypotheses: [],
      source: 'clinical_reasoner',
    };
  }

  // 2. Curated benchmark scenario with vetted differential answers
  if (scenarioId && scenarioId !== 'custom') {
    const scenario = DEMO_SCENARIOS.find((s) => s.id === scenarioId);
    if (scenario) {
      return {
        blocked: false,
        hypotheses: applyAssistiveOnlyGate(scenario.expectedDifferentials),
        source: 'scenario_benchmark',
      };
    }
  }

  // 3. Live generation via the server proxy (only when built in live mode).
  // The server builds the prompt and gates every card; null → deterministic.
  if (isLiveMode()) {
    const liveHypotheses = await requestDifferentials(reportMarkdown);
    if (liveHypotheses && liveHypotheses.length > 0) {
      return {
        blocked: false,
        hypotheses: applyAssistiveOnlyGate(liveHypotheses),
        source: 'gemini_llm',
      };
    }
  }

  // 4. Deterministic Clinical Reasoner (keyword analysis of the report text)
  const clinicalResult = executeClinicalReasoningAnalysis(reportMarkdown);
  return {
    blocked: false,
    hypotheses: applyAssistiveOnlyGate(clinicalResult),
    source: 'clinical_reasoner',
  };
}

/**
 * Reviewer-output policy gate (ported from the production reviewer policy):
 * any hypothesis whose text drifts into definitive-diagnosis or prescribing
 * language has its action text replaced with an abstain note; escalated
 * content is withheld entirely.
 */
function applyAssistiveOnlyGate(hypotheses: DifferentialHypothesis[]): DifferentialHypothesis[] {
  const gated: DifferentialHypothesis[] = [];

  for (const hypothesis of hypotheses) {
    const cardText = [
      hypothesis.condition,
      ...hypothesis.keyFindings,
      hypothesis.recommendedAction,
    ].join(' ');

    const decision = evaluateAssistiveOnlyGuardrails(cardText);

    if (decision.action === 'escalate') {
      continue;
    }

    if (decision.action === 'abstain') {
      gated.push({
        ...hypothesis,
        recommendedAction: buildAssistiveOnlyAbstainNote(decision.reason || 'Policy gate triggered.'),
      });
      continue;
    }

    gated.push(hypothesis);
  }

  return gated;
}

// =============================================================================
// CLINICAL REASONING PARSER (Analyzes the finalized report markdown)
// =============================================================================

function executeClinicalReasoningAnalysis(reportMarkdown: string): DifferentialHypothesis[] {
  const textLower = reportMarkdown.toLowerCase();

  // Extract evidence quotes from the report
  const extractQuote = (query: RegExp, fallback: string): string => {
    const lines = reportMarkdown.split('\n');
    for (const line of lines) {
      if (query.test(line)) {
        return line.replace(/^[-*#\s]+/, '').trim();
      }
    }
    return fallback;
  };

  // 1. Musculoskeletal / Back / Leg / Radiculopathy
  if (
    textLower.includes('back') ||
    textLower.includes('sciatica') ||
    textLower.includes('leg pain') ||
    textLower.includes('spine') ||
    textLower.includes('lumbar')
  ) {
    const evidence1 = extractQuote(/onset|pain|shooting|leg/i, 'Stabbing/shooting discomfort with physical limitation');
    const evidence2 = extractQuote(/numbness|weakness|bladder/i, 'Screened negative for acute cauda equina red flags');

    return [
      {
        id: 'hyp_radiculopathy',
        condition: 'Lumbar Radiculopathy (Sciatica / Nerve Root Irritation)',
        probability: 0.74,
        confidenceBucket: 'high',
        keyFindings: [evidence1, evidence2, 'Pain follows dermatomal distribution down lower limb'],
        recommendedAction: 'Clinician to consider neurological examination (straight leg raise, reflex check) and physiotherapy assessment.',
        guidelineRef: 'NICE NG59: Low back pain and sciatica',
      },
      {
        id: 'hyp_mechanical_back',
        condition: 'Non-Specific Mechanical Lumbosacral Strain',
        probability: 0.20,
        confidenceBucket: 'medium',
        keyFindings: ['Paraspinal muscular tenderness without progressive motor deficit', 'Exacerbation with positional shifts'],
        recommendedAction: 'Clinician may consider early gentle mobilization and simple analgesia; avoid prolonged bed rest.',
        guidelineRef: 'NICE CKS: Back pain without radiculopathy',
      },
      {
        id: 'hyp_sacroiliac',
        condition: 'Sacroiliac Joint Dysfunction',
        probability: 0.06,
        confidenceBucket: 'low',
        keyFindings: ['Localized unilateral lumbosacral pain without focal distal paresthesias'],
        recommendedAction: 'Targeted pelvic examination and manual therapy evaluation if symptoms persist past 2 weeks.',
        guidelineRef: 'BASS Clinical Guidelines',
      },
    ];
  }

  // 2. Knee / Joint / Musculoskeletal Injury
  if (
    textLower.includes('knee') ||
    textLower.includes('joint') ||
    textLower.includes('swelling') ||
    textLower.includes('twist') ||
    textLower.includes('football')
  ) {
    const evidence1 = extractQuote(/knee|pain|swelling|running/i, 'Acute post-activity localized joint pain with swelling');
    const evidence2 = extractQuote(/lock|give way|weight/i, 'Preserved or partially restricted weight-bearing capacity');

    return [
      {
        id: 'hyp_knee_meniscal',
        condition: 'Acute Meniscal Tear / Soft Tissue Sprain',
        probability: 0.72,
        confidenceBucket: 'high',
        keyFindings: [evidence1, evidence2, 'Absence of hot/erythematous septic joint indicators'],
        recommendedAction: 'Clinician examination for joint line tenderness (McMurray sign); discuss protected weight-bearing and rehabilitation options.',
        guidelineRef: 'NICE CKS: Knee pain - acute assessment',
      },
      {
        id: 'hyp_patellofemoral',
        condition: 'Patellofemoral Pain Syndrome / Ligamentous Strain',
        probability: 0.21,
        confidenceBucket: 'medium',
        keyFindings: ['Anterior/peripatellar discomfort aggravated by loading and stairs'],
        recommendedAction: 'Clinician to consider quadriceps rehabilitation, activity modification, and gait review.',
        guidelineRef: 'NICE CKS: Patellofemoral syndrome',
      },
      {
        id: 'hyp_joint_effusion',
        condition: 'Reactive Traumatic Joint Effusion',
        probability: 0.07,
        confidenceBucket: 'low',
        keyFindings: ['Moderate intra-articular swelling without constitutional systemic signs'],
        recommendedAction: 'Consider knee ultrasound or plain radiograph if inability to bear weight persists (Ottawa Knee Rules).',
        guidelineRef: 'Ottawa Knee Clinical Decision Rules',
      },
    ];
  }

  // 3. Headache / Cranial Symptoms
  if (
    textLower.includes('headache') ||
    textLower.includes('migraine') ||
    textLower.includes('head pain') ||
    textLower.includes('throbbing')
  ) {
    const evidence1 = extractQuote(/headache|throbbing|aura|light/i, 'Unilateral/throbbing cranial pain with sensory sensitivity');
    const evidence2 = extractQuote(/red flags|weakness|speech/i, 'Screened negative for sudden thunderclap onset or neurological deficits');

    return [
      {
        id: 'hyp_migraine_primary',
        condition: 'Primary Migraine (Probable with Typical Aura)',
        probability: 0.76,
        confidenceBucket: 'high',
        keyFindings: [evidence1, evidence2, 'Episodic pattern with photophobia and nausea'],
        recommendedAction: 'Clinician to confirm ICHD-3 criteria and review acute therapy options; symptom diary tracking.',
        guidelineRef: 'NICE CG150: Headaches in over 12s',
      },
      {
        id: 'hyp_tension_headache',
        condition: 'Tension-Type Headache',
        probability: 0.17,
        confidenceBucket: 'medium',
        keyFindings: ['Band-like constriction pressure reported in secondary history'],
        recommendedAction: 'Clinician to review analgesia usage limits to avoid medication-overuse headache.',
        guidelineRef: 'BASH Guidelines 2024',
      },
      {
        id: 'hyp_cervicogenic_headache',
        condition: 'Cervicogenic Headache / Musculoskeletal',
        probability: 0.07,
        confidenceBucket: 'low',
        keyFindings: ['Co-occurring neck stiffness or postural strain components'],
        recommendedAction: 'Ergonomic posture review and neck mobility exercises.',
        guidelineRef: 'NICE CKS: Neck pain & headaches',
      },
    ];
  }

  // 4. Respiratory / Cough / Sore Throat / Chest
  if (
    textLower.includes('cough') ||
    textLower.includes('sore throat') ||
    textLower.includes('chest') ||
    textLower.includes('fever') ||
    textLower.includes('cold') ||
    textLower.includes('breath')
  ) {
    const evidence1 = extractQuote(/cough|fever|throat|chest/i, 'Acute respiratory symptom complex with coryzal features');
    const evidence2 = extractQuote(/breath|pleuritic|blood/i, 'Hemodynamically stable without pleuritic chest pain or red flags');

    return [
      {
        id: 'hyp_viral_urti',
        condition: 'Acute Viral Upper Respiratory Tract Infection',
        probability: 0.77,
        confidenceBucket: 'high',
        keyFindings: [evidence1, evidence2, 'Stable baseline oxygenation; low CURB-65 risk category'],
        recommendedAction: 'Clinician to confirm management; symptomatic self-care advice with safety-net for breathlessness or persistent high fever.',
        guidelineRef: 'NICE NG120: Cough (acute)',
      },
      {
        id: 'hyp_acute_bronchitis',
        condition: 'Acute Bronchitis',
        probability: 0.16,
        confidenceBucket: 'medium',
        keyFindings: ['Persistent cough duration with bronchial chest discomfort'],
        recommendedAction: 'Antibiotics generally not indicated for routine viral bronchitis without comorbid vulnerability (clinician to assess).',
        guidelineRef: 'NICE CKS: Chest infections',
      },
      {
        id: 'hyp_strep_pharyngitis',
        condition: 'Acute Pharyngotonsillitis (Centor / FeverPAIN)',
        probability: 0.07,
        confidenceBucket: 'low',
        keyFindings: ['Pharyngeal irritation present; review against FeverPAIN scoring in-clinic'],
        recommendedAction: 'Clinician to assess FeverPAIN score during face-to-face examination to guide any antibiotic decision.',
        guidelineRef: 'NICE NG84: Sore throat (acute)',
      },
    ];
  }

  // 5. Abdominal / Dyspepsia / GI
  if (
    textLower.includes('stomach') ||
    textLower.includes('abdo') ||
    textLower.includes('nausea') ||
    textLower.includes('bowel') ||
    textLower.includes('gut')
  ) {
    const evidence1 = extractQuote(/stomach|abdo|cramp|nausea/i, 'Epigastric or generalized cramping discomfort');
    const evidence2 = extractQuote(/red flags|blood|weight/i, 'Screened negative for GI bleeding, jaundice, or peritonism');

    return [
      {
        id: 'hyp_dyspepsia_gerd',
        condition: 'Acute Functional Dyspepsia / Gastro-Oesophageal Reflux',
        probability: 0.74,
        confidenceBucket: 'high',
        keyFindings: [evidence1, evidence2, 'Relation to meals or postural changes without systemic alarms'],
        recommendedAction: 'Clinician to review reflux management options and dietary triggers; safety-net for dysphagia.',
        guidelineRef: 'NICE CG184: Gastro-oesophageal reflux disease and dyspepsia',
      },
      {
        id: 'hyp_viral_gastro',
        condition: 'Acute Viral Gastroenteritis',
        probability: 0.19,
        confidenceBucket: 'medium',
        keyFindings: ['Intermittent colicky abdominal sensations and mild nausea'],
        recommendedAction: 'Clinician to consider self-limiting-illness advice and hydration review.',
        guidelineRef: 'NICE CKS: Gastroenteritis',
      },
      {
        id: 'hyp_biliary_colic',
        condition: 'Biliary Colic Rule-Out',
        probability: 0.07,
        confidenceBucket: 'low',
        keyFindings: ['Absence of right upper quadrant peritonism or Murphy sign on clinical check'],
        recommendedAction: 'Consider abdominal ultrasound if post-prandial right upper quadrant pain recurs.',
        guidelineRef: 'NICE CG188: Gallstone disease',
      },
    ];
  }

  // 6. General Acute Primary Care Presentation
  const evidence1 = extractQuote(/chief complaint|concern/i, 'Acute patient-reported primary care concern');
  const evidence2 = extractQuote(/red flags|safety/i, 'Absence of immediate constitutional emergency red flags');

  return [
    {
      id: 'hyp_acute_benign',
      condition: 'Self-Limiting Acute Symptom Complex',
      probability: 0.71,
      confidenceBucket: 'high',
      keyFindings: [evidence1, evidence2, 'Stable baseline clinical presentation documented in briefing'],
      recommendedAction: 'Primary care clinician evaluation, examination, and tailored management planning.',
      guidelineRef: 'GMC Good Medical Practice & Clinical Decision Support Standards',
    },
    {
      id: 'hyp_subacute_reactive',
      condition: 'Subacute Reactive Condition',
      probability: 0.21,
      confidenceBucket: 'medium',
      keyFindings: ['Moderate functional impact described in history', 'Requires routine baseline laboratory blood work'],
      recommendedAction: 'Consider baseline investigations if symptoms persist beyond 7-14 days.',
      guidelineRef: 'NICE Clinical Knowledge Summaries',
    },
    {
      id: 'hyp_atypical_presentation',
      condition: 'Atypical Clinical Presentation',
      probability: 0.08,
      confidenceBucket: 'low',
      keyFindings: ['Non-localized symptoms requiring direct in-person physical examination'],
      recommendedAction: 'Face-to-face physician consultation advised.',
      guidelineRef: 'RCGP Clinical Governance Standards',
    },
  ];
}
