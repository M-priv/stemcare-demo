import React from 'react';
import {
  ArrowLeft,
  Stethoscope,
  Play,
  RotateCcw,
  Shield,
  Moon,
  Sun,
  ChevronDown,
  CheckCircle2,
  Sparkles,
  Compass,
  PlusCircle,
} from 'lucide-react';
import { DEMO_SCENARIOS } from '../lib/scenarios';
import { isLiveMode } from '../lib/demoApi';
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
}) => {
  const [dropdownOpen, setDropdownOpen] = React.useState(false);
  const currentScenario = DEMO_SCENARIOS.find((s) => s.id === currentScenarioId);

  return (
    <header className="demo-header">
      <div className="demo-header__inner">
        {/* Left Section: Back button & Brand lockup */}
        <div className="demo-header__brand-group">
          <button
            type="button"
            className="demo-header__back-btn"
            onClick={onBackToLanding}
            aria-label="Return to STEMCare Home"
          >
            <ArrowLeft size={16} />
            <span className="demo-header__back-text">Back to Home</span>
          </button>

          <div className="demo-header__divider" />

          <div className="demo-header__brand">
            <div className="demo-header__avatar">
              <Stethoscope size={18} className="demo-header__avatar-icon" />
            </div>
            <div className="demo-header__brand-meta">
              <div className="demo-header__title-row">
                <span className="demo-header__title">MedGemma</span>
                <span className="demo-header__badge">Pre-Consultation</span>
              </div>
              <span className="demo-header__subtitle">Clinical Operating Layer</span>
            </div>
          </div>
        </div>

        {/* Center Section: Scenario dropdown & simulation controls */}
        <div className="demo-header__controls">
          <div className="demo-header__scenario-selector">
            <button
              type="button"
              className="demo-header__scenario-btn"
              onClick={() => setDropdownOpen((prev) => !prev)}
              aria-haspopup="true"
              aria-expanded={dropdownOpen}
            >
              <span className={`demo-header__scenario-dot ${currentScenarioId === 'custom' ? 'demo-header__scenario-dot--custom' : ''}`} />
              <span className="demo-header__scenario-label">
                {currentScenarioId === 'custom' ? '+ Fresh Start (Custom Case)' : currentScenario?.name}
              </span>
              <ChevronDown size={14} className="demo-header__scenario-chevron" />
            </button>

            {dropdownOpen && (
              <div className="demo-header__dropdown-menu">
                <div className="demo-header__dropdown-header">Select Clinical Scenario</div>

                {/* Fresh Start Option */}
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
                    <span className="demo-header__dropdown-item-name flex items-center gap-1.5 font-semibold text-emerald-500">
                      <PlusCircle size={14} />
                      <span>+ Fresh Start (Custom Case)</span>
                    </span>
                    <span className="demo-header__dropdown-item-badge demo-header__dropdown-item-badge--custom">
                      Free Form
                    </span>
                  </div>
                  <span className="demo-header__dropdown-item-desc">
                    Enter any patient symptom or scenario from scratch — the interview runs deterministically in your browser.
                  </span>
                </button>

                <div className="my-1 border-t border-line/40" />
                <div className="px-3 py-1 text-[10px] font-semibold tracking-wider text-muted uppercase">
                  Curated Clinical Cases
                </div>

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
                      <span className="demo-header__dropdown-item-badge">{scenario.badgeLabel}</span>
                    </div>
                    <span className="demo-header__dropdown-item-desc">{scenario.summaryPitch}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Action pills: Tour, Auto-Play & Reset */}
          <div className="demo-header__action-pills">
            <button
              type="button"
              className="demo-pill-btn demo-pill-btn--tour"
              onClick={onOpenTour}
              title="60-second guided overview of the MedGemma pre-consultation demo"
            >
              <Compass size={13} className="text-emerald-500" />
              <span>60s Tour</span>
            </button>

            {!isInterviewComplete && currentScenarioId !== 'custom' && (
              <button
                type="button"
                className={`demo-pill-btn ${isAutoPlaying ? 'demo-pill-btn--active' : ''}`}
                onClick={onAutoPlay}
              >
                <Play size={13} className={isAutoPlaying ? 'animate-pulse' : ''} />
                <span>{isAutoPlaying ? 'Simulating...' : 'Auto-Play Case'}</span>
              </button>
            )}

            <button
              type="button"
              className="demo-pill-btn demo-pill-btn--ghost"
              onClick={onReset}
              title="Reset consultation"
            >
              <RotateCcw size={13} />
              <span className="hidden-mobile">Reset</span>
            </button>
          </div>
        </div>

        {/* Right Section: Demo mode indicator & theme switch */}
        <div className="demo-header__right-group">
          <div
            className="demo-header__health-pill"
            title={
              isLiveMode()
                ? 'Live model responses via server-side proxy — API keys never reach the browser'
                : 'This demo runs deterministically in your browser — no data is sent anywhere'
            }
          >
            <Shield size={13} className="text-emerald-500" />
            <span>{isLiveMode() ? 'Live model' : 'Deterministic demo'}</span>
            <span className="demo-header__health-sep">·</span>
            <span className="demo-header__health-status">{isLiveMode() ? 'Server-proxied' : 'Runs in-browser'}</span>
          </div>

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
          Consultation Chat
        </button>
        <button
          type="button"
          className={`demo-header__mobile-tab ${activeTab === 'report' ? 'demo-header__mobile-tab--active' : ''}`}
          onClick={() => onTabChange('report')}
        >
          Clinical Briefing
          <span className="demo-header__mobile-tab-dot" />
        </button>
        <button
          type="button"
          className={`demo-header__mobile-tab ${activeTab === 'review' ? 'demo-header__mobile-tab--active' : ''}`}
          onClick={() => onTabChange('review')}
        >
          Clinician Review
          {isInterviewComplete && <CheckCircle2 size={12} className="inline ml-1 text-emerald-500" />}
        </button>
      </div>
    </header>
  );
};
