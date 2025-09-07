import React from 'react';
import { ChatMessage as ChatMessageType, ChatQueryResult } from '../types';
import QueryResult from './QueryResult';

interface ChatMessageProps {
  message: ChatMessageType;
  onApplyQueryResult?: (queryResult: ChatQueryResult) => void;
  onNavigateToNode?: (nodeId: string) => void;
  onClarificationResponse?: (response: string) => void;
  onExampleQuestionClick?: (question: string) => void;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ 
  message, 
  onApplyQueryResult,
  onNavigateToNode,
  onClarificationResponse,
  onExampleQuestionClick 
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

  const renderMutationConfirmation = () => {
    if (!message.mutationConfirmation) return null;

    const { plan, onConfirm, onCancel } = message.mutationConfirmation;
    const riskColor = plan.riskLevel === 'HIGH' ? '#ef4444' : 
                     plan.riskLevel === 'MEDIUM' ? '#f59e0b' : '#10b981';

    return (
      <div className="mutation-confirmation">
        <div className="mutation-details">
          <div className="mutation-header">
            <h4>⚠️ Confirm Changes</h4>
            <span className="risk-badge" style={{ backgroundColor: riskColor }}>
              {plan.riskLevel} RISK
            </span>
          </div>
          <p className="mutation-explanation">{plan.explanation}</p>
          
          <div className="cypher-preview">
            <h5>Cypher Query:</h5>
            <pre className="cypher-code">{plan.query}</pre>
          </div>
          
          {plan.affectedNodes.length > 0 && (
            <div className="affected-nodes">
              <h5>Affected Node Types:</h5>
              <div className="node-tags">
                {plan.affectedNodes.map((nodeType, index) => (
                  <span key={index} className="node-tag">{nodeType}</span>
                ))}
              </div>
            </div>
          )}
        </div>
        
        <div className="mutation-actions">
          <button 
            className="execute-btn"
            onClick={onConfirm}
          >
            ✅ Execute Changes
          </button>
          <button 
            className="cancel-btn"
            onClick={onCancel}
          >
            ❌ Cancel
          </button>
        </div>
      </div>
    );
  };

  const renderVisualizationConfirmation = () => {
    if (!message.visualizationConfirmation) return null;

    const { nodeCount, edgeCount, onConfirm, onCancel } = message.visualizationConfirmation;

    return (
      <div className="visualization-confirmation">
        <div className="visualization-details">
          <div className="visualization-header">
            <h4>📊 Large Graph Visualization</h4>
            <span className="performance-badge">
              Performance Impact
            </span>
          </div>
          <p className="visualization-warning">
            This query returned <strong>{nodeCount} nodes</strong> and <strong>{edgeCount} edges</strong>. 
            Rendering a large graph may impact performance.
          </p>
        </div>
        
        <div className="visualization-actions">
          <button 
            className="show-graph-btn"
            onClick={onConfirm}
          >
            📈 Show Graph ({nodeCount} nodes, {edgeCount} edges)
          </button>
          <button 
            className="cancel-btn"
            onClick={onCancel}
          >
            ❌ Cancel
          </button>
        </div>
      </div>
    );
  };

