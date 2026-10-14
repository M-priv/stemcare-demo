/**
 * MedGemma Dual-Persona Chat Service (demo port)
 *
 * Adapted from STEMCare (`apps/web/src/lib/ai/medgemma/medgemmaChatService.ts`).
 * Orchestrates:
 * 1. Interviewer Persona: prioritized follow-up questions following the
 *    deterministic interview policy (`interviewPrioritization.ts`).
 * 2. Report Writer Persona: compiles the structured intake report each turn.
 *
 * Mode behavior:
 * - Deterministic (default): both personas run on the deterministic engines.
 *   Nothing a visitor types leaves the browser.
 * - Live (VITE_DEMO_LIVE_MODE): model calls go through the server proxy
 *   (`/api/gemini`) — never to the model provider from the browser. The key
 *   lives only in the server function env. Every live response is gated
 *   TWICE: server-side in `liveEngine.ts`, then again here with
 *   `validateGeneratedQuestion` + `evaluateAssistiveOnlyGuardrails` before
 *   it may enter the transcript. Any failure (network, gate, kill switch,
 *   rate limit) falls back to the deterministic engine silently.
 * - The red-flag gate below runs BEFORE anything else in both modes and is
 *   always deterministic.
 */

import type {
  MedGemmaChatMessage,
  MedGemmaChatState,
  InterviewTopic,
  InterviewPolicyState,
} from './harnessTypes';
import {
  createInitialInterviewPolicy,
  selectInterviewTopic,
  applyUserAnswerToPolicy,
  computeCoverageStatus,
  shouldTerminateInterview,
  isIntakeGateSatisfied,
  getFallbackQuestion,
  validateGeneratedQuestion,
} from './interviewPrioritization';
import { evaluateAssistiveOnlyGuardrails } from './assistiveOnlyGuardrails';
import { isLiveMode, requestInterviewerTurn, requestReportUpdate } from './demoApi';
import { detectRedFlags } from './redFlagDetector';

// Canonical protocol phrase (kept identical to production for parity; the
// trailing control marker is stripped before anything is shown to a visitor).
export const INTERVIEW_COMPLETE_PHRASE =
  'Thank you for answering my questions. I have everything needed to prepare a report for your visit. End interview.';

export const INTERVIEW_COMPLETE_DISPLAY_PHRASE =
  'Thank you for answering my questions. I have everything needed to prepare a report for your visit.';

export const CANONICAL_OPENING_GREETING =
  'Thank you for booking an appointment with your primary doctor. I am an assistant here to ask a few questions to help your doctor prepare for your visit. To start, what is your main concern today?';

export const INTERVIEWER_SYSTEM_PROMPT = `SYSTEM INSTRUCTION: Always think silently before responding.

Persona:
You are a clinical assistant for a UK NHS General Practice. Your role is to gather information from users about their health concerns through focused questioning.

CRITICAL RULES:
- **No Assessments:** You are NOT authorized to provide medical advice, diagnoses, or express any form of assessment to the patient.
- **Question Format:** Ask exactly ONE question sentence ending with "?".
- **Question Length:** Each question must be 20 words or less.
- **No Preambles:** Do NOT start with phrases like "Considering...", "Given...", or "As you mentioned...".
- **Control Compliance:** Follow the Interview Control block exactly when provided.

### Priority Policy ###
- Prioritize unresolved safety concerns (breathing/chest/neurological red flags) before lower-yield questions.
- Prioritize chief-complaint defining details (onset, severity, progression) before broad review-of-systems.
- Prefer high-yield differentiators over optional broad screening.
- Ensure relevant history coverage includes PMH, regular medications, allergies, and family/social context before wrap-up when feasible.
- Do NOT re-ask answered topics.

### Context Awareness ###
You MUST use the CURRENT REPORT and conversation history below:
- Do NOT ask for information already documented.
- Ask the next best question to close an unresolved, high-value gap.
- Keep each turn strictly fact-finding.

### Procedure ###
1. **Start Interview:** Begin the conversation with: "${CANONICAL_OPENING_GREETING}"
2. **Conduct Interview:** Ask one focused question per turn, following Interview Control.
3. **End Interview:** Print this exact phrase when complete: "${INTERVIEW_COMPLETE_PHRASE}"`;

