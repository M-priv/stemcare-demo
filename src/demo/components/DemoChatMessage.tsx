import React from 'react';
import { Stethoscope, User, AlertTriangle, Sparkles } from 'lucide-react';
import type { DemoChatMessage as DemoChatMessageType } from '../types';
import { renderMarkdownToSafeHtml } from '../lib/markdown';

interface DemoChatMessageProps {
  message: DemoChatMessageType;
}

export const DemoChatMessage: React.FC<DemoChatMessageProps> = ({ message }) => {
  const isUser = message.role === 'user';
  const isRedFlag = message.variant === 'red_flag';

  // Render markdown safely for assistant messages
  const renderedContent = React.useMemo(() => {
    if (isUser) return null;
    return renderMarkdownToSafeHtml(message.content);
  }, [message.content, isUser]);

  return (
    <div
      className={`demo-msg ${
        isUser ? 'demo-msg--user' : 'demo-msg--assistant'
      } ${isRedFlag ? 'demo-msg--red-flag' : ''}`}
    >
      {!isUser && (
        <div className="demo-msg__avatar">
          {isRedFlag ? (
            <AlertTriangle size={15} className="demo-msg__avatar-icon--danger" />
          ) : (
            <Stethoscope size={15} className="demo-msg__avatar-icon--assistant" />
          )}
        </div>
      )}

      <div className="demo-msg__bubble-container">
        <div className="demo-msg__header">
          <span className="demo-msg__sender">
            {isUser ? 'Patient' : 'MedGemma Clinical AI'}
          </span>
          {message.simulated && (
            <span className="demo-msg__sim-badge">
              <Sparkles size={10} />
              Simulated
            </span>
          )}
          <span className="demo-msg__time">{message.timestamp}</span>
        </div>

        <div className="demo-msg__bubble">
          {isUser ? (
            <p className="demo-msg__text">{message.content}</p>
          ) : (
            <div
              className="demo-msg__prose"
              dangerouslySetInnerHTML={{ __html: renderedContent || '' }}
            />
          )}
        </div>

        {isRedFlag && (
          <div className="demo-msg__red-flag-callout">
            <AlertTriangle size={14} className="shrink-0" />
            <span>Emergency safety rule triggered. Consultation halted for clinical escalation.</span>
          </div>
        )}
      </div>

      {isUser && (
        <div className="demo-msg__avatar demo-msg__avatar--user">
          <User size={15} className="demo-msg__avatar-icon--user" />
        </div>
      )}
    </div>
  );
};
