import React, { useState } from 'react';
import type { DifferentialHypothesis, ClinicianReviewDecision } from '../types';
import { suggestTriage, pathwayLabel, type ActionPathway } from '../lib/triageSuggestion';
import { renderReportMarkdownToSafeHtml, type ReportCitationSource } from '../lib/markdown';
import { extractCitedSummary } from '../lib/medgemmaEngine';

interface DemoClinicianReviewProps {
  hypotheses: DifferentialHypothesis[];
  isInterviewComplete: boolean;
  onReviewSubmitted: (decision: ClinicianReviewDecision) => void;
  existingReview: ClinicianReviewDecision | null;
  onResetReview: () => void;
  patientName?: string;
  /** Compiled briefing markdown; its cited HPI lines form the review summary. */
  reportMarkdown?: string;
  citationSources?: ReportCitationSource[];
  onCitationClick?: (transcriptIndex: number) => void;
}

const DISPOSITIONS: Array<{ id: ActionPathway; label: string; desc: string }> = [
  { id: 'same_day_gp', label: 'Same-Day Urgent GP Review', desc: 'Book priority in-person evaluation' },
  { id: 'routine_gp', label: 'Routine GP Consultation', desc: 'Book standard clinic appointment' },
  { id: 'specialist_referral', label: 'Direct Specialist Referral', desc: 'Prepare secondary care draft' },
  { id: 'emergency_transfer', label: 'Emergency Transfer (A&E / 999)', desc: 'Immediate acute hospital escalation' },
  { id: 'self_care_safety_net', label: 'Self-Care + Safety-Net', desc: 'Send patient advice with escalation criteria' },
];

