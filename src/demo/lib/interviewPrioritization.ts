/**
 * Interview Prioritization & Topic Selection Engine
 *
 * Adapted from STEMCare (`apps/web/src/lib/ai/medgemma/interviewPrioritization.ts`,
 * 863 → 434 lines): keeps the deterministic questioning priorities, candidate
 * scoring, question-validation guardrails (≤20 words, 1 question ending in ?)
 * and dynamic termination; drops production-only coverage snapshotting and
 * duplicate-topic suppression detail. MIN_ADAPTIVE_QUESTIONS is 4 here vs 8
 * in the production GP queue, tuned for a web demo session length.
 */

import type {
  InterviewPolicyState,
  InterviewTerminationReason,
  InterviewTopic,
  InterviewControlContext,
} from './harnessTypes';

export type { InterviewControlContext };

export const MAX_INTERVIEW_QUESTIONS = 15;
export const MIN_ADAPTIVE_QUESTIONS = 4; // Adapted to 4 for responsive web demo (vs 8 in production GP queue)
export const CANDIDATE_SCORE_THRESHOLD = 40;

const LOW_YIELD_STREAK_LIMIT = 3;
const NO_CANDIDATE_STREAK_LIMIT = 2;
const HIGH_PRIORITY_REMAINING_THRESHOLD = 70;

export const INTERVIEW_TOPICS: InterviewTopic[] = [
  'breathing_chest_red_flags',
  'neuro_severe_red_flags',
  'chief_complaint_onset_timeline',
  'chief_complaint_severity_impact',
  'associated_symptoms_core',
  'progression_modifiers',
  'branch_discriminators',
  'hydration_tolerance_if_gi',
  'self_care_and_response',
  'exposure_context',
  'pmh',
  'regular_meds',
  'allergies',
  'family_social',
  'broad_ros_optional',
];

/** Topics the intake gate requires before the interview may end. */
export const INTAKE_GATE_TOPICS: InterviewTopic[] = [
  'pmh',
  'regular_meds',
  'allergies',
  'family_social',
];

export const TOPIC_BASE_PRIORITIES: Record<InterviewTopic, number> = {
  breathing_chest_red_flags: 100,
  neuro_severe_red_flags: 95,
  chief_complaint_onset_timeline: 90,
  chief_complaint_severity_impact: 88,
  associated_symptoms_core: 84,
  progression_modifiers: 80,
  branch_discriminators: 75,
  hydration_tolerance_if_gi: 72,
  self_care_and_response: 65,
  exposure_context: 60,
  pmh: 55,
  regular_meds: 52,
  allergies: 52,
  family_social: 50,
  broad_ros_optional: 25,
};

export const FALLBACK_QUESTIONS: Record<InterviewTopic, string> = {
  breathing_chest_red_flags: 'Any chest pain, shortness of breath, or trouble breathing right now?',
  neuro_severe_red_flags: 'Any severe headache, confusion, fainting, weakness, or vision changes today?',
  chief_complaint_onset_timeline: 'When did your symptoms start, and how have they changed over time?',
  chief_complaint_severity_impact: 'How severe are your symptoms now, and how are they affecting daily activities?',
  associated_symptoms_core: 'What other symptoms are you having alongside your main complaint?',
  progression_modifiers: 'What makes symptoms better or worse, and are they constant or intermittent?',
  branch_discriminators: 'Any new symptoms in other areas, like stomach, urine, chest, or neurological changes?',
  hydration_tolerance_if_gi: 'Are you keeping fluids down, and how often are vomiting or diarrhoea episodes?',
  self_care_and_response: 'What treatments or home remedies have you tried, and did they help?',
  exposure_context: 'Any recent sick contacts, travel, or infection exposures before symptoms began?',
  pmh: 'Do you have any medical conditions relevant to this illness?',
  regular_meds: 'Do you take regular medications, including over-the-counter medicines or supplements?',
  allergies: 'Do you have any medication allergies?',
  family_social: 'Any relevant family history or social factors, such as smoking, alcohol, or household exposures?',
  broad_ros_optional: 'Anything important we have not covered about your symptoms?',
};

