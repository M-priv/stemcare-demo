import React, { useState, useEffect, useCallback } from 'react';

interface DemoTourModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface TourSlide {
  badge: string;
  title: string;
  subtitle: string;
  points: string[];
  clinicianNote: string;
}

const SLIDES: TourSlide[] = [
  {
    badge: '1 of 4 · Interview',
    title: 'Structured patient interview',
    subtitle: 'The assistant asks one focused question per turn before your GP appointment.',
    points: [
      'One short question per turn, at most 20 words.',
      'Covers onset, severity, modifiers, and pertinent negatives.',
      'Screens every answer against NHS red-flag rules before anything else happens.',
    ],
    clinicianNote: 'Short questions keep typing effort low for patients.',
  },
  {
    badge: '2 of 4 · Briefing',
    title: 'Clinical briefing updates live',
    subtitle: 'A report writer compiles the answers into a structured note as the interview runs.',
    points: [
      'The briefing keeps standard HPI and medical history sections.',
      'Every statement in it cites the chat line it came from.',
      'The red-flag detector runs locally on every turn.',
    ],
    clinicianNote: 'The note exists before the consultation starts, so review time is spent on decisions.',
  },
  {
    badge: '3 of 4 · Differentials',
    title: 'Candidate hypotheses for review',
    subtitle: 'At the end of the interview, up to three candidate hypotheses are compiled.',
    points: [
      'Each hypothesis is grounded in quoted findings from the report.',
      'Ranking buckets are illustrative, not calibrated probabilities.',
      'Generation is blocked entirely when a red flag has been detected.',
    ],
    clinicianNote: 'The safety gate escalates immediately instead of generating candidates.',
  },
  {
    badge: '4 of 4 · Clinician decision',
    title: 'The clinician decides',
    subtitle: 'The assistant prepares; the clinician authorizes.',
    points: [
      'Review each hypothesis and override or modify with a recorded reason.',
      'Authorize a disposition: same-day GP, routine clinic, referral, or self-care.',
      'The sign-off is recorded with a receipt. The system never diagnoses or prescribes.',
    ],
    clinicianNote: 'The system never executes a care decision on its own.',
  },
];

export const DemoTourModal: React.FC<DemoTourModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = useCallback(() => {
    setCurrentStep((prev) => Math.min(prev + 1, SLIDES.length - 1));
  }, []);

  const handlePrev = useCallback(() => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose, handleNext, handlePrev]);

  if (!isOpen) return null;

  const slide = SLIDES[currentStep];

  return (
    <div className="demo-tour-overlay" onClick={onClose}>
      <div className="demo-tour-card" onClick={(e) => e.stopPropagation()}>
        <div className="demo-tour-card__header">
          <div className="demo-tour-card__step-pills">
            {SLIDES.map((_, idx) => (
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
            Close
          </button>
        </div>

        <div className="demo-tour-card__body">
          <div className="demo-tour-card__meta">
            <span className="demo-tour-card__badge">{slide.badge}</span>
            <h3 className="demo-tour-card__title">{slide.title}</h3>
            <p className="demo-tour-card__subtitle">{slide.subtitle}</p>
          </div>

          <div className="demo-tour-card__points">
            {slide.points.map((pt, pIdx) => (
              <div key={pIdx} className="demo-tour-card__point-row">
                <span>{pt}</span>
              </div>
            ))}
          </div>

          <div className="demo-tour-card__callout">
            <span>{slide.clinicianNote}</span>
          </div>
        </div>

        <div className="demo-tour-card__footer">
          <button
            type="button"
            className="demo-tour-card__nav-btn demo-tour-card__nav-btn--ghost"
            onClick={handlePrev}
            disabled={currentStep === 0}
          >
            <span>Previous</span>
          </button>

          <button
            type="button"
            className="demo-tour-card__nav-btn demo-tour-card__nav-btn--primary"
            onClick={handleNext}
          >
            <span>{currentStep === SLIDES.length - 1 ? 'Start the demo' : 'Next'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
