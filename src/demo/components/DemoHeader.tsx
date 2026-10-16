import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { DEMO_SCENARIOS } from '../lib/scenarios';
import type { ScenarioConditionId } from '../types';

interface DemoHeaderProps {
  currentScenarioId: ScenarioConditionId | 'custom';
  onSelectScenario: (scenarioId: ScenarioConditionId | 'custom') => void;
  onReset: () => void;
  onAutoPlay: () => void;
  onOpenTour: () => void;
  isAutoPlaying: boolean;
  isInterviewComplete: boolean;
  onBackToLanding: () => void;
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
  activeTab: 'chat' | 'report' | 'review';
  onTabChange: (tab: 'chat' | 'report' | 'review') => void;
  onOpenSurvey?: () => void;
  hasSurveySubmitted?: boolean;
}

export const DemoHeader: React.FC<DemoHeaderProps> = ({
  currentScenarioId,
  onSelectScenario,
  onReset,
  onAutoPlay,
  onOpenTour,
  isAutoPlaying,
  isInterviewComplete,
  onBackToLanding,
  theme,
  onThemeToggle,
  activeTab,
  onTabChange,
  onOpenSurvey,
  hasSurveySubmitted,
}) => {
  const [dropdownOpen, setDropdownOpen] = React.useState(false);
  const currentScenario = DEMO_SCENARIOS.find((s) => s.id === currentScenarioId);

  return (
    <header className="demo-header">
      <div className="demo-header__inner">
        {/* Left: back link and product name */}
        <div className="demo-header__brand-group">
          <button
            type="button"
            className="demo-header__back-btn"
            onClick={onBackToLanding}
            aria-label="Return to STEMCare Home"
          >
            <span className="demo-header__back-text">Back to Home</span>
          </button>

          <div className="demo-header__divider" />

          <div className="demo-header__brand">
            <div className="demo-header__brand-meta">
              <span className="demo-header__title">STEMCare</span>
              <span className="demo-header__subtitle">Pre-consultation demo</span>
            </div>
          </div>
        </div>

        {/* Center: scenario selector and interview controls */}
        <div className="demo-header__controls">
          <div className="demo-header__scenario-selector" data-tour="scenario-selector">
            <button
              type="button"
              className="demo-header__scenario-btn"
              onClick={() => setDropdownOpen((prev) => !prev)}
              aria-haspopup="true"
              aria-expanded={dropdownOpen}
            >
              <span className={`demo-header__scenario-dot ${currentScenarioId === 'custom' ? 'demo-header__scenario-dot--custom' : ''}`} />
              <span className="demo-header__scenario-label">
                {currentScenarioId === 'custom' ? 'Custom Case' : currentScenario?.name}
              </span>
            </button>

            {dropdownOpen && (
              <div className="demo-header__dropdown-menu">
                <button
                  type="button"
                  className={`demo-header__dropdown-item ${
                    currentScenarioId === 'custom' ? 'demo-header__dropdown-item--active' : ''
                  }`}
                  onClick={() => {
                    onSelectScenario('custom');
                    setDropdownOpen(false);
                  }}
                >
                  <div className="demo-header__dropdown-item-top">
                    <span className="demo-header__dropdown-item-name">Custom Case</span>
                  </div>
                  <span className="demo-header__dropdown-item-desc">
                    Start from any symptom narrative.
                  </span>
                </button>

                {DEMO_SCENARIOS.map((scenario) => (
                  <button
                    key={scenario.id}
                    type="button"
                    className={`demo-header__dropdown-item ${
                      scenario.id === currentScenarioId ? 'demo-header__dropdown-item--active' : ''
                    }`}
                    onClick={() => {
                      onSelectScenario(scenario.id);
                      setDropdownOpen(false);
                    }}
                  >
                    <div className="demo-header__dropdown-item-top">
                      <span className="demo-header__dropdown-item-name">{scenario.name}</span>
                    </div>
                    <span className="demo-header__dropdown-item-desc">{scenario.summaryPitch}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="demo-header__action-pills" data-tour="action-pills">
            <button type="button" className="demo-pill-btn demo-pill-btn--tour" data-tour="tour-btn" onClick={onOpenTour}>
              <span>Tour</span>
            </button>

            {onOpenSurvey && (
              <button
                type="button"
                className={`demo-pill-btn demo-pill-btn--survey ${hasSurveySubmitted ? 'demo-pill-btn--survey-done' : ''}`}
                onClick={onOpenSurvey}
                title="Rate and evaluate demo (1–10)"
              >
                <span>{hasSurveySubmitted ? 'Feedback ✓' : 'Feedback (1–10)'}</span>
              </button>
            )}

            {!isInterviewComplete && currentScenarioId !== 'custom' && (
              <button
                type="button"
                className={`demo-pill-btn ${isAutoPlaying ? 'demo-pill-btn--active' : ''}`}
                data-tour="autoplay-btn"
                onClick={onAutoPlay}
              >
                <span>{isAutoPlaying ? 'Stop' : 'Auto-play'}</span>
              </button>
            )}

            <button type="button" className="demo-pill-btn demo-pill-btn--ghost" data-tour="reset-btn" onClick={onReset}>
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Right: theme */}
        <div className="demo-header__right-group">
          <button
            type="button"
            className="demo-header__theme-toggle"
            onClick={onThemeToggle}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </div>

      {/* Mobile Tab Switcher */}
      <div className="demo-header__mobile-tabs">
        <button
          type="button"
          className={`demo-header__mobile-tab ${activeTab === 'chat' ? 'demo-header__mobile-tab--active' : ''}`}
          onClick={() => onTabChange('chat')}
        >
          Chat
        </button>
        <button
          type="button"
          className={`demo-header__mobile-tab ${activeTab === 'report' ? 'demo-header__mobile-tab--active' : ''}`}
          onClick={() => onTabChange('report')}
        >
          Briefing
        </button>
        <button
          type="button"
          className={`demo-header__mobile-tab ${activeTab === 'review' ? 'demo-header__mobile-tab--active' : ''}`}
          onClick={() => onTabChange('review')}
        >
          Review
        </button>
      </div>
    </header>
  );
};
