import { describe, it, expect } from 'vitest';
import { generateDifferentialHypotheses } from '../lib/differentials';
import { DEMO_SCENARIOS } from '../lib/scenarios';

const ABSTAIN_MARKER = 'Assistive-only guardrail abstained';

describe('differentials — scenario benchmark path', () => {
  it.each(DEMO_SCENARIOS.map((s) => [s.id, s.name] as const))(
    '%s (%s) returns clean ranked hypotheses',
    async (scenarioId) => {
      const result = await generateDifferentialHypotheses('any report', scenarioId);
      expect(result.blocked).toBe(false);
      expect(result.source).toBe('scenario_benchmark');
      expect(result.hypotheses.length).toBeGreaterThanOrEqual(3);

      for (const h of result.hypotheses) {
        expect(h.probability).toBeGreaterThan(0);
        expect(h.probability).toBeLessThanOrEqual(1);
        expect(['high', 'medium', 'low']).toContain(h.confidenceBucket);
        expect(h.keyFindings.length).toBeGreaterThan(0);
        expect(h.recommendedAction).not.toContain(ABSTAIN_MARKER);
        expect(h.recommendedAction).not.toMatch(/\bprescribe\b[^.]*\d+\s?mg/i);
        expect(h.guidelineRef).toBeTruthy();
      }

      // Ranked descending by probability
      const probs = result.hypotheses.map((h) => h.probability);
      expect([...probs].sort((a, b) => b - a)).toEqual(probs);
    },
  );
});

describe('differentials — deterministic clinical reasoner (custom path)', () => {
  it.each([
    ['knee swelling after football, twisting injury', /meniscal|knee|joint/i],
    ['lower back pain shooting down my leg', /radiculopathy|sciatica|lumbosacral/i],
    ['throbbing headache with light sensitivity', /migraine|headache/i],
    ['dry cough and fever for three days', /respiratory|bronchitis|pharyngitis|upper respiratory/i],
    ['stomach cramps and nausea after meals', /dyspepsia|gastro|reflux/i],
    ['unexplained fatigue and weight changes', /self-limiting|subacute|atypical/i],
  ])('routes %j to the right hypothesis family', async (reportText, family) => {
    const result = await generateDifferentialHypotheses(reportText, 'custom');
    expect(result.blocked).toBe(false);
    expect(result.source).toBe('clinical_reasoner');
    expect(result.hypotheses.length).toBeGreaterThanOrEqual(3);
    expect(result.hypotheses.map((h) => h.condition).join(' ')).toMatch(family);
    for (const h of result.hypotheses) {
      expect(h.recommendedAction).not.toContain(ABSTAIN_MARKER);
    }
  });
});

describe('differentials — red-flag hard gate', () => {
  it('blocks on explicit positive red-flag report text', async () => {
    const report =
      '## Red Flags\n⚠️ **EMERGENCY RED FLAG DETECTED**: Mental health crisis\nGuidance: call 999 now';
    const result = await generateDifferentialHypotheses(report, 'custom');
    expect(result.blocked).toBe(true);
    expect(result.hypotheses).toHaveLength(0);
    expect(result.blockedReason).toMatch(/red flag|emergency/i);
  });

  it('does NOT block on a negative red-flag screen', async () => {
    const result = await generateDifferentialHypotheses(
      '## Red Flags\nScreened negative for emergency red flags.',
      'custom',
    );
    expect(result.blocked).toBe(false);
  });

  it('does NOT block on benign sections mentioning red flags in negation', async () => {
    const result = await generateDifferentialHypotheses(
      '## HPI\n- screened negative for emergency red flags\n## Red Flags\nNone identified',
      'custom',
    );
    expect(result.blocked).toBe(false);
  });
});
