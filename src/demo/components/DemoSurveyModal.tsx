import React, { useState, useEffect } from 'react';
import { X, Check, Copy, Sparkles, Star, MessageSquareQuote } from 'lucide-react';
import type { DemoSurveyResponse, EvaluatorRole, PillarScore } from '../types';
import {
  EVALUATOR_ROLES,
  FEELING_OPTIONS,
  RATING_DESCRIPTORS,
  loadSurveyResponse,
  formatSurveySummary,
} from '../lib/surveyStorage';
import { submitSurveyResponse } from '../lib/surveyService';

interface DemoSurveyModalProps {
  isOpen: boolean;
  onClose: () => void;
  scenarioId?: string;
  onSubmitted?: (response: DemoSurveyResponse) => void;
}

export const DemoSurveyModal: React.FC<DemoSurveyModalProps> = ({
  isOpen,
  onClose,
  scenarioId,
  onSubmitted,
}) => {
  const [overallRating, setOverallRating] = useState<number>(9);
  const [evaluatorRole, setEvaluatorRole] = useState<EvaluatorRole>('clinician_gp');
  const [evaluatorRoleOther, setEvaluatorRoleOther] = useState('');
  const [feelings, setFeelings] = useState<string[]>([
    'safe_grounded',
    'transparent_citations',
    'apple_design',
  ]);
  const [pillarRatings, setPillarRatings] = useState<{
    patientInterview?: PillarScore;
    clinicalBriefing?: PillarScore;
    clinicianGate?: PillarScore;
  }>({
    patientInterview: 'excellent',
    clinicalBriefing: 'excellent',
    clinicianGate: 'excellent',
  });
  const [positiveFeedback, setPositiveFeedback] = useState('');
  const [constructiveFeedback, setConstructiveFeedback] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submittedData, setSubmittedData] = useState<DemoSurveyResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load saved response on mount / open
  useEffect(() => {
    if (!isOpen) return;
    const existing = loadSurveyResponse();
    if (existing) {
      setOverallRating(existing.overallRating);
      setEvaluatorRole(existing.evaluatorRole);
      if (existing.evaluatorRoleOther) setEvaluatorRoleOther(existing.evaluatorRoleOther);
      if (existing.feelings) setFeelings(existing.feelings);
      if (existing.pillarRatings) setPillarRatings(existing.pillarRatings);
      if (existing.positiveFeedback) setPositiveFeedback(existing.positiveFeedback);
      if (existing.constructiveFeedback) setConstructiveFeedback(existing.constructiveFeedback);
      if (existing.contactName) setContactName(existing.contactName);
      if (existing.contactEmail) setContactEmail(existing.contactEmail);
      setSubmittedData(existing);
      // If already submitted in the past, show the confirmation view initially
      setIsSubmitted(true);
    } else {
      setIsSubmitted(false);
    }
  }, [isOpen]);

  // Handle ESC key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const toggleFeeling = (id: string) => {
    setFeelings((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handlePillarChange = (pillar: 'patientInterview' | 'clinicalBriefing' | 'clinicianGate', score: PillarScore) => {
    setPillarRatings((prev) => ({
      ...prev,
      [pillar]: prev[pillar] === score ? undefined : score,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const payload: DemoSurveyResponse = {
      overallRating,
      evaluatorRole,
      evaluatorRoleOther: evaluatorRole === 'other' ? evaluatorRoleOther.trim() : undefined,
      feelings,
      pillarRatings,
      positiveFeedback: positiveFeedback.trim(),
      constructiveFeedback: constructiveFeedback.trim(),
      contactName: contactName.trim() || undefined,
      contactEmail: contactEmail.trim() || undefined,
      submittedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      scenarioId,
    };

    setIsSubmitting(true);
    try {
      await submitSurveyResponse(payload);
    } finally {
      setSubmittedData(payload);
      setIsSubmitted(true);
      setIsSubmitting(false);
      onSubmitted?.(payload);
    }
  };

  const handleCopySummary = () => {
    if (!submittedData) return;
    const text = formatSurveySummary(submittedData);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="demo-survey-backdrop" onClick={onClose}>
      <div
        className="demo-survey-modal animate-scale-in"
        role="dialog"
        aria-modal="true"
        aria-label="Demo Experience Survey"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="demo-survey-modal__header">
          <div className="demo-survey-modal__header-left">
            <span className="demo-survey-modal__badge">
              <Sparkles size={12} className="inline mr-1 text-warm" />
              Demo Feedback
            </span>
            <h2 className="demo-survey-modal__title">How was your experience?</h2>
            <p className="demo-survey-modal__subtitle">
              Your evaluation calibrates clinical safety, dialogue empathy, and decision clarity.
            </p>
          </div>
          <button
            type="button"
            className="demo-survey-modal__close-btn"
            onClick={onClose}
            aria-label="Close survey"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="demo-survey-modal__body">
          {isSubmitted && submittedData ? (
            <div className="demo-survey-success animate-fade-in">
              <div className="demo-survey-success__icon-wrapper">
                <Check size={32} className="demo-survey-success__check" />
              </div>

              <h3 className="demo-survey-success__title">Thank you for your feedback!</h3>
              <p className="demo-survey-success__desc">
                Your evaluation has been recorded and automatically saved. We deeply appreciate your insights on the MedGemma pre-consultation workflow.
              </p>

              <div className="demo-survey-success__cloud-pill">
                <Check size={13} className="inline mr-1 text-mint" />
                <span>Response synced to evaluation spreadsheet</span>
              </div>

              <div className="demo-survey-success__card">
                <div className="demo-survey-success__rating-row">
                  <span className="demo-survey-success__rating-number">
                    {submittedData.overallRating}
                    <span className="demo-survey-success__rating-denom">/10</span>
                  </span>
                  <div className="demo-survey-success__rating-meta">
                    <span className="demo-survey-success__rating-label">
                      {RATING_DESCRIPTORS[submittedData.overallRating]}
                    </span>
                    <span className="demo-survey-success__rating-role">
                      {EVALUATOR_ROLES.find((r) => r.id === submittedData.evaluatorRole)?.label}
                    </span>
                  </div>
                </div>

                {submittedData.feelings.length > 0 && (
                  <div className="demo-survey-success__tags">
                    {submittedData.feelings.map((fid) => {
                      const opt = FEELING_OPTIONS.find((o) => o.id === fid);
                      return opt ? (
                        <span key={fid} className="demo-survey-success__tag">
                          {opt.icon} {opt.label}
                        </span>
                      ) : null;
                    })}
                  </div>
                )}

                {submittedData.positiveFeedback && (
                  <div className="demo-survey-success__quote-block">
                    <MessageSquareQuote size={16} className="text-mint shrink-0" />
                    <p className="demo-survey-success__quote-text">
                      "{submittedData.positiveFeedback}"
                    </p>
                  </div>
                )}
              </div>

              <div className="demo-survey-success__actions">
                <button
                  type="button"
                  className="demo-pill-btn demo-pill-btn--primary"
                  onClick={handleCopySummary}
                >
                  <Copy size={14} className="mr-1.5 inline" />
                  <span>{copied ? 'Summary Copied!' : 'Copy Feedback Summary'}</span>
                </button>
                <button
                  type="button"
                  className="demo-pill-btn demo-pill-btn--ghost"
                  onClick={() => setIsSubmitted(false)}
                >
                  <span>Edit Response</span>
                </button>
                <button
                  type="button"
                  className="demo-pill-btn demo-pill-btn--ghost"
                  onClick={onClose}
                >
                  <span>Done</span>
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="demo-survey-form">
              {/* Question 1: Rating out of 10 */}
              <div className="demo-survey-group">
                <div className="demo-survey-group__header">
                  <label className="demo-survey-group__label">
                    1. Overall experience rating
                  </label>
                  <span className="demo-survey-rating-badge">
                    <strong>{overallRating}/10</strong> · {RATING_DESCRIPTORS[overallRating]}
                  </span>
                </div>

                <div
                  className="demo-survey-rating-scale"
                  role="radiogroup"
                  aria-label="Rating out of 10"
                >
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((val) => {
                    const isSelected = overallRating === val;
                    return (
                      <button
                        key={val}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        className={`demo-survey-rating-btn ${
                          isSelected ? 'demo-survey-rating-btn--active' : ''
                        }`}
                        onClick={() => setOverallRating(val)}
                      >
                        <span className="demo-survey-rating-btn__val">{val}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="demo-survey-rating-scale__captions">
                  <span>1: Needs rethink</span>
                  <span>5: Promising</span>
                  <span>10: Exceptional</span>
                </div>
              </div>

              {/* Question 2: Perspective / Role */}
              <div className="demo-survey-group">
                <label className="demo-survey-group__label">
                  2. What perspective best describes you?
                </label>
                <div className="demo-survey-role-grid">
                  {EVALUATOR_ROLES.map((role) => {
                    const isSelected = evaluatorRole === role.id;
                    return (
                      <button
                        key={role.id}
                        type="button"
                        className={`demo-survey-role-card ${
                          isSelected ? 'demo-survey-role-card--active' : ''
                        }`}
                        onClick={() => setEvaluatorRole(role.id)}
                      >
                        <span className="demo-survey-role-card__title">{role.label}</span>
                        <span className="demo-survey-role-card__desc">{role.desc}</span>
                      </button>
                    );
                  })}
                </div>
                {evaluatorRole === 'other' && (
                  <input
                    type="text"
                    className="demo-survey-input mt-2"
                    placeholder="Please specify your role or organization"
                    value={evaluatorRoleOther}
                    onChange={(e) => setEvaluatorRoleOther(e.target.value)}
                  />
                )}
              </div>

              {/* Question 3: Sentiment & Feelings */}
              <div className="demo-survey-group">
                <label className="demo-survey-group__label">
                  3. Which words capture your feelings around this demo?
                  <span className="demo-survey-group__hint">Select all that resonate</span>
                </label>
                <div className="demo-survey-feelings-wrap">
                  {FEELING_OPTIONS.map((opt) => {
                    const isSelected = feelings.includes(opt.id);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        className={`demo-survey-chip ${
                          isSelected ? 'demo-survey-chip--active' : ''
                        }`}
                        onClick={() => toggleFeeling(opt.id)}
                      >
                        <span className="demo-survey-chip__icon">{opt.icon}</span>
                        <span className="demo-survey-chip__label">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Question 4: Pillar Assessment */}
              <div className="demo-survey-group">
                <label className="demo-survey-group__label">
                  4. Core workflow evaluation
                </label>
                <div className="demo-survey-pillars">
                  <div className="demo-survey-pillar-row">
                    <span className="demo-survey-pillar-row__name">
                      Patient intake interview & pacing
                    </span>
                    <div className="demo-survey-pillar-row__options">
                      {(['excellent', 'adequate', 'needs_work'] as PillarScore[]).map((score) => (
                        <button
                          key={score}
                          type="button"
                          className={`demo-survey-pillar-btn ${
                            pillarRatings.patientInterview === score
                              ? 'demo-survey-pillar-btn--active'
                              : ''
                          }`}
                          onClick={() => handlePillarChange('patientInterview', score)}
                        >
                          {score === 'excellent' ? 'Excellent' : score === 'adequate' ? 'Good' : 'Needs work'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="demo-survey-pillar-row">
                    <span className="demo-survey-pillar-row__name">
                      Live briefing note & citations
                    </span>
                    <div className="demo-survey-pillar-row__options">
                      {(['excellent', 'adequate', 'needs_work'] as PillarScore[]).map((score) => (
                        <button
                          key={score}
                          type="button"
                          className={`demo-survey-pillar-btn ${
                            pillarRatings.clinicalBriefing === score
                              ? 'demo-survey-pillar-btn--active'
                              : ''
                          }`}
                          onClick={() => handlePillarChange('clinicalBriefing', score)}
                        >
                          {score === 'excellent' ? 'Excellent' : score === 'adequate' ? 'Good' : 'Needs work'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="demo-survey-pillar-row">
                    <span className="demo-survey-pillar-row__name">
                      Clinician decision gate & sign-off
                    </span>
                    <div className="demo-survey-pillar-row__options">
                      {(['excellent', 'adequate', 'needs_work'] as PillarScore[]).map((score) => (
                        <button
                          key={score}
                          type="button"
                          className={`demo-survey-pillar-btn ${
                            pillarRatings.clinicianGate === score
                              ? 'demo-survey-pillar-btn--active'
                              : ''
                          }`}
                          onClick={() => handlePillarChange('clinicianGate', score)}
                        >
                          {score === 'excellent' ? 'Excellent' : score === 'adequate' ? 'Good' : 'Needs work'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Question 5: Qualitative Narrative */}
              <div className="demo-survey-group">
                <label className="demo-survey-group__label" htmlFor="positive_feedback">
                  5. What stood out most positively?
                </label>
                <textarea
                  id="positive_feedback"
                  rows={2}
                  className="demo-survey-textarea"
                  placeholder="e.g. The live clinical note with exact chat citations gave high confidence..."
                  value={positiveFeedback}
                  onChange={(e) => setPositiveFeedback(e.target.value)}
                />
              </div>

              <div className="demo-survey-group">
                <label className="demo-survey-group__label" htmlFor="constructive_feedback">
                  6. What felt confusing, missing, or concerning?
                </label>
                <textarea
                  id="constructive_feedback"
                  rows={2}
                  className="demo-survey-textarea"
                  placeholder="e.g. Would like more granular red-flag rationale, or custom referral letter drafting..."
                  value={constructiveFeedback}
                  onChange={(e) => setConstructiveFeedback(e.target.value)}
                />
              </div>

              {/* Optional Contact info */}
              <div className="demo-survey-group demo-survey-group--contact">
                <div className="demo-survey-group__header">
                  <label className="demo-survey-group__label">
                    Stay connected (Optional)
                  </label>
                  <span className="demo-survey-group__hint">
                    For clinical pilot updates
                  </span>
                </div>
                <div className="demo-survey-contact-row">
                  <input
                    type="text"
                    className="demo-survey-input"
                    placeholder="Your name (optional)"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                  />
                  <input
                    type="email"
                    className="demo-survey-input"
                    placeholder="Your email (optional)"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                  />
                </div>
              </div>

              {/* Form Actions */}
              <div className="demo-survey-modal__footer">
                <button
                  type="button"
                  className="demo-pill-btn demo-pill-btn--ghost"
                  onClick={onClose}
                >
                  <span>Skip for now</span>
                </button>
                <button
                  type="submit"
                  className="demo-pill-btn demo-pill-btn--primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <span className="demo-survey-spinner" aria-hidden="true" />
                      <span>Saving evaluation...</span>
                    </>
                  ) : (
                    <span>Submit Demo Evaluation</span>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
