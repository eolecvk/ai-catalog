import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ChatMessage as ChatMessageType, ChatQueryResult, ChatApiRequest, ChatApiResponse } from '../types';
import ChatMessage from './ChatMessage';
import { chatApi } from '../utils/api';

interface ChatInterfaceProps {
  onApplyQueryResult?: (queryResult: ChatQueryResult) => void;
  onNavigateToNode?: (nodeId: string) => void;
  graphContext?: {
    currentNodeType?: string;
    selectedNodes?: string[];
    graphVersion?: string;
  };
}

export interface ChatInterfaceRef {
  sendExampleQuestion: (question: string) => Promise<void>;
}

interface BackoffStatus {
  isRetrying: boolean;
  provider: string | null;
  remainingWaitMs: number;
  waitSeconds: number;
  message: string;
  quotaExceeded?: boolean;
  allProvidersInCooldown?: boolean;
  attempt?: number;
  maxAttempts?: number;
}

const ChatInterface = forwardRef<ChatInterfaceRef, ChatInterfaceProps>(({ 
  onApplyQueryResult,
  onNavigateToNode,
  graphContext 
}, ref) => {
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [currentInput, setCurrentInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [backoffStatus, setBackoffStatus] = useState<BackoffStatus | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const backoffPollingRef = useRef<NodeJS.Timeout | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // Backoff status polling
  const pollBackoffStatus = async () => {
    try {
      const status = await chatApi.getBackoffStatus();
      
      if (status.isRetrying) {
        setBackoffStatus(status);
      } else {
        setBackoffStatus(null);
        // Stop polling when no longer retrying
        if (backoffPollingRef.current) {
          clearInterval(backoffPollingRef.current);
          backoffPollingRef.current = null;
        }
      }
    } catch (error) {
      console.error('Failed to poll backoff status:', error);
      
      // If it's a 404, the endpoint doesn't exist or routing is wrong
      if (error instanceof Error && error.message.includes('404')) {
        console.warn('Backoff status endpoint not found (404). Stopping polling.');
        if (backoffPollingRef.current) {
          clearInterval(backoffPollingRef.current);
          backoffPollingRef.current = null;
        }
        return;
      }
      
      // For JSON parsing errors, also stop polling to avoid spam
      if (error instanceof Error && error.message.includes('JSON.parse')) {
        console.warn('JSON parsing error in backoff status - stopping polling');
        if (backoffPollingRef.current) {
          clearInterval(backoffPollingRef.current);
          backoffPollingRef.current = null;
        }
      }
    }
  };

  const startBackoffPolling = () => {
    if (backoffPollingRef.current) return; // Already polling
    
    // Poll immediately, then every second
    pollBackoffStatus();
    backoffPollingRef.current = setInterval(pollBackoffStatus, 1000);
  };

  const stopBackoffPolling = () => {
    if (backoffPollingRef.current) {
      clearInterval(backoffPollingRef.current);
      backoffPollingRef.current = null;
    }
    setBackoffStatus(null);
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (backoffPollingRef.current) {
        clearInterval(backoffPollingRef.current);
      }
    };
  }, []);

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    sendExampleQuestion: handleExampleQuestionClick
  }));

  const generateMessageId = () => {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  };

  const handleClarificationResponse = async (response: string) => {
    await sendMessage(response);
  };

  const handleExampleQuestionClick = async (question: string) => {
    await sendMessage(question);
  };

  const handleMutationConfirm = async (mutationPlan: any) => {
    try {
      const result = await chatApi.executeMutation(mutationPlan);

      const resultMessage: ChatMessageType = {
        id: generateMessageId(),
        type: result.success ? 'assistant' : 'system',
        content: result.message || (result.success ? 'Changes applied successfully!' : 'Failed to apply changes.'),
        timestamp: new Date(),
        queryResult: result.queryResult
      };

      setMessages(prev => [...prev, resultMessage]);

      // If mutation was successful and has graph data, apply it
      if (result.success && result.queryResult && result.queryResult.graphData && onApplyQueryResult) {
        onApplyQueryResult(result.queryResult);
      }
    } catch (error) {
      console.error('Mutation execution error:', error);
      const errorMessage: ChatMessageType = {
        id: generateMessageId(),
        type: 'system',
        content: 'Failed to execute changes. Please try again.',
        timestamp: new Date()
      };

      setMessages(prev => [...prev, errorMessage]);
    }
  };

  const handleMutationCancel = () => {
    const cancelMessage: ChatMessageType = {
      id: generateMessageId(),
      type: 'assistant',
      content: 'Changes cancelled. No modifications were made to your graph.',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, cancelMessage]);
  };

  const handleVisualizationConfirm = (graphData: { nodes: any[], edges: any[] }) => {
    console.log('🎯 VISUALIZATION CONFIRM START');
    console.log('📊 Graph data to apply:', {
      nodeCount: graphData.nodes.length,
      edgeCount: graphData.edges.length,
      sampleNodes: graphData.nodes.slice(0, 3),
      sampleEdges: graphData.edges.slice(0, 3)
    });
    
    if (onApplyQueryResult) {
      console.log('📡 Calling onApplyQueryResult with graph data...');
      const queryResult = { 
        cypherQuery: 'MATCH p=(n)-[*0..5]-(m) RETURN p', // Include the original query
        graphData: graphData,
        summary: 'Graph visualization applied via confirmation'
      };
      console.log('📤 Query result object:', queryResult);
      
      onApplyQueryResult(queryResult);
      console.log('✅ onApplyQueryResult called successfully');
    } else {
      console.error('❌ onApplyQueryResult callback not available!');
    }

    // Replace the last message (confirmation) with a success message
    const confirmMessage: ChatMessageType = {
      id: generateMessageId(),
      type: 'assistant',
      content: `✅ Graph visualization updated with ${graphData.nodes.length} nodes and ${graphData.edges.length} edges.`,
      timestamp: new Date(),
      queryResult: {
        cypherQuery: 'MATCH p=(n)-[*0..5]-(m) RETURN p',
        graphData: graphData,
        summary: 'Graph visualization applied'
      }
    };

    // Replace the last message (which should be the confirmation) with the success message
    setMessages(prev => {
      const newMessages = [...prev];
      newMessages[newMessages.length - 1] = confirmMessage;
      return newMessages;
    });
    console.log('🎯 VISUALIZATION CONFIRM END - Replaced confirmation message with success message');
  };

  const handleVisualizationCancel = () => {
    const cancelMessage: ChatMessageType = {
      id: generateMessageId(),
      type: 'assistant',
      content: '❌ Graph visualization cancelled. Showing current graph state.',
      timestamp: new Date()
    };

    // Replace the last message (confirmation) with the cancel message  
    setMessages(prev => {
      const newMessages = [...prev];
      newMessages[newMessages.length - 1] = cancelMessage;
      return newMessages;
    });
  };

  const sendMessage = async (query: string) => {
    if (!query.trim() || isProcessing) return;

    const userMessage: ChatMessageType = {
      id: generateMessageId(),
      type: 'user',
      content: query,
      timestamp: new Date()
    };

    const processingMessage: ChatMessageType = {
      id: generateMessageId(),
      type: 'assistant',
      content: '',
      timestamp: new Date(),
      isProcessing: true
    };

    setMessages(prev => [...prev, userMessage, processingMessage]);
    setCurrentInput('');
    setIsProcessing(true);
    
    // Start polling for backoff status during processing
    startBackoffPolling();

    try {
      const data: ChatApiResponse = await chatApi.query(query, graphContext, messages);

      if (data.success) {
        // Handle visualization confirmation requests
        if (data.needsVisualizationConfirmation && data.queryResult) {
          const confirmationMessage: ChatMessageType = {
            id: generateMessageId(),
            type: 'assistant',
            content: data.message,
            timestamp: new Date(),
            visualizationConfirmation: {
              nodeCount: (data.queryResult as any).nodeCount || data.queryResult.graphData.nodes.length,
              edgeCount: (data.queryResult as any).edgeCount || data.queryResult.graphData.edges.length,
              graphData: data.queryResult.graphData,
              onConfirm: () => handleVisualizationConfirm(data.queryResult!.graphData),
              onCancel: () => handleVisualizationCancel()
            }
          };

          setMessages(prev => prev.slice(0, -1).concat(confirmationMessage));
        } else {
          const assistantMessage: ChatMessageType = {
            id: generateMessageId(),
            type: 'assistant',
            content: data.message,
            timestamp: new Date(),
            queryResult: data.queryResult
          };

          setMessages(prev => prev.slice(0, -1).concat(assistantMessage));

          // Automatically apply query result to graph if it has data
          if (data.queryResult && data.queryResult.graphData && 
              data.queryResult.graphData.nodes.length > 0 && onApplyQueryResult) {
            console.log('Automatically applying query result to graph');
            onApplyQueryResult(data.queryResult);
          }
        }
      } else {
        // Handle mutation confirmation requests
        if (data.needsConfirmation && data.mutationPlan) {
          const confirmationMessage: ChatMessageType = {
            id: generateMessageId(),
            type: 'assistant',
            content: data.message,
            timestamp: new Date(),
            mutationConfirmation: {
              plan: data.mutationPlan,
              onConfirm: () => handleMutationConfirm(data.mutationPlan!),
              onCancel: () => handleMutationCancel()
            }
          };

          setMessages(prev => prev.slice(0, -1).concat(confirmationMessage));
        }
        // Handle clarification requests
        else if (data.needsClarification) {
          const clarificationMessage: ChatMessageType = {
            id: generateMessageId(),
            type: 'assistant',
            content: data.message,
            timestamp: new Date(),
            clarificationRequest: {
              question: data.message,
              options: (data as any).suggestions || (data as any).corrected_entities || (data.needsClarification as any)?.options || [],
              context: (data as any).entity_issues || data.needsClarification
            }
          };

          setMessages(prev => prev.slice(0, -1).concat(clarificationMessage));
        } else {
          // Create detailed backend error message
          let errorContent = `**Backend Error:** ${data.error || 'Failed to process query'}`;
          
          // Add additional error context if available
          if ((data as any).executionLog && (data as any).executionLog.length > 0) {
            const failedSteps = (data as any).executionLog.filter((step: any) => !step.success);
            if (failedSteps.length > 0) {
              errorContent += `\n\n**Failed Steps:**`;
              failedSteps.forEach((step: any, index: number) => {
                errorContent += `\n${index + 1}. ${step.taskType}: ${step.result?.error || 'Unknown error'}`;
              });
            }
          }
          
          // Add timestamp and request ID for debugging
          if (process.env.NODE_ENV === 'development') {
            errorContent += `\n\n**Debug Info:**`;
            errorContent += `\n- Request ID: ${(data as any).requestId || 'N/A'}`;
            errorContent += `\n- Time: ${new Date().toISOString()}`;
            if ((data as any).failedAt) {
              errorContent += `\n- Failed at step: ${(data as any).failedAt}`;
            }
          }
          
          const errorMessage: ChatMessageType = {
            id: generateMessageId(),
            type: 'system',
            content: errorContent,
            timestamp: new Date()
          };

          setMessages(prev => prev.slice(0, -1).concat(errorMessage));
        }
      }
    } catch (error) {
      console.error('Chat API error:', error);
      
      // Create detailed error message for debugging
      let errorContent = 'Sorry, there was an error processing your request.';
      
      if (error instanceof Error) {
        errorContent += `\n\n**Error Details:**\n- ${error.message}`;
        
        // If it's a network error, show more details
        if (error.message.includes('fetch') || error.message.includes('network')) {
          errorContent += '\n- Check if the backend server is running on port 5004';
        }
      }
      
      // Add environment info for debugging
      if (process.env.NODE_ENV === 'development') {
        errorContent += `\n\n**Debug Info:**\n- Time: ${new Date().toISOString()}\n- Environment: ${process.env.NODE_ENV}\n- Backend: ${process.env.REACT_APP_BACKEND_PORT || 'default'}`;
      }
      
      const errorMessage: ChatMessageType = {
        id: generateMessageId(),
        type: 'system',
        content: errorContent,
        timestamp: new Date()
      };

      setMessages(prev => prev.slice(0, -1).concat(errorMessage));
    } finally {
      setIsProcessing(false);
      stopBackoffPolling();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(currentInput);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(currentInput);
    }
  };

  const resetChat = () => {
    const welcomeMessage: ChatMessageType = {
      id: generateMessageId(),
      type: 'assistant',
      content: 'Hi! I can help you explore the catalog. Try asking questions like:',
      timestamp: new Date(),
      exampleQuestions: [
        'Find projects for ANZ',
        'Show me painpoints for online banking',
        'Show projects that require an AI engineer',
        'What are the sectors with the most project opportunities'
      ]
    };
    setMessages([welcomeMessage]);
  };

  const addWelcomeMessage = () => {
    if (messages.length === 0) {
      resetChat();
    }
  };

  useEffect(() => {
    if (messages.length === 0) {
      addWelcomeMessage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="chat-interface open">
      <div className="chat-body">
          <div className="chat-messages">
            {messages.map(message => (
              <ChatMessage 
                key={message.id} 
                message={message} 
                onApplyQueryResult={onApplyQueryResult}
                onNavigateToNode={onNavigateToNode}
                onClarificationResponse={handleClarificationResponse}
                onExampleQuestionClick={handleExampleQuestionClick}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Backoff Status Indicator */}
          {backoffStatus && backoffStatus.isRetrying && (
            <div className={`backoff-status-indicator ${
              backoffStatus.quotaExceeded ? 'quota-exceeded' : 
              backoffStatus.allProvidersInCooldown ? 'all-cooldown' : ''
            }`}>
              <div className="backoff-content">
                <div className="backoff-icon">
                  {backoffStatus.quotaExceeded ? '📊' : backoffStatus.allProvidersInCooldown ? '⏰' : '🔄'}
                </div>
                <div className="backoff-text">
                  <div className="backoff-message">{backoffStatus.message}</div>
                  <div className="backoff-details">
                    {backoffStatus.attempt && backoffStatus.maxAttempts && (
                      <span className="attempt-info">
                        Attempt {backoffStatus.attempt}/{backoffStatus.maxAttempts}
                      </span>
                    )}
                    {backoffStatus.quotaExceeded && (
                      <span className="quota-info">Quota limits exceeded</span>
                    )}
                  </div>
                </div>
                <div className="backoff-timer">
                  <div className="timer-circle">
                    <div className="timer-text">{backoffStatus.waitSeconds}s</div>
                  </div>
                </div>
              </div>
              <div className="backoff-progress">
                <div 
                  className="backoff-progress-bar"
                  style={{
                    animation: `backoffCountdown ${backoffStatus.remainingWaitMs}ms linear`
                  }}
                />
              </div>
            </div>
          )}

          <form className="chat-input-form" onSubmit={handleSubmit}>
            <div className="chat-input-container">
              <button 
                type="button"
                className="reset-chat-btn"
                onClick={resetChat}
                disabled={messages.length === 1 && !!messages[0]?.exampleQuestions}
                title="Reset conversation"
              >
                🔄
              </button>
              <input
                ref={inputRef}
                type="text"
                value={currentInput}
                onChange={(e) => setCurrentInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask a question about the catalog..."
                className="chat-input"
                disabled={isProcessing}
              />
              <button 
                type="submit" 
                className="chat-send-btn"
                disabled={!currentInput.trim() || isProcessing}
              >
                {isProcessing ? '⏳' : '➤'}
              </button>
            </div>
          </form>
        </div>
    </div>
  );
});

ChatInterface.displayName = 'ChatInterface';

export default ChatInterface;