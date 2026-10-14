/**
 * Intake gate: the interview must not end (adaptive termination or manual
 * wrap-up) until the HPI core and the full history block are covered —
 * otherwise the GP report ships "Not yet discussed" rows for information a
 * PCP needs.
 */

import { describe, expect, it } from 'vitest';
import {
  computeCoverageStatus,
  createInitialInterviewPolicy,
  isIntakeGateSatisfied,
  shouldTerminateInterview,
  applyUserAnswerToPolicy,
  selectInterviewTopic,
  INTERVIEW_TOPICS,
} from '../lib/interviewPrioritization';
import type { InterviewTopic, InterviewPolicyState } from '../lib/harnessTypes';

function askAll(policy = createInitialInterviewPolicy(), topics: InterviewTopic[]) {
  // Prime lastSelectedTopic so no ask is consumed by the presenting-complaint
  // turn (the reply to the opening greeting records no finding).
  let current: InterviewPolicyState = { ...policy, lastSelectedTopic: topics[0] };
  for (const topic of topics) {
    current = applyUserAnswerToPolicy(current, topic, 'Two days ago, it is constant and mild.');
  }
  return current;
}

const EVERY_TOPIC = [...INTERVIEW_TOPICS];

describe('isIntakeGateSatisfied', () => {
  it('is false on a fresh policy', () => {
    const coverage = computeCoverageStatus(createInitialInterviewPolicy(), false);
    expect(isIntakeGateSatisfied(coverage)).toBe(false);
  });

  it('stays false until ALL of pmh, meds, allergies, and family/social are covered', () => {
    const hpiCore = [
      'chief_complaint_onset_timeline',
      'chief_complaint_severity_impact',
      'progression_modifiers',
    ] as const;
    const partial = askAll(createInitialInterviewPolicy(), [...hpiCore, 'pmh', 'regular_meds', 'allergies']);
    expect(isIntakeGateSatisfied(computeCoverageStatus(partial, false))).toBe(false);

    const full = askAll(partial, ['family_social']);
    expect(isIntakeGateSatisfied(computeCoverageStatus(full, false))).toBe(true);
  });

  it('counts a blocked topic (asked twice) as covered', () => {
    // Prime past the presenting-complaint turn, then answer ambiguously twice.
    let policy: InterviewPolicyState = { ...createInitialInterviewPolicy(), lastSelectedTopic: 'allergies' };
    policy = applyUserAnswerToPolicy(policy, 'allergies', 'not sure');
    policy = applyUserAnswerToPolicy(policy, 'allergies', 'still not sure');
    // asked twice → blocked; must still count as covered
    expect(policy.blockedTopics).toContain('allergies');
    expect(isIntakeGateSatisfied(computeCoverageStatus(policy, false))).toBe(false); // rest missing
  });

  it('requires the HPI core (onset, severity, progression) as well', () => {
    const historyOnly = askAll(createInitialInterviewPolicy(), [
      'pmh',
      'regular_meds',
      'allergies',
      'family_social',
    ]);
    expect(isIntakeGateSatisfied(computeCoverageStatus(historyOnly, false))).toBe(false);

    const withHpi = askAll(historyOnly, [
      'chief_complaint_onset_timeline',
      'chief_complaint_severity_impact',
      'progression_modifiers',
    ]);
    expect(isIntakeGateSatisfied(computeCoverageStatus(withHpi, false))).toBe(true);
  });
});

describe('shouldTerminateInterview honors the intake gate', () => {
  it('never soft-terminates while the gate is unsatisfied, even on low yield', () => {
    // All topics asked once but the history block skipped entirely: selection
    // is weak (everything blocked or penalised) yet termination must not fire.
    const noHistory = askAll(
      createInitialInterviewPolicy(),
      EVERY_TOPIC.filter((t) => !['pmh', 'regular_meds', 'allergies', 'family_social'].includes(t)),
    );
    const coverage = computeCoverageStatus(noHistory, false);
    expect(coverage.highYieldComplete).toBe(true);
    const selection = selectInterviewTopic(noHistory, 'headache');
    const decision = shouldTerminateInterview(noHistory, coverage, selection);
    expect(decision.shouldTerminate).toBe(false);
  });

  it('terminates once the gate is satisfied with high-yield coverage', () => {
    const full = askAll(createInitialInterviewPolicy(), EVERY_TOPIC);
    const coverage = computeCoverageStatus(full, false);
    const selection = selectInterviewTopic(full, 'headache');
    const decision = shouldTerminateInterview(full, coverage, selection);
    expect(decision.shouldTerminate).toBe(true);
  });

  it('the hard cap still terminates an unsatisfied interview', () => {
    let policy = createInitialInterviewPolicy();
    for (let i = 0; i < 20; i++) {
      policy = applyUserAnswerToPolicy(policy, 'broad_ros_optional', 'not sure');
    }
    const decision = shouldTerminateInterview(
      policy,
      computeCoverageStatus(policy, false),
      selectInterviewTopic(policy, 'headache'),
    );
    expect(decision.shouldTerminate).toBe(true);
    expect(decision.reason).toBe('hard_cap');
  });
});

describe('wrap-up refusal and report classification', () => {
  it('a refused wrap-up leaves the policy untouched', async () => {
    const { processPatientMessage } = await import('../lib/medgemmaChatService');
    let state = (await import('../lib/medgemmaChatService')).initializeChatSession('', 'Guest Patient');
    state = (await processPatientMessage(state, 'Persistent dry cough for a week')).state;
    const countsBefore = JSON.stringify(state.interviewPolicy?.askedTopicCounts);
    const blockedBefore = JSON.stringify(state.interviewPolicy?.blockedTopics);

    const refused = await processPatientMessage(state, '', true);
    expect(refused.interviewComplete).toBe(false);
    expect(JSON.stringify(refused.state.interviewPolicy?.askedTopicCounts)).toBe(countsBefore);
    expect(JSON.stringify(refused.state.interviewPolicy?.blockedTopics)).toBe(blockedBefore);
  });

  it('classifies screening answers by polarity', async () => {
    const { buildDeterministicReport } = await import('../lib/medgemmaChatService');
    const { createInitialInterviewPolicy, applyUserAnswerToPolicy } = await import('../lib/interviewPrioritization');
    const base = { ...createInitialInterviewPolicy(), lastSelectedTopic: 'breathing_chest_red_flags' as const };
    let policy = applyUserAnswerToPolicy(base, 'breathing_chest_red_flags', 'I do get a bit breathless climbing stairs, but no pain');
    const positiveReport = buildDeterministicReport({ policy, complaint: 'cough', complete: false });
    // A positive finding must NOT sit under Pertinent Negatives.
    expect(positiveReport).toMatch(/\*\*Associated Symptoms\*\*:.*breathless climbing stairs/);
    expect(positiveReport).not.toMatch(/\*\*Pertinent Negatives\*\*:.*Reports:/);

    let policy2 = applyUserAnswerToPolicy(base, 'breathing_chest_red_flags', 'No chest pain or shortness of breath');
    const negativeReport = buildDeterministicReport({ policy: policy2, complaint: 'cough', complete: false });
    expect(negativeReport).toMatch(/\*\*Pertinent Negatives\*\*: No chest pain/);
    expect(negativeReport).not.toMatch(/\*\*Associated Symptoms\*\*:.*No chest pain/);
  });
});