export const REPORT_WRITER_SYSTEM_PROMPT = `<role>
You are a clinical documentation specialist. You maintain a pre-consultation
intake report for a Primary Care Physician, built from a structured patient
interview.
</role>

<rules>
1. VOICE — Write in third-person clinical register. NEVER reproduce the
   patient's sentences. Convert each statement into documented findings
   ("bilateral throbbing headache for two days, worse on movement"), not
   quotes. The only permitted quotation is a brief symptom descriptor whose
   own wording is clinically informative (e.g. describes the pain as "like an
   electric shock").
2. NO INTERVIEW ARTIFACTS — Never copy interview questions into the report.
   Never use the interview's internal topic labels ("red flags",
   "branch discriminators", "hydration tolerance", "core associated
   symptoms", etc.) as headings or bullet labels.
3. CLASSIFY BY MEANING — Place each finding under the clinically correct
   heading, regardless of which interview question surfaced it. Example:
   discomfort in bright light is photophobia and belongs under Associated
   Symptoms, never under a gastrointestinal heading.
4. NO DUPLICATION — Each fact appears exactly once. If several answers cover
   the same finding, merge them into a single line.
5. HPI STRUCTURE — Keep the History of Present Illness bullets in the given
   order: Onset, Duration, Location, Character/Quality, Severity, Timing,
   Modifying Factors, Associated Symptoms, Pertinent Negatives. If a
   dimension has not been covered yet, keep its "Not yet discussed"
   placeholder rather than inventing content.
6. PERTINENT NEGATIVES — Record denied symptoms once, as "Denies …", under
   Pertinent Negatives only.
7. ASSISTIVE ONLY — Document findings only. Never assert a diagnosis, never
   add assessment conclusions, and never include management or prescribing
   directives.
8. BREVITY — Every line earns its place: no filler, no pleasantries.
9. CITATIONS — The transcript lines in <interview_transcript> are numbered
   ([1], [2], …). After each documented finding, append the marker [[n]]
   where n is the number of the PATIENT transcript line the fact came from;
   when a finding combines several answers, append several markers
   ([[2]][[5]]). Every HPI bullet, Relevant Medical History line, and Red
   Flags line that documents patient-sourced information must end with at
   least one marker; placeholder lines ("Not yet discussed") carry none.
   Never cite a Clinician line. The Summary section carries no markers.
</rules>

<output_format>
Return ONLY the full updated Markdown report, always using exactly this
skeleton:

## Chief Complaint
## History of Present Illness
- **Onset**: …
- **Duration**: …
- **Location**: …
- **Character/Quality**: …
- **Severity**: …
- **Timing**: …
- **Modifying Factors**: …
- **Associated Symptoms**: …
- **Pertinent Negatives**: …
## Relevant Medical History
- **Conditions**: …
- **Medications**: …
- **Allergies**: …
- **Family/Social**: …
## Red Flags
…
## Summary
…
</output_format>`;

export const REPORT_TEMPLATE = `## Chief Complaint
[To be determined from interview]

## History of Present Illness
- **Onset**: Not yet discussed
- **Duration**: Not yet discussed
- **Location**: Not yet discussed
- **Character/Quality**: Not yet discussed
- **Severity**: Not yet discussed
- **Timing**: Not yet discussed
- **Modifying Factors**: Not yet discussed
- **Associated Symptoms**: Not yet discussed
- **Pertinent Negatives**: Not yet discussed

## Relevant Medical History
- **Conditions**: Not yet reviewed
- **Medications**: Not yet reviewed
- **Allergies**: Not yet reviewed
- **Family/Social**: Not yet reviewed

## Red Flags
Not yet assessed

## Summary
Interview in progress.`;

/** The prompt builders need only the transcript text, not UI metadata. */
export type ChatTranscriptMessage = Pick<MedGemmaChatMessage, 'role' | 'content'>;

