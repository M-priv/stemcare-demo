import React, { useState } from 'react';
import type { ClinicalReportSnapshot, DifferentialHypothesis, ClinicianReviewDecision } from '../types';
import { compileReportToMarkdown } from '../lib/medgemmaEngine';
import { renderReportMarkdownToSafeHtml, type ReportCitationSource } from '../lib/markdown';
import { isLiveMode } from '../lib/demoApi';
import { DemoClinicianReview } from './DemoClinicianReview';

const CONFIDENCE_LABELS: Record<DifferentialHypothesis['confidenceBucket'], string> = {
  high: 'High plausibility',
  medium: 'Medium plausibility',
  low: 'Low plausibility',
};

interface DemoReportPanelProps {
  report: ClinicalReportSnapshot;
  reportMarkdown?: string;
  hypotheses: DifferentialHypothesis[];
  isInterviewComplete: boolean;
  isSynthesizingHypotheses?: boolean;
  blockedReason?: string;
  onReviewSubmitted: (decision: ClinicianReviewDecision) => void;
  existingReview: ClinicianReviewDecision | null;
  onResetReview: () => void;
  onConcludeEarly?: () => void;
  /** Numbered transcript lines for provenance citations in the live report. */
  citationSources?: ReportCitationSource[];
  /** Fires with the 1-based transcript index when a citation is clicked. */
  onCitationClick?: (transcriptIndex: number) => void;
}

