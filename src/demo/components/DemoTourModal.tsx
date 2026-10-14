import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  ArrowRight,
  ArrowLeft,
  MessageSquareHeart,
  FileText,
  Activity,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';

interface DemoTourModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectScenario?: (id: any) => void;
}

interface TourSlide {
  badge: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  iconColor: string;
  points: string[];
  clinicianHighlight: string;
}

export const DemoTourModal: React.FC<DemoTourModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [currentStep, setCurrentStep] = useState(0);

  const slides: TourSlide[] = [
    {
      badge: 'Step 1 of 4 · Conversational Intake',
      title: 'Empathetic, NHS-Grounded Patient Chat',
      subtitle: 'Structured pre-consultation interview conducted by MedGemma prior to the GP appointment.',
      icon: <MessageSquareHeart size={28} />,
      iconColor: 'text-emerald-500',
      points: [
        'Interviewer persona asks exactly ONE focused question per turn (≤20 words).',
        'Systematically unpacks onset, severity, timing, and pertinent negatives.',
        'Never diagnoses the patient directly—gathers evidence for the clinician.',
      ],
      clinicianHighlight: 'Short, structured questions are designed to reduce typing burden for patients.',
    },
    {
      badge: 'Step 2 of 4 · Live Clinical Briefing',
      title: 'Simultaneous Clinical Note Synthesis',
      subtitle: 'Real-time dual-persona engine compiling structured documentation as the conversation flows.',
      icon: <FileText size={28} />,
      iconColor: 'text-teal-400',
      points: [
        'A secondary Report Writer persona continuously updates the clinical briefing.',
        'Structures HPI, systemic review, medications, allergies, and safety screening.',
        'Deterministic NHS/NICE red-flag detector guards every turn in real time.',
      ],
      clinicianHighlight: 'Aimed at reducing pre-consultation documentation time — a headline pilot metric.',
    },
    {
      badge: 'Step 3 of 4 · Differential Hypothesis Engine',
      title: 'Evidence-Backed Candidate Diagnoses',
      subtitle: 'Illustrative candidate hypotheses compiled at interview conclusion, for clinician review.',
      icon: <Activity size={28} />,
      iconColor: 'text-blue-500',
      points: [
        'Proposes up to three illustrative differential hypotheses with guideline references.',
        'Quotes specific evidence references directly from the patient’s statements.',
        'Links guideline recommendations (NICE CG150, NG120, NG59) and actions.',
      ],
      clinicianHighlight: 'Hard safety gate halts generation and escalates immediately if emergency red flags appear.',
    },
    {
      badge: 'Step 4 of 4 · Governance & Authority',
      title: 'Separation of AI Synthesis & Medical Authority',
      subtitle: 'AI proposes. Policy gates. Licensed clinicians make final care decisions.',
      icon: <ShieldCheck size={28} />,
      iconColor: 'text-emerald-400',
      points: [
        'Clinician reviews candidate differentials with full freedom to override or modify.',
        'Authorizes the acute pathway: Same-Day GP, Routine Clinic, Referral, or Self-Care.',
        'Records the decision in an audit trail; the production system adds cryptographic receipts.',
      ],
      clinicianHighlight: 'Zero autonomous execution—medical authority remains exclusively with the doctor.',
    },
  ];

  const handleNext = () => {
    if (currentStep < slides.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
    },
    [isOpen, currentStep]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!isOpen) return null;

  const slide = slides[currentStep];

  return (
    <div className="demo-tour-backdrop animate-fade-in" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="demo-tour-card animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header & Close button */}
        <div className="demo-tour-card__header">
          <div className="demo-tour-card__step-pills">
            {slides.map((_, idx) => (
              <button
                key={idx}
                type="button"
                className={`demo-tour-card__step-pill ${
                  idx === currentStep
                    ? 'demo-tour-card__step-pill--active'
                    : idx < currentStep
                    ? 'demo-tour-card__step-pill--completed'
                    : ''
                }`}
                onClick={() => setCurrentStep(idx)}
                aria-label={`Go to step ${idx + 1}`}
              />
            ))}
          </div>

          <button
            type="button"
            className="demo-tour-card__close-btn"
            onClick={onClose}
            aria-label="Close walkthrough"
          >
            <X size={18} />
          </button>
        </div>

        {/* Slide Body */}
        <div className="demo-tour-card__body">
          <div className="demo-tour-card__icon-wrapper">
            <div className={`demo-tour-card__icon ${slide.iconColor}`}>
              {slide.icon}
            </div>
          </div>

          <div className="demo-tour-card__meta">
            <span className="demo-tour-card__badge">{slide.badge}</span>
            <h3 className="demo-tour-card__title">{slide.title}</h3>
            <p className="demo-tour-card__subtitle">{slide.subtitle}</p>
          </div>

          <div className="demo-tour-card__points">
            {slide.points.map((pt, pIdx) => (
              <div key={pIdx} className="demo-tour-card__point-row">
                <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                <span className="text-sm text-foreground">{pt}</span>
              </div>
            ))}
          </div>

          <div className="demo-tour-card__callout">
            <Sparkles size={14} className="text-emerald-400 shrink-0 mt-0.5" />
            <span className="text-xs text-muted">{slide.clinicianHighlight}</span>
          </div>
        </div>

        {/* Footer controls */}
        <div className="demo-tour-card__footer">
          <button
            type="button"
            className="demo-tour-card__nav-btn demo-tour-card__nav-btn--ghost"
            onClick={handlePrev}
            disabled={currentStep === 0}
          >
            <ArrowLeft size={15} />
            <span>Previous</span>
          </button>

          <button
            type="button"
            className="demo-tour-card__nav-btn demo-tour-card__nav-btn--primary"
            onClick={handleNext}
          >
            <span>{currentStep === slides.length - 1 ? 'Start Exploring Demo' : 'Next Step'}</span>
            <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
};
