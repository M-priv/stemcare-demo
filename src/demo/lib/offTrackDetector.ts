/**
 * Off-Track & Clinical Alignment Detector
 *
 * Evaluates whether a patient's chat message genuinely engages with the
 * clinical pre-consultation line of questioning, distinguishing:
 *
 * - Category A (`off_track_non_clinical`): casual chit-chat, trivia, weather,
 *   jokes, AI meta-prompts/jailbreaks, gibberish, greeting-only replies, or
 *   demands for direct diagnosis/prescriptions without answering intake.
 * - Category B (`off_track_clinical_misaligned`): genuine clinical information
 *   or clinical questions that do NOT answer the active topic (e.g., sharing
 *   medications/allergies when asked about symptom onset, sharing pain severity
 *   when asked about allergies, or asking "Could this be meningitis?" instead
 *   of answering).
 *
 * When Category B occurs, any cross-domain clinical facts are opportunistically
 * extracted with their matching topic so they appear in the GP report without
 * prematurely closing the unanswered active topic.
 */

import type { InterviewTopic } from './harnessTypes';

export type RelevanceStatus =
  | 'on_track'
  | 'off_track_non_clinical'
  | 'off_track_clinical_misaligned';

export type OffTrackCategory =
  | 'chitchat_trivia'
  | 'meta_jailbreak'
  | 'advice_demand'
  | 'gibberish_evasion'
  | 'greeting_only'
  | 'patient_clinical_question'
  | 'cross_topic_clinical';

export interface OpportunisticFinding {
  topic: InterviewTopic;
  text: string;
}

export interface RelevanceContext {
  /** Undefined when the patient is answering the opening greeting ("what is your main concern today?"). */
  activeTopic?: InterviewTopic;
  hasPresentingComplaint: boolean;
  offTrackStreak: number;
  topicRefocusCount: number;
  sessionClinicalRefocusCount: number;
}

export interface RelevanceEvaluation {
  status: RelevanceStatus;
  category?: OffTrackCategory;
  /** Cross-domain clinical facts captured into their rightful sections. */
  opportunisticFindings: OpportunisticFinding[];
  /** Concise single-question redirection ending in '?'. */
  redirectQuestion: string;
  /** UI focus badge label displayed below redirected messages. */
  badgeLabel: string;
  reason?: string;
}

export const MAX_REFOCUS_PER_TOPIC = 1;
export const MAX_CLINICAL_REFOCUSES_PER_SESSION = 2;

// =============================================================================
// Signal Dictionaries
// =============================================================================

const SYMPTOM_OR_BODY_SIGNAL =
  /\b(?:pain|ache|aching|hurt|hurts|hurting|sore|fever|temperature|cough|coughing|rash|itch|itching|dizzy|dizziness|lightheaded|nausea|nauseous|vomit|vomiting|threw up|throw up|diarrh(?:ea|oea)|headache|migraine|bleed|bleeding|swell|swelling|swollen|cramp|cramps|burn|burning|numb|numbness|tingl(?:e|ing)|stiff|stiffness|weak|weakness|fatigue|tired|exhausted|breath|breathing|breathless|shortness|wheez(?:e|ing)|tightness|chest|stomach|tummy|abdomen|abdominal|head|throat|ear|eye|eyes|back|knee|leg|arm|foot|hand|skin|neck|heart|racing|palpitation|lung|urine|urinary|bowel|stool|chills|shiver(?:ing)?|sweat(?:ing)?|shake|shaking|tremor|twitch(?:ing)?|faint(?:ing)?|vision|blurry|flashing|zigzag|blind spot|photophobia|agitat(?:ed|ion)|restless|confus(?:ed|ion)|symptom|symptoms|unwell|sick|ill)\b/i;

const TEMPORAL_OR_ONSET_SIGNAL =
  /\b(?:ago|since|start|started|began|begin|onset|yesterday|today|tonight|morning|evening|night|hour|hours|day|days|week|weeks|month|months|year|years|sudden|suddenly|gradual|gradually|slowly|quickly|duration|how long|last|past|recent|recently|earlier|before|after|while|constant|intermittent)\b/i;

