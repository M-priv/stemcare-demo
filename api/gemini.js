// src/demo/lib/interviewPrioritization.ts
var INTERVIEW_TOPICS = [
  "breathing_chest_red_flags",
  "neuro_severe_red_flags",
  "chief_complaint_onset_timeline",
  "chief_complaint_severity_impact",
  "associated_symptoms_core",
  "progression_modifiers",
  "branch_discriminators",
  "hydration_tolerance_if_gi",
  "self_care_and_response",
  "exposure_context",
  "pmh",
  "regular_meds",
  "allergies",
  "family_social",
  "broad_ros_optional"
];
function sanitizeQuestionOutput(text) {
  return text.replace(/End interview\.?/gi, "").replace(/\s+/g, " ").trim();
}
function validateGeneratedQuestion(text) {
  const sanitized = sanitizeQuestionOutput(text);
  if (!sanitized) {
    return { valid: false, question: "", reason: "empty_output" };
  }
  if (!sanitized.includes("?")) {
    return { valid: false, question: "", reason: "no_question_mark" };
  }
  const questionSegments = sanitized.match(/[^?]*\?/g)?.map((part) => part.trim()).filter(Boolean) || [];
  if (questionSegments.length !== 1) {
    return { valid: false, question: "", reason: "multiple_questions" };
  }
  if (!/^[^?]+\?$/.test(sanitized)) {
    return { valid: false, question: "", reason: "extra_commentary" };
  }
  const question = questionSegments[0];
  const startsWithPreamble = /^(considering|given|regarding|to better understand|based on|as you mentioned|since you mentioned)\b/i.test(question);
  if (startsWithPreamble) {
    return { valid: false, question: "", reason: "preamble_style" };
  }
  const wordCount = question.replace(/[^\w\s']/g, "").split(/\s+/).filter(Boolean).length;
  if (wordCount === 0) {
    return { valid: false, question: "", reason: "empty_question" };
  }
  if (wordCount > 20) {
    return { valid: false, question: "", reason: "too_long" };
  }
  return {
    valid: true,
    question
  };
}

// src/demo/lib/assistiveOnlyGuardrails.ts
var ESCALATION_PATTERNS = [
  { pattern: /call\s*(999|911)\s*(now|immediately|right away)/i, reason: "Emergency language detected that requires immediate clinician escalation." },
  { pattern: /go\s*to\s*(a&e|emergency department|er)\s*(now|immediately|right away)/i, reason: "Emergency department directive detected; requires clinician-led escalation." },
  { pattern: /medical\s+emergency/i, reason: "Output frames presentation as a medical emergency and must be escalated." },
  { pattern: /suicidal\s+ideation|self-harm|homicidal/i, reason: "Acute safety-risk language detected and must be escalated." }
];
var ABSTAIN_PATTERNS = [
  { pattern: /\b(definitive|confirmed|final)\s+diagnosis\b/i, reason: "Definitive diagnosis language detected; the harness must remain assistive." },
  { pattern: /\byou\s+(definitely|certainly)?\s*have\b/i, reason: "Patient-level definitive diagnosis detected; clinician confirmation is required." },
  { pattern: /\b(diagnosis\s+is|this\s+is\s+diagnosed\s+as)\b/i, reason: "Autonomous diagnosis statement detected; the harness must abstain." },
  { pattern: /\b(start|prescribe|initiate|increase|stop)\b[^.\n]{0,80}\b\d+\s?(mg|mcg|g|ml)\b/i, reason: "Direct prescribing instruction with dose detected; requires clinician decision." }
];
function evaluateAssistiveOnlyGuardrails(text) {
  const triggered = [];
  for (const check of ESCALATION_PATTERNS) {
    if (check.pattern.test(text)) {
      triggered.push(check.reason);
      return {
        action: "escalate",
        reason: check.reason,
        triggeredRules: triggered
      };
    }
  }
  for (const check of ABSTAIN_PATTERNS) {
    if (check.pattern.test(text)) {
      triggered.push(check.reason);
      return {
        action: "abstain",
        reason: check.reason,
        triggeredRules: triggered
      };
    }
  }
  return {
    action: "allow",
    triggeredRules: []
  };
}
function buildAssistiveOnlyAbstainNote(reason) {
  return `Assistive-only guardrail abstained from returning AI guidance. Reason: ${reason} Please proceed with manual clinician review.`;
}

// src/demo/lib/medgemmaChatService.ts
var INTERVIEW_COMPLETE_PHRASE = "Thank you for answering my questions. I have everything needed to prepare a report for your visit. End interview.";
var CANONICAL_OPENING_GREETING = "Thank you for booking an appointment with your primary doctor. I am an assistant here to ask a few questions to help your doctor prepare for your visit. To start, what is your main concern today?";
var INTERVIEWER_SYSTEM_PROMPT = `SYSTEM INSTRUCTION: Always think silently before responding.

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
var REPORT_WRITER_SYSTEM_PROMPT = `<role>
You are a clinical documentation specialist. You maintain a pre-consultation
intake report for a Primary Care Physician, built from a structured patient
interview.
</role>

<rules>
1. VOICE \u2014 Write in third-person clinical register. NEVER reproduce the
   patient's sentences. Convert each statement into documented findings
   ("bilateral throbbing headache for two days, worse on movement"), not
   quotes. The only permitted quotation is a brief symptom descriptor whose
   own wording is clinically informative (e.g. describes the pain as "like an
   electric shock").
2. NO INTERVIEW ARTIFACTS \u2014 Never copy interview questions into the report.
   Never use the interview's internal topic labels ("red flags",
   "branch discriminators", "hydration tolerance", "core associated
   symptoms", etc.) as headings or bullet labels.
3. CLASSIFY BY MEANING \u2014 Place each finding under the clinically correct
   heading, regardless of which interview question surfaced it. Example:
   discomfort in bright light is photophobia and belongs under Associated
   Symptoms, never under a gastrointestinal heading.
4. NO DUPLICATION \u2014 Each fact appears exactly once. If several answers cover
   the same finding, merge them into a single line.
5. HPI STRUCTURE \u2014 Keep the History of Present Illness bullets in the given
   order: Onset, Duration, Location, Character/Quality, Severity, Timing,
   Modifying Factors, Associated Symptoms, Pertinent Negatives. If a
   dimension has not been covered yet, keep its "Not yet discussed"
   placeholder rather than inventing content.
5b. MEDICAL HISTORY \u2014 Scan the WHOLE transcript for the patient's
   statements about medical conditions, regular medications, allergies,
   and family or social history. Fill the matching Relevant Medical
   History rows from those statements, each with its citation marker.
   Keep "Not yet discussed" on a row ONLY when the transcript contains no
   statement about it \u2014 never because the row was empty in
   <current_report>.
6. PERTINENT NEGATIVES \u2014 Record denied symptoms once, as "Denies \u2026", under
   Pertinent Negatives only.
7. ASSISTIVE ONLY \u2014 Document findings only. Never assert a diagnosis, never
   add assessment conclusions, and never include management or prescribing
   directives.
8. BREVITY \u2014 Every line earns its place: no filler, no pleasantries.
9. CITATIONS \u2014 The transcript lines in <interview_transcript> are numbered
   ([1], [2], \u2026). After each documented finding, append the marker [[n]]
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
- **Onset**: \u2026
- **Duration**: \u2026
- **Location**: \u2026
- **Character/Quality**: \u2026
- **Severity**: \u2026
- **Timing**: \u2026
- **Modifying Factors**: \u2026
- **Associated Symptoms**: \u2026
- **Pertinent Negatives**: \u2026
## Relevant Medical History
- **Conditions**: \u2026
- **Medications**: \u2026
- **Allergies**: \u2026
- **Family/Social**: \u2026
## Red Flags
\u2026
## Summary
\u2026
</output_format>`;
var REPORT_TEMPLATE = `## Chief Complaint
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
function buildInterviewerPrompt(history, presentingComplaint, patientName, currentReport, control) {
  const nameContext = patientName ? `Speaking with: ${patientName}
` : "";
  const historyText = history.length > 0 ? history.map((msg) => `${msg.role === "user" ? "Patient" : "Assistant"}: ${msg.content}`).join("\n") : "";
  const reportContext = currentReport ? `
### Current Report ###
${currentReport}
Do NOT ask for information already documented above.
` : "";
  const controlContext = control ? `
### Interview Control (authoritative) ###
questions_asked: ${control.questionsAsked}
selected_topic: ${control.selectedTopic}
rationale: ${control.selectedTopicRationale}
` : "";
  return `${INTERVIEWER_SYSTEM_PROMPT}

${nameContext}Initial complaint: "${presentingComplaint}"
${controlContext}${reportContext}
${historyText ? `Conversation so far:
${historyText}
` : ""}
Generate your next response.
Return exactly ONE question sentence ending with "?". No preamble. No extra commentary.`;
}
function buildReportWriterPrompt(transcript, currentReport, presentingComplaint, patientName, patientMeta) {
  const interviewText = transcript.map((msg, i) => `[${i + 1}] ${msg.role === "user" ? "Patient" : "Clinician"}: ${msg.content}`).join("\n");
  const patientLine = patientName || patientMeta ? `Patient: ${patientName || "Name not provided"}${patientMeta ? ` (${patientMeta})` : ""}

` : "";
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
**Patient:** <name> (<age/sex>) \u2014 "not provided" when unknown. Return
ONLY the full Markdown report.`;
}
function cleanReportOutput(report) {
  let cleaned = report.trim();
  const codeBlockMatch = cleaned.match(/^\s*```(?:markdown)?\s*([\s\S]*?)\s*```\s*$/i);
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1];
  }
  return cleaned.trim();
}

// src/demo/lib/patientSimulator.ts
function buildPatientPrompt(question, config) {
  const symptomsText = config.selectedSymptoms.join("\n");
  const previousAnswersText = config.previousAnswers.length > 0 ? config.previousAnswers.map((a, i) => `${i + 1}. ${a}`).join("\n") : "None yet.";
  return `SYSTEM INSTRUCTION: You are roleplaying as a patient in a medical interview.

### Your Current Symptoms ###
This is how you have been feeling. Base ALL your answers on these facts. Do NOT invent new symptoms.
---
${symptomsText}
---

### Critical Rules of Roleplay ###
- **Act as the Patient:** Your entire response must be ONLY what the patient would say. Do not add external comments, notes, or clarifications.
- **No Guessing:** You DO NOT know your diagnosis or the name of your condition. Do not guess or speculate about it.
- **Answer Only What Is Asked:** Do not volunteer your entire list of symptoms at once. Respond naturally to the specific question asked by the interviewer.
- **Be Conversational:** Respond in a natural, conversational way. Use simple language.
- **Keep Responses Brief:** Aim for 1-2 sentences max.

### Your Previous Answers ###
---
${previousAnswersText}
---

### Current Question from the Clinical Assistant ###
${question}

Now respond as the patient. Remember: be brief, natural, and only answer what was asked.`;
}

// src/demo/lib/differentials.ts
var HYPOTHESIS_SYSTEM_PROMPT = `You are a clinical decision support assistant. Your task is to analyze a pre-consultation report and generate up to 3 differential hypotheses for the clinician to consider.

IMPORTANT RULES:
1. Generate exactly 1-3 hypotheses, ordered by probability (highest first)
2. Each hypothesis must be grounded in evidence from the report
3. Never present as a definitive diagnosis - these are HYPOTHESES for clinical consideration
4. Include supporting evidence references from the report sections
5. Assign confidence buckets: high (>70% probability), medium (30-70%), low (<30%)

OUTPUT FORMAT (JSON):
{
  "hypotheses": [
    {
      "label": "Short diagnosis name",
      "rationale": "1-3 sentences explaining why this hypothesis fits, grounded in the report",
      "supporting_evidence_refs": ["Chief Complaint", "HPI: duration", "PMH: relevant condition"],
      "confidence_bucket": "high|medium|low"
    }
  ]
}`;
function buildHypothesisPrompt(reportMarkdown) {
  return `Analyze the following pre-consultation report and generate differential hypotheses:

---
${reportMarkdown}
---

Generate up to 3 differential hypotheses with supporting rationale. Return ONLY valid JSON.`;
}

// src/demo/lib/liveEngine.ts
var DEFAULT_MODEL = "gemini-3.1-flash-lite";
var GOOGLE_TIMEOUT_MS = 15e3;
var MAX_HISTORY_ITEMS = 40;
var MAX_HISTORY_ITEM_CHARS = 1e3;
var MAX_REPORT_CHARS = 6e3;
var MAX_COMPLAINT_CHARS = 300;
var MAX_NAME_CHARS = 80;
var MAX_QUESTION_CHARS = 500;
var MAX_SYMPTOM_ITEMS = 20;
var MAX_SYMPTOM_CHARS = 200;
var MAX_PREVIOUS_ANSWERS = 20;
var MAX_PREVIOUS_ANSWER_CHARS = 300;
var RATE_LIMIT_PER_MINUTE = 20;
var RATE_LIMIT_PER_HOUR = 200;
var MINUTE_MS = 6e4;
var HOUR_MS = 36e5;
var MAX_TRACKED_IPS = 5e3;
var rateBuckets = /* @__PURE__ */ new Map();
function checkRateLimit(ip, now = Date.now()) {
  if (rateBuckets.size > MAX_TRACKED_IPS) {
    rateBuckets.clear();
  }
  const bucket = rateBuckets.get(ip) ?? {
    minuteCount: 0,
    minuteStart: now,
    hourCount: 0,
    hourStart: now
  };
  if (now - bucket.minuteStart >= MINUTE_MS) {
    bucket.minuteCount = 0;
    bucket.minuteStart = now;
  }
  if (now - bucket.hourStart >= HOUR_MS) {
    bucket.hourCount = 0;
    bucket.hourStart = now;
  }
  bucket.minuteCount += 1;
  bucket.hourCount += 1;
  rateBuckets.set(ip, bucket);
  return bucket.minuteCount <= RATE_LIMIT_PER_MINUTE && bucket.hourCount <= RATE_LIMIT_PER_HOUR;
}
function asString(value, maxChars) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxChars);
}
function asHistory(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_HISTORY_ITEMS) {
    return null;
  }
  const out = [];
  for (const item of value) {
    const role = item?.role;
    const content = asString(item?.content, MAX_HISTORY_ITEM_CHARS);
    if (role !== "user" && role !== "assistant" || !content) return null;
    out.push({ role, content });
  }
  return out;
}
function asStringList(value, maxItems, maxChars) {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxItems) return null;
  const out = [];
  for (const item of value) {
    const s = asString(item, maxChars);
    if (!s) return null;
    out.push(s);
  }
  return out;
}
function asOptionalStringList(value, maxItems, maxChars) {
  if (value === void 0) return [];
  if (!Array.isArray(value) || value.length > maxItems) return null;
  if (value.length === 0) return [];
  const out = [];
  for (const item of value) {
    const s = asString(item, maxChars);
    if (!s) return null;
    out.push(s);
  }
  return out;
}
function isInterviewTopic(value) {
  return INTERVIEW_TOPICS.includes(value);
}
async function callGemini(prompt, opts, generationConfig) {
  const MAX_ATTEMPTS = 3;
  const RETRY_DELAY_MS = 900;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let retryable = false;
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${opts.model}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": opts.apiKey
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig
          }),
          signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS)
        }
      );
      if (!response.ok) {
        console.error(`[demo-live] ${opts.model} HTTP ${response.status}:`, (await response.text()).slice(0, 400));
        retryable = response.status === 503 || response.status === 429;
      } else {
        const data = await response.json();
        const parts = data.candidates?.[0]?.content?.parts ?? [];
        const text = parts.map((p) => p?.text ?? "").join("").trim();
        if (!text) {
          console.error(
            "[demo-live] empty model response:",
            JSON.stringify({
              finishReason: data.candidates?.[0]?.finishReason,
              parts: parts.length,
              usage: data.usageMetadata
            }).slice(0, 400)
          );
        }
        return text || null;
      }
    } catch {
      retryable = true;
    }
    if (retryable && attempt < MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    } else {
      return null;
    }
  }
  return null;
}
var fallbackResponse = (status, reason) => ({
  status,
  body: { fallback: true, reason }
});
async function runInterviewer(body, opts) {
  const history = asHistory(body.history);
  const complaint = asString(body.complaint, MAX_COMPLAINT_CHARS);
  if (!history || !complaint) return fallbackResponse(400, "invalid_payload");
  const patientName = asString(body.patientName, MAX_NAME_CHARS) ?? void 0;
  const currentReport = asString(body.currentReport, MAX_REPORT_CHARS) ?? void 0;
  let control;
  if (body.control && typeof body.control === "object") {
    const raw = body.control;
    const selectedTopic = asString(raw.selectedTopic, 80);
    const questionsAsked = typeof raw.questionsAsked === "number" ? raw.questionsAsked : NaN;
    if (!selectedTopic || !isInterviewTopic(selectedTopic) || !Number.isInteger(questionsAsked) || questionsAsked < 0 || questionsAsked > 100) {
      return fallbackResponse(400, "invalid_control");
    }
    const blockedTopics = Array.isArray(raw.blockedTopics) ? raw.blockedTopics.filter(
      (t) => typeof t === "string" && isInterviewTopic(t)
    ).slice(0, INTERVIEW_TOPICS.length) : [];
    control = {
      questionsAsked,
      maxQuestions: 15,
      selectedTopic,
      selectedTopicRationale: asString(raw.selectedTopicRationale, 300) ?? "",
      blockedTopics
    };
  }
  const prompt = buildInterviewerPrompt(history, complaint, patientName, currentReport, control);
  const text = await callGemini(prompt, opts, { temperature: 0.35, maxOutputTokens: 150 });
  if (!text) return fallbackResponse(502, "model_unavailable");
  const validated = validateGeneratedQuestion(text);
  if (!validated.valid) return fallbackResponse(200, `question_format_${validated.reason}`);
  const guardrail = evaluateAssistiveOnlyGuardrails(validated.question);
  if (guardrail.action !== "allow") return fallbackResponse(200, "guardrail_" + guardrail.action);
  return { status: 200, body: { text: validated.question } };
}
async function runReportWriter(body, opts) {
  const transcript = asHistory(body.transcript);
  const complaint = asString(body.complaint, MAX_COMPLAINT_CHARS);
  const currentReport = asString(body.currentReport, MAX_REPORT_CHARS);
  if (!transcript || !complaint || !currentReport) return fallbackResponse(400, "invalid_payload");
  const patientName = asString(body.patientName, MAX_NAME_CHARS) ?? void 0;
  const patientMeta = asString(body.patientMeta, 80) ?? void 0;
  const prompt = buildReportWriterPrompt(transcript, currentReport, complaint, patientName, patientMeta);
  const text = await callGemini(prompt, opts, { temperature: 0.25, maxOutputTokens: 1024 });
  if (!text) return fallbackResponse(502, "model_unavailable");
  const cleaned = cleanReportOutput(text);
  const guardrail = evaluateAssistiveOnlyGuardrails(cleaned);
  if (guardrail.action !== "allow") return fallbackResponse(200, "guardrail_" + guardrail.action);
  return { status: 200, body: { text: cleaned } };
}
async function runPatientSimulator(body, opts) {
  const question = asString(body.question, MAX_QUESTION_CHARS);
  if (!question || typeof body.config !== "object" || body.config === null) {
    return fallbackResponse(400, "invalid_payload");
  }
  const rawConfig = body.config;
  const selectedSymptoms = asStringList(rawConfig.selectedSymptoms, MAX_SYMPTOM_ITEMS, MAX_SYMPTOM_CHARS);
  const previousAnswers = asOptionalStringList(rawConfig.previousAnswers, MAX_PREVIOUS_ANSWERS, MAX_PREVIOUS_ANSWER_CHARS);
  const condition = asString(rawConfig.condition, 40);
  if (!selectedSymptoms || previousAnswers === null || !condition) {
    return fallbackResponse(400, "invalid_payload");
  }
  const prompt = buildPatientPrompt(question, {
    condition,
    selectedSymptoms,
    previousAnswers
  });
  const text = await callGemini(prompt, opts, { temperature: 0.6, maxOutputTokens: 120 });
  if (!text) return fallbackResponse(502, "model_unavailable");
  return { status: 200, body: { text: text.slice(0, MAX_QUESTION_CHARS) } };
}
var PROBABILITY_BY_BUCKET = { high: 0.78, medium: 0.54, low: 0.22 };
async function runDifferentials(body, opts) {
  const reportMarkdown = asString(body.reportMarkdown, MAX_REPORT_CHARS);
  if (!reportMarkdown) return fallbackResponse(400, "invalid_payload");
  const prompt = `${HYPOTHESIS_SYSTEM_PROMPT}

${buildHypothesisPrompt(reportMarkdown)}`;
  const text = await callGemini(prompt, opts, { temperature: 0.25, maxOutputTokens: 1024 });
  if (!text) return fallbackResponse(502, "model_unavailable");
  const stripped = text.trim().replace(/^```(?:json)?\n?/i, "").replace(/```\s*$/i, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    console.error("[demo-live] differentials: unparseable JSON:", stripped.slice(0, 400));
    return fallbackResponse(200, "unparseable_json");
  }
  const parsedObj = parsed;
  const rawHypotheses = Array.isArray(parsedObj.hypotheses) ? parsedObj.hypotheses : parsedObj.differential_hypotheses;
  if (!Array.isArray(rawHypotheses) || rawHypotheses.length === 0) {
    console.error("[demo-live] differentials: unexpected JSON shape:", stripped.slice(0, 400));
    return fallbackResponse(200, "invalid_hypotheses");
  }
  const hypotheses = [];
  rawHypotheses.slice(0, 3).forEach((raw, idx) => {
    const rawItem = raw;
    const label = asString(rawItem.label ?? rawItem.diagnosis, 120);
    const rationale = asString(raw?.rationale, 400);
    if (!label) return;
    const rawBucket = raw?.confidence_bucket;
    const bucket = rawBucket === "medium" || rawBucket === "low" ? rawBucket : idx === 0 ? "high" : idx === 1 ? "medium" : "low";
    const base = PROBABILITY_BY_BUCKET[bucket];
    const probability = Math.round(Math.max(0.1, Math.min(0.95, base - idx * 0.08)) * 100) / 100;
    const evidence = Array.isArray(raw?.supporting_evidence_refs) ? raw.supporting_evidence_refs.map((ref) => asString(ref, 200)).filter((ref) => Boolean(ref)).slice(0, 4) : [];
    const card = {
      id: `hyp_live_${idx + 1}_${Date.now()}`,
      condition: label,
      probability,
      confidenceBucket: bucket,
      keyFindings: evidence.length > 0 ? evidence : [rationale ?? "Grounded in patient intake report."],
      recommendedAction: rationale ?? "Clinician review and physical examination indicated.",
      guidelineRef: "Clinician review \u2014 generated hypothesis, not a calibrated estimate"
    };
    const cardText = [card.condition, ...card.keyFindings, card.recommendedAction].join(" ");
    const guardrail = evaluateAssistiveOnlyGuardrails(cardText);
    if (guardrail.action === "escalate") return;
    if (guardrail.action === "abstain") {
      card.recommendedAction = buildAssistiveOnlyAbstainNote(guardrail.reason ?? "Policy gate triggered.");
    }
    hypotheses.push(card);
  });
  if (hypotheses.length === 0) return fallbackResponse(200, "all_cards_gated");
  return { status: 200, body: { hypotheses } };
}
async function handleDemoApiRequest(body, opts) {
  if (opts.killSwitch) return fallbackResponse(503, "live_disabled");
  if (!opts.apiKey) return fallbackResponse(503, "not_configured");
  if (opts.ip && !checkRateLimit(opts.ip)) return fallbackResponse(429, "rate_limited");
  const role = body?.role;
  const validRoles = ["interviewer", "report_writer", "patient_simulator", "differentials"];
  if (typeof role !== "string" || !validRoles.includes(role)) {
    return fallbackResponse(400, "invalid_role");
  }
  const request = body ?? {};
  const modelOpts = { apiKey: opts.apiKey, model: opts.model || DEFAULT_MODEL };
  switch (role) {
    case "interviewer":
      return runInterviewer(request, modelOpts);
    case "report_writer":
      return runReportWriter(request, modelOpts);
    case "patient_simulator":
      return runPatientSimulator(request, modelOpts);
    case "differentials":
      return runDifferentials(request, modelOpts);
  }
}

// src/server/gemini.ts
function getHeader(headers, name) {
  if (!headers) return void 0;
  if (typeof headers.get === "function") {
    return headers.get(name) ?? void 0;
  }
  const rec = headers;
  const val = rec[name] ?? rec[name.toLowerCase()];
  if (Array.isArray(val)) return val[0];
  return typeof val === "string" ? val : void 0;
}
async function parseBody(req) {
  const reqObj = req;
  if (typeof reqObj.json === "function" && reqObj.body === void 0) {
    try {
      return await reqObj.json();
    } catch {
      return null;
    }
  }
  let body = reqObj.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = null;
    }
  }
  return body ?? null;
}
async function handler(req, res) {
  const isWebStandard = !res || typeof res.status !== "function";
  const method = req?.method ?? "GET";
  if (method !== "POST") {
    const errorBody = { fallback: true, reason: "method_not_allowed" };
    if (isWebStandard) {
      return new Response(JSON.stringify(errorBody), {
        status: 405,
        headers: { "Content-Type": "application/json" }
      });
    }
    res.status(405).json(errorBody);
    return;
  }
  const forwarded = getHeader(req?.headers, "x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";
  const body = await parseBody(req);
  const result = await handleDemoApiRequest(body, {
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.DEMO_GEMINI_MODEL,
    killSwitch: process.env.DEMO_LIVE_KILL_SWITCH === "true",
    ip
  });
  if (isWebStandard) {
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { "Content-Type": "application/json" }
    });
  }
  res.status(result.status).json(result.body);
}
export {
  handler as default
};
