/**
 * MedGemma Pre-Consultation Demo Types
 * 
 * Defines standalone data contracts for the MedGemma pre-consultation chat,
 * live briefing synthesizer, differential hypothesis engine, and clinician gate.
 */

export type DemoRole = 'user' | 'assistant' | 'system';

export type DemoMessageVariant = 'normal' | 'red_flag' | 'warning' | 'success';

export interface DemoChatMessage {
  id: string;
  role: DemoRole;
  content: string;
  timestamp: string;
  simulated?: boolean;
  variant?: DemoMessageVariant;
  redFlagReason?: string;
  topicTag?: string;
}

export type ScenarioConditionId = 
  | 'migraine_aura'
  | 'influenza'
  | 'malaria_travel'
  | 'serotonin_syndrome';

export interface DifferentialHypothesis {
  id: string;
  condition: string;
  probability: number; // 0 to 1 (e.g. 0.78 for 78%)
  confidenceBucket: 'high' | 'medium' | 'low';
  keyFindings: string[];
  recommendedAction: string;
  guidelineRef: string;
}

export interface ScenarioTurn {
  patientInput: string;
  assistantQuestion: string;
  topic: string;
  suggestedChips?: string[];
  reportAddition: {
    section: 'Chief Complaint' | 'History of Present Illness' | 'Associated Symptoms' | 'Past History & Meds' | 'Red Flags' | 'Clinical Assessment';
    bullet: string;
  };
}

export interface DemoScenario {
  id: ScenarioConditionId;
  name: string;
  badgeLabel: string;
  patientProfile: {
    name: string;
    age: number;
    gender: string;
    allergies: string;
    regularMeds: string;
    pastHistory: string;
  };
  initialComplaint: string;
  initialFollowUpQuestion: string;
  summaryPitch: string;
  turns: ScenarioTurn[];
  expectedDifferentials: DifferentialHypothesis[];
  triggersRedFlag?: boolean;
  redFlagDetails?: {
    symptom: string;
    urgency: 'call_999' | 'call_111' | 'same_day_gp';
    headline: string;
    guidance: string;
  };
}

export interface ClinicianReviewDecision {
  decision: 'approve' | 'modify' | 'reject';
  selectedHypothesisId: string;
  actionPathway: 
    | 'routine_gp'
    | 'same_day_gp'
    | 'specialist_referral'
    | 'emergency_transfer'
    | 'self_care_safety_net';
  overrideReason?: string;
  clinicianNotes?: string;
  signedAt: string;
  clinicianName: string;
  clinicianRole: string;
}

export interface ClinicalReportSnapshot {
  patientName: string;
  ageGender: string;
  chiefComplaint: string;
  hpi: string[];
  associatedSymptoms: string[];
  pastHistoryAndMeds: string[];
  redFlags: string[];
  clinicalAssessment: string[];
  lastUpdated: string;
  isFinalized: boolean;
}
