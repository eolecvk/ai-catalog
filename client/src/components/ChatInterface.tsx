import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage as ChatMessageType, ChatQueryResult, ChatApiRequest, ChatApiResponse } from '../types';
import ChatMessage from './ChatMessage';

interface ChatInterfaceProps {
  isOpen: boolean;
  onToggle: () => void;
  onApplyQueryResult?: (queryResult: ChatQueryResult) => void;
  graphContext?: {
    currentNodeType?: string;
    selectedNodes?: string[];
    graphVersion?: string;
  };
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ 
  isOpen, 
  onToggle, 
  onApplyQueryResult,
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
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const generateMessageId = () => {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  };

  const handleClarificationResponse = async (response: string) => {
    await sendMessage(response);
  };

  const handleExampleQuestionClick = async (question: string) => {
    await sendMessage(question);
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
        const assistantMessage: ChatMessageType = {
          id: generateMessageId(),
          type: 'assistant',
          content: data.message,
          timestamp: new Date(),
          queryResult: data.queryResult
        };

        setMessages(prev => prev.slice(0, -1).concat(assistantMessage));
      } else {
        // Handle clarification requests
        if (data.needsClarification) {
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

  const clearChat = () => {
    setMessages([]);
  };

  const addWelcomeMessage = () => {
    if (messages.length === 0) {
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
    }
  };

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      addWelcomeMessage();
    }
  }, [isOpen]);

  return (
    <div className={`chat-interface ${isOpen ? 'open' : 'closed'}`}>
      <div className="chat-header">
        <div className="chat-title">
          <span className="chat-icon">💬</span>
          <h3>Graph Query Assistant</h3>
        </div>
        <div className="chat-actions">
          <button 
            className="clear-chat-btn"
            onClick={clearChat}
            disabled={messages.length === 0}
            title="Clear conversation"
          >
            🗑️
          </button>
          <button 
            className="toggle-chat-btn"
            onClick={onToggle}
            title={isOpen ? 'Minimize chat' : 'Open chat'}
          >
            {isOpen ? '🔽' : '🔼'}
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="chat-body">
          <div className="chat-messages">
            {messages.map(message => (
              <ChatMessage 
                key={message.id} 
                message={message} 
                onApplyQueryResult={onApplyQueryResult}
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
      )}

      {!isOpen && (
        <div className="chat-minimized">
          <button 
            className="chat-expand-btn"
            onClick={onToggle}
            title="Open graph query assistant"
          >
            💬 Ask AI
          </button>
        </div>
      )}
    </div>
  );
};

export default ChatInterface;