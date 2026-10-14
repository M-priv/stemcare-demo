/**
 * MedGemma Harness & Engine Type Definitions
 *
 * Adapted from STEMCare AI types (`apps/web/src/lib/ai/medgemma/types.ts`);
 * `MedGemmaChatMessage.redFlag` is demo-specific so the UI can flag the
 * escalation message without sniffing message text.
 */

export interface MedGemmaChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  /** Set on the deterministic emergency-escalation assistant message. */
  redFlag?: boolean;
}

export type InterviewTopic =
  | 'breathing_chest_red_flags'
  | 'neuro_severe_red_flags'
  | 'chief_complaint_onset_timeline'
  | 'chief_complaint_severity_impact'
  | 'associated_symptoms_core'
  | 'progression_modifiers'
  | 'branch_discriminators'
  | 'hydration_tolerance_if_gi'
  | 'self_care_and_response'
  | 'exposure_context'
  | 'pmh'
  | 'regular_meds'
  | 'allergies'
  | 'family_social'
  | 'broad_ros_optional';

export type InterviewTerminationReason =
  | 'hard_cap'
  | 'coverage_complete'
  | 'low_yield'
  | 'no_candidate'
  | 'red_flag'
  | 'message_loop';

export interface InterviewControlContext {
  questionsAsked: number;
  maxQuestions: number;
  selectedTopic: InterviewTopic;
  selectedTopicRationale: string;
  blockedTopics: InterviewTopic[];
  clarificationAllowedForTopic?: InterviewTopic;
}

export interface InterviewPolicyState {
  questionsAsked: number;
  askedTopicCounts: Partial<Record<InterviewTopic, number>>;
  topicFindings?: Partial<Record<InterviewTopic, string>>;
  blockedTopics: InterviewTopic[];
  clarificationUsedTopics: InterviewTopic[];
  lowYieldStreak: number;
  noCandidateStreak: number;
  lastSelectedTopic?: InterviewTopic;
  recentTopics?: InterviewTopic[];
  terminationReason?: InterviewTerminationReason;
}

export interface MedGemmaChatState {
  sessionId: string;
  patientName?: string;
  patientId?: string;
  presentingComplaint: string;
  messages: MedGemmaChatMessage[];
  report: string;
  hasRedFlag: boolean;
  redFlagReason?: string;
  exchangeCount: number;
  interviewPolicy?: InterviewPolicyState;
}

export type ConditionName = 'Flu' | 'Migraine' | 'Malaria' | 'Serotonin Syndrome';

export interface SimulationConfig {
  condition: ConditionName;
  selectedSymptoms: string[];
  previousAnswers: string[];
}

export interface Hypothesis {
  id: string;
  label: string;
  rationale: string;
  supporting_evidence_refs: string[];
  confidence_bucket: 'low' | 'medium' | 'high';
  ambiguity_signals?: string[];
}

export interface DifferentialHypotheses {
  created_at: string;
  hypotheses: Hypothesis[];
  ambiguity_score: number;
  ambiguity_signals: string[];
  escalation_required: boolean;
  escalation_reason?: string;
}
