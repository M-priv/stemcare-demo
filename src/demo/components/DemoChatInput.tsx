import React, { useState } from 'react';
import { ArrowUp, Shield, Sparkles } from 'lucide-react';

interface DemoChatInputProps {
  onSendMessage: (message: string) => void;
  disabled: boolean;
  isInterviewComplete: boolean;
  suggestedChips?: string[];
  canConclude?: boolean;
  onConcludeInterview?: () => void;
}

export const DemoChatInput: React.FC<DemoChatInputProps> = ({
  onSendMessage,
  disabled,
  isInterviewComplete,
  suggestedChips,
  canConclude = false,
  onConcludeInterview,
}) => {
  const [text, setText] = useState('');

  const handleSend = () => {
    if (!text.trim() || disabled) return;
    onSendMessage(text.trim());
    setText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChipClick = (chip: string) => {
    if (disabled) return;
    onSendMessage(chip);
  };

  if (isInterviewComplete) {
    return (
      <div className="demo-input-concluded">
        <div className="demo-input-concluded__content">
          <Shield size={16} className="text-emerald-500" />
          <span>Pre-consultation intake concluded. Review the generated briefing and differential hypotheses on the right.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="demo-input-wrapper">
      {/* Quick symptom shortcut chips & early wrap-up option */}
      <div className="demo-input__chips-row">
        {suggestedChips && suggestedChips.length > 0 && (
          <div className="demo-input__chips" aria-label="Suggested patient answers">
            {suggestedChips.map((chip, idx) => (
              <button
                key={idx}
                type="button"
                className="demo-input__chip"
                disabled={disabled}
                onClick={() => handleChipClick(chip)}
              >
                {chip}
              </button>
            ))}
          </div>
        )}

        {canConclude && onConcludeInterview && (
          <button
            type="button"
            className="demo-conclude-pill-btn"
            onClick={onConcludeInterview}
            disabled={disabled}
            title="Conclude pre-consultation interview and generate differential diagnoses"
          >
            <Sparkles size={12} className="text-emerald-500" />
            <span>Wrap-Up Intake</span>
          </button>
        )}
      </div>

      {/* Main Apple HIG floating input card */}
      <div className="demo-input-card">
        <input
          type="text"
          className="demo-input-card__field"
          placeholder="Describe your symptoms or answer the doctor's assistant..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          maxLength={500}
          aria-label="Patient symptom input"
        />

        <button
          type="button"
          className={`demo-input-card__send-btn ${text.trim() ? 'demo-input-card__send-btn--active' : ''}`}
          disabled={!text.trim() || disabled}
          onClick={handleSend}
          aria-label="Send message"
        >
          <ArrowUp size={16} />
        </button>
      </div>

      <div className="demo-input-footer">
        <Shield size={12} className="text-muted" />
        <span>AI proposes. Policy gates. Licensed clinicians make final care decisions.</span>
      </div>
    </div>
  );
};
