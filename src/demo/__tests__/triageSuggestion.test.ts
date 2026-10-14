import { describe, expect, it } from 'vitest';
import { suggestTriage } from '../lib/triageSuggestion';
import type { DifferentialHypothesis } from '../types';

const hyp = (over: Partial<DifferentialHypothesis>): DifferentialHypothesis => ({
  id: 'h1',
  condition: 'Migraine without aura',
  probability: 0.78,
  confidenceBucket: 'high',
  keyFindings: ['Unilateral throbbing headache'],
  recommendedAction: 'Consider triptan review at consultation',
  guidelineRef: 'Test guideline',
  ...over,
});

describe('suggestTriage', () => {
  it('escalates on an emergency instruction', () => {
    const s = suggestTriage(hyp({ recommendedAction: 'Immediate escalation to A&E if symptoms progress' }));
    expect(s.pathway).toBe('emergency_transfer');
  });

  it('maps same-day language to same-day GP', () => {
    const s = suggestTriage(hyp({ recommendedAction: 'Urgent review: combined oral contraceptive is contraindicated (UKMEC 4)' }));
    expect(s.pathway).toBe('same_day_gp');
    expect(s.reason).toContain('Migraine without aura');
  });

  it('maps specialist language to referral', () => {
    const s = suggestTriage(hyp({ recommendedAction: 'Consider neurology referral to exclude automatasia', confidenceBucket: 'low' }));
    expect(s.pathway).toBe('specialist_referral');
  });

  it('falls back by plausibility bucket', () => {
    expect(suggestTriage(hyp({ recommendedAction: 'Clinician review advised' })).pathway).toBe('same_day_gp');
    expect(suggestTriage(hyp({ recommendedAction: 'Clinician review advised', confidenceBucket: 'low' })).pathway).toBe('routine_gp');
  });

  it('suggests emergency transfer on red flag regardless of content', () => {
    expect(suggestTriage(undefined, true).pathway).toBe('emergency_transfer');
  });

  it('grounds the reason in the selected hypothesis', () => {
    const s = suggestTriage(hyp({}));
    expect(s.reason).toContain('Migraine without aura');
  });
});

describe('extractCitedSummary', () => {
  it('returns the HPI bullets with citations and stops at the next section', async () => {
    const { extractCitedSummary } = await import('../lib/medgemmaEngine');
    const report = [
      '## Chief Complaint',
      'Headache',
      '',
      '## History of Present Illness',
      '- **Onset**: Two days ago [[4]]',
      '- **Severity**: 7 to 8 out of 10 [[6]]',
      '',
      '## Relevant Medical History',
      '- **Medications**: Paracetamol [[9]]',
    ].join('\n');
    const summary = extractCitedSummary(report);
    expect(summary).toContain('**Onset**: Two days ago [[4]]');
    expect(summary).toContain('**Severity**');
    expect(summary).not.toContain('Medications');
    expect(summary).not.toContain('Chief Complaint');
  });

  it('returns empty when the report has no HPI section', async () => {
    const { extractCitedSummary } = await import('../lib/medgemmaEngine');
    expect(extractCitedSummary('')).toBe('');
    expect(extractCitedSummary('## Red Flags\nNone')).toBe('');
  });
});
