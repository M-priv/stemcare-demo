import React, { useState, useEffect, useLayoutEffect, useCallback } from 'react';

interface DemoTourModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface TourStep {
  badge: string;
  title: string;
  subtitle: string;
  points: string[];
  clinicianNote: string;
  /** Element the step spotlights; falls back to a centered card if hidden. */
  targetSelector: string;
  /** Where to dock the step card relative to the target. */
  placement: 'right' | 'left' | 'bottom';
}

const SLIDES: TourStep[] = [
  {
    badge: '1 of 3 · Interview',
    title: 'Structured patient interview',
    subtitle: 'The assistant asks one focused question per turn before your GP appointment.',
    points: [
      'One short question per turn, at most 20 words.',
      'Covers onset, severity, modifiers, and pertinent negatives.',
      'Screens every answer against NHS red-flag rules before anything else happens.',
    ],
    clinicianNote: 'Short questions keep typing effort low for patients.',
    targetSelector: '.demo-pane--chat',
    placement: 'right',
  },
  {
    badge: '2 of 3 · Briefing',
    title: 'Clinical briefing updates live',
    subtitle: 'A report writer compiles the answers into a structured note as the interview runs.',
    points: [
      'The briefing keeps standard HPI and medical history sections.',
      'Every statement in it cites the chat line it came from.',
      'The red-flag detector runs locally on every turn.',
    ],
    clinicianNote: 'The note exists before the consultation starts, so review time is spent on decisions.',
    targetSelector: '.demo-pane--report',
    placement: 'left',
  },
  {
    badge: '3 of 3 · Clinician decision',
    title: 'The clinician decides',
    subtitle: 'When the chat concludes, the handoff arrives and the clinician authorizes the next step.',
    points: [
      'Review the suggested triage, approve it, or edit to another disposition.',
      'Authorize: same-day GP, routine clinic, referral, or self-care.',
      'The sign-off is recorded with a receipt. The system never diagnoses or prescribes.',
    ],
    clinicianNote: 'The system never executes a care decision on its own.',
    targetSelector: '.demo-report-panel__tabs',
    placement: 'bottom',
  },
];

const CARD_WIDTH = 340;
const CARD_HEIGHT_ESTIMATE = 330;
const EDGE = 16;

export const DemoTourModal: React.FC<DemoTourModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [cardPos, setCardPos] = useState<{ left: number; top: number } | null>(null);

  const slide = SLIDES[step];

  const measure = useCallback(() => {
    const el = document.querySelector(slide.targetSelector);
    if (!el) {
      setRect(null);
      setCardPos(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect(r);

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left: number;
    let top: number;
    if (slide.placement === 'right') {
      left = r.right + 20;
      if (left + CARD_WIDTH > vw - EDGE) left = Math.max(EDGE, r.left - CARD_WIDTH - 20);
      top = Math.max(80, Math.min(r.top, vh - CARD_HEIGHT_ESTIMATE - EDGE));
    } else if (slide.placement === 'left') {
      left = r.left - CARD_WIDTH - 20;
      if (left < EDGE) left = Math.min(vw - CARD_WIDTH - EDGE, r.right + 20);
      top = Math.max(80, Math.min(r.top, vh - CARD_HEIGHT_ESTIMATE - EDGE));
    } else {
      left = Math.max(EDGE, Math.min(r.left - 40, vw - CARD_WIDTH - EDGE));
      top = r.bottom + 14;
      if (top + CARD_HEIGHT_ESTIMATE > vh - EDGE) top = Math.max(EDGE, r.top - CARD_HEIGHT_ESTIMATE - 14);
    }
    setCardPos({ left, top });
  }, [slide]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    measure();
    // Re-measure once fonts/layout settle after open.
    const t = setTimeout(measure, 350);
    return () => clearTimeout(t);
  }, [isOpen, step, measure]);

  useEffect(() => {
    if (!isOpen) return;
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setStep((prev) => Math.min(prev + 1, SLIDES.length - 1));
      if (e.key === 'ArrowLeft') setStep((prev) => Math.max(prev - 1, 0));
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', handleKey);
    };
  }, [isOpen, onClose, measure]);

  if (!isOpen) return null;

  const spotlightVisible = rect && rect.width >= 60 && rect.height >= 40;

  return (
    <div className="demo-walkthrough" onClick={onClose}>
      {spotlightVisible && (
        <div
          className="demo-walkthrough__spotlight"
          style={{
            top: rect.top - 8,
            left: rect.left - 8,
            width: rect.width + 16,
            height: rect.height + 16,
          }}
        />
      )}

      <div
        className="demo-walkthrough__card"
        role="dialog"
        aria-modal="true"
        aria-label={`Walkthrough step ${step + 1} of ${SLIDES.length}`}
        style={cardPos ? { left: cardPos.left, top: cardPos.top } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="demo-walkthrough__card-header">
          <span className="demo-walkthrough__badge">{slide.badge}</span>
          <button
            type="button"
            className="demo-walkthrough__close"
            onClick={onClose}
            aria-label="Close walkthrough"
          >
            Close
          </button>
        </div>

        <h3 className="demo-walkthrough__title">{slide.title}</h3>
        <p className="demo-walkthrough__subtitle">{slide.subtitle}</p>

        <div className="demo-walkthrough__points">
          {slide.points.map((pt, idx) => (
            <div key={idx} className="demo-walkthrough__point">{pt}</div>
          ))}
        </div>

        <div className="demo-walkthrough__note">{slide.clinicianNote}</div>

        <div className="demo-walkthrough__footer">
          <span className="demo-walkthrough__count">
            {step + 1} of {SLIDES.length}
          </span>
          <div className="demo-walkthrough__nav">
            <button
              type="button"
              className="demo-walkthrough__nav-btn"
              onClick={() => setStep((prev) => Math.max(prev - 1, 0))}
              disabled={step === 0}
            >
              <span>Back</span>
            </button>
            {step < SLIDES.length - 1 ? (
              <button
                type="button"
                className="demo-walkthrough__nav-btn demo-walkthrough__nav-btn--primary"
                onClick={() => setStep((prev) => Math.min(prev + 1, SLIDES.length - 1))}
              >
                <span>Next</span>
              </button>
            ) : (
              <button
                type="button"
                className="demo-walkthrough__nav-btn demo-walkthrough__nav-btn--primary"
                onClick={onClose}
              >
                <span>Done</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
