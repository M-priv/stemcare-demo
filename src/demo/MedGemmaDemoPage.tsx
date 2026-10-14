import React, { useState, useEffect, useRef, useCallback } from 'react';
import type {
  DemoChatMessage as DemoChatMessageType,
  ScenarioConditionId,
  ClinicalReportSnapshot,
  DifferentialHypothesis,
  ClinicianReviewDecision,
} from './types';
import type {
  MedGemmaChatState,
  ConditionName,
  SimulationConfig,
} from './lib/harnessTypes';
import { DEMO_SCENARIOS } from './lib/scenarios';
import {
  initializeChatSession,
  processPatientMessage,
  INTERVIEW_COMPLETE_PHRASE,
  CANONICAL_OPENING_GREETING,
} from './lib/medgemmaChatService';
import {
  createSimulation,
  generatePatientResponse,
  getInitialComplaint,
} from './lib/patientSimulator';
import { generateDifferentialHypotheses } from './lib/differentials';
import { createInitialReport } from './lib/medgemmaEngine';
import { isLiveMode } from './lib/demoApi';
import { DemoHeader } from './components/DemoHeader';
import { DemoChatArea } from './components/DemoChatArea';
import { DemoChatInput } from './components/DemoChatInput';
import { DemoReportPanel } from './components/DemoReportPanel';
import { DemoTourModal } from './components/DemoTourModal';

interface MedGemmaDemoPageProps {
  onBackToLanding: () => void;
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
}

const SCENARIO_TO_CONDITION: Record<ScenarioConditionId, ConditionName> = {
  migraine_aura: 'Migraine',
  influenza: 'Flu',
  malaria_travel: 'Malaria',
  serotonin_syndrome: 'Serotonin Syndrome',
};

const CUSTOM_STARTER_CHIPS = [
  'Sharp knee pain after playing football',
  'Severe sore throat and fever for 3 days',
  'Lower back pain shooting down left leg',
  'Persistent dry cough with mild breathlessness',
];

