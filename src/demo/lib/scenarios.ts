/**
 * Curated Clinical Scenarios for MedGemma Pre-Consultation Demo
 *
 * Hand-authored for this demo — they are NOT drawn from the STEMCare
 * evaluation golden sets. Patient presentations are fictional and the
 * expected differentials are illustrative teaching content for the
 * clinician-review walkthrough.
 */

import type { DemoScenario } from '../types';

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: 'migraine_aura',
    name: 'Acute Migraine with Typical Aura',
    badgeLabel: 'Neurology / Primary Care',
    summaryPitch: 'Demonstrates complex symptom onset, visual aura profiling, and critical contraindication flagging (combined oral contraceptive in migraine with aura).',
    patientProfile: {
      name: 'Sophie Clarke',
      age: 28,
      gender: 'Female',
      allergies: 'NKDA (No known drug allergies)',
      regularMeds: 'Combined oral contraceptive pill (Microgynon 30)',
      pastHistory: 'Milder episodic headaches in university (infrequent)',
    },
    initialComplaint:
      "I've developed a severe, throbbing headache on the right side of my head that started about 4 hours ago, and I had weird zigzagging lights in my vision right before it hit.",
    initialFollowUpQuestion:
      "I see. You mentioned strange zigzagging lights in your vision right before the headache began. Could you describe what those visual disturbances looked like, how long they lasted, and did your vision return to normal?",
    turns: [
      {
        patientInput:
          "The visual disturbance lasted about 25 minutes—it looked like shimmering, jagged zig-zag lines that drifted across my right eye. Then my vision cleared just as the intense pain started.",
        suggestedChips: [
          'Visual zigzags lasted ~25 mins',
          'Shimmering jagged lines across right eye',
          'Vision cleared just before pain started',
        ],
        assistantQuestion:
          "Thank you for describing the visual changes so clearly. How severe is the headache right now on a scale from 1 to 10, how does the pain feel (pulsing, pressure, sharp), and are you experiencing any nausea or sensitivity to light or sound?",
        topic: 'hpi_character',
        reportAddition: {
          section: 'History of Present Illness',
          bullet: 'Classic scintillating scotoma (jagged, shimmering visual aura) lasting 25 minutes prior to headache onset.',
        },
      },
      {
        patientInput:
          "It's a pulsating, pounding 8 out of 10. Normal room lighting feels blinding, and any sound makes my head throb more. I've vomited once and feel very nauseous.",
        suggestedChips: [
          'Pulsating, pounding 8/10 pain',
          'Severe light & sound sensitivity',
          'Vomited once with nausea',
        ],
        assistantQuestion:
          "I'm sorry to hear how uncomfortable that is. To ensure we have your full background before the doctor reviews this: what regular prescription medications, birth control, or over-the-counter remedies do you take, and have you taken anything for this headache so far?",
        topic: 'regular_meds',
        reportAddition: {
          section: 'Associated Symptoms',
          bullet: 'Pulsatile right-sided hemicrania (8/10), marked photophobia, phonophobia, and 1 episode of emesis.',
        },
      },
      {
        patientInput:
          "I take the combined pill (Microgynon 30) for contraception. I don't take any other regular meds. About an hour ago I took 400mg ibuprofen with water, but it hasn't helped at all.",
        suggestedChips: [
          'Taking Microgynon 30 pill',
          'Took 400mg Ibuprofen without relief',
          'No other regular medications',
        ],
        assistantQuestion:
          "Thank you. A critical safety check: are you experiencing any neck stiffness, fever, weakness in your face or arms, numbness, or difficulty speaking or finding words?",
        topic: 'red_flags',
        reportAddition: {
          section: 'Past History & Meds',
          bullet: 'Current medications: Microgynon 30 (Combined Oral Contraceptive). Took Ibuprofen 400mg PO without symptomatic relief.',
        },
      },
      {
        patientInput:
          "No neck stiffness, no fever, no weakness in my face or arms, and no speech trouble. Just the intense throbbing headache, light sensitivity, and nausea.",
        suggestedChips: [
          'No neck stiffness or fever',
          'No facial weakness or speech trouble',
          'Just intense throbbing headache & nausea',
        ],
        assistantQuestion:
          "Thank you for answering these questions thoroughly. I have compiled all the essential details into your pre-consultation briefing for your GP. Please rest in a dark, quiet room while the clinician reviews your record.",
        topic: 'summary',
        reportAddition: {
          section: 'Red Flags',
          bullet: 'Negative for neck stiffness, pyrexia, focal motor weakness, sensory deficit, or dysphasia.',
        },
      },
    ],
    expectedDifferentials: [
      {
        id: 'diff_migraine',
        condition: 'Migraine with typical aura (ICD-10 G43.109)',
        probability: 0.86,
        confidenceBucket: 'high',
        keyFindings: [
          'Unilateral pulsating headache lasting >4h preceded by 25-minute scintillating scotoma',
          'Prominent photophobia, phonophobia, and nausea',
          'Meets ICHD-3 criteria for Migraine with Aura',
        ],
        recommendedAction:
          'Clinician to review acute therapy options (e.g. triptan + antiemetic) if migraine confirmed. URGENT REVIEW: combined oral contraceptive is contraindicated in migraine with aura (UKMEC 4 - stroke risk); clinician to discuss switching to progesterone-only or non-hormonal contraception.',
        guidelineRef: 'NICE Clinical Guideline [CG150] & UK Medical Eligibility Criteria for Contraceptive Use (UKMEC)',
      },
      {
        id: 'diff_tension',
        condition: 'Tension-type headache (G44.209)',
        probability: 0.09,
        confidenceBucket: 'low',
        keyFindings: ['Headache present, but character is pulsatile and unilateral rather than band-like; aura incompatible with simple tension headache.'],
        recommendedAction: 'Low likelihood; consider only if secondary features dominate.',
        guidelineRef: 'NICE CG150',
      },
      {
        id: 'diff_cluster',
        condition: 'Cluster headache / Trigeminal autonomic cephalalgia (G44.009)',
        probability: 0.05,
        confidenceBucket: 'low',
        keyFindings: ['Unilateral pain present, but lacks autonomic features (conjunctival injection, lacrimation, rhinorrhea, ptosis).'],
        recommendedAction: 'Safety-net for episodic clustering; verify absence of autonomic signs.',
        guidelineRef: 'BASH Guidelines 2024',
      },
    ],
  },
  {
    id: 'influenza',
    name: 'Acute Influenza-like Illness',
    badgeLabel: 'Infectious / Acute Care',
    summaryPitch: 'Captures hyperacute febrile onset, systemic myalgia, respiratory screening, and rule-outs for lower respiratory tract consolidation.',
    patientProfile: {
      name: 'James Miller',
      age: 42,
      gender: 'Male',
      allergies: 'Penicillin (mild cutaneous rash in childhood)',
      regularMeds: 'None',
      pastHistory: 'No chronic respiratory, cardiovascular, or metabolic disease',
    },
    initialComplaint:
      "I've suddenly come down with a high fever, severe muscle aches all over my body, shivering chills, and a relentless dry cough that started yesterday evening.",
    initialFollowUpQuestion:
      "I am sorry to hear that. A sudden high fever and intense body aches are important to evaluate. How quickly did this come on, what has your highest measured temperature been, and did it start with shivering chills?",
    turns: [
      {
        patientInput:
          "It hit me like a freight train yesterday around 6 PM. I went from feeling completely normal at work to having a 39.1°C fever, uncontrollable shivering, and feeling exhausted within hours.",
        suggestedChips: [
          'Hit suddenly yesterday around 6 PM',
          'Temperature reached 39.1°C with rigors',
          'Uncontrollable shivering and exhaustion',
        ],
        assistantQuestion:
          "That rapid onset is very helpful context. Alongside the fever and muscle aches, are you experiencing any shortness of breath, chest pain when breathing in, wheezing, or difficulty catching your breath when walking or resting?",
        topic: 'associated_symptoms',
        reportAddition: {
          section: 'History of Present Illness',
          bullet: 'Hyperacute febrile onset (within hours) with documented temperature 39.1°C, prominent rigors, and debilitating diffuse myalgias.',
        },
      },
      {
        patientInput:
          "My throat feels raw and scratched, and I have a constant tickly dry cough. But no chest pain, no wheezing, and I can catch my breath fine when resting.",
        suggestedChips: [
          'Raw throat and tickly dry cough',
          'No chest pain or wheezing',
          'Breathing fine when resting',
        ],
        assistantQuestion:
          "Good to know there is no chest pain or breathlessness. Do you have any underlying medical conditions like asthma, diabetes, or heart disease, and what have you taken to help manage the fever?",
        topic: 'pmh_meds',
        reportAddition: {
          section: 'Associated Symptoms',
          bullet: 'Dry non-productive cough, pharyngeal erythema/sore throat; denies pleuritic chest pain or resting dyspnea.',
        },
      },
      {
        patientInput:
          "No chronic medical conditions at all, no asthma. I've taken 1000mg paracetamol which knocked the fever down to 38.2°C for a couple of hours before it climbed again. I'm allergic to penicillin (had a rash as a kid).",
        suggestedChips: [
          'No chronic medical conditions',
          'Paracetamol knocked fever down temporarily',
          'Allergic to penicillin (rash)',
        ],
        assistantQuestion:
          "Thank you for noting the penicillin allergy. Just to screen for any urgent safety concerns: have you coughed up any blood, felt confused or drowsy, or noticed a rash that does not fade when pressed with a glass?",
        topic: 'red_flags',
        reportAddition: {
          section: 'Past History & Meds',
          bullet: 'Allergies: Penicillin (childhood rash). Nil regular medications. Paracetamol provides transient antipyretic response.',
        },
      },
      {
        patientInput:
          "No confusion, no blood at all, no rash, and I've been forcing down plenty of fluids and hot lemon tea.",
        suggestedChips: [
          'No confusion or coughing blood',
          'No rash',
          'Drinking plenty of fluids and hot tea',
        ],
        assistantQuestion:
          "Thank you, James. I have documented your symptoms and timeline in full. Your clinician will review this to confirm the assessment and advise on symptomatic management and safety-netting.",
        topic: 'summary',
        reportAddition: {
          section: 'Red Flags',
          bullet: 'Screened negative for hemoptysis, confusion (CURB-65 criteria intact), shortness of breath, or non-blanching purpura.',
        },
      },
    ],
    expectedDifferentials: [
      {
        id: 'diff_flu',
        condition: 'Influenza-like Illness / Acute Viral Respiratory Infection (J11.1)',
        probability: 0.84,
        confidenceBucket: 'high',
        keyFindings: [
          'Abrupt sudden onset (<24h) with pyrexia >39°C and pronounced rigors',
          'Generalized myalgia, fatigue, dry cough, and sore throat',
          'Absence of lower respiratory tract consolidation signs or red flags',
        ],
        recommendedAction:
          'Clinician to confirm supportive-care advice and safety-netting for deteriorating respiratory symptoms or prolonged pyrexia (>5 days).',
        guidelineRef: 'NICE Clinical Knowledge Summaries (CKS): Influenza-like illness',
      },
      {
        id: 'diff_bronchitis',
        condition: 'Acute Bronchitis (J20.9)',
        probability: 0.11,
        confidenceBucket: 'low',
        keyFindings: ['Prominent cough present, but constitutional features (rapid high fever and myalgias) dominate clinical picture.'],
        recommendedAction: 'Antibiotics not routinely indicated; monitor cough trajectory.',
        guidelineRef: 'NICE NG120',
      },
      {
        id: 'diff_pneumonia',
        condition: 'Community-Acquired Pneumonia (J18.9)',
        probability: 0.05,
        confidenceBucket: 'low',
        keyFindings: ['Low risk: no focal pleuritic chest pain, no hemoptysis, respiratory rate comfortable, zero CURB-65 criteria.'],
        recommendedAction: 'Advise urgent clinic evaluation if breathlessness, colored sputum, or pleuritic pain develop.',
        guidelineRef: 'NICE CG191 (CURB-65 Score: 0)',
      },
    ],
  },
  {
    id: 'malaria_travel',
    name: 'Post-Travel Febrile Illness (Suspected Malaria)',
    badgeLabel: 'Tropical Medicine / Urgent Triage',
    summaryPitch: 'Demonstrates critical travel history capture, cyclical paroxysm recognition, and immediate same-day diagnostic pathway triggering.',
    patientProfile: {
      name: 'David Okonjo',
      age: 34,
      gender: 'Male',
      allergies: 'None',
      regularMeds: 'None',
      pastHistory: 'Recent 14-day travel to rural Tanzania (safari & Lake Victoria), returned 10 days ago',
    },
    initialComplaint:
      "I've been experiencing bouts of extreme shivering and teeth-chattering chills followed by burning high fevers and drenching sweats. I returned from a two-week trip to Tanzania 10 days ago.",
    initialFollowUpQuestion:
      "Travel to sub-Saharan Africa with cyclical shivering and fever is a top clinical priority. While in Tanzania, were you taking any antimalarial medication (such as Malarone or Doxycycline), and did you experience mosquito bites?",
    turns: [
      {
        patientInput:
          "The fevers seem to spike every other day. I start shaking uncontrollably with chills, then my fever spikes up to almost 40°C, and then I drench my clothes in sweat when it breaks.",
        suggestedChips: [
          'Fevers spike every 48 hours',
          'Shaking chills with fever to 40°C',
          'Drenching sweats when fever breaks',
        ],
        assistantQuestion:
          "Travel to sub-Saharan Africa with cyclical fever is an important clinical priority. While in Tanzania, were you taking any antimalarial medication (such as Malarone or Doxycycline), and did you experience mosquito bites?",
        topic: 'travel_chemoprophylaxis',
        reportAddition: {
          section: 'History of Present Illness',
          bullet: 'Tertiary-pattern pyrexial paroxysms (rigors -> high fever ~40°C -> diaphoresis) returning from Tanzania 10 days ago.',
        },
      },
      {
        patientInput:
          "I had plenty of mosquito bites on safari. I was prescribed Malarone, but I stopped taking it 3 days into the trip because it gave me mild stomach upset. So I didn't complete the course.",
        suggestedChips: [
          'Numerous mosquito bites on safari',
          'Stopped Malarone after day 3',
          'Did not complete preventative course',
        ],
        assistantQuestion:
          "Thank you for being open about the medication—incomplete chemoprophylaxis significantly increases malaria risk. Have you noticed any yellowing of your eyes or skin (jaundice), dark 'tea-colored' urine, persistent vomiting, or confusion?",
        topic: 'severity_markers',
        reportAddition: {
          section: 'Past History & Meds',
          bullet: 'Travel: Rural Tanzania x14 days. Stopped Atovaquone/Proguanil (Malarone) prematurely after day 3. Significant mosquito exposure.',
        },
      },
      {
        patientInput:
          "My urine has been noticeably dark like strong black tea since yesterday. No yellow eyes yet, no confusion, but I feel terribly weak and have upper abdominal discomfort.",
        suggestedChips: [
          'Urine dark like black tea',
          'No yellow eyes or confusion',
          'Extreme weakness & malaise',
        ],
        assistantQuestion:
          "Dark urine and cyclical fevers following travel to an endemic area require urgent same-day laboratory testing. Are you able to walk, keep fluids down, and breathe without difficulty?",
        topic: 'urgent_assessment',
        reportAddition: {
          section: 'Associated Symptoms',
          bullet: 'Dark tea-colored urine (suggestive of intravascular hemolysis/hemoglobinuria), profound malaise, and upper abdominal tenderness.',
        },
      },
      {
        patientInput:
          "I can keep sips of water down and I can walk, but I feel very weak. No shortness of breath or fainting, but I feel worse with every fever cycle.",
        suggestedChips: [
          'Able to walk slowly',
          'Can keep sips of fluid down',
          'No shortness of breath or fainting',
        ],
        assistantQuestion:
          "Thank you, David. I am concluding this pre-consultation intake immediately with an urgent escalation flag. Because malaria can progress rapidly, your clinician will direct you for same-day blood films and a full blood count without delay.",
        topic: 'summary',
        reportAddition: {
          section: 'Red Flags',
          bullet: 'High-risk post-travel pyrexia with dark urine. Requires urgent same-day EDTA blood film (thick & thin) and rapid diagnostic test (RDT).',
        },
      },
    ],
    expectedDifferentials: [
      {
        id: 'diff_malaria',
        condition: 'Plasmodium Falciparum Malaria (ICD-10 B50.9)',
        probability: 0.88,
        confidenceBucket: 'high',
        keyFindings: [
          'Endemic travel to East Africa within incubation window (returned 10 days ago)',
          'Premature discontinuation of antimalarial chemoprophylaxis (Malarone)',
          'Cyclical rigors and paroxysmal fevers with dark urine (hemolysis marker)',
        ],
        recommendedAction:
          'IMMEDIATE SAME-DAY REFERRAL for urgent thick and thin blood films, malaria rapid diagnostic antigen test (RDT), FBC, U&Es, and LFTs. Do not delay assessment.',
        guidelineRef: 'UK Health Security Agency (UKHSA) Malaria Treatment Guidelines 2024',
      },
      {
        id: 'diff_typhoid',
        condition: 'Enteric Fever / Typhoid (Salmonella enterica) (A01.0)',
        probability: 0.08,
        confidenceBucket: 'low',
        keyFindings: ['Travel history compatible, but fever is paroxysmal rather than step-ladder pattern; lacks bradycardia.'],
        recommendedAction: 'Blood cultures indicated concurrently with malaria films.',
        guidelineRef: 'UKHSA Enteric Fever Guidelines',
      },
      {
        id: 'diff_dengue',
        condition: 'Dengue Fever (A90)',
        probability: 0.04,
        confidenceBucket: 'low',
        keyFindings: ['Arthropod-borne travel infection, but absence of retro-orbital pain, severe arthralgia (breakbone), or petechiae.'],
        recommendedAction: 'Dengue NS1/IgM serology as secondary differential.',
        guidelineRef: 'WHO Dengue Guidelines',
      },
    ],
  },
  {
    id: 'serotonin_syndrome',
    name: 'Serotonin Syndrome (Critical Drug Interaction)',
    badgeLabel: 'Adverse Drug Reaction / 999 Escalation',
    summaryPitch: 'Demonstrates deterministic Hunter Criteria detection, immediate emergency red-flag termination, and clinician safety-net gating.',
    triggersRedFlag: true,
    redFlagDetails: {
      symptom: 'Suspected Serotonin Toxicity (Hunter Criteria: Tremor + Clonus + Hyperthermia)',
      urgency: 'call_999',
      headline: 'Emergency Medical Attention Required — Call 999 Immediately',
      guidance: 'Spontaneous clonus, involuntary jerking, and fever after taking combined serotonergic medications (Sertraline + Tramadol) is a medical emergency. Discontinue all medications and call 999 or proceed to the nearest Emergency Department.',
    },
    patientProfile: {
      name: 'Eleanor Vance',
      age: 52,
      gender: 'Female',
      allergies: 'None',
      regularMeds: 'Sertraline 100mg once daily (prescribed for generalized anxiety)',
      pastHistory: 'Generalized anxiety disorder, recent dental extraction 24h ago',
    },
    initialComplaint:
      "I'm feeling intensely jittery, my hands and ankles are twitching and jerking involuntarily, I'm sweating profusely, and my heart is racing after taking my new dental painkiller.",
    initialFollowUpQuestion:
      "Involuntary muscle twitches, profuse sweating, and a racing heart after a new medication can be very serious. What medications are you currently taking, what is the new painkiller, and when did you take your last dose?",
    turns: [
      {
        patientInput:
          "I take Sertraline 100mg daily. Yesterday my dentist prescribed Tramadol 50mg for severe tooth pain. I took my second Tramadol tablet about 3 hours ago, and now my muscles won't stop jerking, I'm drenched in sweat, and I feel terrified.",
        suggestedChips: [
          'Taking Sertraline 100mg daily',
          'Took 2nd Tramadol dose 3h ago',
          'Muscles jerking & sweating profusely',
        ],
        assistantQuestion:
          "This is a critical symptom pattern. Are you experiencing fever or high body temperature, confusion, stiff muscles, or rhythmic bouncing (clonus) in your ankles or feet when you move?",
        topic: 'serotonin_hunter_criteria',
        reportAddition: {
          section: 'Past History & Meds',
          bullet: 'Concurrent intake of dual serotonergic agents: Sertraline 100mg PO daily + Tramadol 50mg PO (2 doses in last 24h).',
        },
      },
      {
        patientInput:
          "Yes! My temperature is 38.6°C, my heart is beating at 130 bpm, my pupils look huge in the mirror, and when my foot bends upward my ankle jerks repeatedly (clonus). I feel disoriented and my muscles feel rigid.",
        suggestedChips: [
          'Temp 38.6°C, HR 130 bpm',
          'Rhythmic ankle clonus present',
          'Dilated pupils & feeling disoriented',
        ],
        assistantQuestion:
          "⚠️ CRITICAL EMERGENCY: The combination of Sertraline and Tramadol with muscle jerking (clonus), high fever, sweating, and rapid heart rate indicates potential Serotonin Syndrome. Please stop taking Tramadol immediately, dial 999, and seek emergency hospital evaluation now.",
        topic: 'emergency_termination',
        reportAddition: {
          section: 'Red Flags',
          bullet: 'EMERGENCY: Positive Hunter Serotonin Toxicity Criteria (spontaneous clonus + diaphoresis + hyperpyrexia 38.6°C + tachycardia). Advised immediate 999 / A&E.',
        },
      },
    ],
    expectedDifferentials: [
      {
        id: 'diff_serotonin',
        condition: 'Serotonin Toxicity / Syndrome (ICD-10 T43.225A)',
        probability: 0.93,
        confidenceBucket: 'high',
        keyFindings: [
          'Dual serotonergic agent exposure (SSRI Sertraline + Tramadol opioid receptor / SNRI)',
          'Meets validated Hunter Criteria: Clonus (ankle clonus) + Diaphoresis + Tremor + Hyperthermia (38.6°C)',
          'Autonomic hyperactivity (tachycardia ~130 bpm, dilated pupils)',
        ],
        recommendedAction:
          'EMERGENCY A&E TRANSFER (999). Immediate discontinuation of all serotonergic agents. Supportive care, IV fluids, and consideration of Cyproheptadine in high-dependency unit.',
        guidelineRef: 'BNF Drug Interaction Guidance & Hunter Serotonin Toxicity Criteria',
      },
      {
        id: 'diff_anticholinergic',
        condition: 'Anticholinergic Toxindrome (T44.3X5A)',
        probability: 0.05,
        confidenceBucket: 'low',
        keyFindings: ['Tachycardia and mydriasis present, but patient is diaphoresis/sweating rather than having dry skin/dry mouth typical of anticholinergic toxicity.'],
        recommendedAction: 'Rule out via presence of profuse diaphoresis and hyperreflexia.',
        guidelineRef: 'Toxbase Guidance',
      },
      {
        id: 'diff_panic',
        condition: 'Acute Panic / Hyperventilation Episode (F41.0)',
        probability: 0.02,
        confidenceBucket: 'low',
        keyFindings: ['Anxiety history present, but objective pyrexia (38.6°C) and ocular/ankle clonus cannot be explained by panic alone.'],
        recommendedAction: 'Do not attribute to anxiety in presence of objective neuromuscular signs.',
        guidelineRef: 'NICE CG113',
      },
    ],
  },
];
