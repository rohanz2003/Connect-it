import React, { useState, useEffect, useRef } from 'react';
import { Send, Trash2, Sparkles, Loader2, MessageSquare } from 'lucide-react';
import './AIChat.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const AIChat = ({ socket, user, onClose }) => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);
  const streamingTempId = useRef(null);

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessage, isTyping]);

  // Load conversation history
  useEffect(() => {
    const loadHistory = async () => {
      if (!user?.email) return;

      try {
        const response = await fetch(
          `${API_URL}/api/ai/conversation/${encodeURIComponent(user.email)}`
        );
        const data = await response.json();

        if (data.success && data.messages) {
          setMessages(data.messages);
        }
      } catch (error) {
        console.error('Failed to load AI conversation:', error);
      }
    };

    loadHistory();
  }, [user]);

  // Setup socket listeners
  useEffect(() => {
    if (!socket) return;

    const handleAITyping = () => {
      setIsTyping(true);
    };

    const handleStreamChunk = (data) => {
      if (data.tempId === streamingTempId.current) {
        setStreamingMessage((prev) => prev + data.chunk);
        setIsTyping(false);
      }
    };

    const handleStreamComplete = (data) => {
      if (data.tempId === streamingTempId.current) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: data.response,
            timestamp: data.timestamp,
          },
        ]);
        setStreamingMessage('');
        setIsTyping(false);
        setIsSending(false);
        streamingTempId.current = null;
      }
    };

    const handleAIError = (data) => {
      if (data.tempId === streamingTempId.current) {
        setError(data.error || 'An error occurred');
        setStreamingMessage('');
        setIsTyping(false);
        setIsSending(false);
        streamingTempId.current = null;

        // Clear error after 5 seconds
        setTimeout(() => setError(null), 5000);
      }
    };

    socket.on('ai-typing', handleAITyping);
    socket.on('ai-stream-chunk', handleStreamChunk);
    socket.on('ai-stream-complete', handleStreamComplete);
    socket.on('ai-error', handleAIError);

    return () => {
      socket.off('ai-typing', handleAITyping);
      socket.off('ai-stream-chunk', handleStreamChunk);
      socket.off('ai-stream-complete', handleStreamComplete);
      socket.off('ai-error', handleAIError);
    };
  }, [socket]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isSending || !user?.email) return;

    const userMessage = inputMessage.trim();
    setInputMessage('');
    setIsSending(true);
    setError(null);

    // Add user message to UI
    const newUserMessage = {
      role: 'user',
      content: userMessage,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, newUserMessage]);

    // Generate temp ID for this request
    const tempId = `temp_${Date.now()}_${Math.random()}`;
    streamingTempId.current = tempId;
    setStreamingMessage('');

    // Send via socket for streaming
    if (socket && socket.connected) {
      socket.emit('ai-message', {
        userId: user.email,
        message: userMessage,
        tempId,
      });
    } else {
      // Fallback to REST API if socket not available
      try {
        const response = await fetch(`${API_URL}/api/ai/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.email,
            message: userMessage,
          }),
        });

        const data = await response.json();

        if (data.success) {
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: data.response,
              timestamp: data.timestamp,
            },
          ]);
        } else {
          throw new Error(data.error || 'Failed to get response');
        }
      } catch (error) {
        console.error('AI message error:', error);
        setError(error.message || 'Failed to send message');
      } finally {
        setIsSending(false);
        streamingTempId.current = null;
      }
    }
  };

  const handleClearConversation = async () => {
    if (!window.confirm('Are you sure you want to clear this conversation?')) {
      return;
    }

    if (socket && socket.connected) {
      socket.emit('clear-ai-conversation', { userId: user.email });
      setMessages([]);
    } else {
      try {
        await fetch(
          `${API_URL}/api/ai/conversation/${encodeURIComponent(user.email)}`,
          { method: 'DELETE' }
        );
        setMessages([]);
      } catch (error) {
        console.error('Failed to clear conversation:', error);
      }
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="ai-chat-container">
      {/* Header */}
      <div className="ai-chat-header">
        <div className="ai-header-left">
          <div className="ai-avatar-wrapper">
            <MessageSquare className="ai-avatar-icon" size={24} strokeWidth={2.5} />
            <Sparkles className="ai-sparkle" size={12} />
          </div>
          <div className="ai-header-info">
            <h3>AI Assistant</h3>
            <p>Powered by Llama 3.1</p>
          </div>
        </div>
        <button
          className="ai-clear-btn"
          onClick={handleClearConversation}
          title="Clear conversation"
          disabled={messages.length === 0}
        >
          <Trash2 size={18} />
        </button>
      </div>

      {/* Messages */}
      <div className="ai-messages-container">
        {messages.length === 0 && !streamingMessage && (
          <div className="ai-welcome">
            <div className="ai-welcome-icon-wrapper">
              <MessageSquare className="ai-welcome-icon" size={64} strokeWidth={2} />
              <Sparkles className="ai-welcome-sparkle" size={24} />
            </div>
            <h2>Hi! I'm your AI Assistant</h2>
            <p>I can help you with:</p>
            <ul>
              <li>📚 Homework & Study Help</li>
              <li>💻 Coding & Programming</li>
              <li>✍️ Writing & Essays</li>
              <li>🧮 Math & Science</li>
              <li>🌍 General Knowledge</li>
              <li>💡 Daily Life Advice</li>
            </ul>
            <p className="ai-welcome-cta">Ask me anything!</p>
          </div>
        )}

        {messages.map((msg, index) => (
          <div
            key={index}
            className={`ai-message ${msg.role === 'user' ? 'ai-message-user' : 'ai-message-bot'}`}
          >
            {msg.role === 'assistant' && (
              <div className="ai-message-avatar">
                <MessageSquare size={18} strokeWidth={2.5} />
              </div>
            )}
            <div className="ai-message-content">
              <div className="ai-message-text">{msg.content}</div>
              <div className="ai-message-time">{formatTime(msg.timestamp)}</div>
            </div>
          </div>
        ))}

        {/* Streaming message */}
        {streamingMessage && (
          <div className="ai-message ai-message-bot ai-message-streaming">
            <div className="ai-message-avatar">
              <MessageSquare size={18} strokeWidth={2.5} />
            </div>
            <div className="ai-message-content">
              <div className="ai-message-text">{streamingMessage}</div>
            </div>
          </div>
        )}

        {/* Typing indicator */}
        {isTyping && !streamingMessage && (
          <div className="ai-message ai-message-bot">
            <div className="ai-message-avatar">
              <MessageSquare size={18} strokeWidth={2.5} />
            </div>
            <div className="ai-typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="ai-error-message">
            <span>⚠️ {error}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="ai-input-container">
        <div className="ai-input-wrapper">
          <textarea
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask me anything..."
            disabled={isSending}
            rows={1}
            className="ai-input"
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputMessage.trim() || isSending}
            className="ai-send-btn"
          >
            {isSending ? (
              <Loader2 className="ai-spinner" size={20} />
            ) : (
              <Send size={20} />
            )}
          </button>
        </div>
        <p className="ai-disclaimer">
          AI responses may not always be accurate. Verify important information.
        </p>
      </div>
    </div>
  );
};

export default AIChat;