const SEVERITY_OR_MODIFIER_SIGNAL =
  /\b(?:mild|moderate|severe|bad|worse|worst|terrible|unbearable|manageable|tolerable|slight|intense|strong|scale|out of\s*10|\/\s*10|better|help|helps|helped|relieve|relief|ease|trigger|triggers|aggravate|waves|steady|continuous|comes and goes|come and go|rest|lying|sit|stand|walk|walking|move|movement|light|noise|sound|smell|focus|sleep|work|daily|activit(?:y|ies))\b/i;

const HISTORY_PMH_SIGNAL =
  /\b(?:asthma|diabet(?:es|ic)|hypertension|high blood pressure|thyroid|epileps(?:y|ies)|migraines|anxiety|depression|arthritis|eczema|psoriasis|copd|heart condition|heart disease|kidney|liver|cancer|stroke|medical condition|medical conditions|long-term condition|chronic condition|diagnosed with|diagnosis of|history of|previous surgery|surgery|operation|hospitali[sz]ed|i have\s+(?:type\s+\d|asthma|diabetes|hypertension|eczema|arthritis|epilepsy))\b/i;

const HISTORY_MEDS_SIGNAL =
  /\b(?:medication|medications|medicine|medicines|tablet|tablets|pill|pills|capsule|inhaler|spray|insulin|prescription|prescribed|supplement|supplements|vitamin|vitamins|\d+\s*(?:mg|mcg|ml|g)|daily|every\s+(?:morning|night|day|evening)|omeprazole|metformin|lisinopril|ramipril|atorvastatin|statin|sertraline|fluoxetine|citalopram|ssri|antidepressant|levothyroxine|salbutamol|amlodipine|warfarin|apixaban|bisoprolol|amoxicillin|paracetamol|ibuprofen|aspirin|naproxen|codeine|i\s+(?:take|am on|'m on|am taking|'m taking))\b/i;

const HISTORY_ALLERGY_SIGNAL =
  /\b(?:allerg(?:y|ies|ic)|anaphylax(?:is|tic)|intoleran(?:ce|t)|penicillin|amoxicillin|latex|peanut|nuts|shellfish|sulfa|hay\s*fever|nkda|nka|hives|reactions?\s+to\s+(?:med|drug|antibiotic))\b/i;

const HISTORY_FAMILY_SOCIAL_SIGNAL =
  /\b(?:family history|runs in (?:my|the) family|mother|mum|mom|father|dad|parent|parents|brother|sister|sibling|grandparent|aunt|uncle|smok(?:e|ing|er)|cigarette|vape|vaping|tobacco|alcohol|units?\s+(?:a|per)\s+week|drink(?:ing)?|household|live with|living alone|occupation)\b/i;

const SELF_CARE_REMEDY_SIGNAL =
  /\b(?:tried|remedy|remedies|home remedy|cough syrup|lozenge|ice pack|heat pad|heating pad|hot drink|warm drink|tea|rested|bandag(?:e|ed)|stretch(?:ed|ing)?|paracetamol|ibuprofen|over-the-counter)\b/i;

const EXPOSURE_SIGNAL =
  /\b(?:travel|traveled|travelled|trip|abroad|overseas|flight|holiday|vacation|country|safari|mosquito|tick|sick contact|exposed|exposure|ill at home|colleague|office|school)\b/i;

const UNCERTAINTY_SIGNAL =
  /\b(?:not sure|unsure|don'?t know|do not know|hard to (?:say|tell)|can(?:not|'t) remember)\b/i;

const DENIAL_OR_AFFIRMATION_SIGNAL =
  /^(?:no|none|nothing|never|nope|nah|neither|denies|not really|not at all|yes|yeah|yep|yup|sure|definitely|occasionally|sometimes|maybe|i think|fine|normal|unremarkable|nothing relevant|nothing else|no idea)\b/i;

const SHORT_CLINICAL_DENIAL_OR_UNCERTAINTY =
  /\b(?:no|none|nothing|never|not really|not at all|normal|fine|unremarkable|nothing relevant|nothing else|haven'?t|have not|don'?t take|do not take|no known)\b/i;

const CLINICAL_QUESTION_CONCEPT =
  /\b(?:meningitis|flu|covid|infection|virus|bacteria|strep|pneumonia|appendicitis|concussion|fracture|sprain|ulcer|malaria|serotonin|diagnosis|condition|illness|disease|serious|doctor|gp|hospital|a&e|treatment|antibiotic|medicine)\b/i;

// =============================================================================
// Category A: Non-Clinical / Deflection Patterns
// =============================================================================

