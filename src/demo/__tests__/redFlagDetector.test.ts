import { describe, it, expect } from 'vitest';
import { detectRedFlags } from '../lib/redFlagDetector';

const urgencyOf = (text: string) => detectRedFlags(text).urgency ?? null;
const detectedOf = (text: string) => detectRedFlags(text).detected;

describe('redFlagDetector — escalation coverage (canonical NHS set)', () => {
  it.each([
    ['I want to kill myself', 'call_999'],
    ['I have been thinking about suicide', 'call_999'],
    ['there is severe bleeding', 'call_999'],
    ['he is choking', 'call_999'],
    ['possible overdose', 'call_999'],
    ['she is unconscious', 'call_999'],
    ['the patient is not responding', 'call_999'],
    ['sudden thunderclap headache', 'call_999'],
    ['worst headache I have ever had', 'call_999'],
    ['chest pain and sweating', 'call_999'],
    ['chest pain going down my arm', 'call_999'],
    ['I cannot breathe', 'call_999'],
    ["severe and I can't breathe", 'call_999'],
  ])('%s → 999', (text, expected) => {
    expect(urgencyOf(text)).toBe(expected);
  });

  it.each([
    ['I have chest pain', 'call_111'],
    ['difficulty breathing since yesterday', 'call_111'],
    ['there is blood in my stool', 'call_111'],
    ['blood when I vomit', 'call_111'],
    ['sudden vision loss this morning', 'call_111'],
    ['sometimes I self harm', 'call_111'],
  ])('%s → 111', (text, expected) => {
    expect(urgencyOf(text)).toBe(expected);
  });

  it('includes Samaritans signposting for mental-health crises', () => {
    expect(detectRedFlags('I want to kill myself').guidance).toContain('116 123');
    expect(detectRedFlags('I self harm').guidance).toContain('116 123');
  });

  it('matches the common "worst headache of my life" phrasing', () => {
    expect(urgencyOf('this is the worst headache of my life')).toBe('call_999');
  });

  it('is case-insensitive and punctuation-tolerant', () => {
    expect(urgencyOf('Chest Pain!')).toBe('call_111');
    expect(urgencyOf('SEVERE BLEEDING.')).toBe('call_999');
  });
});

describe('redFlagDetector — negation handling', () => {
  it("does not fire on negated symptoms ('I don't have chest pain')", () => {
    expect(detectedOf("I don't have chest pain")).toBe(false);
  });

  it('does not fire on "no thunderclap headache"', () => {
    expect(detectedOf('no thunderclap headache, just a mild ache')).toBe(false);
  });

  it('does not fire on denied self-harm', () => {
    expect(detectedOf('I do not self harm')).toBe(false);
  });

  it('does not fire on negated chest pain inside a longer message', () => {
    expect(detectedOf("I have a cough but no chest pain and no difficulty breathing")).toBe(false);
  });

  it('still fires when the symptom is affirmed elsewhere in the message', () => {
    expect(urgencyOf('no headache, but I have chest pain and sweating')).toBe('call_999');
  });
});

describe('redFlagDetector — demo scenario extensions', () => {
  it('detects serotonin toxicity (clonus + tramadol) as 999', () => {
    expect(urgencyOf('my legs have clonus and I take tramadol')).toBe('call_999');
  });

  it('detects post-travel malaria risk as same-day GP', () => {
    expect(urgencyOf('malaria risk, I had rigors after travel')).toBe('same_day_gp');
  });

  it('detects anaphylaxis as 999', () => {
    expect(urgencyOf('my throat is closing')).toBe('call_999');
  });
});

describe('redFlagDetector — benign and empty input', () => {
  it.each([
    '',
    '   ',
    'my knee hurts after football',
    'I feel a bit dizzy',
    'mild sore throat for a day',
  ])('%j does not trigger', (text) => {
    expect(detectedOf(text)).toBe(false);
  });
});

describe('redFlagDetector — result shape', () => {
  it('returns headline and guidance alongside urgency on detection', () => {
    const result = detectRedFlags('chest pain and sweating');
    expect(result.detected).toBe(true);
    expect(result.symptom).toBeTruthy();
    expect(result.headline).toContain('999');
    expect(result.guidance).toBeTruthy();
  });
});
