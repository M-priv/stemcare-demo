import React, { useState, useEffect, useLayoutEffect, useCallback } from 'react';
import {
  Sparkles,
  Layers,
  Sliders,
  Play,
  RotateCcw,
  MessageSquare,
  FileText,
  ShieldCheck,
  X,
  ChevronRight,
  ChevronLeft,
  Check,
} from 'lucide-react';
import { shouldShowTourOnStartup, setTourStartupDismissed } from '../lib/tourStorage';

export interface TourStep {
  id: string;
  badge: string;
  title: string;
  subtitle: string;
  points: string[];
  targetSelector: string;
  placement: 'center' | 'bottom' | 'right' | 'left';
  mobileTab?: 'chat' | 'report' | 'review';
}

export const TOUR_SLIDES: TourStep[] = [
  {
    id: 'welcome',
    badge: '1 of 8 · Welcome',
    title: 'Meet STEMCare',
    subtitle: 'Assistive AI pre-consultation tool for primary care.',
    points: [
      'Takes a structured patient history before the GP appointment.',
      'Drafts an audit-ready clinical note in real time.',
      'You stay in full control. The system never diagnoses on its own.',
    ],
    targetSelector: '',
    placement: 'center',
    mobileTab: 'chat',
  },
  {
    id: 'scenarios',
    badge: '2 of 8 · Benchmark Cases',
    title: '4 Clinical Scenarios',
    subtitle: 'Pre-loaded benchmark cases to test different presentations:',
    points: [
      'Migraine with Aura: neurological red-flag screening.',
      'Influenza: typical seasonal viral trajectory.',
      'Malaria: fever following tropical travel.',
      'Serotonin Syndrome: medication interaction emergency.',
    ],
    targetSelector: '[data-tour="scenario-selector"]',
    placement: 'bottom',
    mobileTab: 'chat',
  },
  {
    id: 'custom_case',
    badge: '3 of 8 · Custom Case',
    title: 'Test Any Scenario',
    subtitle: 'Test your own clinical presentation from scratch.',
    points: [
      'Select "Custom Case" from the dropdown menu.',
      'Enter any patient details (name, age, sex).',
      'Type any symptom narrative or pick a starter prompt to see how the intake adapts.',
    ],
    targetSelector: '[data-tour="scenario-selector"]',
    placement: 'bottom',
    mobileTab: 'chat',
  },
  {
    id: 'autoplay',
    badge: '4 of 8 · Auto-Play',
    title: 'Hands-Free Auto-Play',
    subtitle: 'Watch the consultation unfold without typing.',
    points: [
      'Click Auto-play to have the patient simulator reply automatically.',
      'Watch a complete 5-turn consultation finish in under 60 seconds.',
      'Click Stop anytime to take over and type your own replies.',
    ],
    targetSelector: '[data-tour="autoplay-btn"], [data-tour="action-pills"]',
    placement: 'bottom',
    mobileTab: 'chat',
  },
  {
    id: 'reset',
    badge: '5 of 8 · Reset',
    title: 'Restart Anytime',
    subtitle: 'Start the consultation fresh at Turn 1.',
    points: [
      'Click Reset to clear the chat and briefing back to the start.',
      'Test different patient answers or explore alternative pathways.',
      'Your selected scenario remains loaded.',
    ],
    targetSelector: '[data-tour="reset-btn"], [data-tour="action-pills"]',
    placement: 'bottom',
    mobileTab: 'chat',
  },
  {
    id: 'interview',
    badge: '6 of 8 · Patient Chat',
    title: 'Paced Patient Chat',
    subtitle: 'Structured intake before the doctor sees the patient.',
    points: [
      'Asks 1 short question at a time (under 20 words) for patient clarity.',
      'Gathers onset, severity, modifiers, medications, and past history.',
      'Checks every answer locally against NHS red-flag rules.',
    ],
    targetSelector: '[data-tour="chat-pane"]',
    placement: 'right',
    mobileTab: 'chat',
  },
  {
    id: 'briefing',
    badge: '7 of 8 · Live Briefing',
    title: 'Live Clinical Note',
    subtitle: 'The GP note writes itself as the patient answers.',
    points: [
      'Structured into standard sections: HPI, Past History, Meds, Allergies.',
      'Clickable citations like [1] and [2] highlight the exact source message.',
      'Full provenance: verify any clinical claim with one click.',
    ],
    targetSelector: '[data-tour="report-pane"]',
    placement: 'left',
    mobileTab: 'report',
  },
  {
    id: 'clinician_gate',
    badge: '8 of 8 · Clinician Decision',
    title: 'You Decide & Authorize',
    subtitle: 'The clinician always makes the final call.',
    points: [
      'Suggests a safe triage tier and differential considerations.',
      'You approve, edit, or override the recommendation.',
      'Sign off with a timestamped digital receipt.',
    ],
    targetSelector: '[data-tour="clinician-tabs"], [data-tour="report-pane"]',
    placement: 'left',
    mobileTab: 'report',
  },
];

