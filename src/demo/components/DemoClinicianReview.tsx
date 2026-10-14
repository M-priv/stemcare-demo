import React, { useState } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  FileCheck,
  ArrowRight,
  ShieldCheck,
  Stethoscope,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';
import type { DifferentialHypothesis, ClinicianReviewDecision } from '../types';

interface DemoClinicianReviewProps {
  hypotheses: DifferentialHypothesis[];
  isInterviewComplete: boolean;
  onReviewSubmitted: (decision: ClinicianReviewDecision) => void;
  existingReview: ClinicianReviewDecision | null;
  onResetReview: () => void;
}

export const DemoClinicianReview: React.FC<DemoClinicianReviewProps> = ({
  hypotheses,
  isInterviewComplete,
  onReviewSubmitted,
  existingReview,
  onResetReview,
}) => {
  const [selectedHypothesisId, setSelectedHypothesisId] = useState<string>(
    hypotheses[0]?.id || (hypotheses.length === 0 ? 'emergency_red_flag' : '')
  );
  const [actionPathway, setActionPathway] = useState<
    ClinicianReviewDecision['actionPathway']
  >(hypotheses.length === 0 ? 'emergency_transfer' : 'same_day_gp');
  const [clinicianNotes, setClinicianNotes] = useState('');
  const [overrideReason, setOverrideReason] = useState('');

  // Keep top hypothesis selected by default if hypotheses change
  React.useEffect(() => {
    if (hypotheses.length > 0 && (!selectedHypothesisId || selectedHypothesisId === 'emergency_red_flag')) {
      setSelectedHypothesisId(hypotheses[0].id);
      setActionPathway('same_day_gp');
    } else if (hypotheses.length === 0) {
      setSelectedHypothesisId('emergency_red_flag');
      setActionPathway('emergency_transfer');
    }
  }, [hypotheses, selectedHypothesisId]);

  const topHypothesis = hypotheses[0];
  const isOverridingTop = Boolean(
    selectedHypothesisId &&
    topHypothesis &&
    selectedHypothesisId !== topHypothesis.id
  );

  const handleSign = () => {
    const decision: ClinicianReviewDecision = {
      decision: isOverridingTop ? 'modify' : 'approve',
      selectedHypothesisId,
      actionPathway,
      overrideReason: isOverridingTop ? overrideReason : undefined,
      clinicianNotes: clinicianNotes.trim() || undefined,
      signedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      clinicianName: 'Dr. Sarah Jenkins (Simulated Persona)',
      clinicianRole: 'Simulated Attending GP — demo walkthrough only',
    };
    onReviewSubmitted(decision);
  };

  if (existingReview) {
    const chosenHypothesis = hypotheses.find((h) => h.id === existingReview.selectedHypothesisId);

    return (
      <div className="demo-review-signed animate-fade-in">
        <div className="demo-review-signed__card">
          <div className="demo-review-signed__header">
            <div className="demo-review-signed__seal">
              <ShieldCheck size={28} className="text-emerald-500" />
            </div>
            <div>
              <h3 className="demo-review-signed__title">Clinical Disposition Authorized</h3>
              <p className="demo-review-signed__meta">
                Signed by {existingReview.clinicianName} · {existingReview.signedAt}
              </p>
            </div>
          </div>

          <div className="demo-review-signed__body">
            <div className="demo-review-signed__row">
              <span className="demo-review-signed__label">Accepted Diagnosis:</span>
              <span className="demo-review-signed__val font-semibold">
                {chosenHypothesis?.condition || (existingReview.selectedHypothesisId === 'emergency_red_flag' ? 'Emergency Clinical Escalation' : 'Clinical assessment confirmed')}
              </span>
            </div>

            <div className="demo-review-signed__row">
              <span className="demo-review-signed__label">Authorized Pathway:</span>
              <span className="demo-review-signed__badge">
                {existingReview.actionPathway.replace(/_/g, ' ').toUpperCase()}
              </span>
            </div>

            {existingReview.overrideReason && (
              <div className="demo-review-signed__row">
                <span className="demo-review-signed__label">Clinician Override Rationale:</span>
                <span className="demo-review-signed__val">{existingReview.overrideReason}</span>
              </div>
            )}

            {existingReview.clinicianNotes && (
              <div className="demo-review-signed__row">
                <span className="demo-review-signed__label">Clinical Instructions:</span>
                <span className="demo-review-signed__val">{existingReview.clinicianNotes}</span>
              </div>
            )}

            <div className="demo-review-signed__receipt">
              <span className="demo-review-signed__receipt-hash">
                Demo review record — the production system records a clinician decision with a cryptographic audit receipt.
              </span>
            </div>
          </div>

          <button
            type="button"
            className="demo-review-signed__edit-btn"
            onClick={onResetReview}
          >
            <RotateCcw size={14} />
            <span>Modify Disposition</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="demo-clinician-review">
      <div className="demo-clinician-review__header">
        <div className="demo-clinician-review__title-row">
          <Stethoscope size={18} className="text-emerald-500" />
          <h3 className="demo-clinician-review__title">Clinician Decision Support</h3>
          {!isInterviewComplete && (
            <span className="demo-clinician-review__prelim-badge">Preliminary Intake</span>
          )}
        </div>
        <p className="demo-clinician-review__subtitle">
          STEMCare separates AI synthesis from medical authority. Review the differential hypotheses proposed by MedGemma, adjust if necessary, and authorize the care pathway.
        </p>
      </div>

      {/* Differential Hypotheses List */}
      {hypotheses.length === 0 ? (
        <div className="demo-diff-empty-card my-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={18} className="text-rose-500" />
            <span className="font-semibold text-sm text-foreground">
              Emergency Safety Escalation Pathway
            </span>
          </div>
          <p className="text-xs text-muted mb-3">
            Hypothesis generation was blocked due to emergency red flags. Authorize emergency transfer (999 dispatch / A&E) or override with clinical assessment.
          </p>
          <div
            className={`demo-diff-card demo-diff-card--selected demo-diff-card--danger`}
            onClick={() => setSelectedHypothesisId('emergency_red_flag')}
          >
            <div className="demo-diff-card__top">
              <div className="demo-diff-card__radio-row">
                <input
                  type="radio"
                  name="hypothesis_selection"
                  checked={selectedHypothesisId === 'emergency_red_flag'}
                  onChange={() => setSelectedHypothesisId('emergency_red_flag')}
                  className="demo-diff-card__radio"
                />
                <span className="demo-diff-card__name font-bold text-rose-500">
                  Critical Emergency Red Flag Protocol
                </span>
              </div>
              <span className="demo-diff-card__prob-badge demo-diff-card__prob-badge--high">
                Immediate Action
              </span>
            </div>
            <p className="text-xs text-muted mt-2">
              Action: Direct patient to emergency services; notify attending triage GP.
            </p>
          </div>
        </div>
      ) : (
        <div className="demo-diff-list">
          <span className="demo-diff-list__label">Ranked Hypotheses (illustrative — for clinician review):</span>

          {hypotheses.map((hyp, index) => {
            const isSelected = selectedHypothesisId === hyp.id;
            const isTop = index === 0;

            return (
              <div
                key={hyp.id}
                className={`demo-diff-card ${isSelected ? 'demo-diff-card--selected' : ''} ${
                  isTop ? 'demo-diff-card--top' : ''
                }`}
                onClick={() => setSelectedHypothesisId(hyp.id)}
              >
                <div className="demo-diff-card__top">
                  <div className="demo-diff-card__radio-row">
                    <input
                      type="radio"
                      name="hypothesis_selection"
                      checked={isSelected}
                      onChange={() => setSelectedHypothesisId(hyp.id)}
                      className="demo-diff-card__radio"
                    />
                    <span className="demo-diff-card__name">{hyp.condition}</span>
                  </div>

                  <div className="demo-diff-card__badges">
                    <span
                      className={`demo-diff-card__prob-badge demo-diff-card__prob-badge--${hyp.confidenceBucket}`}
                      title="Illustrative ranking bucket — probabilities in this demo are not calibrated estimates"
                    >
                      {hyp.confidenceBucket === 'high' ? 'High plausibility' : hyp.confidenceBucket === 'medium' ? 'Medium plausibility' : 'Low plausibility'}
                    </span>
                    {isTop && <span className="demo-diff-card__top-badge">Primary Candidate</span>}
                  </div>
                </div>

                <div className="demo-diff-card__findings">
                  {hyp.keyFindings.map((finding, fIdx) => (
                    <div key={fIdx} className="demo-diff-card__finding-item">
                      <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
                      <span>{finding}</span>
                    </div>
                  ))}
                </div>

                <div className="demo-diff-card__action">
                  <span className="demo-diff-card__action-label">For Clinician Review:</span>
                  <p className="demo-diff-card__action-text">{hyp.recommendedAction}</p>
                  <span className="demo-diff-card__guideline">{hyp.guidelineRef}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Override prompt if selecting secondary hypothesis */}
      {isOverridingTop && (
        <div className="demo-clinician-override animate-fade-in">
          <div className="demo-clinician-override__header">
            <AlertCircle size={15} className="text-amber-500" />
            <span>Overriding Primary Candidate: Reason Required for Audit</span>
          </div>
          <input
            type="text"
            className="demo-clinician-override__input"
            placeholder="e.g. Clinical history and prior presentation favor secondary differential..."
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
          />
        </div>
      )}

      {/* Care Pathway Disposition Selection */}
      <div className="demo-pathway-selection">
        <span className="demo-pathway-selection__label">Select Disposition & Next Action:</span>
        <div className="demo-pathway-selection__grid">
          {[
            { id: 'same_day_gp', label: 'Same-Day Urgent GP Review', desc: 'Book priority in-person evaluation' },
            { id: 'routine_gp', label: 'Routine GP Consultation', desc: 'Book standard clinic appointment' },
            { id: 'specialist_referral', label: 'Direct Specialist Referral', desc: 'Prepare secondary care draft' },
            { id: 'emergency_transfer', label: 'Emergency Transfer (A&E / 999)', desc: 'Immediate acute hospital escalation' },
            { id: 'self_care_safety_net', label: 'Self-Care + Safety-Net', desc: 'Send patient advice with escalation criteria' },
          ].map((path) => (
            <button
              key={path.id}
              type="button"
              className={`demo-pathway-card ${actionPathway === path.id ? 'demo-pathway-card--selected' : ''}`}
              onClick={() => setActionPathway(path.id as ClinicianReviewDecision['actionPathway'])}
            >
              <span className="demo-pathway-card__title">{path.label}</span>
              <span className="demo-pathway-card__desc">{path.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Clinician Notes */}
      <div className="demo-clinician-notes">
        <label htmlFor="clinician_notes" className="demo-clinician-notes__label">
          Clinician Sign-Off Notes (Optional):
        </label>
        <textarea
          id="clinician_notes"
          className="demo-clinician-notes__textarea"
          rows={2}
          placeholder="e.g. Reviewed with patient history. Agreed on primary management pathway."
          value={clinicianNotes}
          onChange={(e) => setClinicianNotes(e.target.value)}
        />
      </div>

      {/* Authorize Button */}
      <button
        type="button"
        className="demo-authorize-btn"
        disabled={Boolean(isOverridingTop && !overrideReason.trim())}
        onClick={handleSign}
      >
        <FileCheck size={16} />
        <span>Authorize Clinical Disposition</span>
        <ArrowRight size={16} />
      </button>
    </div>
  );
};