  const renderExampleQuestions = () => {
    if (!message.exampleQuestions || message.exampleQuestions.length === 0) return null;

    return (
      <div className="example-questions">
        <div className="example-questions-buttons">
          {message.exampleQuestions.map((question, index) => (
            <button
              key={index}
              className="example-question-btn"
              onClick={() => onExampleQuestionClick?.(question)}
            >
              {question}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderReasoningInfo = () => {
    const hasLegacyReasoning = message.queryResult?.reasoning || message.queryResult?.detailedExplanation;
    const hasReasoningSteps = message.queryResult?.reasoningSteps && message.queryResult.reasoningSteps.length > 0;
    
    if (!hasLegacyReasoning && !hasReasoningSteps) return null;

    const { interpretations, chosenInterpretation, intermediateQueries } = message.queryResult?.reasoning || {};

    return (
      <div className="reasoning-info">
        <details className="reasoning-details">
          <summary>🧠 Reasoning Process</summary>
          <div className="reasoning-content">
            {message.queryResult?.detailedExplanation && (
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

            {hasReasoningSteps && (
              <div className="reasoning-steps">
                <h4>Processing Steps:</h4>
                <div className="steps-timeline">
                  {message.queryResult?.reasoningSteps?.map((step, index) => (
                    <div key={index} className={`reasoning-step step-${step.type}`}>
                      <div className="step-header">
                        <span className="step-icon">{getStepIcon(step.type)}</span>
                        <span className="step-type">{formatStepType(step.type)}</span>
                        {step.duration && <span className="step-duration">{step.duration}ms</span>}
                        {step.confidence && <span className="step-confidence">{Math.round(step.confidence * 100)}%</span>}
                      </div>
                      <div className="step-description">{step.description}</div>
                      {step.input && (
                        <div className="step-detail">
                          <strong>Input:</strong>
                          <div className="step-content">{formatReasoningData(step.input)}</div>
                        </div>
                      )}
                      {step.output && (
                        <div className="step-detail">
                          <strong>Output:</strong>
                          <div className="step-content">{formatReasoningData(step.output)}</div>
                        </div>
                      )}
                      {step.metadata && Object.keys(step.metadata).length > 0 && (
                        <div className="step-metadata">
                          {Object.entries(step.metadata).map(([key, value]) => (
                            <span key={key} className="metadata-item">
                              {key}: {String(value)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </details>
      </div>
    );
  };

  const getStepIcon = (type: string) => {
    const icons = {
      intent_parsing: '🎯',
      context_analysis: '🔍', 
      cypher_generation: '⚙️',
      result_formatting: '📝',
      clarification: '❓',
      validation: '✅'
    };
    return icons[type as keyof typeof icons] || '📋';
  };

  const formatStepType = (type: string) => {
    return type.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  const formatReasoningData = (text: string) => {
    if (!text) return '';
    
    // Try to parse as JSON and format nicely
    try {
      const parsed = JSON.parse(text);
      return JSON.stringify(parsed, null, 2);
    } catch (e) {
      // Not JSON, return as-is
      return text;
    }
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

    // Collect all the components that might render
    const clarificationComponent = renderClarificationOptions();
    const mutationComponent = renderMutationConfirmation();
    const visualizationComponent = renderVisualizationConfirmation();
    const exampleQuestionsComponent = renderExampleQuestions();
    
    const hasNodes = message.queryResult && 
                    message.queryResult.graphData && 
                    message.queryResult.graphData.nodes && 
                    message.queryResult.graphData.nodes.length > 0;
                    
    const nodesComponent = hasNodes && message.queryResult ? (
      <div className="found-nodes">
        <div className="node-list">
          {message.queryResult.graphData.nodes.slice(0, 10).map(node => (
            <button
              key={node.id}
              className={`node-chip clickable ${node.group.toLowerCase()}`}
              onClick={() => onNavigateToNode?.(node.id)}
              title={`Click to focus on ${node.label}`}
            >
              {node.label}
            </button>
          ))}
          {message.queryResult.graphData.nodes.length > 10 && (
            <span className="more-indicator">
              +{message.queryResult.graphData.nodes.length - 10} more
            </span>
          )}
        </div>
      </div>
    ) : null;
    
    const reasoningComponent = renderReasoningInfo();
    const hasValidCypher = message.queryResult && message.queryResult.cypherQuery && message.queryResult.cypherQuery.trim() !== '';
    const queryResultComponent = (reasoningComponent || hasValidCypher) && message.queryResult ? (
      <>
        {reasoningComponent}
        <QueryResult 
          queryResult={message.queryResult}
          onApplyToGraph={onApplyQueryResult}
          onNavigateToNode={onNavigateToNode}
        />
      </>
    ) : null;
    
    // Only create the wrapper if there's actual content beyond just the message text
    const hasExtraContent = clarificationComponent || 
                           mutationComponent || 
                           visualizationComponent ||
                           exampleQuestionsComponent || 
                           nodesComponent || 
                           queryResultComponent;

    return (
      <div className="chat-message-content">
        {/* Only show main content if there's no clarification request, since clarification renders its own message */}
        {!message.clarificationRequest && <p>{message.content}</p>}
        {hasExtraContent && (
          <>
            {clarificationComponent}
            {mutationComponent}
            {visualizationComponent}
            {exampleQuestionsComponent}
            {nodesComponent}
            {queryResultComponent}
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