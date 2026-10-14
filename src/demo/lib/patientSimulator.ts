/**
 * Patient Simulator for MedGemma Triage & Benchmark Testing (demo port)
 *
 * Adapted from STEMCare (`apps/web/src/lib/ai/medgemma/patientSimulator.ts`).
 * Generates natural patient responses for the curated scenarios (Flu,
 * Migraine, Malaria, Serotonin Syndrome).
 *
 * Mode behavior:
 * - Deterministic (default): the roleplay reasoner answers from the selected
 *   symptom pool; nothing leaves the browser.
 * - Live (VITE_DEMO_LIVE_MODE): roleplay generation runs through the server
 *   proxy (/api/gemini, role "patient_simulator") with the key held
 *   server-side. Any failure falls back to the deterministic reasoner.
 */

import type { ConditionName, SimulationConfig } from './harnessTypes';
import { isLiveMode, requestPatientLine } from './demoApi';

export interface SimulatedPatientResponseResult {
  response: string;
  updatedConfig: SimulationConfig;
  source: 'model' | 'fallback_reasoner';
}

export const CONDITION_SYMPTOMS: Record<ConditionName, string[]> = {
  Flu: [
    'I have a fever, feeling hot and cold.',
    'I have a cough.',
    'My throat is sore.',
    'My nose is running or blocked.',
    'My muscles ache all over.',
    'I have a headache.',
    'I feel very tired.',
    'I might possibly be throwing up or have diarrhea.',
  ],
  Migraine: [
    "I have a really bad headache, usually on one side of my head, and it's throbbing or pulsing.",
    'The headache gets worse when I move around.',
    'Bright lights really bother my eyes.',
    'Loud noises really bother my ears.',
    'Strong smells make me feel worse.',
    'I feel sick to my stomach, and I might even throw up.',
    'I feel really tired and worn out.',
    'I see flashing lights, zigzags, and blind spots before the headache starts.',
    'I have numbness or tingling on one side of my body or face.',
  ],
  Malaria: [
    'I have a high fever that comes and goes in waves.',
    'I have severe chills and shivering.',
    'I have a throbbing headache.',
    'I have muscle aches all over.',
    'I feel very tired and weak.',
    'I have nausea and abdominal discomfort.',
    'I recently returned from a 2-week safari trip in Tanzania with mosquito bites.',
  ],
  'Serotonin Syndrome': [
    'I feel agitated and restless.',
    'I have confusion and disorientation.',
    'My pupils are dilated.',
    'I have a rapid heart rate and high blood pressure.',
    "I'm sweating a lot and shivering.",
    'I have tremors and muscle twitching in my legs.',
    'My muscles feel rigid and stiff.',
    'I have overactive reflexes.',
    'I was coughing a lot and took dextromethorphan cough syrup on top of my daily SSRI antidepressant.',
  ],
};

export function createSimulation(condition: ConditionName): SimulationConfig {
  const allSymptoms = CONDITION_SYMPTOMS[condition];
  const selectedSymptoms: string[] = [];

  // Randomly select ~60% of symptoms
  for (const symptom of allSymptoms) {
    if (Math.random() < 0.6) {
      selectedSymptoms.push(symptom);
    }
  }

  // Ensure at least 3 symptoms are selected
  if (selectedSymptoms.length < 3) {
    const shuffled = [...allSymptoms].sort(() => Math.random() - 0.5);
    while (selectedSymptoms.length < 3 && shuffled.length > 0) {
      const symptom = shuffled.pop()!;
      if (!selectedSymptoms.includes(symptom)) {
        selectedSymptoms.push(symptom);
      }
    }
  }

  // For Malaria, ensure travel history is present
  if (condition === 'Malaria' && !selectedSymptoms.some((s) => s.includes('Tanzania'))) {
    selectedSymptoms.push(allSymptoms[allSymptoms.length - 1]);
  }

  // For Serotonin Syndrome, ensure medication interaction is present
  if (condition === 'Serotonin Syndrome' && !selectedSymptoms.some((s) => s.includes('SSRI') || s.includes('cough syrup'))) {
    selectedSymptoms.push(allSymptoms[allSymptoms.length - 1]);
  }

  return {
    condition,
    selectedSymptoms,
    previousAnswers: [],
  };
}

