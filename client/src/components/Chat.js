import React, { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import EmojiPicker from "emoji-picker-react";
import { Search, MessageCircle, PlusCircle, BellRing, Settings, Smile, Paperclip, Home, Send, Trash2, Users, Layers, Sun, Moon, ChevronDown, X, LogOut, Archive, Image, Video, FileText, Music, File, Download } from "lucide-react";
import { auth } from "../firebase";
import useSocket from "../hooks/useSocket";
import { formatLastSeen, formatMessageTime } from "../utils/timeFormatter";
import { fetchMessages, fetchRecentChats, archiveChat as archiveChatService, clearAllChats as clearAllChatsService } from "../services/messageService";
import { useNavigate } from "react-router-dom";
import Avatar from "./Avatar";
import ErrorBoundary from "./ErrorBoundary";
import "./Chat.css";

const normalizeEmail = (email) => (email || "").toLowerCase().trim();
const MESSAGES_PER_PAGE = 50;
let scrollPositionRestore = null;

const getOtherParty = (msg, currentUserEmail) => {
  const senderEmail = normalizeEmail(msg.sender);
  const receiverEmail = normalizeEmail(msg.receiver);
  const me = normalizeEmail(currentUserEmail);
  return senderEmail === me ? receiverEmail : senderEmail;
};

const isSameMessage = (a, b) => {
  if (!a || !b) return false;
  if (a._id && b._id && String(a._id) === String(b._id)) return true;
  if (a.tempId && b.tempId && a.tempId === b.tempId) return true;
  return false;
};

const upsertMessageInList = (list, msg) => {
  const idx = list.findIndex((m) => isSameMessage(m, msg));
  if (idx === -1) {
    return [...list, msg].sort(
      (a, b) => new Date(a.timestamp || a.createdAt) - new Date(b.timestamp || b.createdAt)
    );
  }
  const updated = [...list];
  updated[idx] = { ...updated[idx], ...msg };
  return updated.sort(
    (a, b) => new Date(a.timestamp || a.createdAt) - new Date(b.timestamp || b.createdAt)
  );
};

function Chat({ user: currentUser }) {
  const socket = useSocket();
  const navigate = useNavigate();

  const [user, setUser] = useState(() => {
    if (currentUser) return currentUser;
    const saved = localStorage.getItem("user");
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { return null; }
    }
    return null;
  });
  const [message, setMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [chatHistory, setChatHistory] = useState({});
  const [typingUser, setTypingUser] = useState(null);
  const [lastSeen, setLastSeen] = useState({});
  const [messages, setMessages] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [unreadMessages, setUnreadMessages] = useState({});
  const [userProfiles, setUserProfiles] = useState({});
  const [isMediaSending, setIsMediaSending] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem("theme") === "dark");
  const [isChatMinimized, setIsChatMinimized] = useState(false);
  const [zoomedImage, setZoomedImage] = useState(null);
  const [isZoomMinimized, setIsZoomMinimized] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newBio, setNewBio] = useState("");
  const [tempProfilePic, setTempProfilePic] = useState(null);
  const [userMetadata, setUserMetadata] = useState({});
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const loadingMessagesRef = useRef(false);
  const emojiPickerRef = useRef(null);
  const attachMenuRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const lastTypingEmitRef = useRef(0);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const chatHistoryRef = useRef({});
  const selectedUserRef = useRef(selectedUser);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const prevMessagesLengthRef = useRef(0);

  useEffect(() => { selectedUserRef.current = selectedUser; }, [selectedUser]);
  useEffect(() => { chatHistoryRef.current = chatHistory; }, [chatHistory]);

  useEffect(() => {
    document.body.classList.toggle("dark-mode", isDarkMode);
    localStorage.setItem("theme", isDarkMode ? "dark" : "light");
  }, [isDarkMode]);

  const handleZoomImage = useCallback((src) => {
    setZoomedImage(src);
    setIsZoomMinimized(false);
  }, []);

  useEffect(() => {
    if (!zoomedImage) {
      setIsZoomMinimized(false);
    }
  }, [zoomedImage]);

  const handleScrollEvent = useCallback(() => {
    if (!messagesContainerRef.current) return;
    const container = messagesContainerRef.current;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    setIsNearBottom(distanceFromBottom < 100);

    if (container.scrollTop < 100 && hasMoreMessages && !loadingMessagesRef.current) {
      scrollPositionRestore = container.scrollHeight;
      setCurrentPage(prev => prev + 1);
    }
  }, [hasMoreMessages]);

  useEffect(() => {
    if (!messagesContainerRef.current) return;
    const container = messagesContainerRef.current;
    container.addEventListener("scroll", handleScrollEvent);
    return () => container.removeEventListener("scroll", handleScrollEvent);
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
  }, [messages, user?.email, isNearBottom]);

  useEffect(() => {
    const handleGlobalClick = (e) => {
      setContextMenu(null);
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target)) {
        setShowAttachMenu(false);
      }
    };
    window.addEventListener("click", handleGlobalClick);
    return () => window.removeEventListener("click", handleGlobalClick);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target)) {
        setShowEmojiPicker(false);
      }
    };
    if (showEmojiPicker) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showEmojiPicker]);

  useEffect(() => {
    if (!currentUser) {
      const savedUser = localStorage.getItem("user");
      if (savedUser) {
        try {
          const parsed = JSON.parse(savedUser);
          setUser(parsed);
          setNewDisplayName(parsed.displayName || (parsed.email ? parsed.email.split('@')[0] : "User"));
          return;
        } catch (e) {
          console.error("Failed to parse saved user", e);
        }
      }
      navigate("/");
      return;
    }
    const email = currentUser.email ? currentUser.email.toLowerCase() : "";
    const userData = {
      email: email,
      profilePic: currentUser.profilePic || (email ? localStorage.getItem(`profilePic_${email}`) : null),
      uid: currentUser.uid,
      displayName: currentUser.displayName || (email ? email.split('@')[0] : "User")
    };
    setUser(userData);
    setNewDisplayName(userData.displayName);
    try { localStorage.setItem("user", JSON.stringify(userData)); } catch (e) {}
    if (userData.profilePic) {
      setUserProfiles((prev) => ({ ...prev, [userData.email.toLowerCase()]: userData.profilePic }));
    }
  }, [currentUser, navigate]);

  useEffect(() => {
    if (!user) return;
    const loadChatHistory = async () => {
      try {
        const userKey = normalizeEmail(user.email);
        const recentChats = await fetchRecentChats(userKey);
        if (recentChats && recentChats.length > 0) {
          const historyFromServer = {};
          recentChats.forEach(chat => {
            if (chat.userEmail) {
              const emailKey = normalizeEmail(chat.userEmail);
              historyFromServer[emailKey] = [{
                _id: chat.messageId,
                sender: userKey,
                receiver: chat.userEmail,
                text: chat.lastMessage,
                type: chat.type,
                timestamp: chat.timestamp,
                seen: false
              }];
            }
          });
          setChatHistory(historyFromServer);
        }
      } catch (error) {
        console.error("Error loading chat history:", error);
      }
    };
    loadChatHistory();
  }, [user]);

  const loadMessagesForChat = useCallback(async (user1, user2, page = 1) => {
    if (loadingMessagesRef.current) return;
    try {
      setLoadingMessages(true);
      loadingMessagesRef.current = true;
      const data = await fetchMessages(user1, user2, page, MESSAGES_PER_PAGE);
      const newMessages = data.messages || [];
      setHasMoreMessages(data.hasMore);
      setCurrentPage(page);
      setMessages(prev => {
        if (page === 1) return newMessages;
        const existingIds = new Set(prev.map(m => m._id));
        const uniqueNew = newMessages.filter(m => !existingIds.has(m._id));
        return [...uniqueNew, ...prev];
      });
      setChatHistory(prev => ({ ...prev, [user2]: newMessages }));
      if (page > 1 && scrollPositionRestore && messagesContainerRef.current) {
        requestAnimationFrame(() => {
          if (messagesContainerRef.current) {
            const newHeight = messagesContainerRef.current.scrollHeight;
            messagesContainerRef.current.scrollTop = newHeight - scrollPositionRestore;
            scrollPositionRestore = null;
          }
        });
      }
    } catch (err) {
      console.error("Failed to fetch messages:", err);
      if (page === 1) {
        const partner = normalizeEmail(user2);
        const cached = chatHistoryRef.current[partner];
        if (cached?.length) {
          setMessages(cached.sort((a, b) => new Date(a.timestamp || a.createdAt) - new Date(b.timestamp || b.createdAt)));
        }
      }
    } finally {
      setLoadingMessages(false);
      loadingMessagesRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!user || !socket) return;
    const handleJoin = () => {
      socket.emit("join", {
        email: user.email,
        profilePic: user.profilePic || null,
        displayName: user.displayName || user.email.split('@')[0]
      });
    };
    handleJoin();
    socket.on("connect", handleJoin);
    socket.on("online-users", setOnlineUsers);

    socket.on("all-user-metadata", (metadata) => {
      setUserMetadata(prev => ({ ...prev, ...metadata }));
      const initialLastSeen = {};
      const profiles = {};
      Object.keys(metadata).forEach(email => {
        if (metadata[email].lastSeen) initialLastSeen[email] = metadata[email].lastSeen;
        if (metadata[email].profilePic) profiles[email] = metadata[email].profilePic;
      });
      setLastSeen(prev => ({ ...initialLastSeen, ...prev }));
      setUserProfiles(prev => ({ ...prev, ...profiles }));
    });

    socket.on("typing", ({ from }) => {
      const activeChat = selectedUserRef.current;
      if (normalizeEmail(from) === normalizeEmail(activeChat)) {
        setTypingUser(normalizeEmail(from));
      }
    });

    socket.on("stop-typing", ({ from }) => {
      const activeChat = selectedUserRef.current;
      if (normalizeEmail(from) === normalizeEmail(activeChat)) {
        setTypingUser(null);
      } else {
        setTypingUser((current) => {
          if (current && normalizeEmail(current) === normalizeEmail(from)) return null;
          return current;
        });
      }
    });

    socket.on("last-seen", (data) => {
      setLastSeen((prev) => ({ ...prev, [data.userId]: data.time }));
    });

    socket.on("user-status-change", ({ userId, isOnline, lastSeen: time }) => {
      if (isOnline) {
        setOnlineUsers(prev => [...new Set([...prev, userId])]);
      } else {
        setOnlineUsers(prev => prev.filter(u => normalizeEmail(u) !== normalizeEmail(userId)));
        if (time) setLastSeen(prev => ({ ...prev, [userId]: time }));
      }
    });

    socket.on("unread-update", (unreadData) => {
      setUnreadMessages(unreadData);
    });

    socket.on("user-profile-update", (data) => {
      const normalizedUpdateEmail = data.email.toLowerCase();
      const isMe = user && normalizedUpdateEmail === user.email.toLowerCase();
      const updatedInfo = { displayName: data.displayName, profilePic: data.profilePic || null, bio: data.bio || "" };
      if (isMe) {
        setUser(prev => ({ ...prev, ...updatedInfo }));
        try { localStorage.setItem("user", JSON.stringify({ ...user, ...updatedInfo })); } catch (e) {}
      }
      setUserMetadata((prev) => ({ ...prev, [normalizedUpdateEmail]: updatedInfo }));
      setUserProfiles((prev) => ({ ...prev, [normalizedUpdateEmail]: data.profilePic || null }));
    });

    const handleChatCleared = ({ user1, user2, scope }) => {
      if (normalizeEmail(user1) !== normalizeEmail(user.email)) return;
      setChatHistory((prev) => { const u = { ...prev }; delete u[normalizeEmail(user2)]; return u; });
      setUnreadMessages((prev) => { const k = `${normalizeEmail(user2)}_${normalizeEmail(user.email)}`; if (!prev[k]) return prev; const n = { ...prev }; delete n[k]; return n; });
      if (selectedUserRef.current && normalizeEmail(selectedUserRef.current) === normalizeEmail(user2)) setMessages([]);
    };
    socket.on("chat-cleared", handleChatCleared);

    const handleMessageSaved = ({ tempId, _id, timestamp }) => {
      const applySaved = (list) => list.map((m) => m.tempId === tempId ? { ...m, _id, timestamp: timestamp || m.timestamp, pending: false } : m);
      if (selectedUserRef.current) {
        const partner = normalizeEmail(selectedUserRef.current);
        setChatHistory((prev) => prev[partner] ? { ...prev, [partner]: applySaved(prev[partner]) } : prev);
        setMessages((prev) => applySaved(prev));
      } else {
        setChatHistory((prev) => { const u = { ...prev }; Object.keys(u).forEach((k) => { if (u[k].some(m => m.tempId === tempId)) u[k] = applySaved(u[k]); }); return u; });
      }
    };
    socket.on("message-saved", handleMessageSaved);

    const handleMessageError = ({ tempId }) => {
      const markFailed = (list) => list.map((m) => m.tempId === tempId ? { ...m, failed: true, pending: false } : m);
      setMessages((prev) => markFailed(prev));
      setChatHistory((prev) => { const u = { ...prev }; Object.keys(u).forEach((k) => { u[k] = markFailed(u[k] || []); }); return u; });
    };
    socket.on("message-error", handleMessageError);

    socket.on("message-deleted", ({ messageId, sender, receiver }) => {
      const otherParty = normalizeEmail(sender) === normalizeEmail(user.email) ? normalizeEmail(receiver) : normalizeEmail(sender);
      setChatHistory((prev) => ({ ...prev, [otherParty]: (prev[otherParty] || []).filter(m => m._id !== messageId && m.tempId !== messageId) }));
      if (selectedUserRef.current && normalizeEmail(selectedUserRef.current) === normalizeEmail(otherParty)) {
        setMessages((prev) => prev.filter(m => m._id !== messageId && m.tempId !== messageId));
      }
    });

    const handleIncomingMessage = (msg) => {
      const otherParty = getOtherParty(msg, user.email);
      const isActiveChat = selectedUserRef.current && normalizeEmail(selectedUserRef.current) === otherParty;
      setChatHistory((prev) => ({ ...prev, [otherParty]: upsertMessageInList(prev[otherParty] || [], msg) }));
      if (isActiveChat) {
        setMessages((prev) => upsertMessageInList(prev, msg));
        socket.emit("mark-as-read", { user1: normalizeEmail(user.email), user2: otherParty });
      } else if (normalizeEmail(msg.sender) !== normalizeEmail(user.email)) {
        setUnreadMessages((prev) => { const k = `${otherParty}_${normalizeEmail(user.email)}`; return { ...prev, [k]: (prev[k] || 0) + 1 }; });
      }
    };
    socket.on("receive-message", handleIncomingMessage);

    return () => {
      socket.off("connect", handleJoin);
      socket.off("online-users");
      socket.off("typing");
      socket.off("stop-typing");
      socket.off("last-seen");
      socket.off("user-status-change");
      socket.off("unread-update");
      socket.off("user-profile-update");
      socket.off("chat-cleared", handleChatCleared);
      socket.off("message-saved", handleMessageSaved);
      socket.off("message-error", handleMessageError);
      socket.off("message-deleted");
      socket.off("receive-message", handleIncomingMessage);
    };
  }, [socket, user]);

  useEffect(() => {
    if (!socket || !user) return;
    const emitVisiblePresence = () => {
      if (document.hidden) {
        socket.emit("leave", { email: user.email.toLowerCase() });
      } else {
        socket.emit("join", { email: user.email.toLowerCase(), profilePic: user.profilePic || null });
      }
    };
    const handleBeforeUnload = () => {
      socket.emit("leave", { email: user.email.toLowerCase() });
    };
    document.addEventListener("visibilitychange", emitVisiblePresence);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", emitVisiblePresence);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [socket, user]);

  useEffect(() => {
    if (!user || !selectedUser || !socket) return;
    socket.emit("join-room", { user1: user.email, user2: selectedUser });
    socket.emit("mark-as-read", { user1: user.email, user2: selectedUser });
    loadMessagesForChat(user.email, selectedUser, 1);
    setTypingUser(null);
    setCurrentPage(1);
    setHasMoreMessages(false);
    if (typingTimeoutRef.current) { clearTimeout(typingTimeoutRef.current); typingTimeoutRef.current = null; }
    if (user && socket && socket.connected && previousSelectedUserRef.current) {
      socket.emit("stop-typing", { from: normalizeEmail(user.email), to: normalizeEmail(previousSelectedUserRef.current) });
    }
    previousSelectedUserRef.current = selectedUser;
  }, [selectedUser, user, socket, loadMessagesForChat]);

  useEffect(() => {
    if (!user || !selectedUser || !socket || currentPage <= 1) return;
    loadMessagesForChat(user.email, selectedUser, currentPage);
  }, [currentPage, user, selectedUser, socket, loadMessagesForChat]);

  const previousSelectedUserRef = useRef(null);

  useEffect(() => {
    setTypingUser(null);
    if (typingTimeoutRef.current) { clearTimeout(typingTimeoutRef.current); typingTimeoutRef.current = null; }
    if (user && socket && socket.connected && previousSelectedUserRef.current) {
      socket.emit("stop-typing", { from: normalizeEmail(user.email), to: normalizeEmail(previousSelectedUserRef.current) });
    }
    previousSelectedUserRef.current = selectedUser;
  }, [selectedUser, user, socket]);

  const stopTyping = useCallback(() => {
    if (typingTimeoutRef.current) { clearTimeout(typingTimeoutRef.current); typingTimeoutRef.current = null; }
    if (user && selectedUser && socket && socket.connected) {
      socket.emit("stop-typing", { from: normalizeEmail(user.email), to: normalizeEmail(selectedUser) });
    }
  }, [user, selectedUser, socket]);

  const handleTyping = useCallback((e) => {
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
    typingTimeoutRef.current = setTimeout(() => { stopTyping(); }, 3000);
  }, [user, selectedUser, socket, stopTyping]);

  const sendMessage = useCallback(() => {
    if (!user || !selectedUser || !message.trim() || !socket) return;
    if (!socket.connected) { alert("You are offline. Please check your connection."); return; }
    ensureSocketJoined();
    const msgText = message;
    const tempId = `${Date.now()}-${Math.random()}`;
    const newMsg = { sender: user.email, receiver: selectedUser, text: msgText, type: "text", tempId, timestamp: new Date().toISOString() };
    if (replyTo) {
      newMsg.replyTo = { id: replyTo._id || replyTo.tempId, text: replyTo.type === 'media' ? 'Media file' : replyTo.text, sender: replyTo.sender };
    }
    const optimisticMsg = { ...newMsg, pending: true, _id: tempId };
    const partner = normalizeEmail(selectedUser);
    setChatHistory((prev) => ({ ...prev, [partner]: upsertMessageInList(prev[partner] || [], optimisticMsg) }));
    setMessages((prev) => upsertMessageInList(prev, optimisticMsg));
    socket.emit("send-message", newMsg, (ack) => {
      if (ack && ack.ok === false) {
        setMessages((prev) => prev.map((m) => m.tempId === tempId ? { ...m, failed: true, pending: false } : m));
      }
    });
    stopTyping();
    setMessage("");
    setReplyTo(null);
  }, [user, selectedUser, message, socket, replyTo, stopTyping]);

  const handleMediaShare = useCallback((file) => {
    if (!file || !user || !selectedUser || !socket) return;
    if (!socket.connected) { alert("You are offline. Please check your connection."); return; }
    if (isMediaSending) { alert("File is already being sent. Please wait..."); return; }
    const isImage = file.type.startsWith('image/');
    const maxSize = isImage ? 5 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxSize) {
      alert(`File size must be less than ${isImage ? '5MB' : '10MB'}.`);
      return;
    }
    const allowedTypes = ['image/', 'video/', 'audio/', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument', 'text/plain'];
    if (!allowedTypes.some(t => file.type.startsWith(t) || file.type.includes(t))) {
      alert("This file type is not supported.");
      return;
    }
    setIsMediaSending(true);
    setShowAttachMenu(false);
    const tempId = `${Date.now()}-${Math.random()}`;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        let fileData = { name: file.name, type: file.type, size: file.size, data: reader.result };
        const newMsg = { sender: user.email, receiver: selectedUser, text: fileData, type: "media", mediaType: file.type.split('/')[0], tempId, timestamp: new Date().toISOString() };
        const optimisticMsg = { ...newMsg, pending: true, _id: tempId };
        const partner = normalizeEmail(selectedUser);
        setChatHistory((prev) => ({ ...prev, [partner]: upsertMessageInList(prev[partner] || [], optimisticMsg) }));
        setMessages((prev) => upsertMessageInList(prev, optimisticMsg));
        socket.emit("send-message", newMsg, (ack) => {
          if (!ack || ack.ok === false) {
            setMessages((prev) => prev.map((m) => m.tempId === tempId ? { ...m, failed: true, pending: false } : m));
          }
        });
      } catch (err) {
        console.error("Error processing file:", err);
        alert("Error sending file. Please try again.");
      } finally {
        setIsMediaSending(false);
      }
    };
    reader.onerror = () => { console.error("Error reading file"); alert("Error reading file."); setIsMediaSending(false); };
    reader.readAsDataURL(file);
  }, [user, selectedUser, socket, isMediaSending]);

  const clearChatForPartner = useCallback((partnerEmail, keepInRecent = false) => {
    if (!user || !socket?.connected || !partnerEmail) return;
    const partner = normalizeEmail(partnerEmail);
    const userKey = normalizeEmail(user.email);
    socket.emit("clear-chat", { user1: userKey, user2: partner, keepInRecent }, (ack) => { if (!ack?.ok) alert("Failed to clear chat."); });
    if (!keepInRecent) {
      setChatHistory((prev) => { const u = { ...prev }; delete u[partner]; return u; });
      setUnreadMessages((prev) => { const k = `${partner}_${userKey}`; if (!prev[k]) return prev; const n = { ...prev }; delete n[k]; return n; });
    }
    if (selectedUserRef.current && normalizeEmail(selectedUserRef.current) === partner) setMessages([]);
  }, [user, socket]);

  const handleClearCurrentChat = useCallback(() => {
    if (!selectedUser) return;
    if (window.confirm("Clear all messages in this chat? The conversation will stay in your list.")) {
      clearChatForPartner(selectedUser, true);
    }
  }, [selectedUser, clearChatForPartner]);

  const handleArchiveChat = useCallback(async (e, partnerEmail) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (!user || !partnerEmail) return;
    try {
      await archiveChatService(user.email, partnerEmail);
      const partner = normalizeEmail(partnerEmail);
      setChatHistory((prev) => { const u = { ...prev }; delete u[partner]; return u; });
      if (selectedUserRef.current && normalizeEmail(selectedUserRef.current) === partner) { setSelectedUser(null); setMessages([]); }
    } catch (err) { console.error("Failed to archive chat:", err); }
  }, [user]);

  const handleClearAllHistory = useCallback(async () => {
    if (!user) return;
    if (window.confirm("Clear all recent chats from your list?")) {
      try {
        await clearAllChatsService(user.email);
        setChatHistory({}); setMessages([]); setUnreadMessages({}); setSelectedUser(null);
      } catch (err) { console.error("Failed to clear all chats:", err); }
    }
  }, [user]);

  const handleRemoveChatFromRecent = useCallback((e, partnerEmail) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (!user || !partnerEmail) return;
    if (window.confirm(`Remove ${getDisplayName(partnerEmail)} from your recent chats?`)) {
      const partner = normalizeEmail(partnerEmail);
      socket.emit("clear-chat", { user1: normalizeEmail(user.email), user2: partner });
      setChatHistory((prev) => { const u = { ...prev }; delete u[partner]; return u; });
      setUnreadMessages((prev) => { const k = `${partner}_${normalizeEmail(user.email)}`; if (!prev[k]) return prev; const n = { ...prev }; delete n[k]; return n; });
      if (selectedUserRef.current && normalizeEmail(selectedUserRef.current) === partner) { setMessages([]); setSelectedUser(null); }
    }
  }, [user, socket]);

  const handleContextMenu = useCallback((e, msg) => {
    e.preventDefault();
    const x = Math.min(e.pageX, window.innerWidth - 200);
    const y = Math.min(e.pageY, window.innerHeight - 100);
    setContextMenu({ x, y, message: msg });
  }, []);

  const handleDeleteMessage = useCallback((msg) => {
    if (window.confirm("Delete this message?")) {
      socket.emit("delete-message", { messageId: msg._id || msg.tempId, sender: msg.sender, receiver: msg.receiver });
    }
  }, [socket]);

  const handleUpdateProfilePic = useCallback((e) => {
    const file = e.target.files[0];
    if (!file || !user) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_SIZE = 400;
        let width = img.width, height = img.height;
        if (width > height) { if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } }
        else { if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; } }
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, width, height);
        setTempProfilePic(canvas.toDataURL("image/jpeg", 0.9));
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  }, [user]);

  const handleRemoveProfilePic = useCallback(() => { setTempProfilePic(""); }, []);
  const handleCancelSettings = useCallback(() => { setShowSettings(false); }, []);

  const handleSaveSettings = useCallback(() => {
    if (!user || !socket) return;
    const displayName = newDisplayName.trim() || user.email.split('@')[0];
    const profilePic = tempProfilePic !== null ? tempProfilePic : user.profilePic;
    const bio = newBio;
    const updatedUser = { ...user, displayName, profilePic, bio };
    setUser(updatedUser);
    try { localStorage.setItem("user", JSON.stringify(updatedUser)); } catch (e) {}
    if (updatedUser.profilePic) {
      try { localStorage.setItem(`profilePic_${user.email.toLowerCase()}`, updatedUser.profilePic); } catch (e) {}
    } else { localStorage.removeItem(`profilePic_${user.email.toLowerCase()}`); }
    setUserProfiles(prev => ({ ...prev, [user.email.toLowerCase()]: updatedUser.profilePic || null }));
    setUserMetadata(prev => ({ ...prev, [user.email.toLowerCase()]: { displayName, profilePic: updatedUser.profilePic, bio } }));
    socket.emit("update-profile", { email: user.email, profilePic: updatedUser.profilePic, displayName: updatedUser.displayName, bio: updatedUser.bio });
    setShowSettings(false);
  }, [user, socket, newDisplayName, newBio, tempProfilePic]);

  const ensureSocketJoined = useCallback(() => {
    if (!socket || !user) return;
    socket.emit("join", { email: normalizeEmail(user.email), profilePic: user.profilePic || null, displayName: user.displayName || user.email.split('@')[0] });
  }, [socket, user]);

  const performLogout = useCallback(() => {
    if (socket && user) socket.emit("leave", { email: normalizeEmail(user.email) });
    setShowLogoutConfirm(false);
    navigate("/feedback");
    auth.signOut().then(() => { localStorage.removeItem("user"); });
  }, [socket, user, navigate]);

  const handleUserSelect = useCallback((u) => {
    const partner = normalizeEmail(u);
    setSelectedUser(partner);
    if (chatHistory[partner]) {
      setMessages(chatHistory[partner].sort((a, b) => new Date(a.timestamp || a.createdAt) - new Date(b.timestamp || b.createdAt)));
    }
    if (user) {
      setUnreadMessages(prev => { const k = `${partner}_${normalizeEmail(user.email)}`; if (!prev[k]) return prev; const n = { ...prev }; delete n[k]; return n; });
    }
  }, [user, chatHistory]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);

  const formatDay = useCallback((timestamp) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return "Today";
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    return date.toLocaleDateString(undefined, { month: "long", day: "numeric" });
  }, []);

  const getDisplayName = useCallback((email) => {
    if (!email || typeof email !== 'string') return "User";
    const lowerEmail = email.toLowerCase();
    return userMetadata[lowerEmail]?.displayName || user?.displayName || email.split("@")[0];
  }, [userMetadata, user]);

  const renderAvatar = useCallback((email, size = "md", customSrc = null) => {
    if (!email) return null;
    const lowerEmail = email.toLowerCase();
    const isMe = user && lowerEmail === user.email.toLowerCase();
    const metadata = userMetadata[lowerEmail];
    const src = customSrc || (isMe ? user?.profilePic : metadata?.profilePic) || userProfiles[lowerEmail];
    const name = (isMe ? user?.displayName : metadata?.displayName) || email.split('@')[0];
    return <Avatar email={lowerEmail} name={name} src={src} size={size} onClick={src ? (e) => { e.stopPropagation(); handleZoomImage(src); } : undefined} />;
  }, [user, userMetadata, userProfiles, handleZoomImage]);

  const isUserOnline = useCallback((userEmail) => onlineUsers.some((u) => normalizeEmail(u) === normalizeEmail(userEmail)), [onlineUsers]);

  const getUnreadCount = useCallback((otherUser) => {
    if (!user || !otherUser) return 0;
    return unreadMessages[`${normalizeEmail(otherUser)}_${normalizeEmail(user.email)}`] || 0;
  }, [user, unreadMessages]);

  const otherOnlineUsers = onlineUsers.filter(u => u && typeof u === 'string' && u.toLowerCase().trim() !== user?.email?.toLowerCase().trim());

  const recentChats = Object.keys(chatHistory)
    .filter(u => u !== user?.email)
    .sort((a, b) => {
      const historyA = chatHistory[a] || [];
      const historyB = chatHistory[b] || [];
      const lastA = historyA[historyA.length - 1];
      const lastB = historyB[historyB.length - 1];
      return new Date(lastB?.timestamp || lastB?.createdAt || 0) - new Date(lastA?.timestamp || lastA?.createdAt || 0);
    });

  const searchValue = searchTerm.trim().toLowerCase();
  const filteredRecentChats = recentChats.filter((u) => normalizeEmail(u).includes(searchValue) || getDisplayName(u).includes(searchValue));
  const filteredOnlineUsers = otherOnlineUsers.filter((u) => normalizeEmail(u).includes(searchValue) || getDisplayName(u).includes(searchValue));

  const handleAttachFile = useCallback((type) => {
    setShowAttachMenu(false);
    const input = document.getElementById('media-input');
    if (!input) return;
    if (type === 'image') { input.accept = 'image/*'; input.click(); }
    else if (type === 'video') { input.accept = 'video/*'; input.click(); }
    else if (type === 'audio') { input.accept = 'audio/*'; input.click(); }
    else if (type === 'document') { input.accept = '.pdf,.doc,.docx,.txt,.xls,.xlsx,.ppt,.pptx'; input.click(); }
    else { input.accept = '*/*'; input.click(); }
  }, []);

  const handleMediaInputChange = useCallback((e) => {
    const file = e.target.files[0];
    if (file) handleMediaShare(file);
    e.target.value = null;
  }, [handleMediaShare]);

  const handleReplyClick = useCallback((msg) => {
    setReplyTo(msg);
    setContextMenu(null);
  }, []);

  const handleDeleteFromContext = useCallback((msg) => {
    handleDeleteMessage(msg);
    setContextMenu(null);
  }, [handleDeleteMessage]);

  if (!user) return <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}><h2>Loading Connect Messenger...</h2></div>;

  return (
    <ErrorBoundary>
      <div className={`chat-layout ${isDarkMode ? "dark" : ""}`}>
        <aside className="sidebar">
          <div className="sidebar-top">
            <div className="brand-head">
              <div className="brand-mark">C</div>
              <div className="brand-copy">
                <strong>Connect</strong>
                <span>Enterprise messenger</span>
              </div>
            </div>
            <button className="theme-toggle" onClick={() => setIsDarkMode((prev) => !prev)} aria-label="Toggle theme">
              {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
          <div className="sidebar-tabs">
            <button className="tab active"><MessageCircle size={16} /> Chats</button>
          </div>
          <div className="sidebar-search">
            <Search size={16} />
            <input type="search" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search conversations" />
          </div>
          <div className="profile-card">
            <div className="profile-card-main">
              {renderAvatar(user.email, "md")}
              <div>
                <span className="profile-name">{user.displayName || (user.email ? user.email.split("@")[0] : "User")}</span>
                <span className="profile-meta">{isUserOnline(user.email) ? "Online" : "Offline"}</span>
              </div>
            </div>
            <button className="primary-btn" onClick={() => setSelectedUser(null)}><PlusCircle size={16} /> New</button>
          </div>
          <div className="sidebar-section">
            <div className="sidebar-section-title">Recent Chats</div>
            <div className="sidebar-list">
              {filteredRecentChats.length > 0 ? filteredRecentChats.map((u, i) => {
                const unreadCount = getUnreadCount(u);
                return (
                  <div key={`recent-${i}`} className={`user-item ${normalizeEmail(selectedUser) === normalizeEmail(u) ? "active" : ""}`} onClick={() => handleUserSelect(u)}>
                    <div className="avatar-wrap">
                      {renderAvatar(u, "md")}
                      {isUserOnline(u) && <span className="status-dot online" />}
                    </div>
                    <div className="user-item-copy">
                      <span className="user-name">{getDisplayName(u)}</span>
                      <span className="user-last">{isUserOnline(u) ? "Online" : formatLastSeen(lastSeen[u])}</span>
                    </div>
                    <div className="user-item-actions">
                      {unreadCount > 0 && <span className="unread-badge">{unreadCount}</span>}
                      <button className="remove-recent-btn" onClick={(e) => handleArchiveChat(e, u)} title="Archive"><Archive size={14} /></button>
                      <button className="remove-recent-btn" onClick={(e) => handleRemoveChatFromRecent(e, u)} title="Remove"><X size={14} /></button>
                    </div>
                  </div>
                );
              }) : (
                <div className="empty-list">Try searching or start a new conversation.</div>
              )}
            </div>
          </div>
          <div className="sidebar-section">
            <div className="sidebar-section-title">Online Users</div>
            <div className="sidebar-list">
              {filteredOnlineUsers.length > 0 ? filteredOnlineUsers.map((u, i) => (
                <div key={`online-${i}`} className={`user-item ${normalizeEmail(selectedUser) === normalizeEmail(u) ? "active" : ""}`} onClick={() => handleUserSelect(u)}>
                  <div className="avatar-wrap">
                    {renderAvatar(u, "md")}
                    <span className="status-dot online" />
                  </div>
                  <div className="user-item-copy">
                    <span className="user-name">{getDisplayName(u)}</span>
                    <span className="user-last">Available now</span>
                  </div>
                  {getUnreadCount(u) > 0 && <span className="unread-badge">{getUnreadCount(u)}</span>}
                </div>
              )) : (
                <div className="empty-list">No contacts are available right now.</div>
              )}
            </div>
          </div>
          <div className="sidebar-actions">
            <button className="secondary-btn" onClick={handleClearAllHistory} title="Clear all recent chats"><Trash2 size={16} /> Clear All</button>
            <button className="secondary-btn" onClick={() => navigate("/feedback")}><MessageCircle size={16} /> Feedback</button>
          </div>
        </aside>

        <main className="chat-panel">
          <div className="chat-panel-header">
            <div className="chat-panel-title">
              <div className="header-avatar-wrap">{renderAvatar(selectedUser, "md")}</div>
              <div>
                <h3>{selectedUser ? getDisplayName(selectedUser) : "Welcome to Connect"}</h3>
                <p>{selectedUser ? (isUserOnline(selectedUser) ? "Online" : formatLastSeen(lastSeen[selectedUser])) : "Choose a conversation."}</p>
              </div>
            </div>
            <div className="chat-header-actions">
              {selectedUser && (
                <>
                  <button className="secondary-btn clear-chat-btn" title="Clear chat" onClick={handleClearCurrentChat}><Trash2 size={16} /> Clear</button>
                  <button className="icon-btn" title={isChatMinimized ? "Expand" : "Minimize"} onClick={() => setIsChatMinimized(!isChatMinimized)}>
                    <ChevronDown size={18} style={{ transform: isChatMinimized ? 'rotate(0deg)' : 'rotate(180deg)' }} />
                  </button>
                  <button className="icon-btn" title="Close" onClick={() => { setSelectedUser(null); setIsChatMinimized(false); }}><X size={18} /></button>
                </>
              )}
              <button className="icon-btn" title="Settings" onClick={() => { setNewDisplayName(user?.displayName || (user?.email ? user.email.split('@')[0] : "")); setNewBio(user?.bio || ""); setTempProfilePic(null); setShowSettings(true); }}><Settings size={18} /></button>
              <button className="logout-btn" type="button" onClick={() => setShowLogoutConfirm(true)}><LogOut size={16} /> <span>Logout</span></button>
            </div>
          </div>

          {showSettings && (
            <div className="logout-modal-overlay" onClick={handleCancelSettings}>
              <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
                <div className="settings-header">
                  <h3>Settings</h3>
                  <button className="settings-close-btn" onClick={handleCancelSettings}><X size={20} /></button>
                </div>
                <div className="settings-body">
                  <div className="settings-section">
                    <label className="settings-label">Profile Picture</label>
                    <div className="settings-avatar-card">
                      {renderAvatar(user.email, "lg", tempProfilePic !== null ? tempProfilePic : undefined)}
                      <div className="avatar-actions-row">
                        <label htmlFor="update-profile-pic-settings" className="change-dp-btn">Change Photo</label>
                        {(tempProfilePic || (tempProfilePic === null && user.profilePic)) && (
                          <button className="remove-dp-btn" onClick={handleRemoveProfilePic}>Remove Photo</button>
                        )}
                      </div>
                      <input id="update-profile-pic-settings" type="file" accept="image/*" onChange={handleUpdateProfilePic} style={{ display: "none" }} />
                    </div>
                  </div>
                  <div className="settings-section">
                    <label className="settings-label">Display Name</label>
                    <input type="text" value={newDisplayName} onChange={(e) => setNewDisplayName(e.target.value)} placeholder="Enter your name" className="settings-input" />
                    <p className="settings-hint">This name will be visible to everyone.</p>
                  </div>
                  <div className="settings-section">
                    <label className="settings-label">Bio / About</label>
                    <textarea value={newBio} onChange={(e) => setNewBio(e.target.value)} placeholder="Tell others about yourself..." className="settings-input settings-textarea" />
                  </div>
                  <div className="settings-section">
                    <label className="settings-label">Account Information</label>
                    <div className="settings-info-card">
                      <div className="info-row"><span className="info-label">Email</span><span className="info-value">{user?.email}</span></div>
                      <div className="info-row"><span className="info-label">Username</span><span className="info-value">{user?.email?.split('@')[0]}</span></div>
                    </div>
                  </div>
                </div>
                <div className="settings-footer">
                  <button className="remove-dp-btn" onClick={handleCancelSettings}>Cancel</button>
                  <button className="save-profile-btn" onClick={handleSaveSettings}>Save Changes</button>
                </div>
              </div>
            </div>
          )}

          {showLogoutConfirm && (
            <div className="logout-modal-overlay" onClick={() => setShowLogoutConfirm(false)}>
              <div className="logout-modal" onClick={(e) => e.stopPropagation()}>
                <h3>Log out?</h3>
                <p>You will be signed out of Connect It.</p>
                <div className="logout-modal-actions">
                  <button type="button" className="logout-cancel-btn" onClick={() => setShowLogoutConfirm(false)}>Cancel</button>
                  <button type="button" className="logout-confirm-btn" onClick={performLogout}>Logout</button>
                </div>
              </div>
            </div>
          )}

          {!isChatMinimized && (
            <div className="chat-panel-body" ref={messagesContainerRef}>
              {selectedUser ? (
                <div className="chat-messages">
                  {loadingMessages && <div className="loading-messages"><div className="spinner-sm" /> Loading...</div>}
                  {hasMoreMessages && !loadingMessages && (
                    <div className="load-more-bar">
                      <button className="load-more-btn" onClick={() => { scrollPositionRestore = messagesContainerRef.current?.scrollHeight; setCurrentPage(prev => prev + 1); }}>Load older messages</button>
                    </div>
                  )}
                  {messages.length === 0 && !loadingMessages ? (
                    <div className="empty-chat-state">
                      <MessageCircle size={32} />
                      <h4>No messages yet</h4>
                      <p>Send the first message to start the conversation.</p>
                    </div>
                  ) : (
                    messages.map((msg, i) => {
                      const previousMsg = messages[i - 1];
                      const showDay = !previousMsg || new Date(msg.timestamp || msg.createdAt).toDateString() !== new Date(previousMsg.timestamp || previousMsg.createdAt).toDateString();
                      return (
                        <React.Fragment key={msg._id || msg.tempId || `msg-${i}`}>
                          {showDay && <div className="day-separator"><span>{formatDay(msg.timestamp || msg.createdAt)}</span></div>}
                          <motion.div
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.25 }}
                            className={`message-wrapper ${msg.sender === user.email ? "sent" : "received"}`}
                          >
                            {msg.sender !== user.email && <div className="message-avatar">{renderAvatar(msg.sender, "sm")}</div>}
                            <div className={`message ${msg.sender === user.email ? "sent" : "received"}`} onContextMenu={(e) => handleContextMenu(e, msg)}>
                              <div className="message-content">
                                {msg.replyTo && (
                                  <div className="reply-quote">
                                    <small>{msg.replyTo.sender === user.email ? "You" : msg.replyTo.sender.split('@')[0]}</small>
                                    <p>{msg.replyTo.text}</p>
                                  </div>
                                )}
                                {msg.type === "media" ? (
                                  <div className="media-message">
                                    {msg.mediaType === "image" && msg.text?.data?.startsWith("data:image/") && (
                                      <img src={msg.text.data} alt="Shared" className="media-image" onClick={() => handleZoomImage(msg.text.data)} />
                                    )}
                                    {msg.mediaType === "video" && msg.text?.data?.startsWith("data:video/") && (
                                      <video controls className="media-video"><source src={msg.text.data} type={msg.text.type} /></video>
                                    )}
                                    {(msg.mediaType === "audio" || fileIsAudio(msg.text?.name)) && msg.text?.data?.startsWith("data:audio/") && (
                                      <audio controls className="media-audio" src={msg.text.data}>Your browser does not support audio</audio>
                                    )}
                                    {!["image","video","audio"].includes(msg.mediaType) && msg.text?.data && (
                                      <div className="media-file">
                                        <div className="file-icon-wrapper">
                                          <FileText size={24} />
                                        </div>
                                        <div className="file-info">
                                          <span className="file-name">{msg.text?.name || "Attachment"}</span>
                                          <span className="file-size">{formatFileSize(msg.text?.size)}</span>
                                        </div>
                                        <a href={msg.text.data} download={msg.text?.name} className="download-btn" onClick={(e) => e.stopPropagation()}>
                                          <Download size={14} /> Save
                                        </a>
                                      </div>
                                    )}
                                    {!msg.text?.data && msg.type === "media" && <span className="media-unavailable">Media unavailable</span>}
                                  </div>
                                ) : (
                                  msg.text
                                )}
                              </div>
                              <div className="message-meta">
                                <span>{formatMessageTime(msg.timestamp || msg.createdAt)}</span>
                                {msg.pending && <span className="message-status pending">Sending...</span>}
                                {msg.failed && <span className="message-status failed">Failed</span>}
                                {msg.sender === user.email && !msg.pending && !msg.failed && <span className="read-receipt">{msg.seen ? "✓✓" : "✓"}</span>}
                              </div>
                            </div>
                          </motion.div>
                        </React.Fragment>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>
              ) : (
                <div className="dashboard-empty-state">
                  <div className="welcome-panel">
                    <h2>Welcome back, {user.email.split("@")[0]} 👋</h2>
                    <p>Pick a chat or start messaging a colleague from the sidebar.</p>
                  </div>
                </div>
              )}
              <AnimatePresence>
                {typingUser && typingUser !== user.email && (
                  <motion.div className="typing-indicator-floating" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}>
                    <div className="typing-dots"><span /><span /><span /></div>
                    <span>{getDisplayName(typingUser)} is typing...</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {!isChatMinimized && (
            <div className="chat-panel-footer">
              {showEmojiPicker && (
                <div ref={emojiPickerRef} className="emoji-picker-container">
                  <EmojiPicker onEmojiClick={(emojiData) => setMessage(prev => prev + emojiData.emoji)} theme={isDarkMode ? "dark" : "light"} />
                </div>
              )}
              <div ref={attachMenuRef} className="attach-menu-wrapper">
                <button className="secondary-icon-btn" title="Attach file" onClick={() => setShowAttachMenu(!showAttachMenu)}>
                  <Paperclip size={18} />
                </button>
                {showAttachMenu && (
                  <div className="attach-menu" onClick={(e) => e.stopPropagation()}>
                    <button className="attach-option" onClick={() => handleAttachFile('image')}><div className="attach-icon attach-image"><Image size={18} /></div><span>Image</span></button>
                    <button className="attach-option" onClick={() => handleAttachFile('video')}><div className="attach-icon attach-video"><Video size={18} /></div><span>Video</span></button>
                    <button className="attach-option" onClick={() => handleAttachFile('audio')}><div className="attach-icon attach-audio"><Music size={18} /></div><span>Audio</span></button>
                    <button className="attach-option" onClick={() => handleAttachFile('document')}><div className="attach-icon attach-doc"><FileText size={18} /></div><span>Document</span></button>
                    <button className="attach-option" onClick={() => handleAttachFile('other')}><div className="attach-icon attach-other"><File size={18} /></div><span>Other</span></button>
                  </div>
                )}
              </div>
              {replyTo && (
                <div className="reply-preview">
                  <div className="reply-preview-content">
                    <small>Replying to {replyTo.sender === user.email ? "yourself" : replyTo.sender.split('@')[0]}</small>
                    <p>{replyTo.type === 'media' ? 'Media file' : replyTo.text}</p>
                  </div>
                  <button className="close-reply" onClick={() => setReplyTo(null)}><X size={14} /></button>
                </div>
              )}
              <button className="secondary-icon-btn" title="Emoji" onClick={() => setShowEmojiPicker(!showEmojiPicker)}>
                <Smile size={18} />
              </button>
              <input
                type="text"
                placeholder={selectedUser ? "Write a message..." : "Select a conversation"}
                value={message}
                onChange={handleTyping}
                onKeyDown={handleKeyDown}
                onBlur={stopTyping}
                disabled={!selectedUser}
              />
              <input
                id="media-input"
                type="file"
                onChange={handleMediaInputChange}
                disabled={!selectedUser}
                style={{ display: "none" }}
              />
              <button className="send-btn" onClick={sendMessage} disabled={!selectedUser || !message.trim()}>
                <Send size={18} />
              </button>
            </div>
          )}
        </main>

        <aside className="dashboard-panel">
          <div className="dashboard-card welcome-card">
            <div className="dashboard-card-head">
              <div><span className="eyebrow">Good day</span><h4>Ready to connect?</h4></div>
              <Home size={20} />
            </div>
            <p>Start a new chat, review mentions, and stay updated with your team activity.</p>
          </div>
          <div className="dashboard-card stats-card">
            <div className="dashboard-card-head">
              <span className="eyebrow">Activity</span><span>Live insights</span>
            </div>
            <div className="stats-grid">
              <div className="stat-item"><span>{recentChats.length}</span><small>Active chats</small></div>
              <div className="stat-item"><span>{Object.keys(unreadMessages).length}</span><small>Unread</small></div>
              <div className="stat-item"><span>{filteredOnlineUsers.length}</span><small>Online</small></div>
            </div>
          </div>
          <div className="dashboard-card actions-card">
            <div className="dashboard-card-head">
              <span className="eyebrow">Quick actions</span><span>Faster workflow</span>
            </div>
            <div className="action-list">
              <button className="action-pill"><PlusCircle size={16} /> Start new chat</button>
              <button className="action-pill"><Users size={16} /> Invite team member</button>
              <button className="action-pill"><Layers size={16} /> View activity</button>
            </div>
          </div>
        </aside>

        <AnimatePresence>
          {isMediaSending && (
            <motion.div className="toast-notice" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}>
              Uploading file...
            </motion.div>
          )}
        </AnimatePresence>

        {contextMenu && (
          <div className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }}>
            <button onClick={() => handleReplyClick(contextMenu.message)}><MessageCircle size={14} /> Reply</button>
            {contextMenu.message.sender === user.email && (
              <button className="delete-option" onClick={() => handleDeleteFromContext(contextMenu.message)}><Trash2 size={14} /> Delete</button>
            )}
          </div>
        )}

        {zoomedImage && isZoomMinimized && (
          <div className="zoom-minimized-bubble">
            <img src={zoomedImage} alt="Preview" />
            <div className="zoom-minimized-copy">
              <strong>Preview</strong>
              <span>Tap to expand</span>
            </div>
            <button className="zoom-minimized-close" onClick={() => { setZoomedImage(null); setIsZoomMinimized(false); }}><X size={16} /></button>
          </div>
        )}

        {zoomedImage && !isZoomMinimized && (
          <div className="image-zoom-overlay" onClick={() => { setZoomedImage(null); setIsZoomMinimized(false); }}>
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="zoom-content" onClick={(e) => e.stopPropagation()}>
              <div className="zoom-header">
                <div className="zoom-title">Preview</div>
                <button className="close-zoom" onClick={() => { setZoomedImage(null); setIsZoomMinimized(false); }}><X size={24} /></button>
              </div>
              <div className="zoom-image-circle"><img src={zoomedImage} alt="Zoomed" /></div>
              <div className="zoom-controls">
                <button className="zoom-control-btn min" onClick={() => setIsZoomMinimized(true)} title="Minimize"><Minus size={20} /></button>
                <button className="zoom-control-btn close" onClick={() => { setZoomedImage(null); setIsZoomMinimized(false); }} title="Close"><X size={20} /></button>
              </div>
            </motion.div>
          </div>
        )}

        <button className="mobile-logout-fab" type="button" aria-label="Logout" onClick={() => setShowLogoutConfirm(true)}>
          <LogOut size={22} />
        </button>

        <nav className="bottom-nav">
          <button className="bottom-nav-btn active"><MessageCircle size={18} /><span>Chat</span></button>
          <button className="bottom-nav-btn"><Users size={18} /><span>Contacts</span></button>
          <button className="bottom-nav-btn"><BellRing size={18} /><span>Alerts</span></button>
          <button className="bottom-nav-btn" onClick={() => setShowSettings(true)}><Settings size={18} /><span>Settings</span></button>
        </nav>
      </div>
    </ErrorBoundary>
  );
}

function fileIsAudio(name) {
  if (!name) return false;
  const ext = name.split('.').pop()?.toLowerCase();
  return ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'wma'].includes(ext);
}

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function Minus(props) {
  return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /></svg>;
}

export default Chat;