export function buildInterviewerPrompt(
  history: ChatTranscriptMessage[],
  presentingComplaint: string,
  patientName?: string,
  currentReport?: string,
  control?: {
    questionsAsked: number;
    maxQuestions: number;
    selectedTopic: InterviewTopic;
    selectedTopicRationale: string;
    blockedTopics: InterviewTopic[];
  },
): string {
  const nameContext = patientName ? `Speaking with: ${patientName}\n` : '';
  const historyText = history.length > 0
    ? history.map((msg) => `${msg.role === 'user' ? 'Patient' : 'Assistant'}: ${msg.content}`).join('\n')
    : '';

  const reportContext = currentReport
    ? `\n### Current Report ###\n${currentReport}\nDo NOT ask for information already documented above.\n`
    : '';

  const controlContext = control
    ? `\n### Interview Control (authoritative) ###\nquestions_asked: ${control.questionsAsked}\nselected_topic: ${control.selectedTopic}\nrationale: ${control.selectedTopicRationale}\n`
    : '';

  return `${INTERVIEWER_SYSTEM_PROMPT}

${nameContext}Initial complaint: "${presentingComplaint}"
${controlContext}${reportContext}
${historyText ? `Conversation so far:\n${historyText}\n` : ''}
Generate your next response.
Return exactly ONE question sentence ending with "?". No preamble. No extra commentary.`;
}

export function buildReportWriterPrompt(
  transcript: ChatTranscriptMessage[],
  currentReport: string,
  presentingComplaint: string,
  patientName?: string,
  patientMeta?: string,
): string {
  const interviewText = transcript
    .map((msg, i) => `[${i + 1}] ${msg.role === 'user' ? 'Patient' : 'Clinician'}: ${msg.content}`)
    .join('\n');

  const patientLine =
    patientName || patientMeta
      ? `Patient: ${patientName || 'Name not provided'}${patientMeta ? ` (${patientMeta})` : ''}\n\n`
      : '';

  return `${REPORT_WRITER_SYSTEM_PROMPT}

Presenting complaint: ${presentingComplaint}

${patientLine}<interview_transcript>
${interviewText}
</interview_transcript>

<current_report>
${currentReport || REPORT_TEMPLATE}
</current_report>

Rewrite <current_report> into the required skeleton, incorporating the new
facts from the interview per the rules above. The skeleton and rules take
precedence over whatever structure <current_report> currently uses. Where the
skeleton's opening line is concerned, render the patient's name and age/sex
from the Patient line above as the first line of the report:
**Patient:** <name> (<age/sex>) — "not provided" when unknown. Return
ONLY the full Markdown report.`;
}

export function cleanReportOutput(report: string): string {
  let cleaned = report.trim();
  const codeBlockMatch = cleaned.match(/^\s*```(?:markdown)?\s*([\s\S]*?)\s*```\s*$/i);
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1];
  }
  return cleaned.trim();
}

export function initializeChatSession(
  presentingComplaint: string,
  patientName?: string,
  patientMeta?: string,
): MedGemmaChatState {
  const initialPolicy = createInitialInterviewPolicy();
  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const initialReport = presentingComplaint
    ? `## Chief Complaint\n${presentingComplaint}\n\n## History of Present Illness\n- **Onset**: Not yet discussed\n- **Duration**: Not yet discussed\n- **Severity**: Not yet discussed\n\n## Relevant Medical History\n- **Conditions**: Not yet reviewed\n- **Medications**: Not yet reviewed\n\n## Red Flags\nSafety screen in progress.\n\n## Summary\nInterview initiated.`
    : REPORT_TEMPLATE;

  return {
    sessionId: crypto.randomUUID(),
    patientName: patientName || 'Patient Consultation',
    patientMeta,
    presentingComplaint,
    messages: [
      {
        role: 'assistant',
        content: CANONICAL_OPENING_GREETING,
        timestamp: now,
      },
    ],
    report: initialReport,
    hasRedFlag: false,
    exchangeCount: 0,
    interviewPolicy: initialPolicy,
  };
}

export interface ProcessPatientMessageResult {
  state: MedGemmaChatState;
  assistantReply: MedGemmaChatMessage;
  redFlagDetected: boolean;
  redFlagMessage?: string;
  interviewComplete: boolean;
}

function redFlagPatientMessage(headline: string, guidance: string, urgency: 'call_999' | 'call_111' | 'same_day_gp'): string {
  const stopping = urgency === 'call_999'
    ? 'This interview has been stopped so that nothing delays emergency care. Call 999 now.'
    : urgency === 'call_111'
      ? 'This interview has been stopped. Please call 111 now for urgent advice.'
      : 'This interview has been stopped. Please arrange an urgent same-day GP appointment today.';
  return `⚠️ **${headline}**\n\n${guidance}\n\n*${stopping}*`;
}