export function buildPatientPrompt(question: string, config: SimulationConfig): string {
  const symptomsText = config.selectedSymptoms.join('\n');
  const previousAnswersText =
    config.previousAnswers.length > 0
      ? config.previousAnswers.map((a, i) => `${i + 1}. ${a}`).join('\n')
      : 'None yet.';

  return `SYSTEM INSTRUCTION: You are roleplaying as a patient in a medical interview.

### Your Current Symptoms ###
This is how you have been feeling. Base ALL your answers on these facts. Do NOT invent new symptoms.
---
${symptomsText}
---

### Critical Rules of Roleplay ###
- **Act as the Patient:** Your entire response must be ONLY what the patient would say. Do not add external comments, notes, or clarifications.
- **No Guessing:** You DO NOT know your diagnosis or the name of your condition. Do not guess or speculate about it.
- **Answer Only What Is Asked:** Do not volunteer your entire list of symptoms at once. Respond naturally to the specific question asked by the interviewer.
- **Be Conversational:** Respond in a natural, conversational way. Use simple language.
- **Keep Responses Brief:** Aim for 1-2 sentences max.

### Your Previous Answers ###
---
${previousAnswersText}
---

### Current Question from the Clinical Assistant ###
${question}

Now respond as the patient. Remember: be brief, natural, and only answer what was asked.`;
}

export async function generatePatientResponse(
  question: string,
  config: SimulationConfig,
): Promise<SimulatedPatientResponseResult> {
  // Live roleplay via the server proxy (only when built in live mode).
  if (isLiveMode()) {
    const liveLine = await requestPatientLine({ question, config });
    if (liveLine && liveLine.trim()) {
      const cleanText = liveLine.trim().slice(0, 600);
      return {
        response: cleanText,
        updatedConfig: {
          ...config,
          previousAnswers: [...config.previousAnswers, cleanText],
        },
        source: 'model',
      };
    }
  }

  // Deterministic roleplay reasoner: matches question semantics to the
  // selected symptoms. Timeline answers are condition-aware so the roleplay
  // never contradicts the scenario's presenting complaint.
  const qLower = question.toLowerCase();
  let candidate = '';

  if (qLower.includes('when') || qLower.includes('start') || qLower.includes('how long')) {
    candidate = getTimelineAnswer(config.condition);
  } else if (qLower.includes('severe') || qLower.includes('scale') || qLower.includes('1 to 10') || qLower.includes('rate')) {
    candidate = "I'd rate it around 7 or 8 out of 10. It makes it really hard to focus on anything.";
  } else if (qLower.includes('travel') || qLower.includes('country') || qLower.includes('abroad')) {
    const travelSymptom = config.selectedSymptoms.find((s) => s.includes('Tanzania') || s.includes('trip'));
    candidate = travelSymptom || 'No recent overseas travel, just stayed locally.';
  } else if (qLower.includes('medication') || qLower.includes('drug') || qLower.includes('tablet') || qLower.includes('took')) {
    const medSymptom = config.selectedSymptoms.find((s) => s.includes('SSRI') || s.includes('cough syrup') || s.includes('Ibuprofen'));
    candidate = medSymptom || 'I took some paracetamol earlier today, but it didn’t make much difference.';
  } else if (qLower.includes('other symptom') || qLower.includes('alongside') || qLower.includes('also')) {
    const remaining = config.selectedSymptoms.filter((s) => !config.previousAnswers.includes(s));
    candidate = remaining[0] || 'Nothing else unusual, just feeling completely exhausted.';
  } else if (qLower.includes('chest') || qLower.includes('breath') || qLower.includes('red flag')) {
    candidate = config.condition === 'Serotonin Syndrome'
      ? "My heart feels like it's racing very fast, but I don't have stabbing chest pain."
      : 'No chest pain or shortness of breath.';
  } else {
    // Pick first unsaid symptom or general answer
    const remaining = config.selectedSymptoms.filter((s) => !config.previousAnswers.includes(s));
    candidate = remaining[0] || "I'm just really not feeling well and wanted to get checked by the doctor.";
  }

  return {
    response: candidate,
    updatedConfig: {
      ...config,
      previousAnswers: [...config.previousAnswers, candidate],
    },
    source: 'fallback_reasoner',
  };
}

// Timeline answers consistent with each scenario's presenting complaint.
function getTimelineAnswer(condition: ConditionName): string {
  switch (condition) {
    case 'Migraine':
      return 'It started about four hours ago, quite suddenly, and it has been getting worse since.';
    case 'Flu':
      return 'It came on over the last two days and has been getting steadily worse.';
    case 'Malaria':
      return 'The fevers started about a week ago, a few days after we got back from Tanzania.';
    case 'Serotonin Syndrome':
      return 'It started within a few hours of taking the cough syrup on top of my usual antidepressant.';
  }
}

export function getInitialComplaint(condition: ConditionName): string {
  const complaints: Record<ConditionName, string> = {
    Flu: "I've been feeling unwell with fever, sore throat, and body aches for the last two days.",
    Migraine: "I have a severe, pounding headache on the left side of my head with flashing lights in my vision.",
    Malaria: "I've had severe shivering chills followed by burning high fevers since returning from travel.",
    'Serotonin Syndrome': "I feel extremely restless and agitated, my heart is racing, and my legs keep twitching.",
  };
  return complaints[condition];
}
