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

  it('compiles findings into the canonical clinical skeleton with citations', async () => {
    let state = initializeChatSession('', 'Guest Patient');
    for (const answer of ANSWERS.slice(0, 5)) {
      state = (await processPatientMessage(state, answer)).state;
    }
    // Canonical GP sections — never the interview's internal topic labels.
    expect(state.report).toContain('## Chief Complaint');
    expect(state.report).toContain('## History of Present Illness');
    expect(state.report).toContain('## Relevant Medical History');
    expect(state.report).not.toMatch(/GI hydration tolerance|Branch discriminators|Onset and timeline|Core associated symptoms/);
    expect(state.report).not.toContain('chief_complaint');
    // Each finding carries a [[n]] provenance marker into the transcript.
    expect(state.report).toMatch(/\[\[\d+\]\]/);
  });
});

describe('medgemmaChatService — conclude early', () => {
  it('refuses wrap-up before the intake gate, honours it after, and appends no empty patient bubble', async () => {
    let state = initializeChatSession('', 'Guest Patient');
    state = (await processPatientMessage(state, 'Persistent dry cough for a week')).state;

    // Before the intake gate (HPI core + history block) is satisfied, a
    // force wrap-up must NOT complete the interview.
    const early = await processPatientMessage(state, '', true);
    expect(early.interviewComplete).toBe(false);
    expect(early.state.report).not.toContain('Interview complete');
    // The interviewer just asks its next question — no empty user bubble.
    expect(userCount(early.state)).toBe(userCount(state));

    // Drive a real interview until the intake gate is satisfied.
    let guard = 0;
    let complete = false;
    while (guard++ < 18) {
      const turn = await processPatientMessage(state, 'It started two days ago, it is mild and constant.');
      state = turn.state;
      complete = turn.interviewComplete;
      if (complete) break;
    }
    expect(complete).toBe(true);

    // A wrap-up after the gate appends no empty patient bubble.
    const before = userCount(state);
    const result = await processPatientMessage(state, '', true);
    expect(result.interviewComplete).toBe(true);
    expect(userCount(result.state)).toBe(before);
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

describe('medgemmaChatService — red-flag report hygiene', () => {
  it('terminates with exactly one Summary section', async () => {
    const state = initializeChatSession('Sore throat and fever', 'Sophie Clarke');
    const result = await processPatientMessage(state, 'I want to kill myself');
    const summaries = result.state.report.match(/## Summary/g) ?? [];
    expect(summaries).toHaveLength(1);
    expect(result.state.report).toContain('Interview terminated due to emergency red flag.');
  });
});

describe('medgemmaChatService — off-track & clinical alignment redirection', () => {
  it('protects presentingComplaint and question budget on opening off-topic messages', async () => {
    let state = initializeChatSession('', 'Guest Patient');
    const r1 = await processPatientMessage(state, 'hi');
    expect(r1.assistantReply.offTrackRedirect).toBe(true);
    expect(r1.state.presentingComplaint).toBe('');
    expect(r1.state.interviewPolicy?.questionsAsked).toBe(1);

    const r2 = await processPatientMessage(r1.state, 'tell me a joke about cats');
    expect(r2.assistantReply.offTrackRedirect).toBe(true);
    expect(r2.assistantReply.content).not.toBe(r1.assistantReply.content);
    expect(r2.state.presentingComplaint).toBe('');
    expect(r2.state.report).not.toContain('tell me a joke');
    expect(r2.state.interviewPolicy?.questionsAsked).toBe(1);

    // Real complaint starts the interview normally once provided
    const r3 = await processPatientMessage(r2.state, 'Severe headache since this morning');
    expect(r3.assistantReply.offTrackRedirect).toBeUndefined();
    expect(r3.state.presentingComplaint).toBe('Severe headache since this morning');
    expect(r3.state.interviewPolicy?.questionsAsked).toBe(2);
  });

  it('redirects mid-interview non-clinical chatter without polluting the report or closing the active topic', async () => {
    let state = initializeChatSession('', 'Guest Patient');
    state = (await processPatientMessage(state, 'Sharp knee pain after playing football')).state;
    const pendingTopic = state.interviewPolicy?.lastSelectedTopic;
    expect(pendingTopic).toBe('chief_complaint_onset_timeline');
    const budgetBefore = state.interviewPolicy?.questionsAsked;

    const deflected = await processPatientMessage(state, 'What is the weather like in London today?');
    expect(deflected.assistantReply.offTrackRedirect).toBe(true);
    expect(deflected.assistantReply.content.toLowerCase()).toContain('when did your symptoms');
    expect(deflected.state.interviewPolicy?.lastSelectedTopic).toBe(pendingTopic);
    expect(deflected.state.interviewPolicy?.blockedTopics).not.toContain(pendingTopic);
    expect(deflected.state.interviewPolicy?.questionsAsked).toBe(budgetBefore);
    expect(deflected.state.report).not.toContain('London');
  });

  it('acknowledges and opportunistically captures off-target clinical facts while refocusing on the active question', async () => {
    let state = initializeChatSession('', 'Guest Patient');
    state = (await processPatientMessage(state, 'Persistent migraine headache')).state;
    expect(state.interviewPolicy?.lastSelectedTopic).toBe('chief_complaint_onset_timeline');
    const budgetBefore = state.interviewPolicy?.questionsAsked;

    // Patient shares meds & allergies instead of answering onset
    const offTarget = await processPatientMessage(
      state,
      'I take 20mg Omeprazole daily and I am allergic to penicillin',
    );
    expect(offTarget.assistantReply.offTrackRedirect).toBe(true);
    expect(offTarget.assistantReply.content.toLowerCase()).toContain('noted your medications and allergies');
    expect(offTarget.assistantReply.content.toLowerCase()).toContain('when did your symptoms');

    // Active topic stays open & budget preserved
    expect(offTarget.state.interviewPolicy?.lastSelectedTopic).toBe('chief_complaint_onset_timeline');
    expect(offTarget.state.interviewPolicy?.blockedTopics).not.toContain('chief_complaint_onset_timeline');
    expect(offTarget.state.interviewPolicy?.questionsAsked).toBe(budgetBefore);

    // Opportunistic facts appear under the rightful report rows with transcript citation
    expect(offTarget.state.report).toContain('I take 20mg Omeprazole daily');
    expect(offTarget.state.report).toContain('I am allergic to penicillin');
    expect(offTarget.state.report).toMatch(/\*\*Medications\*\*: I take 20mg Omeprazole daily \[\[\d+\]\]/);
    expect(offTarget.state.report).toMatch(/\*\*Allergies\*\*: I am allergic to penicillin \[\[\d+\]\]/);

    // Next turn, patient actually answers onset -> onset is documented and interview moves on
    const onTrack = await processPatientMessage(offTarget.state, 'It started three days ago');
    expect(onTrack.assistantReply.offTrackRedirect).toBeUndefined();
    expect(onTrack.state.report).toMatch(/\*\*Onset & Duration\*\*: It started three days ago \[\[\d+\]\]/);
    expect(onTrack.state.interviewPolicy?.lastSelectedTopic).not.toBe('chief_complaint_onset_timeline');
  });

  it('redirects clinical questions asked by the patient back to the active intake question', async () => {
    let state = initializeChatSession('', 'Guest Patient');
    state = (await processPatientMessage(state, 'Sore throat and body aches')).state;
    expect(state.interviewPolicy?.lastSelectedTopic).toBe('chief_complaint_onset_timeline');

    const patientQuestion = await processPatientMessage(state, 'Could this be strep throat?');
    expect(patientQuestion.assistantReply.offTrackRedirect).toBe(true);
    expect(patientQuestion.assistantReply.content.toLowerCase()).toContain('when did your symptoms');
    expect(patientQuestion.state.interviewPolicy?.lastSelectedTopic).toBe('chief_complaint_onset_timeline');
  });
});
