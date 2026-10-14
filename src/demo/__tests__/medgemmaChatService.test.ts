import { describe, it, expect } from 'vitest';
import {
  initializeChatSession,
  processPatientMessage,
  CANONICAL_OPENING_GREETING,
  INTERVIEW_COMPLETE_DISPLAY_PHRASE,
} from '../lib/medgemmaChatService';
import { MAX_INTERVIEW_QUESTIONS } from '../lib/interviewPrioritization';
import type { MedGemmaChatState } from '../lib/harnessTypes';

const isQuestion = (text: string) => text.trim().endsWith('?');
const userCount = (state: MedGemmaChatState) =>
  state.messages.filter((m) => m.role === 'user').length;

describe('medgemmaChatService — session initialization', () => {
  it('opens with the canonical greeting and an unassessed safety screen', () => {
    const state = initializeChatSession('', 'Guest Patient');
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].content).toBe(CANONICAL_OPENING_GREETING);
    expect(state.report).toContain('Not yet assessed');
    expect(state.hasRedFlag).toBe(false);
  });

  it('seeds the report with a provided presenting complaint', () => {
    const state = initializeChatSession('Sore throat and fever', 'Sophie Clarke');
    expect(state.report).toContain('Sore throat and fever');
  });
});

describe('medgemmaChatService — custom interview flow', () => {
  const ANSWERS = [
    'Sharp knee pain after playing football two days ago',
    'It started suddenly when I twisted on the pitch',
    'About seven out of ten when I walk',
    'Some swelling but no fever',
    'Nothing makes it better, rest helps a little',
    'No chest pain or breathing trouble',
    'No stomach or urinary changes',
    'I am keeping fluids down fine',
    'Ibuprofen has not really helped',
    'No recent travel or sick contacts',
    'No medical conditions I know of',
    'Just paracetamol occasionally',
    'No allergies',
    'Nothing relevant in family history',
    'Nothing else to add',
  ];

  it('runs to completion without repeating questions or leaking control markers', async () => {
    let state = initializeChatSession('', 'Guest Patient');
    let completed = false;
    let previousQuestion = CANONICAL_OPENING_GREETING;
    let turns = 0;

    for (const answer of ANSWERS) {
      if (completed || turns >= MAX_INTERVIEW_QUESTIONS + 2) break;
      const result = await processPatientMessage(state, answer);
      state = result.state;
      completed = result.interviewComplete;
      turns += 1;

      const reply = result.assistantReply.content;
      // Every assistant reply is either a single question or the clean
      // completion phrase — never the raw 'End interview.' control marker.
      if (result.interviewComplete) {
        expect(reply).toBe(INTERVIEW_COMPLETE_DISPLAY_PHRASE);
      } else {
        expect(isQuestion(reply)).toBe(true);
        expect(reply).not.toContain('End interview');
      }
      expect(reply).not.toBe(previousQuestion); // no identical consecutive questions
      previousQuestion = reply;
    }

    expect(completed).toBe(true);
    expect(turns).toBeLessThanOrEqual(MAX_INTERVIEW_QUESTIONS);
  });

  it('keeps the presenting complaint sticky (first substantive message wins)', async () => {
    let state = initializeChatSession('', 'Guest Patient');
    state = (await processPatientMessage(state, ANSWERS[0])).state;
    expect(state.presentingComplaint).toBe(ANSWERS[0]);

    state = (await processPatientMessage(state, 'A completely different later answer')).state;
    expect(state.presentingComplaint).toBe(ANSWERS[0]);
    expect(state.report).toContain(`## Chief Complaint\n${ANSWERS[0]}`);
  });

  it('records findings under human-readable topic labels', async () => {
    let state = initializeChatSession('', 'Guest Patient');
    for (const answer of ANSWERS.slice(0, 5)) {
      state = (await processPatientMessage(state, answer)).state;
    }
    expect(state.report).toMatch(/- \*\*[A-Z][^*]+\*\*: /); // 'Onset and timeline': ...
    expect(state.report).not.toContain('chief_complaint');
  });
});

describe('medgemmaChatService — conclude early', () => {
  it('appends no empty patient bubble and completes the interview', async () => {
    let state = initializeChatSession('', 'Guest Patient');
    state = (await processPatientMessage(state, 'Persistent dry cough for a week')).state;
    const before = userCount(state);

    const result = await processPatientMessage(state, '', true);
    expect(result.interviewComplete).toBe(true);
    expect(userCount(result.state)).toBe(before); // no empty user message
    expect(result.state.messages[result.state.messages.length - 1].role).toBe('assistant');
    expect(result.state.report).toContain('GP review');
  });
});

describe('medgemmaChatService — red-flag gate', () => {
  it('terminates on suicide disclosure with 999 + Samaritans and flags the message', async () => {
    const state = initializeChatSession('', 'Guest Patient');
    const result = await processPatientMessage(state, 'I want to kill myself');

    expect(result.redFlagDetected).toBe(true);
    expect(result.interviewComplete).toBe(true);
    expect(result.assistantReply.redFlag).toBe(true);
    expect(result.state.hasRedFlag).toBe(true);
    expect(result.assistantReply.content).toContain('999');
    expect(result.assistantReply.content).toContain('116 123');
    expect(result.state.report).toMatch(/EMERGENCY RED FLAG DETECTED/i);
    expect(result.state.report).toContain('Samaritans');
  });

  it('routes self-harm disclosure to 111 with signposting', async () => {
    const state = initializeChatSession('', 'Guest Patient');
    const result = await processPatientMessage(state, 'sometimes I self harm');
    expect(result.redFlagDetected).toBe(true);
    expect(result.assistantReply.content).toContain('111');
  });

  it('routes plain chest pain to 111, chest pain with sweating to 999', async () => {
    const state = initializeChatSession('', 'Guest Patient');
    const plain = await processPatientMessage(state, 'I have chest pain');
    const severe = await processPatientMessage(
      initializeChatSession('', 'Guest Patient'),
      'I have chest pain and sweating',
    );
    expect(plain.assistantReply.content).toContain('111');
    expect(severe.assistantReply.content).toContain('999');
  });

  it('continues the interview when symptoms are negated', async () => {
    const state = initializeChatSession('', 'Guest Patient');
    const result = await processPatientMessage(
      state,
      "I have a cough but I don't have chest pain",
    );
    expect(result.redFlagDetected).toBe(false);
    expect(result.interviewComplete).toBe(false);
    expect(isQuestion(result.assistantReply.content)).toBe(true);
  });

  it('blocks differential generation on the terminated report', async () => {
    const { generateDifferentialHypotheses } = await import('../lib/differentials');
    const state = initializeChatSession('', 'Guest Patient');
    const result = await processPatientMessage(state, 'I want to kill myself');
    const outcome = await generateDifferentialHypotheses(result.state.report, 'custom');
    expect(outcome.blocked).toBe(true);
    expect(outcome.hypotheses).toHaveLength(0);
    expect(outcome.blockedReason).toBeTruthy();
  });
});
