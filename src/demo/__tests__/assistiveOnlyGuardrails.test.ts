import { describe, it, expect } from 'vitest';
import {
  evaluateAssistiveOnlyGuardrails,
  buildAssistiveOnlyAbstainNote,
  buildAssistiveOnlyEscalationNote,
} from '../lib/assistiveOnlyGuardrails';

const actionOf = (text: string) => evaluateAssistiveOnlyGuardrails(text).action;

describe('assistiveOnlyGuardrails — escalation patterns', () => {
  it.each([
    'Please call 999 now',
    'you should go to A&E now',
    'this is a medical emergency',
    'there is suicidal ideation in the history',
    'the patient reports self-harm',
  ])('%s escalates', (text) => {
    expect(actionOf(text)).toBe('escalate');
  });
});

describe('assistiveOnlyGuardrails — abstain patterns', () => {
  it.each([
    'the definitive diagnosis is pneumonia',
    'this is the confirmed diagnosis',
    'you definitely have flu',
    'the diagnosis is biliary colic',
    'this is diagnosed as migraine',
    'start amoxicillin 500mg three times daily',
    'prescribe sumatriptan 50mg for the migraine',
  ])('%s abstains', (text) => {
    expect(actionOf(text)).toBe('abstain');
  });
});

describe('assistiveOnlyGuardrails — clean reviewer content passes', () => {
  it.each([
    'Clinician to review acute therapy options if migraine confirmed.',
    'Blood cultures indicated concurrently with malaria films.',
    'Clinician examination for joint line tenderness (McMurray sign).',
    'EMERGENCY A&E TRANSFER (999). Immediate discontinuation of all serotonergic agents.',
  ])('%s allows', (text) => {
    expect(actionOf(text)).toBe('allow');
  });
});

describe('assistiveOnlyGuardrails — abstain notes', () => {
  it('builds abstain and escalation notes mentioning clinician review', () => {
    expect(buildAssistiveOnlyAbstainNote('test reason')).toContain('manual clinician review');
    expect(buildAssistiveOnlyEscalationNote('test reason')).toContain('Clinician-led assessment');
  });
});