export const DemoReportPanel: React.FC<DemoReportPanelProps> = ({
  report,
  reportMarkdown,
  hypotheses,
  isInterviewComplete,
  isSynthesizingHypotheses = false,
  blockedReason,
  onReviewSubmitted,
  existingReview,
  onResetReview,
  onConcludeEarly,
  citationSources,
  onCitationClick,
}) => {
  const [activeTab, setActiveTab] = useState<'briefing' | 'differentials' | 'review'>('briefing');
  const [copied, setCopied] = useState(false);

  const markdownContent = React.useMemo(() => {
    if (reportMarkdown && reportMarkdown.trim()) {
      return reportMarkdown;
    }
    return compileReportToMarkdown(report);
  }, [report, reportMarkdown]);

  const htmlContent = React.useMemo(() => {
    return renderReportMarkdownToSafeHtml(markdownContent, citationSources ?? []);
  }, [markdownContent, citationSources]);

  const handleContentClick = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!onCitationClick) return;
      const cite = (event.target as HTMLElement).closest?.('.demo-cite') as HTMLElement | null;
      if (!cite) return;
      const index = Number(cite.dataset.msgIndex);
      if (Number.isFinite(index) && index >= 1) onCitationClick(index);
    },
    [onCitationClick],
  );

  const handleCopy = () => {
    // Strip citation markers: [[n]] means "patient transcript line n" inside
    // the app; a pasted copy should carry the findings, not orphaned digits.
    navigator.clipboard.writeText(markdownContent.replace(/\[\[(\d{1,2})\]\]/g, ''));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hasDifferentials = hypotheses.length > 0;
  const isRedFlagBlocked = Boolean(blockedReason);

  return (
    <div className="demo-report-panel">
      {/* Top Inspector Header */}
      <div className="demo-report-panel__header">
        <div className="demo-report-panel__tabs">
          <button
            type="button"
            className={`demo-report-panel__tab ${activeTab === 'briefing' ? 'demo-report-panel__tab--active' : ''}`}
            onClick={() => setActiveTab('briefing')}
          >
            <span>Briefing</span>
          </button>

          <button
            type="button"
            className={`demo-report-panel__tab ${activeTab === 'differentials' ? 'demo-report-panel__tab--active' : ''}`}
            onClick={() => setActiveTab('differentials')}
          >
            <span>Differentials</span>
            {hasDifferentials ? (
              <span className="demo-report-panel__badge">{hypotheses.length}</span>
            ) : isInterviewComplete ? (
              <span className="demo-report-panel__badge demo-report-panel__badge--pending">...</span>
            ) : null}
          </button>

          <button
            type="button"
            className={`demo-report-panel__tab ${activeTab === 'review' ? 'demo-report-panel__tab--active' : ''}`}
            onClick={() => setActiveTab('review')}
          >
            <span>Review</span>
            {existingReview ? (
              <span className="demo-report-panel__dot--success" />
            ) : null}
          </button>
        </div>

        <div className="demo-report-panel__actions">
          <button
            type="button"
            className="demo-report-copy-btn"
            onClick={handleCopy}
            title="Copy structured briefing as markdown"
            aria-label="Copy markdown"
          >
            <span className="hidden-mobile">{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>

      {/* Status Bar */}
      <div className="demo-report-panel__status-bar">
        <div className="demo-report-panel__status-left">
          <span className={`demo-report-dot ${report.isFinalized ? 'demo-report-dot--final' : 'demo-report-dot--live'}`} />
          <span className="demo-report-status-text">
            {report.isFinalized
              ? 'Finalized'
              : isLiveMode()
                ? 'Live model'
                : 'Simulation'}
          </span>
        </div>
        <span className="demo-report-timestamp">Updated {report.lastUpdated}</span>
      </div>

      {/* Content Area */}
      <div className="demo-report-panel__content">
        {activeTab === 'briefing' && (
          <div className="demo-report-briefing animate-fade-in">
            <div
              className="demo-report-prose"
              onClick={handleContentClick}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                const cite = (e.target as HTMLElement).closest?.('.demo-cite') as HTMLElement | null;
                if (!cite || !onCitationClick) return;
                const index = Number(cite.dataset.msgIndex);
                if (Number.isFinite(index) && index >= 1) {
                  e.preventDefault();
                  onCitationClick(index);
                }
              }}
              dangerouslySetInnerHTML={{ __html: htmlContent }}
            />

            {!isInterviewComplete && onConcludeEarly && (
              <div className="mt-8 pt-4 border-t border-line flex items-center justify-between">
                <span className="text-xs text-muted">Ready to review hypotheses?</span>
                <button
                  type="button"
                  className="demo-pill-btn demo-pill-btn--primary"
                  onClick={onConcludeEarly}
                >
                  <span>Generate differentials</span>
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'differentials' && (
          <div className="demo-report-differentials animate-fade-in">
            {isRedFlagBlocked ? (
              <div className="demo-diff-empty-state">
                <h4 className="font-semibold text-sm text-foreground">
                  Differential Generation Blocked
                </h4>
                <p className="text-xs text-muted max-w-sm mt-1">
                  {blockedReason || 'Emergency red flag detected in intake. Clinical safety protocol mandates immediate emergency escalation rather than routine differential generation.'}
                </p>
                <div className="demo-diff-card__guideline mt-3">
                  Safety Gate: STEMCare Policy Engine (isHypothesisGenerationBlocked)
                </div>
              </div>
            ) : isSynthesizingHypotheses ? (
              <div className="demo-diff-empty-state">
                <h4 className="font-semibold text-sm text-foreground">
                  Compiling differential hypotheses
                </h4>
                <p className="text-xs text-muted max-w-sm mt-1">
                  Ranking candidate hypotheses from the finalized pre-consultation report for clinician review. Demo content — not diagnostic output.
                </p>
              </div>
            ) : !isInterviewComplete && !hasDifferentials ? (
              <div className="demo-diff-empty-state">
                <h4 className="font-semibold text-sm text-foreground">
                  Interview in progress
                </h4>
                <p className="text-xs text-muted max-w-sm mt-1">
                  MedGemma is actively gathering symptom progression and pertinent negatives. Differential hypotheses generate automatically once the interview is concluded.
                </p>
                {onConcludeEarly && (
                  <button
                    type="button"
                    className="demo-pill-btn demo-pill-btn--primary mt-4"
                    onClick={onConcludeEarly}
                  >
                    <span>Conclude now</span>
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="demo-report-diff-intro">
                  <div>
                    <h4 className="font-semibold text-sm">Differential hypotheses (illustrative)</h4>
                    <p className="text-xs text-muted">
                      Guideline-referenced candidates ranked for clinician review. Demo content only — not diagnoses and not medical advice.
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  {hypotheses.map((h, i) => (
                    <div key={h.id} className="demo-diff-overview-card">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-sm text-foreground">
                          {i + 1}. {h.condition}
                        </span>
                        <span
                          className={`demo-diff-card__prob-badge demo-diff-card__prob-badge--${h.confidenceBucket}`}
                          title="Illustrative ranking bucket — probabilities in this demo are not calibrated estimates"
                        >
                          {CONFIDENCE_LABELS[h.confidenceBucket]}
                        </span>
                      </div>

                      <ul className="text-xs space-y-1 mb-3 text-muted">
                        {h.keyFindings.map((finding, fIdx) => (
                          <li key={fIdx}>• {finding}</li>
                        ))}
                      </ul>

                      <div className="text-xs pt-2 border-t border-line">
                        <span className="font-semibold text-foreground">For Clinician Review: </span>
                        <span className="text-muted">{h.recommendedAction}</span>
                      </div>

                      {h.guidelineRef && (
                        <div className="mt-1 text-[11px] text-muted font-mono">
                          Ref: {h.guidelineRef}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  className="demo-switch-tab-btn mt-6"
                  onClick={() => setActiveTab('review')}
                >
                  <span>Proceed to sign-off</span>
                </button>
              </>
            )}
          </div>
        )}

        {activeTab === 'review' && (
          <div className="demo-report-review animate-fade-in">
            {!isInterviewComplete && !hasDifferentials ? (
              <div className="demo-diff-empty-state">
                <h4 className="font-semibold text-sm text-foreground">
                  Sign-off unlocks after the interview
                </h4>
                <p className="text-xs text-muted max-w-sm mt-1">
                  Medical authority and care pathway authorization require a finalized pre-consultation briefing and differential synthesis.
                </p>
                {onConcludeEarly && (
                  <button
                    type="button"
                    className="demo-pill-btn demo-pill-btn--primary mt-4"
                    onClick={onConcludeEarly}
                  >
                    <span>Conclude to unlock</span>
                  </button>
                )}
              </div>
            ) : (
              <DemoClinicianReview
                hypotheses={hypotheses}
                isInterviewComplete={isInterviewComplete}
                onReviewSubmitted={onReviewSubmitted}
                existingReview={existingReview}
                onResetReview={onResetReview}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};
