import type { DemoSurveyResponse, EvaluatorRole, PillarScore } from '../types';

export const SURVEY_STORAGE_KEY = 'stemcare_demo_survey_v1';

export const EVALUATOR_ROLES: Array<{ id: EvaluatorRole; label: string; desc: string }> = [
  { id: 'clinician_gp', label: 'Clinician / GP', desc: 'Practicing primary or secondary care physician' },
  { id: 'nhs_leader', label: 'NHS / Healthcare Leader', desc: 'ICB, trust, or digital transformation leader' },
  { id: 'healthtech_product', label: 'Healthtech / Product', desc: 'Product manager, engineer, or clinical informatician' },
  { id: 'patient_public', label: 'Patient / Public', desc: 'Evaluating the patient experience' },
  { id: 'investor_partner', label: 'Investor / Partner', desc: 'Exploring partnerships or investment' },
  { id: 'other', label: 'Other', desc: 'Other perspective' },
];

export const FEELING_OPTIONS = [
  { id: 'safe_grounded', label: 'Clinically safe & grounded', icon: '🛡️' },
  { id: 'fast_seamless', label: 'Fast & responsive', icon: '⚡' },
  { id: 'transparent_citations', label: 'Transparent (loved citations)', icon: '🔍' },
  { id: 'apple_design', label: 'Apple-grade design clarity', icon: '✨' },
  { id: 'time_saver', label: 'Genuine clinician time-saver', icon: '⏱️' },
  { id: 'patient_empathy', label: 'Natural patient tone', icon: '💬' },
  { id: 'cautious_rigid', label: 'Felt too cautious / rigid', icon: '🤔' },
  { id: 'needs_depth', label: 'Needs deeper questioning', icon: '📉' },
  { id: 'more_control', label: 'Wanted more clinician control', icon: '🎛️' },
  { id: 'unsure_ai', label: 'Unsure about triage AI', icon: '⚖️' },
];

export const RATING_DESCRIPTORS: Record<number, string> = {
  1: 'Needs major rethink',
  2: 'Poor experience',
  3: 'Below expectations',
  4: 'Approaching viability',
  5: 'Promising start',
  6: 'Solid foundation',
  7: 'Good & usable',
  8: 'Very impressive',
  9: 'Excellent / Near clinic-ready',
  10: 'Exceptional / Transformative',
};

export const PILLAR_LABELS: Record<'patientInterview' | 'clinicalBriefing' | 'clinicianGate', string> = {
  patientInterview: 'Patient intake interview & pacing',
  clinicalBriefing: 'Live briefing note & citations',
  clinicianGate: 'Clinician review & authorization gate',
};

export function saveSurveyResponse(response: DemoSurveyResponse): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(SURVEY_STORAGE_KEY, JSON.stringify(response));
    }
  } catch (err) {
    console.warn('[STEMCare Survey] Failed to save survey response to localStorage:', err);
  }
}

export function loadSurveyResponse(): DemoSurveyResponse | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(SURVEY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.overallRating === 'number') {
      return parsed as DemoSurveyResponse;
    }
    return null;
  } catch (err) {
    console.warn('[STEMCare Survey] Failed to load survey response from localStorage:', err);
    return null;
  }
}

export function clearSurveyResponse(): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(SURVEY_STORAGE_KEY);
    }
  } catch (err) {
    console.warn('[STEMCare Survey] Failed to clear survey response from localStorage:', err);
  }
}

export function formatSurveySummary(response: DemoSurveyResponse): string {
  const roleLabel = EVALUATOR_ROLES.find((r) => r.id === response.evaluatorRole)?.label || response.evaluatorRole;
  const ratingDesc = RATING_DESCRIPTORS[response.overallRating] || '';

  const lines = [
    '=== STEMCARE DEMO EVALUATION ===',
    `Overall Rating: ${response.overallRating}/10 (${ratingDesc})`,
    `Evaluator Perspective: ${roleLabel}${response.evaluatorRoleOther ? ` - ${response.evaluatorRoleOther}` : ''}`,
    `Submitted: ${response.submittedAt}`,
    response.scenarioId ? `Scenario: ${response.scenarioId}` : '',
    '',
    '--- Key Feelings & Impressions ---',
    response.feelings.length > 0
      ? response.feelings
          .map((f) => {
            const opt = FEELING_OPTIONS.find((o) => o.id === f);
            return opt ? `• ${opt.icon} ${opt.label}` : `• ${f}`;
          })
          .join('\n')
      : 'None selected',
    '',
    '--- Core Pillars ---',
    `• Interview: ${response.pillarRatings.patientInterview || 'N/A'}`,
    `• Briefing & Citations: ${response.pillarRatings.clinicalBriefing || 'N/A'}`,
    `• Clinician Gate: ${response.pillarRatings.clinicianGate || 'N/A'}`,
    '',
    '--- Qualitative Feedback ---',
    'What stood out positively:',
    response.positiveFeedback.trim() || '(No comment)',
    '',
    'What could improve or felt missing:',
    response.constructiveFeedback.trim() || '(No comment)',
  ];

  if (response.contactName || response.contactEmail) {
    lines.push(
      '',
      '--- Contact Details ---',
      response.contactName ? `Name: ${response.contactName}` : '',
      response.contactEmail ? `Email: ${response.contactEmail}` : ''
    );
  }

  return lines.filter(Boolean).join('\n');
}
