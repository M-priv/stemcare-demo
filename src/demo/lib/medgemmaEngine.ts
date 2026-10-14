/**
 * Standalone MedGemma Pre-Consultation Engine (report scaffolding only)
 *
 * Adapted from STEMCare. This module retains only the report snapshot
 * helpers used by the demo UI. The interview itself runs through
 * `medgemmaChatService.ts`; the former live-Gemini path was removed —
 * the demo makes no model calls and any future live path must go through
 * a server proxy, never a client-side API key.
 */

import type { ClinicalReportSnapshot } from '../types';

// =============================================================================
// REPORT MANAGEMENT & INITIALIZATION
// =============================================================================

export function createInitialReport(patientName: string, complaint: string): ClinicalReportSnapshot {
  return {
    patientName: patientName || 'Sophie Clarke',
    ageGender: '32 yo Female',
    chiefComplaint: complaint || 'General consultation request',
    hpi: [
      `Primary presenting problem: "${complaint || 'Pending symptom description'}"`,
      'Pre-consultation intake initiated via the structured interview protocol.',
    ],
    associatedSymptoms: [],
    pastHistoryAndMeds: [],
    redFlags: ['Safety screen in progress.'],
    clinicalAssessment: ['Pre-consultation interview active.'],
    lastUpdated: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    isFinalized: false,
  };
}

export function compileReportToMarkdown(report: ClinicalReportSnapshot): string {
  if (!report.chiefComplaint && report.hpi.length === 0) {
    return `### Pre-Consultation Intake Report
**Patient:** ${report.patientName} (${report.ageGender})  
**Document Status:** ⏳ Awaiting Patient Symptom Entry  

---

#### 1. Chief Complaint
*[Patient has not entered symptoms yet]*

#### 2. History of Present Illness (HPI)
- **Onset & Duration**: Not yet discussed
- **Severity & Quality**: Not yet discussed
- **Modifying Factors**: Not yet discussed
- **Pertinent Negatives**: Not yet discussed

#### 3. Relevant Medical History
- **Conditions**: Not yet reviewed
- **Medications**: Not yet reviewed
- **Allergies**: Not yet reviewed

#### 4. Safety & Red Flags
- Not yet assessed

#### 5. Summary
Interview in progress.`;
  }

  return `### Pre-Consultation Briefing (Simulated Demo Data)
**Patient:** ${report.patientName} (${report.ageGender})  
**Document Generated:** ${report.lastUpdated} · *STEMCare Intake Engine (deterministic demo)*  
**Status:** ${report.isFinalized ? '✅ Concluded & Awaiting Clinician Authorization' : '⏳ Live Dual-Persona Synthesis Active'}

---

#### 1. Chief Complaint
${report.chiefComplaint || 'Pending symptom description'}

#### 2. History of Present Illness (HPI)
${report.hpi.length > 0 ? report.hpi.map((item) => `- ${item}`).join('\n') : '- *Awaiting symptom progression details.*'}

#### 3. Review of Systems & Associated Symptoms
${report.associatedSymptoms.length > 0 ? report.associatedSymptoms.map((item) => `- ${item}`).join('\n') : '- *No associated systemic symptoms reported at this stage.*'}

#### 4. Past Medical History, Medications & Allergies
${report.pastHistoryAndMeds.length > 0 ? report.pastHistoryAndMeds.map((item) => `- ${item}`).join('\n') : '- *Routine history screening underway.*'}

#### 5. Safety & Red Flag Screening
${report.redFlags.map((item) => `- ${item}`).join('\n')}

#### 6. Clinical Assessment & Proposed Next Steps
${report.clinicalAssessment.map((item) => `- ${item}`).join('\n')}
`;
}
