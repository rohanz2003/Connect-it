import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trash2,
  ChevronDown,
  X,
  LogOut,
  Settings,
} from "lucide-react";
import { auth } from "../firebase";
import { useChatSocket } from "../hooks/useChatSocket";
import { formatLastSeen, formatMessageTime } from "../utils/timeFormatter";
import { archiveChat as archiveChatService, clearAllChats as clearAllChatsService, fetchMessages } from "../services/messageService";
import { useNavigate } from "react-router-dom";
import Avatar from "./Avatar";
import Sidebar from "./Sidebar";
import ChatMessages from "./ChatMessages";
import ChatInput from "./ChatInput";
import ErrorBoundary from "./ErrorBoundary";
import "./Chat.css";

const normalizeEmail = (email) => (email || "").toLowerCase().trim();

function Chat({ user: currentUser }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(() => {
    if (currentUser) return currentUser;
    const saved = localStorage.getItem("user");
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { return null; }
    }
    return null;
  });

  const [selectedUser, setSelectedUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [message, setMessage] = useState("");
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem("theme") === "dark");
  const [isChatMinimized, setIsChatMinimized] = useState(false);
  const [zoomedImage, setZoomedImage] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newBio, setNewBio] = useState("");
  const [tempProfilePic, setTempProfilePic] = useState(null);
  const [isMediaSending, setIsMediaSending] = useState(false);

  // Pagination state
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [oldestTimestamp, setOldestTimestamp] = useState(null);
  const [isNearBottom, setIsNearBottom] = useState(true);

  const emojiPickerRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const lastTypingEmitRef = useRef(0);
  const messagesEndRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const prevMessagesLengthRef = useRef(0);

  const {
    onlineUsers,
    chatHistory,
    setChatHistory,
    messages,
    setMessages,
    typingUser,
    lastSeen,
    unreadMessages,
    setUnreadMessages,
    userMetadata,
    setUserMetadata,
    userProfiles,
    setUserProfiles,
    socket
  } = useChatSocket(user, selectedUser, setSelectedUser);

  useEffect(() => {
    document.body.classList.toggle("dark-mode", isDarkMode);
    localStorage.setItem("theme", isDarkMode ? "dark" : "light");
  }, [isDarkMode]);

  const handleZoomImage = useCallback((src) => {
    setZoomedImage(src);
  }, []);

  const getDisplayName = useCallback((email) => {
    if (!email || typeof email !== 'string') return "User";
    const lowerEmail = email.toLowerCase();
    return userMetadata[lowerEmail]?.displayName || (user?.email?.toLowerCase() === lowerEmail ? user?.displayName : null) || email.split("@")[0];
  }, [userMetadata, user]);

  const renderAvatar = useCallback((email, size = "md", customSrc = null) => {
    if (!email) return null;
    const lowerEmail = email.toLowerCase();
    const isMe = user && lowerEmail === user.email.toLowerCase();
    const metadata = userMetadata[lowerEmail];
    const src = customSrc || (isMe ? user?.profilePic : metadata?.profilePic) || userProfiles[lowerEmail];
    const name = (isMe ? user?.displayName : metadata?.displayName) || email.split('@')[0];

    return (
      <Avatar 
        email={lowerEmail}
        name={name}
        src={src}
        size={size}
        onClick={src ? (e) => {
          e.stopPropagation();
          handleZoomImage(src);
        } : undefined}
      />
    );
  }, [user, userMetadata, userProfiles, handleZoomImage]);

  const loadMoreMessages = async () => {
    if (!user || !selectedUser || !hasMore || isLoadingMore || !oldestTimestamp) return;

    setIsLoadingMore(true);
    try {
      const response = await fetchMessages(user.email, selectedUser, oldestTimestamp);
      const olderMessages = response.messages || [];
      
      setHasMore(response.hasMore);
      setOldestTimestamp(response.oldestTimestamp);

      if (olderMessages.length > 0) {
        const container = scrollContainerRef.current;
        const previousScrollHeight = container.scrollHeight;

        setMessages(prev => {
          const combined = [...olderMessages, ...prev];
          // Simple sort as older messages are fetched
          return combined.sort((a, b) => new Date(a.timestamp || a.createdAt) - new Date(b.timestamp || b.createdAt));
        });

        requestAnimationFrame(() => {
          if (container) {
            container.scrollTop = container.scrollHeight - previousScrollHeight;
          }
        });
      }
    } catch (err) {
      console.error("Error loading more messages:", err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleScrollEvent = useCallback(() => {
    if (!scrollContainerRef.current) return;
    const container = scrollContainerRef.current;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    setIsNearBottom(distanceFromBottom < 100);

    if (container.scrollTop < 100 && hasMore && !isLoadingMore) {
      loadMoreMessages();
    }
  }, [hasMore, isLoadingMore, oldestTimestamp]);

  useEffect(() => {
    if (messagesEndRef.current) {
      const container = messagesEndRef.current.parentElement;
      scrollContainerRef.current = container;
      container.addEventListener("scroll", handleScrollEvent);
      return () => container.removeEventListener("scroll", handleScrollEvent);
    }
  }, [handleScrollEvent]);

  useEffect(() => {
    if (!messagesEndRef.current) return;
    const isNewMessageAdded = messages.length > prevMessagesLengthRef.current;
    prevMessagesLengthRef.current = messages.length;
    const lastMsg = messages[messages.length - 1];
    const isMyMessage = lastMsg?.sender?.toLowerCase() === user?.email?.toLowerCase();

    if (isNewMessageAdded && (isNearBottom || isMyMessage)) {
      requestAnimationFrame(() => {
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
        }
      });
    }
  }, [messages, user, isNearBottom]);

  const stopTyping = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    if (user && selectedUser && socket?.connected) {
      socket.emit("stop-typing", { from: normalizeEmail(user.email), to: normalizeEmail(selectedUser) });
    }
  }, [user, selectedUser, socket]);

  const handleTyping = (e) => {
    const val = e.target.value;
    setMessage(val);
    if (!user || !selectedUser || !socket) return;
    if (val.trim() === "") { stopTyping(); return; }

    const now = Date.now();
    if (now - lastTypingEmitRef.current > 2000) {
      socket.emit("typing", { from: normalizeEmail(user.email), to: normalizeEmail(selectedUser) });
      lastTypingEmitRef.current = now;
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(stopTyping, 3000);
  };

  const sendMessage = useCallback(() => {
    if (!user || !selectedUser || !message.trim() || !socket?.connected) return;

    const tempId = `${Date.now()}-${Math.random()}`;
    const newMsg = {
      sender: user.email,
      receiver: selectedUser,
      text: message,
      type: "text",
      tempId: tempId,
      timestamp: new Date().toISOString()
    };

    if (replyTo) {
      newMsg.replyTo = {
        id: replyTo._id || replyTo.tempId,
        text: replyTo.type === 'media' ? 'Media file' : replyTo.text,
        sender: replyTo.sender
      };
    }

    const optimisticMsg = { ...newMsg, pending: true, _id: tempId };
    const partner = normalizeEmail(selectedUser);

    setChatHistory(prev => ({
      ...prev,
      [partner]: [...(prev[partner] || []), optimisticMsg]
    }));
    setMessages(prev => [...prev, optimisticMsg]);

    socket.emit("send-message", newMsg, (ack) => {
      if (!ack || ack.ok === false) {
        setMessages(prev => prev.map(m => m.tempId === tempId ? { ...m, failed: true, pending: false } : m));
      }
    });

    stopTyping();
    setMessage("");
    setReplyTo(null);
  }, [user, selectedUser, message, socket, replyTo, stopTyping, setChatHistory, setMessages]);

  const handleMediaShare = useCallback((e) => {
    const file = e.target.files[0];
    if (!file || !user || !selectedUser || !socket?.connected || isMediaSending) return;

    const isImage = file.type.startsWith('image/');
    
    // For images, we compress. For other files, we check size.
    if (!isImage && file.size > 10 * 1024 * 1024) {
      alert(`File size too large (max 10MB).`);
      return;
    }

    setIsMediaSending(true);
    const reader = new FileReader();
    
    reader.onload = (event) => {
      if (isImage) {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const MAX_WIDTH = 1200;
          const MAX_HEIGHT = 1200;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);
          
          // Compress to JPEG with 0.7 quality
          const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.7);
          sendMediaMessage(file.name, file.type, file.size, compressedDataUrl);
        };
        img.src = event.target.result;
      } else {
        sendMediaMessage(file.name, file.type, file.size, event.target.result);
      }
    };

    const sendMediaMessage = (name, type, size, data) => {
      const tempId = `${Date.now()}-${Math.random()}`;
      const newMsg = {
        sender: user.email,
        receiver: selectedUser,
        text: { name, type, size, data },
        type: "media",
        mediaType: type.split('/')[0],
        tempId: tempId,
        timestamp: new Date().toISOString()
      };

      const optimisticMsg = { ...newMsg, pending: true, _id: tempId };
      const partner = normalizeEmail(selectedUser);

      setChatHistory(prev => ({ ...prev, [partner]: [...(prev[partner] || []), optimisticMsg] }));
      setMessages(prev => [...prev, optimisticMsg]);

      socket.emit("send-message", newMsg, (ack) => {
        if (!ack || ack.ok === false) {
          setMessages(prev => prev.map(m => m.tempId === tempId ? { ...m, failed: true, pending: false } : m));
        }
      });
      setIsMediaSending(false);
    };

    reader.readAsDataURL(file);
  }, [user, selectedUser, socket, isMediaSending, setChatHistory, setMessages]);

  const handleClearCurrentChat = () => {
    if (!selectedUser || !socket?.connected) return;
    if (window.confirm("Clear all messages in this chat?")) {
      socket.emit("clear-chat", { user1: normalizeEmail(user.email), user2: normalizeEmail(selectedUser), keepInRecent: true });
      setMessages([]);
    }
  };

  const handleClearAllHistory = useCallback(async () => {
    if (!user || !window.confirm("Clear all recent chats?")) return;
    try {
      await clearAllChatsService(user.email);
      setChatHistory({});
      setMessages([]);
      setUnreadMessages({});
      setSelectedUser(null);
    } catch (err) { console.error(err); }
  }, [user, setChatHistory, setMessages, setUnreadMessages]);

  const handleArchiveChat = useCallback(async (e, partnerEmail) => {
    if (e) e.stopPropagation();
    try {
      await archiveChatService(user.email, partnerEmail);
      const partner = normalizeEmail(partnerEmail);
      setChatHistory(prev => {
        const next = { ...prev };
        delete next[partner];
        return next;
      });
      if (normalizeEmail(selectedUser) === partner) {
        setSelectedUser(null);
        setMessages([]);
      }
    } catch (err) { console.error(err); }
  }, [user, selectedUser, setChatHistory, setMessages]);

  const handleRemoveChatFromRecent = useCallback((e, partnerEmail) => {
    if (e) e.stopPropagation();
    if (!window.confirm(`Remove from recent chats?`)) return;
    const partner = normalizeEmail(partnerEmail);
    socket.emit("clear-chat", { user1: normalizeEmail(user.email), user2: partner });
    setChatHistory(prev => {
      const next = { ...prev };
      delete next[partner];
      return next;
    });
    if (normalizeEmail(selectedUser) === partner) {
      setSelectedUser(null);
      setMessages([]);
    }
  }, [user, socket, selectedUser, setChatHistory, setMessages]);

  const handleSaveSettings = () => {
    const displayName = newDisplayName.trim() || user.email.split('@')[0];
    const profilePic = tempProfilePic !== null ? tempProfilePic : user.profilePic;
    const bio = newBio;
    const updatedUser = { ...user, displayName, profilePic, bio };
    setUser(updatedUser);
    localStorage.setItem("user", JSON.stringify(updatedUser));
    socket.emit("update-profile", { email: user.email, profilePic, displayName, bio });
    setShowSettings(false);
  };

  if (!user) return <div className="loading">Loading...</div>;

  return (
    <ErrorBoundary>
      <div className={`chat-layout ${isDarkMode ? "dark" : ""}`}>
        <Sidebar 
          user={user}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          isDarkMode={isDarkMode}
          setIsDarkMode={setIsDarkMode}
          selectedUser={selectedUser}
          handleUserSelect={setSelectedUser}
          onlineUsers={onlineUsers}
          chatHistory={chatHistory}
          userMetadata={userMetadata}
          lastSeen={lastSeen}
          unreadMessages={unreadMessages}
          handleClearAllHistory={handleClearAllHistory}
          handleArchiveChat={handleArchiveChat}
          handleRemoveChatFromRecent={handleRemoveChatFromRecent}
          renderAvatar={renderAvatar}
          navigate={navigate}
          setSelectedUser={setSelectedUser}
        />

        <main className="chat-panel">
          <div className="chat-panel-header">
            <div className="chat-panel-title">
              {renderAvatar(selectedUser, "md")}
              <div>
                <h3>{selectedUser ? getDisplayName(selectedUser) : "Connect Messenger"}</h3>
                <p>{selectedUser ? (onlineUsers.includes(selectedUser) ? "Online" : formatLastSeen(lastSeen[selectedUser])) : "Select a chat to start"}</p>
              </div>
            </div>
            <div className="chat-header-actions">
              {selectedUser && (
                <button className="secondary-btn" onClick={handleClearCurrentChat}><Trash2 size={16} /> Clear</button>
              )}
              <button className="icon-btn" onClick={() => setShowSettings(true)}><Settings size={18} /></button>
              <button className="logout-btn" onClick={() => setShowLogoutConfirm(true)}><LogOut size={16} /> Logout</button>
            </div>
          </div>

          <div className="chat-content">
            {selectedUser ? (
              <>
                <ChatMessages 
                  messages={messages}
                  user={user}
                  handleContextMenu={(e, msg) => { e.preventDefault(); setContextMenu({ x: e.pageX, y: e.pageY, message: msg }); }}
                  handleZoomImage={handleZoomImage}
                  renderAvatar={renderAvatar}
                  formatMessageTime={formatMessageTime}
                  formatDay={(t) => new Date(t).toLocaleDateString()}
                  messagesEndRef={messagesEndRef}
                  isLoadingMore={isLoadingMore}
                  hasMore={hasMore}
                />
                <ChatInput 
                  message={message}
                  handleTyping={handleTyping}
                  sendMessage={sendMessage}
                  showEmojiPicker={showEmojiPicker}
                  setShowEmojiPicker={setShowEmojiPicker}
                  emojiPickerRef={emojiPickerRef}
                  onEmojiClick={(emoji) => setMessage(prev => prev + emoji.emoji)}
                  handleMediaShare={handleMediaShare}
                  replyTo={replyTo}
                  setReplyTo={setReplyTo}
                  isMediaSending={isMediaSending}
                  userMetadata={userMetadata}
                />
              </>
            ) : (
              <div className="welcome-screen">Select a user to start chatting</div>
            )}
          </div>
        </main>

        {showSettings && (
          <div className="modal-overlay" onClick={() => setShowSettings(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <h3>Profile Settings</h3>
              <input type="text" value={newDisplayName} onChange={e => setNewDisplayName(e.target.value)} placeholder="Display Name" />
              <textarea value={newBio} onChange={e => setNewBio(e.target.value)} placeholder="Bio" />
              <button onClick={handleSaveSettings}>Save</button>
              <button onClick={() => setShowSettings(false)}>Cancel</button>
            </div>
          </div>
        )}

        {showLogoutConfirm && (
          <div className="modal-overlay" onClick={() => setShowLogoutConfirm(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <h3>Logout?</h3>
              <button onClick={() => { auth.signOut(); navigate("/login"); }}>Yes</button>
              <button onClick={() => setShowLogoutConfirm(false)}>No</button>
            </div>
          </div>
        )}

        {zoomedImage && (
          <div className="zoom-overlay" onClick={() => setZoomedImage(null)}>
            <img src={zoomedImage} alt="Zoomed" />
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}

export default Chat;