export const TOPIC_LABELS: Record<InterviewTopic, string> = {
  breathing_chest_red_flags: 'Breathing and chest red flags',
  neuro_severe_red_flags: 'Neurological red flags',
  chief_complaint_onset_timeline: 'Onset and timeline',
  chief_complaint_severity_impact: 'Severity and impact',
  associated_symptoms_core: 'Core associated symptoms',
  progression_modifiers: 'Progression and modifiers',
  branch_discriminators: 'Branch discriminators',
  hydration_tolerance_if_gi: 'GI hydration tolerance',
  self_care_and_response: 'Self-care and response',
  exposure_context: 'Exposure context',
  pmh: 'Past medical history',
  regular_meds: 'Regular medications',
  allergies: 'Allergies',
  family_social: 'Family/social history',
  broad_ros_optional: 'Optional broad review',
};

interface TopicScore {
  topic: InterviewTopic;
  score: number;
  reasons: string[];
}

export interface TopicSelectionResult {
  selectedTopic: InterviewTopic;
  selectedTopicScore: number;
  selectedTopicRationale: string;
  scoredTopics: TopicScore[];
  hasUnresolvedHighPriority: boolean;
  isCandidateWeak: boolean;
}

export interface CoverageStatus {
  chiefComplaintCharacterization: boolean;
  associatedSymptoms: boolean;
  coreRedFlagScreen: boolean;
  selfCareResponse: boolean;
  historyBundle: boolean;
  /** Every history topic (PMH, meds, allergies, family/social) asked or blocked. */
  historyComplete: boolean;
  /** Onset, severity, and progression/modifiers asked or blocked. */
  hpiCoreComplete: boolean;
  highYieldComplete: boolean;
}

export interface TerminationDecision {
  shouldTerminate: boolean;
  reason?: InterviewTerminationReason;
  note?: string;
}

