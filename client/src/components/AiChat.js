import React, { useState, useRef, useEffect, useCallback } from "react";
import { sendAiMessage } from "../services/aiService";
import { Send } from "lucide-react";

const SUGGESTIONS = [
  "Explain quantum physics simply 🤔",
  "Help me write an email ✉️",
  "Best study tips for exams 📚",
  "Tell me a joke 😂",
];

function AiChat({ user }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [error, setError] = useState(null);
  const [streamingContent, setStreamingContent] = useState("");
  const abortRef = useRef(null);
  const endRef = useRef(null);
  const streamRef = useRef("");

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    setError(null);

    const userMsg = { role: "user", content: text, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);

    setIsLoading(true);
    setStreamingContent("");
    streamRef.current = "";

    abortRef.current = sendAiMessage(
      user.email,
      text,
      conversationId,
      (token) => {
        streamRef.current += token;
        setStreamingContent(streamRef.current);
      },
      (id) => {
        setConversationId(id);
      },
      (id) => {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: streamRef.current, timestamp: new Date() },
        ]);
        setStreamingContent("");
        streamRef.current = "";
        setIsLoading(false);
        setConversationId(id);
      },
      (err) => {
        setError(err);
        setIsLoading(false);
        setStreamingContent("");
        streamRef.current = "";
      }
    );
  }, [input, isLoading, conversationId, user.email]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewChat = () => {
    if (abortRef.current) abortRef.current.abort();
    setMessages([]);
    setConversationId(null);
    setStreamingContent("");
    setError(null);
    setIsLoading(false);
  };

  const formatTime = (d) =>
    new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="ai-chat-container">
      <div className="ai-chat-header">
        <div className="ai-chat-header-left">
          <div className="ai-chat-avatar">🤖</div>
          <div>
            <h3>AI Assistant</h3>
            <span className="ai-chat-status">● Online</span>
          </div>
        </div>
        <button className="ai-header-clear" onClick={handleNewChat} disabled={isLoading} title="New conversation">
          🗑️ Clear
        </button>
      </div>

      <div className="ai-chat-messages">
        {messages.length === 0 && (
          <div className="ai-welcome">
            <div className="ai-welcome-avatar">🤖</div>
            <h3>Hey there! 👋</h3>
            <p>
              I'm your AI assistant. I can help you with pretty much anything —
              studies, coding, daily life questions, creative writing, you name it!
              What's on your mind? 😊
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`ai-message ${msg.role === "user" ? "ai-user" : "ai-assistant"}`}
          >
            {msg.role === "assistant" && <div className="ai-msg-avatar">🤖</div>}
            <div className="ai-msg-content">
              <div className="ai-msg-bubble">{msg.content}</div>
              <div className="ai-msg-time">{formatTime(msg.timestamp)}</div>
            </div>
          </div>
        ))}

        {streamingContent && (
          <div className="ai-message ai-assistant">
            <div className="ai-msg-avatar">🤖</div>
            <div className="ai-msg-content">
              <div className="ai-msg-bubble ai-streaming">
                {streamingContent}
                <span className="ai-cursor" />
              </div>
            </div>
          </div>
        )}

        {isLoading && !streamingContent && (
          <div className="ai-message ai-assistant">
            <div className="ai-msg-avatar">🤖</div>
            <div className="ai-msg-content">
              <div className="ai-msg-bubble">
                <div className="ai-typing-dots">
                  <span /><span /><span />
                </div>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="ai-error">
            ⚠️ {error}
          </div>
        )}

        <div ref={endRef} />
      </div>

      {messages.length === 0 && !isLoading && (
        <div className="ai-suggestions">
          {SUGGESTIONS.map((q, i) => (
            <button key={i} className="ai-suggestion-btn" onClick={() => setInput(q)}>
              {q}
            </button>
          ))}
        </div>
      )}

      <div className="ai-chat-footer">
        <input
          type="text"
          placeholder="Ask me anything..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
        />
        <button
          className="ai-send-btn"
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
        >
          {isLoading ? "⏳" : <Send size={18} />}
        </button>
      </div>
    </div>
  );
}

export default AiChat;
