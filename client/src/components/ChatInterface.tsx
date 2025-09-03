import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage as ChatMessageType, ChatQueryResult, ChatApiRequest, ChatApiResponse } from '../types';
import ChatMessage from './ChatMessage';

interface ChatInterfaceProps {
  onApplyQueryResult?: (queryResult: ChatQueryResult) => void;
  onNavigateToNode?: (nodeId: string) => void;
  graphContext?: {
    currentNodeType?: string;
    selectedNodes?: string[];
    graphVersion?: string;
  };
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ 
  onApplyQueryResult,
  onNavigateToNode,
  graphContext 
}) => {
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [currentInput, setCurrentInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
      const response = await fetch('/api/chat/execute-mutation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mutationPlan }),
      });

      const result = await response.json();

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

    try {
      const requestBody: ChatApiRequest = {
        query,
        context: graphContext,
        conversationHistory: messages
      };

      const response = await fetch('/api/chat/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const data: ChatApiResponse = await response.json();

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
            clarificationRequest: data.needsClarification
          };

          setMessages(prev => prev.slice(0, -1).concat(clarificationMessage));
        } else {
          const errorMessage: ChatMessageType = {
            id: generateMessageId(),
            type: 'system',
            content: `Error: ${data.error || 'Failed to process query'}`,
            timestamp: new Date()
          };

          setMessages(prev => prev.slice(0, -1).concat(errorMessage));
        }
      }
    } catch (error) {
      console.error('Chat API error:', error);
      const errorMessage: ChatMessageType = {
        id: generateMessageId(),
        type: 'system',
        content: 'Sorry, there was an error processing your request. Please try again.',
        timestamp: new Date()
      };

      setMessages(prev => prev.slice(0, -1).concat(errorMessage));
    } finally {
      setIsProcessing(false);
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
      content: 'Hi! I can help you explore your graph data. Try asking questions like:',
      timestamp: new Date(),
      exampleQuestions: [
        'Show me all industries',
        'Find pain points in banking',
        'What projects are available for retail?',
        'Show relationships between sectors and departments'
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
  }, []);

  return (
    <div className="chat-interface open">
      <div className="chat-header">
        <div className="chat-title">
          <span className="chat-icon">💬</span>
          <h3>Graph Query Assistant</h3>
        </div>
        <div className="chat-actions">
          <button 
            className="reset-chat-btn"
            onClick={resetChat}
            disabled={messages.length === 1 && !!messages[0]?.exampleQuestions}
            title="Reset conversation"
          >
            🔄
          </button>
        </div>
      </div>

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

          <form className="chat-input-form" onSubmit={handleSubmit}>
            <div className="chat-input-container">
              <input
                ref={inputRef}
                type="text"
                value={currentInput}
                onChange={(e) => setCurrentInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask a question about your graph data..."
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
};

export default ChatInterface;