export async function processPatientMessage(
  state: MedGemmaChatState,
  userMessage: string,
  isForceWrapUp: boolean = false,
): Promise<ProcessPatientMessageResult> {
  const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // 1. Mandatory Red-Flag Screening (Deterministic NHS gate) — runs before
  // anything else, including the force-wrap-up path.
  const redFlagCheck = detectRedFlags(userMessage);
  if (redFlagCheck.detected && redFlagCheck.urgency) {
    const redFlagMessage: MedGemmaChatMessage = {
      role: 'assistant',
      content: redFlagPatientMessage(
        redFlagCheck.headline || 'Immediate attention required',
        redFlagCheck.guidance || 'Please seek urgent medical advice.',
        redFlagCheck.urgency,
      ),
      timestamp,
      redFlag: true,
    };

    const updatedMessages: MedGemmaChatMessage[] = [
      ...state.messages,
      { role: 'user', content: userMessage, timestamp },
      redFlagMessage,
    ];

    const flagsBody = `⚠️ **EMERGENCY RED FLAG DETECTED**: ${redFlagCheck.symptom} (${redFlagCheck.urgency})\nGuidance: ${redFlagCheck.guidance}`;
    // Upsert both sections: the preset/custom report templates already carry
    // their own Summary, which must be replaced — not duplicated.
    const updatedReport = upsertReportSection(
      upsertReportSection(state.report, 'Red Flags', flagsBody),
      'Summary',
      'Interview terminated due to emergency red flag.',
    );

    return {
      state: {
        ...state,
        messages: updatedMessages,
        report: updatedReport,
        hasRedFlag: true,
        redFlagReason: redFlagCheck.symptom,
        exchangeCount: state.exchangeCount + 1,
      },
      assistantReply: redFlagMessage,
      redFlagDetected: true,
      redFlagMessage: redFlagCheck.guidance,
      interviewComplete: true,
    };
  }

  // 2. Add the patient message to the transcript. A force wrap-up carries no
  // patient text, so no user bubble is appended.
  const transcriptWithUser: MedGemmaChatMessage[] = isForceWrapUp
    ? [...state.messages]
    : [...state.messages, { role: 'user', content: userMessage, timestamp }];

  // The presenting complaint is the first substantive patient message and is
  // sticky for the rest of the session (custom flow starts blank).
  const effectiveComplaint = state.presentingComplaint || userMessage.trim();

  // 3. Update Policy with User Answer
  const currentPolicy = state.interviewPolicy || createInitialInterviewPolicy();
  const lastTopic = currentPolicy.lastSelectedTopic || 'chief_complaint_onset_timeline';

  // A manual wrap-up below the intake gate is refused WITHOUT mutating the
  // interview: funneling the empty payload through the policy used to burn a
  // turn, block the pending topic with an empty finding, and — under
  // repetition — fabricate gate satisfaction via blockage alone. The pending
  // question is simply re-asked.
  const wrapUpRefused =
    isForceWrapUp && !isIntakeGateSatisfied(computeCoverageStatus(currentPolicy, state.hasRedFlag));

  // 1-based transcript index of the patient message just appended — the
  // deterministic report's [[n]] citation points here.
  const answerMessageIndex = isForceWrapUp ? undefined : transcriptWithUser.length;
  const updatedPolicy = wrapUpRefused
    ? currentPolicy
    : applyUserAnswerToPolicy(currentPolicy, lastTopic, userMessage, answerMessageIndex);

  // 3.5 Selection, coverage, termination
  const selection = selectInterviewTopic(updatedPolicy, state.presentingComplaint, userMessage);
  const coverage = computeCoverageStatus(updatedPolicy, state.hasRedFlag);
  const termination = shouldTerminateInterview(updatedPolicy, coverage, selection);

  const shouldEnd = (isForceWrapUp && !wrapUpRefused) || termination.shouldTerminate;

  // 5. Interviewer response — live model via server proxy when enabled,
  // deterministic policy question otherwise (and on ANY live failure).
  let replyText: string | null = null;

  if (shouldEnd) {
    replyText = INTERVIEW_COMPLETE_DISPLAY_PHRASE;
  } else if (isLiveMode()) {
    const liveText = await requestInterviewerTurn({
      history: transcriptWithUser,
      complaint: effectiveComplaint,
      patientName: state.patientName,
      currentReport: state.report,
      control: {
        questionsAsked: updatedPolicy.questionsAsked,
        maxQuestions: 15,
        selectedTopic: selection.selectedTopic,
        selectedTopicRationale: selection.selectedTopicRationale,
        blockedTopics: updatedPolicy.blockedTopics,
      },
    });

    if (liveText) {
      // Client-side backstop gate (the server already gated this; enforce
      // again so the invariant "every assistant question passes policy"
      // holds regardless of server changes).
      const validation = validateGeneratedQuestion(liveText);
      const guardrail = evaluateAssistiveOnlyGuardrails(validation.question);
      if (validation.valid && guardrail.action === 'allow') {
        replyText = validation.question;
      }
    }
  }

  if (!replyText) {
    replyText = getFallbackQuestion(selection.selectedTopic);
  }

  const assistantReply: MedGemmaChatMessage = {
    role: 'assistant',
    content: replyText,
    timestamp,
  };
  const fullTranscript: MedGemmaChatMessage[] = [...transcriptWithUser, assistantReply];

  // 6. Report Writer Persona — live model via server proxy when enabled,
  // deterministic structured update otherwise (and on ANY live failure).
  let updatedReportText = state.report;
  let liveReportAccepted = false;

  if (isLiveMode()) {
    const liveReport = await requestReportUpdate({
      transcript: fullTranscript,
      currentReport: state.report,
      complaint: effectiveComplaint,
      patientName: state.patientName,
      patientMeta: state.patientMeta,
    });
    if (liveReport) {
      const cleaned = cleanReportOutput(liveReport);
      const guardrail = evaluateAssistiveOnlyGuardrails(cleaned);
      if (guardrail.action === 'allow') {
        updatedReportText = cleaned;
        liveReportAccepted = true;
      }
    }
  }

  // On a live failure, keep the accumulated live report rather than
  // overwriting it with the deterministic skeleton — a mid-interview 503
  // must not visibly downgrade the briefing the audience is reading.
  if (!liveReportAccepted && !state.liveReportActive) {
    updatedReportText = buildDeterministicReport({
      policy: updatedPolicy,
      patientName: state.patientName,
      patientMeta: state.patientMeta,
      complaint: effectiveComplaint,
      complete: shouldEnd,
    });
  }

  return {
    state: {
      ...state,
      presentingComplaint: effectiveComplaint,
      messages: fullTranscript,
      report: updatedReportText,
      liveReportActive: liveReportAccepted || state.liveReportActive,
      exchangeCount: state.exchangeCount + 1,
      interviewPolicy: {
        ...updatedPolicy,
        lastSelectedTopic: selection.selectedTopic,
      },
    },
    assistantReply,
    redFlagDetected: false,
    interviewComplete: shouldEnd,
  };
}