const AMBIGUOUS_PATTERNS = [
  /\bnot sure\b/i,
  /\bunsure\b/i,
  /\b(?:don'?t|do not) know\b/i,
  /\bhard to (?:say|tell)\b/i,
  /\bcan(?:not|'t) remember\b/i,
  /\bmaybe\b/i,
  /\bi think\b/i,
  /\bkind of\b/i,
  /\bsort of\b/i,
  /\bpossibly\b/i,
];

const SPECIFIC_PATTERNS = [
  /\b\d+\b/,
  /\b(?:today|yesterday|week|weeks|day|days|hour|hours|month|months)\b/i,
  /\b(?:yes|no|none|never|always|not at all)\b/i,
  /\b(?:mild|moderate|severe|worse|better|constant|intermittent)\b/i,
];

const RESPIRATORY_OR_EMERGENCY_PATTERN =
  /\b(?:shortness of breath|difficulty breathing|trouble breathing|can't breathe|cannot breathe|breathless|chest pain|tight chest|rapid breathing|severe headache|confusion|faint(?:ed|ing)?|seizure|stroke)\b/i;

export function createInitialInterviewPolicy(): InterviewPolicyState {
  return {
    questionsAsked: 1, // Opening greeting counts as question 1
    askedTopicCounts: { chief_complaint_onset_timeline: 0 },
    topicFindingIndexes: {},
    blockedTopics: [],
    clarificationUsedTopics: [],
    lowYieldStreak: 0,
    noCandidateStreak: 0,
    recentTopics: [],
  };
}

function countForTopic(policy: InterviewPolicyState, topic: InterviewTopic): number {
  return policy.askedTopicCounts[topic] ?? 0;
}

export function selectInterviewTopic(
  policy: InterviewPolicyState,
  presentingComplaint: string,
  latestAnswer?: string,
): TopicSelectionResult {
  const scoredTopics: TopicScore[] = [];
  const textLower = `${presentingComplaint} ${latestAnswer || ''}`.toLowerCase();

  for (const topic of INTERVIEW_TOPICS) {
    if (policy.blockedTopics.includes(topic)) continue;

    const askCount = countForTopic(policy, topic);
    if (askCount >= 2) continue; // Hard max: 2 questions per topic

    let score = TOPIC_BASE_PRIORITIES[topic];
    const reasons: string[] = [`Base priority: ${score}`];

    // Penalty if already asked once
    if (askCount === 1) {
      score -= 35;
      reasons.push('Repeat topic penalty: -35');
    }

    // Penalty if asked recently
    if (policy.recentTopics?.includes(topic)) {
      score -= 20;
      reasons.push('Recently asked penalty: -20');
    }

    // Boost emergency topics if emergency keywords observed
    if (
      (topic === 'breathing_chest_red_flags' || topic === 'neuro_severe_red_flags') &&
      RESPIRATORY_OR_EMERGENCY_PATTERN.test(textLower)
    ) {
      score += 30;
      reasons.push('Emergency trigger boost: +30');
    }

    // Intake-gate floor: once the interview is past its early phase, unasked
    // gate topics outrank everything — including boosted repeat asks — so the
    // history block can never be pushed past the hard cap by re-asks.
    if (
      policy.questionsAsked >= 10 &&
      INTAKE_GATE_TOPICS.includes(topic) &&
      askCount === 0
    ) {
      score += 100;
      reasons.push('Intake gate floor: +100');
    }

    // Boost onset/severity early in interview
    if (
      (topic === 'chief_complaint_onset_timeline' || topic === 'chief_complaint_severity_impact') &&
      policy.questionsAsked <= 2
    ) {
      score += 15;
      reasons.push('Early intake boost: +15');
    }

    scoredTopics.push({ topic, score, reasons });
  }

  scoredTopics.sort((a, b) => b.score - a.score);

  const top = scoredTopics[0] || {
    topic: 'broad_ros_optional',
    score: 10,
    reasons: ['Fallback topic'],
  };

  const hasUnresolvedHighPriority = scoredTopics.some(
    (t) => t.score >= HIGH_PRIORITY_REMAINING_THRESHOLD && countForTopic(policy, t.topic) === 0
  );

  return {
    selectedTopic: top.topic,
    selectedTopicScore: top.score,
    selectedTopicRationale: top.reasons.join('; '),
    scoredTopics,
    hasUnresolvedHighPriority,
    isCandidateWeak: top.score < CANDIDATE_SCORE_THRESHOLD,
  };
}

export function applyUserAnswerToPolicy(
  policy: InterviewPolicyState,
  topic: InterviewTopic,
  userAnswer: string,
  answerMessageIndex?: number,
): InterviewPolicyState {
  const currentCount = countForTopic(policy, topic);
  const updatedCounts = {
    ...policy.askedTopicCounts,
    [topic]: currentCount + 1,
  };

  // The answer that DEFINES the presenting complaint (the reply to the
  // opening greeting) belongs to the complaint, not to the topic the policy
  // had seeded — recording it there misfiled the complaint under "Onset",
  // and its ask-count/recent-penalty crowded out the real onset question.
  // Count the turn only; the topic stays untouched so its actual question
  // gets asked next.
  if (!policy.lastSelectedTopic) {
    return {
      ...policy,
      questionsAsked: policy.questionsAsked + 1,
      lastSelectedTopic: topic,
    };
  }

  // Findings: the first answer wins for topics answered once; a re-ask only
  // happens when the first answer was ambiguous, and the clarification then
  // SUPERSEDES it (keeping the ambiguous "not sure" as the documented finding
  // would preserve exactly the wrong information).
  const isReAsk = currentCount >= 1;
  const existingFinding = policy.topicFindings?.[topic];
  const updatedFindings = {
    ...policy.topicFindings,
    ...(isReAsk || !existingFinding ? { [topic]: userAnswer.trim() } : {}),
  };

  const existingIndex = policy.topicFindingIndexes?.[topic];
  const updatedIndexes = {
    ...policy.topicFindingIndexes,
    ...(isReAsk || !existingIndex ? (answerMessageIndex ? { [topic]: answerMessageIndex } : {}) : {}),
  };

  const isAmbiguous = AMBIGUOUS_PATTERNS.some((p) => p.test(userAnswer));
  const isSpecific = SPECIFIC_PATTERNS.some((p) => p.test(userAnswer));

  const updatedBlocked = [...policy.blockedTopics];
  // A non-ambiguous answer closes the topic (one focused question each keeps
  // the 15-question budget compatible with the intake gate). An ambiguous
  // answer stays open for exactly one clarifying re-ask; two asks always do.
  if (!isAmbiguous || currentCount + 1 >= 2) {
    if (!updatedBlocked.includes(topic)) {
      updatedBlocked.push(topic);
    }
  }

  const updatedRecent = [topic, ...(policy.recentTopics || []).slice(0, 2)];

  return {
    ...policy,
    questionsAsked: policy.questionsAsked + 1,
    askedTopicCounts: updatedCounts,
    topicFindings: updatedFindings,
    topicFindingIndexes: updatedIndexes,
    blockedTopics: updatedBlocked,
    recentTopics: updatedRecent,
    lastSelectedTopic: topic,
  };
}

export function computeCoverageStatus(
  policy: InterviewPolicyState,
  hasRedFlag: boolean = false,
): CoverageStatus {
  const asked = policy.askedTopicCounts;
  const blocked = new Set(policy.blockedTopics);

  const onsetTimeline = (asked.chief_complaint_onset_timeline ?? 0) > 0 || blocked.has('chief_complaint_onset_timeline');
  const severityImpact = (asked.chief_complaint_severity_impact ?? 0) > 0 || blocked.has('chief_complaint_severity_impact');
  const chiefComplaintCharacterization = onsetTimeline || severityImpact;

  const associatedSymptoms = (asked.associated_symptoms_core ?? 0) > 0 || blocked.has('associated_symptoms_core');

  const coreRedFlagScreen =
    hasRedFlag ||
    (asked.breathing_chest_red_flags ?? 0) > 0 ||
    (asked.neuro_severe_red_flags ?? 0) > 0 ||
    blocked.has('breathing_chest_red_flags') ||
    blocked.has('neuro_severe_red_flags');

  const selfCareResponse = (asked.self_care_and_response ?? 0) > 0 || blocked.has('self_care_and_response');

  const historyItems = [
    (asked.pmh ?? 0) > 0 || blocked.has('pmh'),
    (asked.regular_meds ?? 0) > 0 || blocked.has('regular_meds'),
    (asked.allergies ?? 0) > 0 || blocked.has('allergies'),
    (asked.family_social ?? 0) > 0 || blocked.has('family_social'),
  ];
  const historyBundle = historyItems.some(Boolean);
  const historyComplete = historyItems.every(Boolean);

  const hpiCoreComplete =
    onsetTimeline && severityImpact && ((asked.progression_modifiers ?? 0) > 0 || blocked.has('progression_modifiers'));

  return {
    chiefComplaintCharacterization,
    associatedSymptoms,
    coreRedFlagScreen,
    selfCareResponse,
    historyBundle,
    historyComplete,
    hpiCoreComplete,
    highYieldComplete:
      chiefComplaintCharacterization &&
      associatedSymptoms &&
      coreRedFlagScreen,
  };
}

/**
 * True when the interview has covered everything the GP-facing report
 * promises: the HPI core (onset, severity, modifiers) and the full history
 * block (PMH, meds, allergies, family/social). Until this is true, neither
 * the adaptive termination logic nor the manual Wrap-Up control may end the
 * interview (the red-flag gate and the hard question cap always can).
 */
export function isIntakeGateSatisfied(coverage: CoverageStatus): boolean {
  return coverage.historyComplete && coverage.hpiCoreComplete;
}

export function shouldTerminateInterview(
  policy: InterviewPolicyState,
  coverage: CoverageStatus,
  selection: TopicSelectionResult,
  options?: { minimumQuestionsBeforeAdaptiveTermination?: number },
): TerminationDecision {
  const minQuestions = options?.minimumQuestionsBeforeAdaptiveTermination ?? MIN_ADAPTIVE_QUESTIONS;

  if (policy.questionsAsked >= MAX_INTERVIEW_QUESTIONS) {
    return {
      shouldTerminate: true,
      reason: 'hard_cap',
      note: `Reached maximum budget of ${MAX_INTERVIEW_QUESTIONS} questions.`,
    };
  }

  if (policy.questionsAsked < minQuestions) {
    return { shouldTerminate: false };
  }

  // The intake gate (history block + HPI core) outranks every soft
  // termination path: without it the GP report would ship "Not yet
  // discussed" rows for information a PCP needs. Only the hard cap above
  // (and the red-flag gate, handled upstream) can end an interview early.
  if (!isIntakeGateSatisfied(coverage)) {
    return { shouldTerminate: false };
  }

  if (coverage.highYieldComplete && !selection.hasUnresolvedHighPriority) {
    return {
      shouldTerminate: true,
      reason: 'coverage_complete',
      note: 'High-yield intake coverage complete with no unresolved high-priority gaps.',
    };
  }

  if (policy.lowYieldStreak >= LOW_YIELD_STREAK_LIMIT) {
    return {
      shouldTerminate: true,
      reason: 'low_yield',
      note: 'Interview ended after repeated low-yield follow-up opportunities.',
    };
  }

  if (policy.noCandidateStreak >= NO_CANDIDATE_STREAK_LIMIT) {
    return {
      shouldTerminate: true,
      reason: 'no_candidate',
      note: 'No high-value next question remained based on current information.',
    };
  }

  return { shouldTerminate: false };
}

export function getFallbackQuestion(topic: InterviewTopic): string {
  return FALLBACK_QUESTIONS[topic];
}

export function getTopicLabel(topic: InterviewTopic): string {
  return TOPIC_LABELS[topic];
}

export function sanitizeQuestionOutput(text: string): string {
  return text
    .replace(/End interview\.?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Deterministic Question Validation Guardrail
 * Ported verbatim from STEMCare interviewPrioritization.ts
 */
export function validateGeneratedQuestion(text: string): {
  valid: boolean;
  question: string;
  reason?: string;
} {
  const sanitized = sanitizeQuestionOutput(text);

  if (!sanitized) {
    return { valid: false, question: '', reason: 'empty_output' };
  }

  if (!sanitized.includes('?')) {
    return { valid: false, question: '', reason: 'no_question_mark' };
  }

  const questionSegments = sanitized.match(/[^?]*\?/g)?.map((part) => part.trim()).filter(Boolean) || [];
  if (questionSegments.length !== 1) {
    return { valid: false, question: '', reason: 'multiple_questions' };
  }

  if (!/^[^?]+\?$/.test(sanitized)) {
    return { valid: false, question: '', reason: 'extra_commentary' };
  }

  const question = questionSegments[0];
  const startsWithPreamble = /^(considering|given|regarding|to better understand|based on|as you mentioned|since you mentioned)\b/i.test(question);
  if (startsWithPreamble) {
    return { valid: false, question: '', reason: 'preamble_style' };
  }

  const wordCount = question
    .replace(/[^\w\s']/g, '')
    .split(/\s+/)
    .filter(Boolean).length;

  if (wordCount === 0) {
    return { valid: false, question: '', reason: 'empty_question' };
  }

  if (wordCount > 20) {
    return { valid: false, question: '', reason: 'too_long' };
  }

  return {
    valid: true,
    question,
  };
}