export const DemoClinicianReview: React.FC<DemoClinicianReviewProps> = ({
  hypotheses,
  isInterviewComplete,
  onReviewSubmitted,
  existingReview,
  onResetReview,
  patientName,
  reportMarkdown,
  citationSources,
  onCitationClick,
}) => {
  const [mode, setMode] = useState<'conclude' | 'edit'>('conclude');
  const [editedPathway, setEditedPathway] = useState<ActionPathway | null>(null);
  const [clinicianNotes, setClinicianNotes] = useState('');

  const topHypothesis = hypotheses[0];
  const hasRedFlag = hypotheses.length === 0;
  const suggestion = suggestTriage(topHypothesis, hasRedFlag);
  const finalPathway: ActionPathway = mode === 'edit' && editedPathway ? editedPathway : suggestion.pathway;
  const isModified = finalPathway !== suggestion.pathway;

  const summaryHtml = React.useMemo(() => {
    const hpi = extractCitedSummary(reportMarkdown || '');
    if (!hpi.trim()) return '';
    return renderReportMarkdownToSafeHtml(hpi, citationSources ?? []);
  }, [reportMarkdown, citationSources]);

  const handleSummaryClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onCitationClick) return;
    const cite = (e.target as HTMLElement).closest?.('.demo-cite') as HTMLElement | null;
    if (!cite) return;
    const index = Number(cite.dataset.msgIndex);
    if (Number.isFinite(index) && index >= 1) onCitationClick(index);
  };

  const sign = () => {
    onReviewSubmitted({
      decision: isModified ? 'modify' : 'approve',
      selectedHypothesisId: topHypothesis?.id || 'emergency_red_flag',
      actionPathway: finalPathway,
      clinicianNotes: clinicianNotes.trim() || undefined,
      signedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      clinicianName: 'Dr. Sarah Jenkins (Simulated Persona)',
      clinicianRole: 'Simulated Attending GP — demo walkthrough only',
    });
  };

  if (existingReview) {
    return (
      <div className="demo-review-signed animate-fade-in">
        <div className="demo-review-signed__card">
          <div className="demo-review-signed__header">
            <div className="demo-review-signed__seal" />
            <div>
              <h3 className="demo-review-signed__title">Disposition authorized</h3>
              <p className="demo-review-signed__meta">
                Signed by {existingReview.clinicianName} · {existingReview.signedAt}
              </p>
            </div>
          </div>

          <div className="demo-review-signed__body">
            <div className="demo-review-signed__row">
              <span className="demo-review-signed__label">Pathway:</span>
              <span className="demo-review-signed__badge">
                {existingReview.actionPathway.replace(/_/g, ' ').toUpperCase()}
              </span>
            </div>

            {existingReview.clinicianNotes && (
              <div className="demo-review-signed__row">
                <span className="demo-review-signed__label">Notes:</span>
                <span className="demo-review-signed__val">{existingReview.clinicianNotes}</span>
              </div>
            )}

            <div className="demo-review-signed__receipt">
              <span className="demo-review-signed__receipt-hash">
                Demo review record — the production system records a clinician decision with a cryptographic audit receipt.
              </span>
            </div>
          </div>

          <button type="button" className="demo-review-signed__edit-btn" onClick={onResetReview}>
            <span>Modify disposition</span>
          </button>
        </div>
      </div>
    );
  }

  const otherDispositions = DISPOSITIONS.filter((d) => d.id !== suggestion.pathway);

  return (
    <div className="demo-clinician-review animate-fade-in">
      <div className="demo-clinician-review__header">
        <div className="demo-clinician-review__title-row">
          <h3 className="demo-clinician-review__title">
            Clinician review{patientName ? `: ${patientName}` : ''}
          </h3>
          {!isInterviewComplete && (
            <span className="demo-clinician-review__prelim-badge">Preliminary</span>
          )}
        </div>
      </div>

      {/* Summary of the relevant chat info, with citations back to the transcript */}
      {summaryHtml ? (
        <div className="demo-review-summary">
          <span className="demo-review-summary__label">From the chat</span>
          <div
            className="demo-review-summary__body"
            onClick={handleSummaryClick}
            dangerouslySetInnerHTML={{ __html: summaryHtml }}
          />
        </div>
      ) : hasRedFlag ? (
        <div className="demo-review-summary">
          <span className="demo-review-summary__label">Emergency</span>
          <p className="demo-review-summary__body">
            An emergency red flag halted the interview. Authorize escalation below.
          </p>
        </div>
      ) : null}

      {/* Conclusion + approve/edit */}
      <div className="demo-review-conclusion">
        <p className="demo-review-conclusion__lead">Here's what I concluded we should do:</p>
        <p className="demo-review-conclusion__pathway">{pathwayLabel(finalPathway)}</p>
        <p className="demo-review-conclusion__reason">{suggestion.reason}</p>
        {isModified && (
          <p className="demo-review-conclusion__edited">
            Edited from the suggested {pathwayLabel(suggestion.pathway)}.
          </p>
        )}

        <div className="demo-review-conclusion__actions">
          <button type="button" className="demo-authorize-btn" onClick={sign}>
            <span>Approve</span>
          </button>
          <button
            type="button"
            className="demo-pill-btn demo-pill-btn--ghost"
            onClick={() => {
              const next = mode === 'edit' ? 'conclude' : 'edit';
              setMode(next);
              if (next === 'conclude') setEditedPathway(null);
            }}
          >
            <span>{mode === 'edit' ? 'Close' : 'Edit'}</span>
          </button>
        </div>

        {mode === 'edit' && (
          <div className="demo-review-edit">
            <span className="demo-review-edit__label">Other dispositions:</span>
            <div className="demo-review-edit__options">
              {otherDispositions.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className={`demo-pathway-card ${editedPathway === d.id ? 'demo-pathway-card--selected' : ''}`}
                  onClick={() => setEditedPathway(d.id)}
                >
                  <span className="demo-pathway-card__title">{d.label}</span>
                  <span className="demo-pathway-card__desc">{d.desc}</span>
                </button>
              ))}
            </div>
            <label htmlFor="clinician_notes" className="demo-review-edit__notes-label">
              Notes (optional):
            </label>
            <textarea
              id="clinician_notes"
              className="demo-clinician-notes__textarea"
              rows={2}
              placeholder="e.g. Agreed on the suggested pathway with the patient."
              value={clinicianNotes}
              onChange={(e) => setClinicianNotes(e.target.value)}
            />
            <button
              type="button"
              className="demo-authorize-btn"
              disabled={!editedPathway}
              onClick={sign}
            >
              <span>Authorize disposition</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
