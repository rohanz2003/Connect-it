import React, { useState, useRef, useEffect, useCallback } from "react";
import { sendAiMessage } from "../services/aiService";
import Avatar from "./Avatar";
import { Send, Trash2, Loader2, Sparkles } from "lucide-react";

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

    const userMsg = { role: "user", content: text };
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
          { role: "assistant", content: streamRef.current },
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

  return (
    <div className="ai-chat-container">
      <div className="ai-chat-messages">
        <div className="ai-welcome">
          <div className="ai-welcome-avatar">
            <Sparkles size={24} />
          </div>
          <h3>AI Assistant</h3>
          <p>
            Hi! I'm your AI assistant. Ask me anything — homework help, coding,
            writing, general knowledge, daily life tips, and more!
          </p>
        </div>

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`ai-message ${msg.role === "user" ? "ai-user" : "ai-assistant"}`}
          >
            {msg.role === "assistant" && (
              <div className="ai-msg-avatar">
                <Avatar email="ai_assistant" size={32} />
              </div>
            )}
            <div className="ai-msg-content">
              <div className="ai-msg-bubble">{msg.content}</div>
            </div>
          </div>
        ))}

        {streamingContent && (
          <div className="ai-message ai-assistant">
            <div className="ai-msg-avatar">
              <Avatar email="ai_assistant" size={32} />
            </div>
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
            <div className="ai-msg-avatar">
              <Avatar email="ai_assistant" size={32} />
            </div>
            <div className="ai-msg-content">
              <div className="ai-msg-bubble ai-typing">
                <Loader2 size={16} className="ai-spin" />
                <span>Thinking...</span>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="ai-error">
            <span>⚠️ {error}</span>
          </div>
        )}

        <div ref={endRef} />
      </div>

      <div className="ai-chat-footer">
        <button
          className="ai-new-chat-btn"
          onClick={handleNewChat}
          title="New conversation"
          disabled={isLoading}
        >
          <Trash2 size={16} />
        </button>
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
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}

export default AiChat;