const META_JAILBREAK_PATTERNS = [
  /\b(?:ignore|disregard|forget|override|bypass)\s+(?:(?:all|any|your|previous|prior|the)\s+)*(?:instructions?|prompts?|rules?|directives?|guidelines?|system)\b/i,
  /\b(?:system\s+prompt|developer\s+prompt|jailbreak|dan\s+mode|pretend\s+(?:you\s+are|to\s+be)|act\s+as\s+(?:a\s+)?(?:pirate|chef|comedian|hacker|lawyer|teacher))\b/i,
  /\b(?:what\s+(?:ai|model|llm)|which\s+(?:ai|model|llm)|are\s+you\s+(?:a\s+bot|an\s+ai|chatgpt|gemini|claude|human|real)|who\s+(?:made|created|trained|built|programmed)\s+you|how\s+were\s+you\s+trained)\b/i,
];

const ADVICE_DEMAND_PATTERNS = [
  /\b(?:diagnose\s+me|give\s+me\s+a?\s*diagnosis|what\s+(?:is\s+my|do\s+you\s+think\s+(?:my|the))\s+diagnosis|tell\s+me\s+what\s+(?:disease|illness|condition)\s+i\s+have)\b/i,
  /\b(?:can\s+you\s+prescribe|write\s+(?:me\s+)?a\s+prescription|give\s+me\s+antibiotics|what\s+(?:medicine|medication|drug|pills?|tablets?)\s+should\s+i\s+(?:take|buy)|should\s+i\s+take\s+(?:\d+|antibiotics|steroids|painkillers))\b/i,
  /^\s*(?:do\s+i\s+have\s+[a-z\s]+\??|what\s+is\s+wrong\s+with\s+me\??|am\s+i\s+going\s+to\s+die\??|what\s+should\s+i\s+take\??)\s*$/i,
];

