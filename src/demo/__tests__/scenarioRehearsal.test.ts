import { describe, it, expect } from 'vitest';
import { initializeChatSession, processPatientMessage } from '../lib/medgemmaChatService';
import { createSimulation, generatePatientResponse, getInitialComplaint } from '../lib/patientSimulator';
import { generateDifferentialHypotheses } from '../lib/differentials';
import { DEMO_SCENARIOS } from '../lib/scenarios';
import { MAX_INTERVIEW_QUESTIONS } from '../lib/interviewPrioritization';
import type { MedGemmaChatState } from '../lib/harnessTypes';
import type { SimulationConfig } from '../lib/harnessTypes';

const SCENARIO_TO_CONDITION = {
  migraine_aura: 'Migraine',
  influenza: 'Flu',
  malaria_travel: 'Malaria',
  serotonin_syndrome: 'Serotonin Syndrome',
} as const;

/**
 * Rehearses the exact page autoplay loop headlessly: patient simulator →
 * interview engine → differential generation, per curated scenario. This is
 * the same path a design partner exercises with the Auto-Play button.
 */
async function rehearseScenario(scenarioId: keyof typeof SCENARIO_TO_CONDITION) {
  const scenario = DEMO_SCENARIOS.find((s) => s.id === scenarioId)!;
  const condition = SCENARIO_TO_CONDITION[scenarioId];

  let state: MedGemmaChatState = initializeChatSession(
    getInitialComplaint(condition) || scenario.initialComplaint,
    scenario.patientProfile.name,
  );
  let sim: SimulationConfig = createSimulation(condition);
  let complete = false;
  let turns = 0;
  let previousQuestion = '';

  while (!complete && turns < MAX_INTERVIEW_QUESTIONS + 2) {
    const assistantMsgs = state.messages.filter((m) => m.role === 'assistant');
    const lastQuestion = assistantMsgs[assistantMsgs.length - 1]?.content ?? '';

    const simResult = await generatePatientResponse(lastQuestion, sim);
    sim = simResult.updatedConfig;

    const result = await processPatientMessage(state, simResult.response);
    state = result.state;
    complete = result.interviewComplete;
    turns += 1;

    const reply = result.assistantReply.content;
    expect(reply).not.toBe(previousQuestion);
    previousQuestion = reply;
    if (!result.interviewComplete) {
      expect(reply.trim().endsWith('?')).toBe(true);
    }
    // The curated scenario symptom text must never trip the emergency gate
    // (e.g. negated "chest pain" mentions in the serotonin roleplay).
    expect(result.redFlagDetected).toBe(false);
  }

  return { state, complete, turns, scenario };
}

describe('full scenario rehearsal (page autoplay loop)', () => {
  it.each(DEMO_SCENARIOS.map((s) => [s.id, s.name] as const))(
    '%s (%s): interview completes, report finalizes, differentials generate clean',
    async (scenarioId) => {
      const { state, complete, turns } = await rehearseScenario(
        scenarioId as keyof typeof SCENARIO_TO_CONDITION,
      );

      expect(complete).toBe(true);
      expect(turns).toBeLessThanOrEqual(MAX_INTERVIEW_QUESTIONS);
      expect(state.report).toContain('Interview complete. Report finalized for GP review.');

      const outcome = await generateDifferentialHypotheses(state.report, scenarioId);
      expect(outcome.blocked).toBe(false);
      expect(outcome.hypotheses.length).toBeGreaterThanOrEqual(3);
      for (const h of outcome.hypotheses) {
        expect(h.recommendedAction).not.toContain('Assistive-only guardrail abstained');
      }
    },
    20000,
  );

  it.each(DEMO_SCENARIOS.map((s) => s.id) as Array<keyof typeof SCENARIO_TO_CONDITION>)(
    '%s: a second run completes too (repeat-play consistency)',
    async (scenarioId) => {
      const { complete } = await rehearseScenario(scenarioId);
      expect(complete).toBe(true);
    },
    20000,
  );
});

describe('custom-flow rehearsal (visitor types freely)', () => {
  it('reaches a completed reviewable report inside the question budget', async () => {
    let state = initializeChatSession('', 'Guest Patient');
    const answers = [
      'Persistent dry cough with mild breathlessness for a week',
      'It started about a week ago and is worse at night',
      'Around six out of ten, worse when I climb stairs',
      'No fever, no chest pain, no night sweats',
      'A warm drink soothes it briefly',
      'No other symptoms',
      'Keeping fluids down normally',
      'I tried cough syrup, it barely helped',
      'No recent travel',
      'No medical conditions',
      'No regular medications',
      'No known allergies',
      'Nothing relevant',
      'No',
    ];

    let complete = false;
    for (const answer of answers) {
      if (complete) break;
      const result = await processPatientMessage(state, answer);
      state = result.state;
      complete = result.interviewComplete;
    }

    expect(complete).toBe(true);
    expect(state.report).toContain('Persistent dry cough');
    expect(state.report).toMatch(/## Red Flags/);

    const outcome = await generateDifferentialHypotheses(state.report, 'custom');
    expect(outcome.blocked).toBe(false);
    expect(outcome.hypotheses.length).toBeGreaterThanOrEqual(3);
  });
});

describe('red-flag mid-interview rehearsal (visitor discloses emergency)', () => {
  it('halts a live interview immediately and blocks differentials', async () => {
    let state = initializeChatSession('', 'Guest Patient');
    state = (await processPatientMessage(state, 'I have a bad headache')).state;
    expect(state.messages.length).toBeGreaterThan(1);

    const result = await processPatientMessage(state, 'actually the worst headache of my life, came on suddenly');
    expect(result.redFlagDetected).toBe(true);
    expect(result.interviewComplete).toBe(true);

    const outcome = await generateDifferentialHypotheses(result.state.report, 'custom');
    expect(outcome.blocked).toBe(true);
  });
});