export const MedGemmaDemoPage: React.FC<MedGemmaDemoPageProps> = ({
  onBackToLanding,
  theme,
  onThemeToggle,
}) => {
  const [currentScenarioId, setCurrentScenarioId] = useState<ScenarioConditionId | 'custom'>('migraine_aura');
  const [chatState, setChatState] = useState<MedGemmaChatState>(() =>
    initializeChatSession(DEMO_SCENARIOS[0].initialComplaint, 'Sophie Clarke')
  );
  const [simulationConfig, setSimulationConfig] = useState<SimulationConfig | null>(() =>
    createSimulation('Migraine')
  );
  const [reportSnapshot, setReportSnapshot] = useState<ClinicalReportSnapshot>(() =>
    createInitialReport('Sophie Clarke', DEMO_SCENARIOS[0].initialComplaint)
  );

  const [hypotheses, setHypotheses] = useState<DifferentialHypothesis[]>([]);
  const [isSynthesizingHypotheses, setIsSynthesizingHypotheses] = useState(false);
  const [blockedReason, setBlockedReason] = useState<string | undefined>(undefined);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [isInterviewComplete, setIsInterviewComplete] = useState(false);
  const [clinicianReview, setClinicianReview] = useState<ClinicianReviewDecision | null>(null);
  const [activeMobileTab, setActiveMobileTab] = useState<'chat' | 'report' | 'review'>('chat');
  const [isTourOpen, setIsTourOpen] = useState(false);

  const isAutoPlayingRef = useRef(false);
  isAutoPlayingRef.current = isAutoPlaying;

  const chatStateRef = useRef(chatState);
  chatStateRef.current = chatState;

  const simConfigRef = useRef(simulationConfig);
  simConfigRef.current = simulationConfig;

  const autoPlayTimerRef = useRef<number | null>(null);

  // Session epoch: bumped on every scenario switch/reset so async turn and
  // hypothesis continuations from a superseded session are discarded instead
  // of clobbering the fresh state.
  const epochRef = useRef(0);

  // Synchronous busy lock: React state updates batch, so two rapid sends can
  // both observe isStreaming === false; the ref closes that window.
  const isBusyRef = useRef(false);

  const clearTimer = () => {
    if (autoPlayTimerRef.current) {
      window.clearTimeout(autoPlayTimerRef.current);
      autoPlayTimerRef.current = null;
    }
  };

  // Helper to trigger differential hypothesis generation once report is finalized
  const triggerHypothesisSynthesis = useCallback(
    async (finalReportMarkdown: string, scenarioId: ScenarioConditionId | 'custom', epoch: number) => {
      setIsSynthesizingHypotheses(true);
      setBlockedReason(undefined);

      try {
        const result = await generateDifferentialHypotheses(finalReportMarkdown, scenarioId);

        if (epochRef.current !== epoch) return; // session changed mid-synthesis

        if (result.blocked) {
          setBlockedReason(result.blockedReason || 'Emergency red flag detected.');
          setHypotheses([]);
        } else {
          setHypotheses(result.hypotheses);
        }
      } catch (err) {
        console.error('[MedGemma Harness] Failed to generate hypotheses:', err);
      } finally {
        if (epochRef.current === epoch) {
          setIsSynthesizingHypotheses(false);
        }
      }
    },
    []
  );

  // Initialize a scenario or fresh start
  const initScenario = useCallback((scenarioId: ScenarioConditionId | 'custom') => {
    epochRef.current += 1;
    isBusyRef.current = false;
    clearTimer();
    setCurrentScenarioId(scenarioId);
    setIsStreaming(false);
    setIsAutoPlaying(false);
    setIsInterviewComplete(false);
    setClinicianReview(null);
    setHypotheses([]);
    setBlockedReason(undefined);
    setIsSynthesizingHypotheses(false);

    if (scenarioId === 'custom') {
      // Fresh Start: Clean slate with canonical NHS greeting
      const newSession = initializeChatSession('', 'Guest Patient');
      const blankSnapshot = createInitialReport('Guest Patient', '');
      setChatState(newSession);
      setSimulationConfig(null);
      setReportSnapshot(blankSnapshot);
      return;
    }

    // Benchmark Scenario driven by STEMCare Patient Simulator
    const scenario = DEMO_SCENARIOS.find((s) => s.id === scenarioId);
    if (!scenario) return;

    const condition = SCENARIO_TO_CONDITION[scenarioId];
    const initialComplaintText = getInitialComplaint(condition) || scenario.initialComplaint;
    const simConfig = createSimulation(condition);

    const newSession = initializeChatSession(initialComplaintText, scenario.patientProfile.name);
    const initialSnapshot = createInitialReport(scenario.patientProfile.name, initialComplaintText);
    initialSnapshot.ageGender = `${scenario.patientProfile.age} yo ${scenario.patientProfile.gender}`;
    initialSnapshot.pastHistoryAndMeds = [
      `Known conditions: ${scenario.patientProfile.pastHistory}`,
      `Current medications: ${scenario.patientProfile.regularMeds}`,
      `Allergies: ${scenario.patientProfile.allergies}`,
    ];

    setChatState(newSession);
    setSimulationConfig(simConfig);
    setReportSnapshot(initialSnapshot);
  }, []);

  // Run on mount
  useEffect(() => {
    initScenario('migraine_aura');
    return () => {
      clearTimer();
    };
  }, [initScenario]);

  // Execute an authentic simulation turn using STEMCare patientSimulator + medgemmaChatService
  const executeSimulationTurn = useCallback(
    async (keepAutoPlaying: boolean) => {
      if (isBusyRef.current) return;
      const epoch = epochRef.current;
      const activeState = chatStateRef.current;
      const activeSimConfig = simConfigRef.current;
      if (!activeSimConfig || isInterviewComplete) {
        setIsAutoPlaying(false);
        return;
      }

      isBusyRef.current = true;
      setIsStreaming(true);

      try {
        // 1. Get last assistant question
        const assistantMsgs = activeState.messages.filter((m) => m.role === 'assistant');
        const lastQuestion =
          assistantMsgs[assistantMsgs.length - 1]?.content || CANONICAL_OPENING_GREETING;

        // 2. Generate natural patient roleplay response using authentic condition symptoms
        const simResult = await generatePatientResponse(lastQuestion, activeSimConfig);
        if (epochRef.current !== epoch) return; // session changed mid-turn

        // 3. Process patient message through MedGemma dual-persona engine
        const processResult = await processPatientMessage(
          activeState,
          simResult.response,
        );
        if (epochRef.current !== epoch) return; // session changed mid-turn

        setSimulationConfig(simResult.updatedConfig);
        setChatState(processResult.state);
        setIsStreaming(false);

        setReportSnapshot((prev) => ({
          ...prev,
          lastUpdated: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isFinalized: processResult.interviewComplete,
        }));

        if (processResult.interviewComplete) {
          setIsInterviewComplete(true);
          setIsAutoPlaying(false);
          // Automatically trigger hypothesis generation on finalized report
          await triggerHypothesisSynthesis(processResult.state.report, currentScenarioId, epoch);
        } else if (keepAutoPlaying && isAutoPlayingRef.current && epochRef.current === epoch) {
          // Schedule next simulation turn with natural thinking cadence
          autoPlayTimerRef.current = window.setTimeout(() => {
            void executeSimulationTurn(true);
          }, 1800);
        }
      } catch (err) {
        console.error('[Patient Simulator] Simulation turn error:', err);
        setIsStreaming(false);
        setIsAutoPlaying(false);
      } finally {
        if (epochRef.current === epoch) {
          isBusyRef.current = false;
        }
      }
    },
    [currentScenarioId, isInterviewComplete, triggerHypothesisSynthesis]
  );

  // Handle early conclusion requested by user
  const handleConcludeEarly = async () => {
    if (isBusyRef.current || isInterviewComplete || isStreaming) return;
    const epoch = epochRef.current;

    clearTimer();
    setIsAutoPlaying(false);
    isBusyRef.current = true;
    setIsStreaming(true);

    try {
      const activeState = chatStateRef.current;
      const processResult = await processPatientMessage(activeState, '', true);
      if (epochRef.current !== epoch) return; // session changed mid-turn

      setChatState(processResult.state);
      setIsInterviewComplete(true);
      setIsStreaming(false);

      setReportSnapshot((prev) => ({
        ...prev,
        isFinalized: true,
        lastUpdated: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }));

      // Automatically generate hypotheses
      await triggerHypothesisSynthesis(processResult.state.report, currentScenarioId, epoch);
    } catch (err) {
      console.error('[MedGemma Harness] Wrap-up error:', err);
      setIsStreaming(false);
    } finally {
      if (epochRef.current === epoch) {
        isBusyRef.current = false;
      }
    }
  };

  // Handle user typing or clicking a suggestion chip
  const handleUserSendMessage = async (text: string) => {
    if (!text.trim() || isBusyRef.current || isStreaming || isInterviewComplete) return;
    const epoch = epochRef.current;

    clearTimer();
    setIsAutoPlaying(false);
    isBusyRef.current = true;
    setIsStreaming(true);

    try {
      const activeState = chatStateRef.current;
      const processResult = await processPatientMessage(activeState, text.trim());
      if (epochRef.current !== epoch) return; // session changed mid-turn

      setChatState(processResult.state);
      setIsStreaming(false);

      setReportSnapshot((prev) => ({
        ...prev,
        lastUpdated: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isFinalized: processResult.interviewComplete,
      }));

      if (processResult.interviewComplete) {
        setIsInterviewComplete(true);
        // Automatically trigger hypothesis generation on finalized report
        await triggerHypothesisSynthesis(processResult.state.report, currentScenarioId, epoch);
      }
    } catch (err) {
      console.error('[MedGemma Harness] User message turn error:', err);
      setIsStreaming(false);
    } finally {
      if (epochRef.current === epoch) {
        isBusyRef.current = false;
      }
    }
  };

  // Trigger auto-play
  const handleAutoPlay = () => {
    if (currentScenarioId === 'custom' || isInterviewComplete || isStreaming) return;
    setIsAutoPlaying(true);
    void executeSimulationTurn(true);
  };

  const handleReset = () => {
    clearTimer();
    initScenario(currentScenarioId);
  };

  const handleSelectScenario = (id: ScenarioConditionId | 'custom') => {
    initScenario(id);
  };

  // Map messages to UI format with variant decorations
  const uiMessages: DemoChatMessageType[] = chatState.messages.map((m, idx) => {
    return {
      id: `msg_${idx}_${m.timestamp}`,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
      variant: m.redFlag ? 'red_flag' : 'normal',
      simulated: simulationConfig ? m.role === 'user' : false,
    };
  });

  const userMessageCount = chatState.messages.filter((m) => m.role === 'user').length;
  const canConcludeEarly = !isInterviewComplete && userMessageCount >= 2;

  // Active suggestion chips
  const activeScenario = DEMO_SCENARIOS.find((s) => s.id === currentScenarioId);
  const currentTurnChips =
    currentScenarioId === 'custom'
      ? userMessageCount === 0
        ? CUSTOM_STARTER_CHIPS
        : undefined
      : activeScenario?.turns[Math.min(userMessageCount, activeScenario.turns.length - 1)]?.suggestedChips;

  const liveMode = isLiveMode();

  return (
    <div className="demo-page" data-theme={theme}>
      <div className="demo-notice-banner" role="note">
        {liveMode ? (
          <span>
            <strong>Interactive demo with a live AI model</strong> — not medical advice and not a real
            clinical service. Text you type is sent to our server and processed by Google's Gemini to
            generate responses. Please don't enter real personal or health information. In a real
            emergency, call 999.
          </span>
        ) : (
          <span>
            <strong>Simulation demo</strong> — not medical advice, not connected to a live AI model, and not a real
            clinical service. Everything runs in your browser: nothing you type is sent anywhere. Please don't enter
            real personal or health information. In a real emergency, call 999.
          </span>
        )}
      </div>

      <DemoHeader
        currentScenarioId={currentScenarioId}
        onSelectScenario={handleSelectScenario}
        onReset={handleReset}
        onAutoPlay={handleAutoPlay}
        onOpenTour={() => setIsTourOpen(true)}
        isAutoPlaying={isAutoPlaying}
        isInterviewComplete={isInterviewComplete}
        onBackToLanding={onBackToLanding}
        theme={theme}
        onThemeToggle={onThemeToggle}
        activeTab={activeMobileTab}
        onTabChange={setActiveMobileTab}
      />

      <div className="demo-workspace">
        {/* Left Pane: Interactive Consultation Chat */}
        <section
          className={`demo-pane demo-pane--chat ${
            activeMobileTab === 'chat' ? 'demo-pane--mobile-active' : ''
          }`}
          aria-label="Patient consultation chat"
        >
          <div className="demo-pane__scroll-container">
            <DemoChatArea
              messages={uiMessages}
              isStreaming={isStreaming}
              onSelectScenario={handleSelectScenario}
            />
          </div>

          <div className="demo-pane__input-container">
            <DemoChatInput
              onSendMessage={handleUserSendMessage}
              disabled={isStreaming}
              isInterviewComplete={isInterviewComplete}
              suggestedChips={currentTurnChips}
              canConclude={canConcludeEarly}
              onConcludeInterview={handleConcludeEarly}
            />
          </div>
        </section>

        {/* Right Pane: Live Briefing Inspector & Clinician Gate */}
        <section
          className={`demo-pane demo-pane--report ${
            activeMobileTab === 'report' || activeMobileTab === 'review'
              ? 'demo-pane--mobile-active'
              : ''
          }`}
          aria-label="Clinical briefing and clinician decision gate"
        >
          <DemoReportPanel
            report={reportSnapshot}
            reportMarkdown={chatState.report}
            hypotheses={hypotheses}
            isInterviewComplete={isInterviewComplete}
            isSynthesizingHypotheses={isSynthesizingHypotheses}
            blockedReason={blockedReason}
            onReviewSubmitted={(decision) => setClinicianReview(decision)}
            existingReview={clinicianReview}
            onResetReview={() => setClinicianReview(null)}
            onConcludeEarly={canConcludeEarly ? handleConcludeEarly : undefined}
          />
        </section>
      </div>

      {/* Guided Tour Walkthrough Modal */}
      <DemoTourModal
        isOpen={isTourOpen}
        onClose={() => setIsTourOpen(false)}
      />
    </div>
  );
};
