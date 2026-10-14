import { describe, it, expect } from 'vitest';
import {
  createSimulation,
  generatePatientResponse,
  getInitialComplaint,
  CONDITION_SYMPTOMS,
} from '../lib/patientSimulator';
import type { ConditionName } from '../lib/harnessTypes';

const CONDITIONS = Object.keys(CONDITION_SYMPTOMS) as ConditionName[];

describe('patientSimulator — scenario construction', () => {
  it.each(CONDITIONS)('%s selects at least 3 symptoms from the authentic pool', (condition) => {
    const sim = createSimulation(condition);
    expect(sim.selectedSymptoms.length).toBeGreaterThanOrEqual(3);
    const pool = CONDITION_SYMPTOMS[condition];
    for (const symptom of sim.selectedSymptoms) {
      expect(pool).toContain(symptom);
    }
  });

  it('always includes malaria travel history', () => {
    for (let i = 0; i < 10; i += 1) {
      const sim = createSimulation('Malaria');
      expect(sim.selectedSymptoms.some((s) => s.includes('Tanzania'))).toBe(true);
    }
  });

  it('always includes the serotonergic medication interaction', () => {
    for (let i = 0; i < 10; i += 1) {
      const sim = createSimulation('Serotonin Syndrome');
      expect(
        sim.selectedSymptoms.some((s) => s.includes('SSRI') || s.includes('cough syrup')),
      ).toBe(true);
    }
  });
});

describe('patientSimulator — roleplay answers', () => {
  it('gives condition-consistent timeline answers (no contradiction with the complaint)', async () => {
    const expectations: Array<[ConditionName, RegExp]> = [
      ['Migraine', /four hours/i],
      ['Flu', /two days/i],
      ['Malaria', /Tanzania/i],
      ['Serotonin Syndrome', /cough syrup/i],
    ];
    for (const [condition, pattern] of expectations) {
      const sim = createSimulation(condition);
      const result = await generatePatientResponse('When did your symptoms start?', sim);
      expect(result.response).toMatch(pattern);
    }
  });

  it('always returns a non-empty response and records it', async () => {
    const sim = createSimulation('Flu');
    const before = sim.previousAnswers.length;
    const result = await generatePatientResponse('What other symptoms are you having?', sim);
    expect(result.response.trim().length).toBeGreaterThan(0);
    expect(result.updatedConfig.previousAnswers.length).toBe(before + 1);
  });

  it('provides an initial complaint for every condition', () => {
    for (const condition of CONDITIONS) {
      expect(getInitialComplaint(condition).length).toBeGreaterThan(10);
    }
  });
});