// =============================================================================
// Deterministic report compiler — canonical GP skeleton with provenance.
// Same clinical contract as the live report-writer prompt: third-person
// section structure, findings under the clinically correct row (never the
// interview's internal topic labels), no duplicate facts, [[n]] markers
// pointing at the patient transcript line each finding came from.
// =============================================================================

const HPI_TOPIC_ROWS: Array<{ row: string; topics: InterviewTopic[] }> = [
  { row: 'Onset & Duration', topics: ['chief_complaint_onset_timeline'] },
  { row: 'Severity', topics: ['chief_complaint_severity_impact'] },
  { row: 'Modifying Factors', topics: ['progression_modifiers'] },
  { row: 'Interventions Tried', topics: ['self_care_and_response'] },
  { row: 'Associated Symptoms', topics: ['associated_symptoms_core', 'hydration_tolerance_if_gi'] },
];

const NEGATION_HEADED = /^(?:no|none|not|never|nah|nope|denies|don'?t|do not|nothing)\b/i;

function isNegativeScreeningAnswer(text: string): boolean {
  return NEGATION_HEADED.test(text.trim());
}

export function buildDeterministicReport(options: {
  policy: InterviewPolicyState;
  patientName?: string;
  patientMeta?: string;
  complaint: string;
  complete: boolean;
}): string {
  const { policy, complaint, complete } = options;
  const findings = policy.topicFindings || {};
  const indexes = policy.topicFindingIndexes || {};
  const seen = new Set<string>();

  const findingEntry = (topic: InterviewTopic): { text: string; marker: string } | null => {
    const text = (findings[topic] || '').trim();
    if (!text) return null;
    const key = text.toLowerCase();
    if (seen.has(key)) return null; // one fact appears exactly once
    seen.add(key);
    const index = indexes[topic];
    return { text, marker: index ? ` [[${index}]]` : '' };
  };

  const entryText = (e: { text: string; marker: string }): string => `${e.text}${e.marker}`;

  const renderRow = (row: string, topics: InterviewTopic[]): string | null => {
    const parts = topics.map(findingEntry).filter((e): e is NonNullable<typeof e> => Boolean(e)).map(entryText);
    if (parts.length === 0) return null;
    return `- **${row}**: ${parts.join('; ')}`;
  };

  // Safety-screen answers split by polarity: denials belong under Pertinent
  // Negatives; positive findings are symptoms and belong under Associated
  // Symptoms — never "Reports: …" under a Negatives heading.
  const associatedEntries: Array<{ text: string; marker: string }> = [];
  const pertinentNegatives: string[] = [];
  for (const topic of ['associated_symptoms_core', 'hydration_tolerance_if_gi'] as InterviewTopic[]) {
    const e = findingEntry(topic);
    if (e) associatedEntries.push(e);
  }
  for (const topic of [
    'breathing_chest_red_flags',
    'neuro_severe_red_flags',
    'branch_discriminators',
    'broad_ros_optional',
  ] as InterviewTopic[]) {
    const e = findingEntry(topic);
    if (!e) continue;
    if (isNegativeScreeningAnswer(e.text)) {
      pertinentNegatives.push(e.text + e.marker);
    } else {
      associatedEntries.push(e);
    }
  }

  const hpiBullets = [
    renderRow('Onset & Duration', ['chief_complaint_onset_timeline']),
    renderRow('Severity', ['chief_complaint_severity_impact']),
    renderRow('Modifying Factors', ['progression_modifiers']),
    renderRow('Interventions Tried', ['self_care_and_response']),
    associatedEntries.length > 0
      ? `- **Associated Symptoms**: ${associatedEntries.map(entryText).join('; ')}`
      : null,
    pertinentNegatives.length > 0 ? `- **Pertinent Negatives**: ${pertinentNegatives.join('; ')}` : null,
  ].filter((b): b is string => Boolean(b));

  const historyBullets = [
    renderRow('Conditions', ['pmh']),
    renderRow('Medications', ['regular_meds']),
    renderRow('Allergies', ['allergies']),
    renderRow('Family/Social', ['family_social', 'exposure_context']),
  ].filter((b): b is string => Boolean(b));

  const patientLine = `**Patient:** ${options.patientName || 'Not provided'}${options.patientMeta ? ` (${options.patientMeta})` : ''}`;

  return [
    patientLine,
    '',
    '## Chief Complaint',
    complaint || 'Not yet stated',
    '',
    '## History of Present Illness',
    ...(hpiBullets.length > 0 ? hpiBullets : ['- Awaiting symptom details.']),
    '',
    '## Relevant Medical History',
    ...(historyBullets.length > 0 ? historyBullets : ['- Not yet discussed.']),
    '',
    '## Red Flags',
    'Screened negative for emergency red flags.',
    '',
    '## Summary',
    complete
      ? 'Interview complete. Structured pre-consultation summary prepared for GP review; clinician assessment pending.'
      : 'Interview in progress.',
  ].join('\n');
}

/** Replace one `## Heading` section's body, or append the section if absent. */
export function upsertReportSection(markdown: string, heading: string, body: string): string {
  const pattern = new RegExp(`## ${heading}\\n[\\s\\S]*?(?=\\n## |$)`);
  if (pattern.test(markdown)) {
    return markdown.replace(pattern, `## ${heading}\n${body}\n`);
  }
  return `${markdown.trimEnd()}\n\n## ${heading}\n${body}`;
}