interface DemoTourModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeMobileTab?: 'chat' | 'report' | 'review';
  onMobileTabChange?: (tab: 'chat' | 'report' | 'review') => void;
}

const CARD_WIDTH = 380;
const CARD_HEIGHT_ESTIMATE = 300;
const EDGE = 16;

const STEP_ICONS: Record<string, React.ReactNode> = {
  welcome: <Sparkles size={16} aria-hidden="true" />,
  scenarios: <Layers size={16} aria-hidden="true" />,
  custom_case: <Sliders size={16} aria-hidden="true" />,
  autoplay: <Play size={16} aria-hidden="true" />,
  reset: <RotateCcw size={16} aria-hidden="true" />,
  interview: <MessageSquare size={16} aria-hidden="true" />,
  briefing: <FileText size={16} aria-hidden="true" />,
  clinician_gate: <ShieldCheck size={16} aria-hidden="true" />,
};

export const DemoTourModal: React.FC<DemoTourModalProps> = ({
  isOpen,
  onClose,
  activeMobileTab,
  onMobileTabChange,
}) => {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [cardPos, setCardPos] = useState<{ left: number; top: number } | null>(null);
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState<boolean>(() => !shouldShowTourOnStartup());

  const slide = TOUR_SLIDES[step] || TOUR_SLIDES[0];

  // Synchronize mobile tab with the current step so the target pane is rendered
  useEffect(() => {
    if (!isOpen) return;
    const targetTab = slide.mobileTab;
    if (targetTab && onMobileTabChange && targetTab !== activeMobileTab) {
      onMobileTabChange(targetTab);
    }
  }, [isOpen, step, slide.mobileTab, onMobileTabChange, activeMobileTab]);

  const measure = useCallback(() => {
    const isMobile = window.innerWidth <= 1024;
    setIsMobileLayout(isMobile);

    if (!slide.targetSelector) {
      setRect(null);
      setCardPos(null);
      return;
    }

    const el = document.querySelector(slide.targetSelector);
    if (!el) {
      setRect(null);
      setCardPos(null);
      return;
    }

    const r = el.getBoundingClientRect();
    setRect(r);

    if (isMobile) {
      // Mobile & tablet: positioned via fixed bottom sheet CSS
      setCardPos(null);
      return;
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cardWidth = Math.min(CARD_WIDTH, vw - EDGE * 2);
    const cardHeight = CARD_HEIGHT_ESTIMATE;

    let left: number;
    let top: number;

    if (slide.placement === 'right') {
      left = r.right + 20;
      if (left + cardWidth > vw - EDGE) {
        left = Math.max(EDGE, r.left - cardWidth - 20);
      }
      top = Math.max(76, Math.min(r.top + 10, vh - cardHeight - EDGE));
    } else if (slide.placement === 'left') {
      left = r.left - cardWidth - 20;
      if (left < EDGE) {
        left = Math.min(vw - cardWidth - EDGE, r.right + 20);
      }
      top = Math.max(76, Math.min(r.top + 10, vh - cardHeight - EDGE));
    } else if (slide.placement === 'bottom') {
      left = Math.max(EDGE, Math.min(r.left + r.width / 2 - cardWidth / 2, vw - cardWidth - EDGE));
      top = r.bottom + 14;
      if (top + cardHeight > vh - EDGE) {
        top = Math.max(76, r.top - cardHeight - 14);
      }
    } else {
      left = Math.max(EDGE, (vw - cardWidth) / 2);
      top = Math.max(76, (vh - cardHeight) / 2);
    }

    setCardPos({ left, top });
  }, [slide]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    measure();
    const t = setTimeout(measure, 160);
    return () => clearTimeout(t);
  }, [isOpen, step, measure]);

  useEffect(() => {
    if (!isOpen) return;
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setStep((prev) => Math.min(prev + 1, TOUR_SLIDES.length - 1));
      if (e.key === 'ArrowLeft') setStep((prev) => Math.max(prev - 1, 0));
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', handleKey);
    };
  }, [isOpen, onClose, measure]);

  const handleToggleDontShow = (checked: boolean) => {
    setDontShowAgain(checked);
    setTourStartupDismissed(checked);
  };

  if (!isOpen) return null;

  const spotlightVisible =
    !isMobileLayout &&
    Boolean(rect && rect.width >= 20 && rect.height >= 20 && slide.targetSelector);

  const cardStyle: React.CSSProperties | undefined =
    !isMobileLayout && cardPos
      ? { left: `${cardPos.left}px`, top: `${cardPos.top}px` }
      : undefined;

  return (
    <div
      className={`demo-walkthrough ${isMobileLayout ? 'demo-walkthrough--mobile' : ''}`}
      onClick={onClose}
      aria-label="STEMCare walkthrough tour"
    >
      {spotlightVisible && rect && (
        <div
          className="demo-walkthrough__spotlight animate-spotlight"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
          }}
        />
      )}

      <div
        className={`demo-walkthrough__card ${isMobileLayout ? 'demo-walkthrough__card--bottom-sheet' : (!slide.targetSelector ? 'demo-walkthrough__card--centered' : '')}`}
        role="dialog"
        aria-modal="true"
        aria-label={`Walkthrough step ${step + 1} of ${TOUR_SLIDES.length}: ${slide.title}`}
        style={cardStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header: Badge, Progress Dots, and Close */}
        <div className="demo-walkthrough__card-header">
          <div className="demo-walkthrough__badge-group">
            <span className="demo-walkthrough__icon-pill">
              {STEP_ICONS[slide.id] || <Sparkles size={16} />}
            </span>
            <span className="demo-walkthrough__badge">{slide.badge}</span>
          </div>

          <button
            type="button"
            className="demo-walkthrough__close"
            onClick={onClose}
            aria-label="Close walkthrough"
          >
            <X size={15} />
            <span className="demo-walkthrough__close-text">Close</span>
          </button>
        </div>

        {/* Step Progress Pill Indicator */}
        <div className="demo-walkthrough__progress-strip" role="tablist" aria-label="Walkthrough steps">
          {TOUR_SLIDES.map((s, idx) => (
            <button
              key={s.id}
              type="button"
              className={`demo-walkthrough__progress-dot ${idx === step ? 'demo-walkthrough__progress-dot--active' : ''} ${idx < step ? 'demo-walkthrough__progress-dot--completed' : ''}`}
              onClick={() => setStep(idx)}
              aria-label={`Jump to step ${idx + 1}: ${s.title}`}
              aria-selected={idx === step}
              role="tab"
            />
          ))}
        </div>

        {/* Body Content */}
        <div className="demo-walkthrough__body">
          <h3 className="demo-walkthrough__title">{slide.title}</h3>
          <p className="demo-walkthrough__subtitle">{slide.subtitle}</p>

          <div className="demo-walkthrough__points">
            {slide.points.map((pt, idx) => (
              <div key={idx} className="demo-walkthrough__point">
                <span className="demo-walkthrough__point-check">
                  <Check size={13} strokeWidth={2.5} />
                </span>
                <span className="demo-walkthrough__point-text">{pt}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer Navigation & Settings */}
        <div className="demo-walkthrough__footer">
          <label className="demo-walkthrough__dont-show">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => handleToggleDontShow(e.target.checked)}
            />
            <span>Don't show on startup</span>
          </label>

          <div className="demo-walkthrough__nav">
            <button
              type="button"
              className="demo-walkthrough__nav-btn demo-walkthrough__nav-btn--ghost"
              onClick={() => setStep((prev) => Math.max(prev - 1, 0))}
              disabled={step === 0}
              aria-label="Previous step"
            >
              <ChevronLeft size={16} />
              <span>Back</span>
            </button>

            {step < TOUR_SLIDES.length - 1 ? (
              <button
                type="button"
                className="demo-walkthrough__nav-btn demo-walkthrough__nav-btn--primary"
                onClick={() => setStep((prev) => Math.min(prev + 1, TOUR_SLIDES.length - 1))}
                aria-label="Next step"
              >
                <span>Next</span>
                <ChevronRight size={16} />
              </button>
            ) : (
              <button
                type="button"
                className="demo-walkthrough__nav-btn demo-walkthrough__nav-btn--primary"
                onClick={onClose}
                aria-label="Finish walkthrough and explore demo"
              >
                <span>Done</span>
                <Check size={16} strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