const CHITCHAT_TRIVIA_PATTERNS = [
  /\b(?:tell\s+(?:me\s+)?a\s+joke|make\s+me\s+laugh|write\s+(?:me\s+)?a\s+(?:poem|story|song|haiku|essay|code|script)|sing\s+a\s+song|play\s+a\s+game|flip\s+a\s+coin|roll\s+a\s+dice)\b/i,
  /\b(?:weather|forecast|temperature\s+(?:outside|today|in\s+[a-z]+)|stock\s+market|bitcoin|crypto|cryptocurrency|world\s+cup|premier\s+league|football\s+(?:match|score|game|team)|who\s+won\s+the|election|prime\s+minister|president\s+of|capital\s+of|meaning\s+of\s+life)\b/i,
  /\b(?:recipe|how\s+(?:do\s+i|to)\s+(?:cook|bake|fix\s+my\s+car)|math\s+homework|solve\s+\d+\s*[+\-*/]\s*\d+|javascript|python\s+code|typescript|sql\s+query)\b/i,
  /\b(?:how\s+are\s+you(?:\s+doing)?|how'?s\s+your\s+day|what'?s\s+up|nice\s+to\s+meet\s+you|what'?s\s+your\s+favorite|i\s+(?:love|like)\s+(?:dogs|cats|pizza|movies|music|video\s+games)|bored\b)\b/i,
];

const GREETING_ONLY_PATTERN =
  /^\s*(?:hi+|hello+|hey+|hiya|yo|sup|good\s+(?:morning|afternoon|evening)|greetings|ok(?:ay)?|thanks|thank\s+you|cheers|cool|alright|sure|test(?:ing)?|hmm+|uh+|um+)\s*[!.,?]*\s*$/i;

const GIBBERISH_OR_EVASION_PATTERNS = [
  /^[^a-z0-9]+$/i,
  /^(?:whatever|blah(?:\s+blah)*|none\s+of\s+your\s+business|mind\s+your\s+(?:own\s+)?business|don'?t\s+care|skip(?:\s+this)?|pass|n\/a|idk\s+anything|nothing\s+to\s+say|zzz+|asdf+|qwerty+|jkl+|aaa+|xxx+)\s*[!.,?]*$/i,
  /(.)\1{4,}/i,
  /^[bcdfghjklmnpqrstvwxz]{6,}$/i,
];

// =============================================================================
// Re-anchor Question Library (<= 28 words total when combined with lead-in)
// =============================================================================

const SHORT_REANCHOR_QUESTIONS: Record<InterviewTopic, string> = {
  breathing_chest_red_flags: 'are you experiencing any chest pain or shortness of breath right now?',
  neuro_severe_red_flags: 'are you having any severe headache, confusion, weakness, or vision changes?',
  chief_complaint_onset_timeline: 'when did your symptoms first start, and how have they changed?',
  chief_complaint_severity_impact: 'how severe are your symptoms, and how do they affect your day?',
  associated_symptoms_core: 'what other symptoms are you having alongside your main concern?',
  progression_modifiers: 'what makes your symptoms better or worse, and are they constant?',
  branch_discriminators: 'are you experiencing any new stomach, urinary, chest, or neurological symptoms?',
  hydration_tolerance_if_gi: 'are you able to keep fluids down without vomiting or diarrhoea?',
  self_care_and_response: 'what treatments or home remedies have you tried so far?',
  exposure_context: 'have you had any recent travel or contact with sick people?',
  pmh: 'are there any existing or past medical conditions to note?',
  regular_meds: 'do you take any regular medications, vitamins, or supplements?',
  allergies: 'are you allergic to any medications?',
  family_social: 'is there any relevant family history, smoking, or alcohol use to note?',
  broad_ros_optional: 'is there anything else about your symptoms your doctor should know?',
};

const HISTORY_TOPICS = new Set<InterviewTopic>([
  'pmh',
  'regular_meds',
  'allergies',
  'family_social',
]);

const HPI_OR_SAFETY_TOPICS = new Set<InterviewTopic>([
  'breathing_chest_red_flags',
  'neuro_severe_red_flags',
  'chief_complaint_onset_timeline',
  'chief_complaint_severity_impact',
  'associated_symptoms_core',
  'progression_modifiers',
  'branch_discriminators',
  'hydration_tolerance_if_gi',
]);

function hasAnyClinicalSignal(text: string): boolean {
  return (
    SYMPTOM_OR_BODY_SIGNAL.test(text) ||
    TEMPORAL_OR_ONSET_SIGNAL.test(text) ||
    SEVERITY_OR_MODIFIER_SIGNAL.test(text) ||
    HISTORY_PMH_SIGNAL.test(text) ||
    HISTORY_MEDS_SIGNAL.test(text) ||
    HISTORY_ALLERGY_SIGNAL.test(text) ||
    HISTORY_FAMILY_SOCIAL_SIGNAL.test(text) ||
    SELF_CARE_REMEDY_SIGNAL.test(text) ||
    EXPOSURE_SIGNAL.test(text)
  );
}

function mentionsOtherHistoryDomain(text: string, topic: InterviewTopic): boolean {
  if (topic !== 'allergies' && HISTORY_ALLERGY_SIGNAL.test(text)) return true;
  if (topic !== 'regular_meds' && topic !== 'self_care_and_response' && HISTORY_MEDS_SIGNAL.test(text)) {
    return true;
  }
  if (topic !== 'pmh' && HISTORY_PMH_SIGNAL.test(text)) return true;
  if (topic !== 'family_social' && topic !== 'exposure_context' && HISTORY_FAMILY_SOCIAL_SIGNAL.test(text)) {
    return true;
  }
  return false;
}

function isResponsiveToActiveTopic(text: string, topic: InterviewTopic): boolean {
  const trimmed = text.trim();
  if (UNCERTAINTY_SIGNAL.test(trimmed)) {
    return true;
  }

  const hasSpecificDomainSignal = (() => {
    switch (topic) {
      case 'breathing_chest_red_flags':
        return (
          /\b(?:chest|breath|breathing|breathe|breathless|shortness|tight|wheeze|air|heart|racing|palpitation|rib|lung)\b/i.test(
            text,
          ) && !HISTORY_FAMILY_SOCIAL_SIGNAL.test(text)
        );
      case 'neuro_severe_red_flags':
        return (
          /\b(?:headache|head|confus|dizzy|faint|weak|numb|tingl|vision|sight|flash|blur|speech|slur|balance|seizure|neck|light)\b/i.test(
            text,
          ) && !HISTORY_FAMILY_SOCIAL_SIGNAL.test(text)
        );
      case 'chief_complaint_onset_timeline': {
        const withoutFrequency = text.replace(/\bevery\s+(?:morning|night|day|evening)\b/gi, '');
        return TEMPORAL_OR_ONSET_SIGNAL.test(withoutFrequency);
      }
      case 'chief_complaint_severity_impact':
        return SEVERITY_OR_MODIFIER_SIGNAL.test(text) || /\b\d+\s*(?:\/\s*10|out\s+of\s+10)\b/i.test(text);
      case 'progression_modifiers':
        return SEVERITY_OR_MODIFIER_SIGNAL.test(text);
      case 'associated_symptoms_core':
      case 'branch_discriminators':
        return SYMPTOM_OR_BODY_SIGNAL.test(text);
      case 'hydration_tolerance_if_gi':
        return /\b(?:fluid|fluids|water|drink|keep|down|vomit|vomiting|threw up|throw up|nausea|diarrh|stool|bowel|eat|food|appetite|stomach|thirst|urine)\b/i.test(
          text,
        );
      case 'self_care_and_response':
        return (
          SELF_CARE_REMEDY_SIGNAL.test(text) ||
          HISTORY_MEDS_SIGNAL.test(text) ||
          SEVERITY_OR_MODIFIER_SIGNAL.test(text)
        );
      case 'exposure_context':
        return EXPOSURE_SIGNAL.test(text);
      case 'pmh':
        return HISTORY_PMH_SIGNAL.test(text);
      case 'regular_meds':
        return HISTORY_MEDS_SIGNAL.test(text) || SELF_CARE_REMEDY_SIGNAL.test(text);
      case 'allergies':
        return HISTORY_ALLERGY_SIGNAL.test(text);
      case 'family_social':
        return HISTORY_FAMILY_SOCIAL_SIGNAL.test(text);
      case 'broad_ros_optional':
        return hasAnyClinicalSignal(text);
    }
  })();

  if (hasSpecificDomainSignal) return true;

  if (
    (DENIAL_OR_AFFIRMATION_SIGNAL.test(trimmed) || SHORT_CLINICAL_DENIAL_OR_UNCERTAINTY.test(trimmed)) &&
    !mentionsOtherHistoryDomain(trimmed, topic)
  ) {
    return true;
  }

  return false;
}

/**
 * Splits a multi-clause patient utterance and maps clauses matching distinct
 * clinical history domains to their rightful topics for opportunistic capture.
 */
export function extractOpportunisticFindings(
  text: string,
  activeTopic?: InterviewTopic,
): OpportunisticFinding[] {
  const clauses = text
    .split(/(?:[,;.]|\band\b|\bbut\b|\balso\b)+/i)
    .map((c) => c.trim())
    .filter((c) => c.length >= 3);

  const candidates = clauses.length > 0 ? clauses : [text.trim()];
  const captured = new Map<InterviewTopic, string[]>();

  const addMatch = (topic: InterviewTopic, clause: string) => {
    if (topic === activeTopic) return;
    const list = captured.get(topic) ?? [];
    if (!list.includes(clause)) list.push(clause);
    captured.set(topic, list);
  };

  for (const clause of candidates) {
    if (HISTORY_ALLERGY_SIGNAL.test(clause)) {
      addMatch('allergies', clause);
    } else if (HISTORY_MEDS_SIGNAL.test(clause)) {
      addMatch('regular_meds', clause);
    } else if (HISTORY_FAMILY_SOCIAL_SIGNAL.test(clause)) {
      addMatch('family_social', clause);
    } else if (HISTORY_PMH_SIGNAL.test(clause)) {
      addMatch('pmh', clause);
    } else if (
      activeTopic &&
      HISTORY_TOPICS.has(activeTopic) &&
      (TEMPORAL_OR_ONSET_SIGNAL.test(clause) || SEVERITY_OR_MODIFIER_SIGNAL.test(clause) || SYMPTOM_OR_BODY_SIGNAL.test(clause))
    ) {
      if (TEMPORAL_OR_ONSET_SIGNAL.test(clause)) {
        addMatch('chief_complaint_onset_timeline', clause);
      } else if (/\b\d+\s*(?:\/\s*10|out\s+of\s+10)\b|\b(?:mild|moderate|severe|bad|worse|terrible|throbbing)\b/i.test(clause)) {
        addMatch('chief_complaint_severity_impact', clause);
      } else if (SYMPTOM_OR_BODY_SIGNAL.test(clause)) {
        addMatch('associated_symptoms_core', clause);
      }
    }
  }

  return Array.from(captured.entries()).map(([topic, parts]) => ({
    topic,
    text: parts.join(', '),
  }));
}

function isPatientClinicalQuestion(text: string): boolean {
  const trimmed = text.trim();
  const looksInterrogative =
    trimmed.endsWith('?') ||
    /^(?:could\s+this|might\s+this|is\s+this|is\s+it|do\s+i\s+(?:have|need)|should\s+i|why\s+(?:are\s+you|do\s+you|is|does)|what\s+(?:causes|is|does)|can\s+you\s+(?:tell|explain|check))\b/i.test(
      trimmed,
    );
  return looksInterrogative && !DENIAL_OR_AFFIRMATION_SIGNAL.test(trimmed);
}

// =============================================================================
// Redirection Message Builders (Single '?', <= 26 words, streak-varied)
// =============================================================================

function buildOpeningRedirect(category: OffTrackCategory, streak: number): string {
  if (category === 'greeting_only') {
    const variants = [
      'Hello, I am here to help your doctor prepare for your visit. What is your main health concern today?',
      'I can help gather details for your appointment. Could you please describe the symptoms bringing you in today?',
      'To begin your pre-consultation intake, please describe the main symptom or health concern you want your doctor to review?',
    ];
    return variants[streak % variants.length];
  }

  if (category === 'advice_demand') {
    const variants = [
      'I cannot diagnose or prescribe treatments, though your doctor will review this intake. What symptoms are you experiencing today?',
      'Only your doctor can diagnose or advise on treatment. To help them prepare, what is your main symptom today?',
    ];
    return variants[streak % variants.length];
  }

  const variants = [
    'I am a clinical assistant preparing a briefing for your doctor. What health concern or symptom brings you in today?',
    'I can only assist with health-related pre-consultation questions for your GP. What symptoms are you experiencing today?',
    'This chat is focused on pre-consultation medical intake. Could you share the health concern you booked your appointment for?',
  ];
  return variants[streak % variants.length];
}

function buildActiveTopicRedirect(
  category: OffTrackCategory,
  activeTopic: InterviewTopic,
  streak: number,
  opportunisticFindings: OpportunisticFinding[],
): string {
  const reanchor = SHORT_REANCHOR_QUESTIONS[activeTopic];

  if (category === 'advice_demand') {
    const variants = [
      `I cannot diagnose or prescribe, though your doctor will review this; ${reanchor}`,
      `Your doctor will provide medical advice after reviewing your intake; ${reanchor}`,
    ];
    return variants[streak % variants.length];
  }

  if (category === 'greeting_only') {
    const variants = [
      `Thanks for checking in; to continue your clinical intake, ${reanchor}`,
      `Let's continue gathering details for your GP appointment: ${reanchor}`,
    ];
    return variants[streak % variants.length];
  }

  if (category === 'patient_clinical_question') {
    const variants = [
      `Your doctor will address that at your visit; to help prepare, ${reanchor}`,
      `I cannot answer clinical questions directly, so your GP can review this: ${reanchor}`,
    ];
    return variants[streak % variants.length];
  }

  if (category === 'cross_topic_clinical') {
    const capturedTopics = new Set(opportunisticFindings.map((f) => f.topic));
    let acknowledgment = 'I have noted those clinical details for your doctor;';
    if (capturedTopics.has('regular_meds') && capturedTopics.has('allergies')) {
      acknowledgment = 'I have noted your medications and allergies;';
    } else if (capturedTopics.has('regular_meds')) {
      acknowledgment = 'I have noted your medication details;';
    } else if (capturedTopics.has('allergies')) {
      acknowledgment = 'I have noted your allergy details;';
    } else if (capturedTopics.has('pmh')) {
      acknowledgment = 'I have noted your medical history;';
    } else if (capturedTopics.has('family_social')) {
      acknowledgment = 'I have noted that family and social context;';
    } else if (capturedTopics.has('chief_complaint_onset_timeline')) {
      acknowledgment = 'I have noted when those symptoms began;';
    } else if (capturedTopics.has('chief_complaint_severity_impact')) {
      acknowledgment = 'I have noted your symptom severity;';
    } else if (capturedTopics.has('associated_symptoms_core')) {
      acknowledgment = 'I have noted those symptom details;';
    }
    return `${acknowledgment} ${reanchor}`;
  }

  const variants = [
    `I need to keep us focused on your health intake for your doctor: ${reanchor}`,
    `I can only assist with your clinical pre-consultation. To help your GP, ${reanchor}`,
    `Please keep responses focused on your medical consultation so your doctor can prepare: ${reanchor}`,
  ];
  return variants[streak % variants.length];
}

// =============================================================================
// Public Evaluator
// =============================================================================

export function evaluatePatientInputRelevance(
  userMessage: string,
  context: RelevanceContext,
): RelevanceEvaluation {
  const trimmed = userMessage.trim();
  const isOpeningTurn = !context.activeTopic;
  const clinicalSignalPresent = hasAnyClinicalSignal(trimmed);

  // 1. Category A: Meta / Jailbreak attempts (always blocked regardless of clinical words)
  if (META_JAILBREAK_PATTERNS.some((p) => p.test(trimmed))) {
    return {
      status: 'off_track_non_clinical',
      category: 'meta_jailbreak',
      opportunisticFindings: [],
      redirectQuestion: isOpeningTurn
        ? buildOpeningRedirect('meta_jailbreak', context.offTrackStreak)
        : buildActiveTopicRedirect('meta_jailbreak', context.activeTopic!, context.offTrackStreak, []),
      badgeLabel: 'Consultation Focus · Redirected to symptom intake',
      reason: 'meta_or_jailbreak_attempt',
    };
  }

  // 2. Category A: Pure Gibberish or Evasion
  if (GIBBERISH_OR_EVASION_PATTERNS.some((p) => p.test(trimmed)) && !clinicalSignalPresent) {
    return {
      status: 'off_track_non_clinical',
      category: 'gibberish_evasion',
      opportunisticFindings: [],
      redirectQuestion: isOpeningTurn
        ? buildOpeningRedirect('gibberish_evasion', context.offTrackStreak)
        : buildActiveTopicRedirect('gibberish_evasion', context.activeTopic!, context.offTrackStreak, []),
      badgeLabel: 'Consultation Focus · Redirected to symptom intake',
      reason: 'non_responsive_or_gibberish',
    };
  }

  // 3. Category A: Greeting-only or non-substantive filler
  if (GREETING_ONLY_PATTERN.test(trimmed)) {
    return {
      status: 'off_track_non_clinical',
      category: 'greeting_only',
      opportunisticFindings: [],
      redirectQuestion: isOpeningTurn
        ? buildOpeningRedirect('greeting_only', context.offTrackStreak)
        : buildActiveTopicRedirect('greeting_only', context.activeTopic!, context.offTrackStreak, []),
      badgeLabel: 'Consultation Focus · Redirected to symptom intake',
      reason: 'greeting_without_clinical_detail',
    };
  }

  // On the opening turn ("what is your main concern today?"), a bare denial ("no")
  // gives no presenting complaint.
  if (isOpeningTurn && !clinicalSignalPresent && DENIAL_OR_AFFIRMATION_SIGNAL.test(trimmed)) {
    return {
      status: 'off_track_non_clinical',
      category: 'greeting_only',
      opportunisticFindings: [],
      redirectQuestion: buildOpeningRedirect('greeting_only', context.offTrackStreak),
      badgeLabel: 'Consultation Focus · Redirected to symptom intake',
      reason: 'opening_turn_missing_complaint',
    };
  }

  // 4. Category A: Direct Diagnosis or Prescription Demands
  if (ADVICE_DEMAND_PATTERNS.some((p) => p.test(trimmed))) {
    // On the opening turn, only redirect if they did not share symptoms alongside the question.
    if (!isOpeningTurn || !SYMPTOM_OR_BODY_SIGNAL.test(trimmed)) {
      return {
        status: 'off_track_non_clinical',
        category: 'advice_demand',
        opportunisticFindings: [],
        redirectQuestion: isOpeningTurn
          ? buildOpeningRedirect('advice_demand', context.offTrackStreak)
          : buildActiveTopicRedirect('advice_demand', context.activeTopic!, context.offTrackStreak, []),
        badgeLabel: 'Clinical Boundary · Assistive intake only',
        reason: 'diagnostic_or_prescribing_demand',
      };
    }
  }

  // 5. Category A: Off-topic Chit-Chat, Trivia, Weather, Jokes
  if (CHITCHAT_TRIVIA_PATTERNS.some((p) => p.test(trimmed)) && !SYMPTOM_OR_BODY_SIGNAL.test(trimmed)) {
    return {
      status: 'off_track_non_clinical',
      category: 'chitchat_trivia',
      opportunisticFindings: [],
      redirectQuestion: isOpeningTurn
        ? buildOpeningRedirect('chitchat_trivia', context.offTrackStreak)
        : buildActiveTopicRedirect('chitchat_trivia', context.activeTopic!, context.offTrackStreak, []),
      badgeLabel: 'Consultation Focus · Redirected to symptom intake',
      reason: 'off_topic_chitchat_or_trivia',
    };
  }

  const isClinicalQuestionOnActiveTopic =
    Boolean(context.activeTopic) &&
    isPatientClinicalQuestion(trimmed) &&
    (clinicalSignalPresent || CLINICAL_QUESTION_CONCEPT.test(trimmed));

  // Fallback Category A check: conversational statement with zero clinical signals
  // and zero denial/uncertainty signals (e.g., "I like pizza and dogs", "fix my car").
  if (
    !clinicalSignalPresent &&
    !isClinicalQuestionOnActiveTopic &&
    !DENIAL_OR_AFFIRMATION_SIGNAL.test(trimmed) &&
    !SHORT_CLINICAL_DENIAL_OR_UNCERTAINTY.test(trimmed) &&
    !UNCERTAINTY_SIGNAL.test(trimmed)
  ) {
    return {
      status: 'off_track_non_clinical',
      category: 'chitchat_trivia',
      opportunisticFindings: [],
      redirectQuestion: isOpeningTurn
        ? buildOpeningRedirect('chitchat_trivia', context.offTrackStreak)
        : buildActiveTopicRedirect('chitchat_trivia', context.activeTopic!, context.offTrackStreak, []),
      badgeLabel: 'Consultation Focus · Redirected to symptom intake',
      reason: 'no_clinical_relevance',
    };
  }

  // 6. Category B: Clinical but Off-Target (only when an active topic is pending
  // and refocus budgets have not been exceeded).
  if (
    context.activeTopic &&
    context.topicRefocusCount < MAX_REFOCUS_PER_TOPIC &&
    context.sessionClinicalRefocusCount < MAX_CLINICAL_REFOCUSES_PER_SESSION
  ) {
    const activeTopic = context.activeTopic;
    const responsive = isResponsiveToActiveTopic(trimmed, activeTopic);

    if (!responsive) {
      // Case B1: Patient asked a clinical question instead of answering the active topic
      if (isPatientClinicalQuestion(trimmed)) {
        return {
          status: 'off_track_clinical_misaligned',
          category: 'patient_clinical_question',
          opportunisticFindings: [],
          redirectQuestion: buildActiveTopicRedirect(
            'patient_clinical_question',
            activeTopic,
            context.offTrackStreak,
            [],
          ),
          badgeLabel: 'Consultation Focus · Refocusing on active question',
          reason: `patient_question_on_${activeTopic}`,
        };
      }

      // Case B2: High-confidence cross-domain clinical mismatch (HPI/Safety <-> History block)
      const opportunistic = extractOpportunisticFindings(trimmed, activeTopic);
      const activeIsHistory = HISTORY_TOPICS.has(activeTopic);
      const activeIsHpiOrSafety = HPI_OR_SAFETY_TOPICS.has(activeTopic);

      const hasHistoryOpportunistic = opportunistic.some((f) => HISTORY_TOPICS.has(f.topic));
      const hasHpiSignal =
        SYMPTOM_OR_BODY_SIGNAL.test(trimmed) ||
        TEMPORAL_OR_ONSET_SIGNAL.test(trimmed) ||
        SEVERITY_OR_MODIFIER_SIGNAL.test(trimmed);

      const isCrossDomainMismatch =
        (activeIsHpiOrSafety && hasHistoryOpportunistic) ||
        (activeIsHistory && hasHpiSignal);

      if (isCrossDomainMismatch) {
        return {
          status: 'off_track_clinical_misaligned',
          category: 'cross_topic_clinical',
          opportunisticFindings: opportunistic,
          redirectQuestion: buildActiveTopicRedirect(
            'cross_topic_clinical',
            activeTopic,
            context.offTrackStreak,
            opportunistic,
          ),
          badgeLabel: 'Consultation Focus · Refocusing on active question',
          reason: `cross_domain_answer_on_${activeTopic}`,
        };
      }
    }
  }

  return {
    status: 'on_track',
    opportunisticFindings: [],
    redirectQuestion: '',
    badgeLabel: '',
  };
}
