import React from 'react';
import type { DemoChatMessage as DemoChatMessageType } from '../types';
import { renderMarkdownToSafeHtml } from '../lib/markdown';

interface DemoChatMessageProps {
  message: DemoChatMessageType;
  /** 1-based position in the transcript; targeted by report citation clicks. */
  transcriptIndex?: number;
}

export const DemoChatMessage: React.FC<DemoChatMessageProps> = ({ message, transcriptIndex }) => {
  const isUser = message.role === 'user';
  const isRedFlag = message.variant === 'red_flag';

  // Render markdown safely for assistant messages
  const renderedContent = React.useMemo(() => {
    if (isUser) return null;
    return renderMarkdownToSafeHtml(message.content);
  }, [message.content, isUser]);

  return (
    <div
      data-chat-msg-index={transcriptIndex}
      className={`demo-msg ${
        isUser ? 'demo-msg--user' : 'demo-msg--assistant'
      } ${isRedFlag ? 'demo-msg--red-flag' : ''}`}
    >
      <div className="demo-msg__bubble-container">
        <div className="demo-msg__header">
          <span className="demo-msg__sender">{isUser ? 'Patient' : 'Assistant'}</span>
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
            <span>Emergency safety rule triggered. Consultation halted for clinical escalation.</span>
          </div>
        )}
      </div>
    </div>
  );
};
