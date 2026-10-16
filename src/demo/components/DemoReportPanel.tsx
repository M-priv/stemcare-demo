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
  /** Operational context shown on the focused review, e.g. "12:19 · 13 answers · simulated". */
  reviewMeta?: string;
  /** Increment to open the focused review from outside the panel. */
  reviewOpenSignal?: number;
  onOpenSurvey?: () => void;
  hasSurveySubmitted?: boolean;
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
  reviewMeta,
  reviewOpenSignal,
  onOpenSurvey,
  hasSurveySubmitted,
}) => {
  const [activeTab, setActiveTab] = useState<'briefing' | 'review'>('briefing');
  const [reviewFocus, setReviewFocus] = useState(false);
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

  React.useEffect(() => {
    if (reviewOpenSignal && reviewOpenSignal > 0) {
      setActiveTab('review');
      setReviewFocus(true);
    }
  }, [reviewOpenSignal]);
  const reviewMetaLine = `${report.lastUpdated} · simulated patient`;

  return (
    <div className="demo-report-panel">
      {/* Top Inspector Header */}
      <div className="demo-report-panel__header">
        <>
        <div className="demo-report-panel__tabs" data-tour="clinician-tabs">
          <button
            type="button"
            className={`demo-report-panel__tab ${activeTab === 'briefing' ? 'demo-report-panel__tab--active' : ''}`}
            onClick={() => { setActiveTab('briefing'); setReviewFocus(false); }}
          >
            <span>Briefing</span>
          </button>

          <button
            type="button"
            className={`demo-report-panel__tab ${activeTab === 'review' ? 'demo-report-panel__tab--active' : ''}`}
            onClick={() => { setActiveTab('review'); setReviewFocus(true); }}
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
        </>
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
                  <span>Conclude interview</span>
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'review' && (
          <div className={`demo-report-review animate-fade-in ${reviewFocus ? 'demo-report-review--focus' : ''}`}>
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
                    <span>Conclude interview</span>
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
                patientName={report.patientName}
                reportMarkdown={markdownContent}
                citationSources={citationSources}
                onCitationClick={onCitationClick}
                onOpenSurvey={onOpenSurvey}
                hasSurveySubmitted={hasSurveySubmitted}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};
