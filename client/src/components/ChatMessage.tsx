import React from 'react';
import { ChatMessage as ChatMessageType, ChatQueryResult } from '../types';
import QueryResult from './QueryResult';

interface ChatMessageProps {
  message: ChatMessageType;
  onApplyQueryResult?: (queryResult: ChatQueryResult) => void;
  onClarificationResponse?: (response: string) => void;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ 
  message, 
  onApplyQueryResult,
  onClarificationResponse 
}) => {
  const formatTimestamp = (timestamp: Date) => {
    return timestamp.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const renderClarificationOptions = () => {
    if (!message.clarificationRequest) return null;

    return (
      <div className="clarification-options">
        <p className="clarification-question">{message.clarificationRequest.question}</p>
        {message.clarificationRequest.options && (
          <div className="clarification-buttons">
            {message.clarificationRequest.options.map((option, index) => (
              <button
                key={index}
                className="clarification-option-btn"
                onClick={() => onClarificationResponse?.(option)}
              >
                {option}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderReasoningInfo = () => {
    if (!message.queryResult?.reasoning && !message.queryResult?.detailedExplanation) return null;

    const { interpretations, chosenInterpretation, intermediateQueries } = message.queryResult.reasoning || {};

    return (
      <div className="reasoning-info">
        <details className="reasoning-details">
          <summary>🧠 Reasoning Process</summary>
          <div className="reasoning-content">
            {message.queryResult.detailedExplanation && (
              <div className="detailed-explanation">
                <h4>Detailed Explanation:</h4>
                <p>{message.queryResult.detailedExplanation}</p>
              </div>
            )}
            
            {interpretations && (
              <div className="interpretations">
                <h4>Possible Interpretations:</h4>
                <ul>
                  {interpretations.map((interpretation, index) => (
                    <li key={index} className={interpretation === chosenInterpretation ? 'chosen' : ''}>
                      {interpretation}
                      {interpretation === chosenInterpretation && ' ✓'}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {intermediateQueries && intermediateQueries.length > 0 && (
              <div className="intermediate-queries">
                <h4>Exploration Queries:</h4>
                {intermediateQueries.map((query, index) => (
                  <div key={index} className="intermediate-query">
                    <strong>{query.purpose}:</strong>
                    <code>{query.query}</code>
                    <p className="query-result">{query.result}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </details>
      </div>
    );
  };

  const renderMessageContent = () => {
    if (message.isProcessing) {
      return (
        <div className="chat-processing">
          <span className="processing-dots">
            <span></span>
            <span></span>
            <span></span>
          </span>
          <span className="processing-text">Processing your query...</span>
        </div>
      );
    }

    return (
      <div className="chat-message-content">
        <p>{message.content}</p>
        {renderClarificationOptions()}
        {message.queryResult && (
          <>
            {renderReasoningInfo()}
            <QueryResult 
              queryResult={message.queryResult}
              onApplyToGraph={onApplyQueryResult}
            />
          </>
        )}
      </div>
    );
  };

  return (
    <div className={`chat-message ${message.type}`}>
      <div className="message-header">
        <span className="message-sender">
          {message.type === 'user' ? 'You' : message.type === 'assistant' ? 'AI Assistant' : 'System'}
        </span>
        <span className="message-timestamp">
          {formatTimestamp(message.timestamp)}
        </span>
      </div>
      
      <div className="message-body">
        {renderMessageContent()}
      </div>
    </div>
  );
};

export default ChatMessage;