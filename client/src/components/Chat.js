import React, { useEffect, useState, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import EmojiPicker from "emoji-picker-react";
import {
  Search,
  MessageCircle,
  PlusCircle,
  BellRing,
  Settings,
  Smile,
  Paperclip,
  Home,
  Send,
  Trash2,
  Users,
  Layers,
  Sun,
  Moon,
  ChevronDown,
  X,
  Minus,
  LogOut,
  Archive,
  ArchiveRestore,
  User,
  Info,
  Image,
  Film,
  Music,
  FileText,
  FolderOpen,
  Download,
  ZoomIn,
  ZoomOut,
  Camera,
  Palette,
  Save,
  Loader2,
  AlertTriangle,
  Eye,
  EyeOff,
  BarChart3,
  History,
  UserPlus,
  Phone,
  Video,
  PhoneCall,
} from "lucide-react";
import { useCall } from "../context/CallContext";
import CallHistory from "./call/CallHistory";
import Avatar from "./Avatar";
import LastSeen from "./LastSeen";
import ErrorBoundary from "./ErrorBoundary";
import { auth } from "../firebase";
import { EmailAuthProvider, reauthenticateWithCredential, deleteUser } from "firebase/auth";
import useSocket from "../hooks/useSocket";
import { connectSocket } from "../services/socketService";
import { formatLastSeen, formatMessageTime } from "../utils/timeFormatter";
import { validateImageFile, compressImage } from "../utils/imageUtils";
import { getDeviceInfo } from "../utils/deviceDetector";
import { subscribeToPush } from "../utils/pushHelper";
import { fetchMessages, fetchRecentChats } from "../services/messageService";
import { useNavigate } from "react-router-dom";
import "./Chat.css";

const normalizeEmail = (email) => (email || "").toLowerCase().trim();

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

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

const normalizeChatHistoryKeys = (historyObj) => {
  const normalized = {};
  Object.entries(historyObj || {}).forEach(([key, value]) => {
    const normalizedKey = normalizeEmail(key);
    if (!normalizedKey) return;
    normalized[normalizedKey] = [
      ...(normalized[normalizedKey] || []),
      ...(Array.isArray(value) ? value : []),
    ].sort(
      (a, b) => new Date(a.timestamp || a.createdAt) - new Date(b.timestamp || b.createdAt)
    );
  });
  return normalized;
};

const ImageCropModal = ({ src, onCrop, onCancel }) => {
  const [scale, setScale] = React.useState(1);

  const handleCrop = () => {
    try {
      // Simply pass the compressed image directly without cropping
      onCrop(src);
    } catch (err) {
      console.error("Error:", err);
      alert("Failed to save image. Please try again.");
    }
  };

  return (
    <div className="crop-overlay" onClick={onCancel}>
      <div className="crop-modal crop-modal-animate" onClick={(e) => e.stopPropagation()}>
        <div className="crop-header">
          <h3>Profile Picture</h3>
          <button onClick={onCancel}><X size={18} /></button>
        </div>
        <div style={{ padding: "20px", textAlign: "center" }}>
          <img 
            src={src} 
            alt="Preview" 
            style={{ 
              maxWidth: "280px", 
              maxHeight: "280px", 
              borderRadius: "50%",
              objectFit: "cover",
              width: "280px",
              height: "280px"
            }} 
          />
        </div>
        <div className="crop-actions">
          <button className="crop-cancel-btn" onClick={onCancel}>Cancel</button>
          <button className="crop-save-btn" onClick={handleCrop}>Save</button>
        </div>
      </div>
    </div>
  );
};

function Chat({ user: currentUser }) {
  const socket = useSocket();
  const navigate = useNavigate();

  // Call system - from CallContext mounted in App.js
  const {
    callState,
    incomingCall,
    activeCall,
    callHistory,
    duration,
    remoteStreamRef,
    localStreamRef,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleVideo,
    toggleSpeaker,
  } = useCall();

  const [user, setUser] = useState(null);
  const [message, setMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [chatHistory, setChatHistory] = useState({}); // Store all chats by user
  const [typingUser, setTypingUser] = useState(null);
  const [lastSeen, setLastSeen] = useState({});
  const [messages, setMessages] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [unreadMessages, setUnreadMessages] = useState({}); // Track unread counts
  const [userProfiles, setUserProfiles] = useState(() => {
    try {
      const email = JSON.parse(localStorage.getItem("user") || "{}").email;
      if (email) {
        const stored = localStorage.getItem(`userProfiles_${email.toLowerCase()}`);
        return stored ? JSON.parse(stored) : {};
      }
    } catch {}
    return {};
  });
  const [isMediaSending, setIsMediaSending] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [downloadProgress, setDownloadProgress] = useState({});
  const [downloadingId, setDownloadingId] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem("theme") === "dark");
  const [isChatMinimized, setIsChatMinimized] = useState(false); // Track if chat is minimized
  const [contextMenu, setContextMenu] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [showDeletePwd, setShowDeletePwd] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const attachMenuRef = useRef(null);
  const [userNames, setUserNames] = useState(() => {
    try {
      const email = JSON.parse(localStorage.getItem("user") || "{}").email;
      if (email) {
        const stored = localStorage.getItem(`userNames_${email.toLowerCase()}`);
        return stored ? JSON.parse(stored) : {};
      }
    } catch {}
    return {};
  });
  const [profilePreviewUser, setProfilePreviewUser] = useState(null);
  const [imageViewerState, setImageViewerState] = useState({ open: false, src: null, type: "media", name: "", isOwn: false });
  const [cropState, setCropState] = useState({ open: false, src: null, file: null });
  const [imageZoom, setImageZoom] = useState(1);
  const archivedChatsRef = useRef(null);
  const [archivedChats, setArchivedChats] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`archivedChats_${localStorage.getItem("user") ? JSON.parse(localStorage.getItem("user")).email : ""}`) || "[]"); } catch { return []; }
  });
  const [activeTab, setActiveTab] = useState("recent");
  const [displayName, setDisplayName] = useState(() => {
    try { return JSON.parse(localStorage.getItem("user") || "{}").displayName || ""; } catch { return ""; }
  });
  const [bio, setBio] = useState(() => {
    try { return JSON.parse(localStorage.getItem("user") || "{}").bio || ""; } catch { return ""; }
  });
  const [isSaving, setIsSaving] = useState(false);
  const emojiPickerRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const messagesEndRef = useRef(null);
  const [, setLastSeenTick] = useState(0);

  // Auto-refresh last seen display every 1 second
  useEffect(() => {
    const interval = setInterval(() => setLastSeenTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Use Ref to track selectedUser for the socket listener to avoid stale closures
  const selectedUserRef = useRef(selectedUser);
  const previousSelectedUserRef = useRef(null);
  useEffect(() => { selectedUserRef.current = selectedUser; }, [selectedUser]);

  useEffect(() => {
    document.body.classList.toggle("dark-mode", isDarkMode);
    localStorage.setItem("theme", isDarkMode ? "dark" : "light");
  }, [isDarkMode]);

  const handleAvatarClick = (e, email, isOwn = false) => {
    e.stopPropagation();
    setProfilePreviewUser({ email, isOwn });
  };

  const handleViewFullImage = (src, type = "media", name = "", isOwn = false) => {
    setProfilePreviewUser(null);
    setImageZoom(1);
    setImageViewerState({ open: true, src, type, name, isOwn });
  };

  const handleDownloadImage = (src, name) => {
    if (!src) return;
    const link = document.createElement("a");
    link.href = src;
    link.download = name || "image.jpg";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadMedia = (msg) => {
    if (!msg?.text?.data || downloadingId) return;
    const msgId = msg._id || msg.tempId;
    setDownloadingId(msgId);
    setDownloadProgress((prev) => ({ ...prev, [msgId]: 0 }));

    setTimeout(() => {
      try {
        setDownloadProgress((prev) => ({ ...prev, [msgId]: 30 }));
        const byteString = atob(msg.text.data.split(',')[1]);
        const mimeType = msg.text.type || "application/octet-stream";

        setDownloadProgress((prev) => ({ ...prev, [msgId]: 50 }));
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
          ia[i] = byteString.charCodeAt(i);
          if (i % Math.max(1, Math.floor(byteString.length / 20)) === 0) {
            setDownloadProgress((prev) => ({
              ...prev,
              [msgId]: Math.min(90, 50 + Math.round((i / byteString.length) * 40))
            }));
          }
        }

        setDownloadProgress((prev) => ({ ...prev, [msgId]: 95 }));
        const blob = new Blob([ab], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = msg.text.name || `download.${mimeType.split('/')[1] || "bin"}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        setDownloadProgress((prev) => ({ ...prev, [msgId]: 100 }));
      } catch (err) {
        console.error("Download error:", err);
      } finally {
        setTimeout(() => {
          setDownloadingId(null);
          setDownloadProgress((prev) => ({ ...prev, [msgId]: undefined }));
        }, 1000);
      }
    }, 100);
  };

  // Auto-scroll to bottom whenever messages or typing state changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typingUser]);

  // Close context menu on outside click
  useEffect(() => {
    const handleGlobalClick = () => setContextMenu(null);
    window.addEventListener("click", handleGlobalClick);
    return () => window.removeEventListener("click", handleGlobalClick);
  }, []);

  // Close emoji picker on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target)) {
        setShowEmojiPicker(false);
      }
    };
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setShowEmojiPicker(false);
        setShowAttachMenu(false);
      }
    };
    if (showEmojiPicker) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showEmojiPicker]);

  // Close attach menu on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(event.target)) {
        setShowAttachMenu(false);
      }
    };
    if (showAttachMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showAttachMenu]);

  const formatDay = (timestamp) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return "Today";
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    return date.toLocaleDateString(undefined, {
      month: "long",
      day: "numeric"
    });
  };

  const getDisplayName = (email) => {
    const normalized = normalizeEmail(email);
    return userNames[normalized] || (email || "").split("@")[0];
  };

  const chatHistoryRef = useRef({});
  useEffect(() => {
    chatHistoryRef.current = chatHistory;
  }, [chatHistory]);

  const safeLocalStorageSet = (key, value) => {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (err) {
      console.warn(`Failed to persist ${key} to localStorage`, err);
      return false;
    }
  };

  // Helper to safely persist limited chat history without large media blobs or bloat
  const persistHistory = (historyObj, currentUserEmail) => {
    if (!currentUserEmail) return;
    try {
      const sanitized = {};
      Object.keys(historyObj).forEach(key => {
        // Cap to last 30 messages and strip heavy base64 media content for storage
        sanitized[key] = historyObj[key].slice(-30).map(m => ({
          ...m,
          text: m.type === 'media' ? { ...m.text, data: null, persisted: false } : m.text
        }));
      });
      try {
        localStorage.setItem(`chatHistory_${currentUserEmail}`, JSON.stringify(sanitized));
      } catch (quotaError) {
        console.warn("Chat history quota exceeded, skipping local persistence.");
      }
    } catch (e) {
      console.error("Failed to persist chat history", e);
    }
  };

  useEffect(() => {
    if (!currentUser) {
      navigate("/");
      return;
    }

    const userData = {
      email: currentUser.email.toLowerCase(),
      profilePic: currentUser.profilePic,
      uid: currentUser.uid
    };
    setUser(userData);
    safeLocalStorageSet("user", JSON.stringify({
      email: userData.email,
      uid: userData.uid
    }));

    if (userData.profilePic) {
      setUserProfiles((prev) => ({
        ...prev,
        [userData.email.toLowerCase()]: userData.profilePic
      }));
    }

    const savedPicFromReg = localStorage.getItem(`profilePic_${userData.email.toLowerCase()}`);
    if (savedPicFromReg && !userData.profilePic) {
      setUser(prev => ({ ...prev, profilePic: savedPicFromReg }));
    }
  }, [currentUser, navigate]);

  // Load profiles from server on mount
  useEffect(() => {
    if (!user) return;
    const loadProfiles = async () => {
      try {
        const res = await fetch(`${API_URL}/api/users/profiles?emails=${encodeURIComponent(user.email)}`);
        const data = await res.json();
        if (data.success && data.profiles) {
          const newLastSeen = {};
          Object.entries(data.profiles).forEach(([email, profile]) => {
            if (profile.avatarUrl) {
              setUserProfiles(prev => ({ ...prev, [email]: profile.avatarUrl }));
              try { localStorage.setItem(`profilePic_${email}`, profile.avatarUrl); } catch {}
            }
            if (profile.displayName) {
              setUserNames(prev => ({ ...prev, [email]: profile.displayName }));
            }
            if (profile.lastSeen) {
              newLastSeen[email] = profile.lastSeen;
            }
          });
          if (Object.keys(newLastSeen).length > 0) {
            setLastSeen(prev => ({ ...prev, ...newLastSeen }));
          }
        }
      } catch (e) {
        console.warn("Failed to load profiles from server");
      }
    };
    loadProfiles();
  }, [user]);

  // Load chat history from localStorage and fetch recent chats on mount
  useEffect(() => {
    if (!user) return;

    const ensureSocket = async () => {
      if (!socket.connected) {
        try {
          await connectSocket();
          console.log("✅ Socket connected from Chat mount");
        } catch (err) {
          console.error("Socket connection failed from Chat:", err);
        }
      }
    };
    ensureSocket();

    const loadChatHistory = async () => {
      try {
        // 1. Load from localStorage first (for offline access)
        const savedHistory = localStorage.getItem(`chatHistory_${user.email}`);
        if (savedHistory) {
          try {
            const parsed = normalizeChatHistoryKeys(JSON.parse(savedHistory));
            setChatHistory(parsed);
            console.log("OK Loaded chat history from localStorage:", Object.keys(parsed).length, "conversations");
          } catch (e) {
            console.error("Failed to parse saved chat history", e);
          }
        }

        // 2. Fetch recent chats from server (to get the most up-to-date list)
        const recentChats = await fetchRecentChats(user.email);
        if (recentChats && recentChats.length > 0) {
          // Build chat history structure from recent chats for display purposes
          const historyFromServer = {};
          recentChats.forEach(chat => {
            if (chat.userEmail) {
              const emailKey = normalizeEmail(chat.userEmail);
              historyFromServer[emailKey] = [{
                _id: chat.messageId,
                sender: normalizeEmail(chat.sender) || emailKey,
                receiver: normalizeEmail(chat.receiver) || normalizeEmail(user.email),
                text: chat.lastMessage,
                type: chat.type,
                timestamp: chat.timestamp,
                status: chat.status,
                seen: false
              }];
            }
          });

          // Merge with existing localStorage data, preferring localStorage for full histories
          setChatHistory(prev => {
            const merged = normalizeChatHistoryKeys({ ...historyFromServer, ...prev });
            persistHistory(merged, user.email);
            return merged;
          });
          console.log("OK Loaded", recentChats.length, "recent chats from server");

          // Fetch profiles (including lastSeen) for recent chat partners
          const partnerEmails = recentChats.map(c => c.userEmail).filter(Boolean);
          if (partnerEmails.length > 0) {
            try {
              const profilesRes = await fetch(`${API_URL}/api/users/profiles?emails=${encodeURIComponent(partnerEmails.join(","))}`);
              const profilesData = await profilesRes.json();
              if (profilesData.success && profilesData.profiles) {
                const newLastSeen = {};
                Object.entries(profilesData.profiles).forEach(([email, profile]) => {
                  if (profile.avatarUrl) {
                    setUserProfiles(prev => ({ ...prev, [email]: profile.avatarUrl }));
                  }
                  if (profile.displayName) {
                    setUserNames(prev => ({ ...prev, [email]: profile.displayName }));
                  }
                  if (profile.lastSeen) {
                    newLastSeen[email] = profile.lastSeen;
                  }
                });
                if (Object.keys(newLastSeen).length > 0) {
                  setLastSeen(prev => ({ ...prev, ...newLastSeen }));
                }
              }
            } catch (e) {
              console.warn("Failed to load recent chat profiles");
            }
          }
        }
      } catch (error) {
        console.error("Error loading chat history:", error);
      }
    };

    loadChatHistory();
  }, [user]);

  useEffect(() => {
    if (!user || !socket) return;

    const handleJoin = () => {
      const joinData = { 
        email: user.email,
        profilePic: user.profilePic || userProfiles[user.email.toLowerCase()] || null,
        displayName: displayName || null,
        bio: bio || null
      };
      console.log("[socket] Joining socket with data:", { email: joinData.email, hasProfilePic: !!joinData.profilePic });
      socket.emit("join", joinData);
    };

    // Join immediately and on every reconnection
    handleJoin();
    socket.on("connect", handleJoin);

    // Subscribe to push notifications
    subscribeToPush(user.email.toLowerCase());

    const handleOnlineUsers = (users) => {
      if (socket) socket.currentOnlineUsers = users;
      setOnlineUsers(users);
    };
    socket.on("online-users", handleOnlineUsers);

    // Restore unread counts
    const storedUnread = localStorage.getItem(`unread_${user.email.toLowerCase()}`);
    if (storedUnread) {
      try { setUnreadMessages(JSON.parse(storedUnread)); } catch (e) { console.error('Failed to parse stored unread counts', e); }
    }

    socket.on("typing", ({ from }) => {
      const activeChat = selectedUserRef.current;
      const normalizedFrom = normalizeEmail(from);
      const normalizedActiveChat = normalizeEmail(activeChat);
      console.log(`[typing] Typing listener triggered: from=${normalizedFrom}, activeChat=${normalizedActiveChat}, match=${normalizedFrom === normalizedActiveChat}`);
      
      if (normalizedFrom && normalizedActiveChat && normalizedFrom === normalizedActiveChat) {
        console.log(`OK Typing indicator set for ${normalizedFrom}`);
        setTypingUser(normalizedFrom);
      } else {
        console.warn(`Error: Typing mismatch or empty: normalizedFrom=[${normalizedFrom}], normalizedActiveChat=[${normalizedActiveChat}]`);
      }
    });

    socket.on("stop-typing", ({ from }) => {
      const activeChat = selectedUserRef.current;
      const normalizedFrom = normalizeEmail(from);
      const normalizedActiveChat = normalizeEmail(activeChat);
      console.log(`[typing] Stop-typing listener triggered: from=${normalizedFrom}, activeChat=${normalizedActiveChat}, match=${normalizedFrom === normalizedActiveChat}`);
      
      if (normalizedFrom && normalizedActiveChat && normalizedFrom === normalizedActiveChat) {
        console.log(`OK Typing indicator cleared`);
        setTypingUser(null);
        return;
      }
      setTypingUser((currentTypingUser) => {
        if (currentTypingUser && normalizeEmail(currentTypingUser) === normalizedFrom) {
          console.log(`OK Fallback stop-typing cleared for ${normalizedFrom}`);
          return null;
        }
        return currentTypingUser;
      });
    });

    socket.on("last-seen", (data) => {
      setLastSeen((prev) => ({
        ...prev,
        [data.userId]: data.time,
      }));
    });

    // Listen for unread message updates from server
    socket.on("unread-update", (unreadData) => {
      console.log("[unread] Unread messages updated:", unreadData);
      const myEmail = normalizeEmail(user.email);
      setUnreadMessages((prev) => {
        const next = { ...prev };
        Object.entries(unreadData || {}).forEach(([key, count]) => {
          if (!key.endsWith(`_${myEmail}`)) return;
          if (count > 0) {
            next[key] = count;
          } else {
            delete next[key];
          }
        });
        try {
          localStorage.setItem(`unread_${user.email}`, JSON.stringify(next));
        } catch (e) {
          console.error("Failed to persist unread counts", e);
        }
        return next;
      });
    });

    // Listen for profile picture updates
    socket.on("user-profile-update", (data) => {
      console.log("[profile] Profile update:", data);
      const updatedEmail = data.email.toLowerCase();
      
      // Handle profile picture updates (including removal)
      if (data.hasOwnProperty('profilePic')) {
        setUserProfiles((prev) => {
          const updated = { ...prev };
          
          if (data.profilePic === null || data.profilePic === "") {
            // Remove profile picture
            delete updated[updatedEmail];
            // Also remove from localStorage
            try {
              localStorage.removeItem(`profilePic_${updatedEmail}`);
            } catch (e) {
              console.warn("Failed to remove profile pic from localStorage");
            }
          } else {
            // Update profile picture
            updated[updatedEmail] = data.profilePic;
            // Store in localStorage
            try {
              localStorage.setItem(`profilePic_${updatedEmail}`, data.profilePic);
            } catch (e) {
              console.warn("Failed to store profile pic in localStorage");
            }
          }
          
          // Persist all profiles to localStorage
          try {
            if (user) {
              const toStore = {};
              Object.entries(updated).forEach(([k, v]) => {
                if (v && typeof v === "string" && v.length < 500000) {
                  toStore[k] = v;
                }
              });
              localStorage.setItem(`userProfiles_${user.email.toLowerCase()}`, JSON.stringify(toStore));
            }
          } catch (e) {
            console.warn("Failed to persist user profiles to localStorage");
          }
          
          return updated;
        });
      }
      
      // Handle display name and bio updates
      if (data.displayName !== undefined || data.bio !== undefined) {
        setUserNames((prev) => {
          const updated = {
            ...prev,
            [updatedEmail]: data.displayName || null,
          };
          try {
            if (user) {
              localStorage.setItem(`userNames_${user.email.toLowerCase()}`, JSON.stringify(updated));
            }
          } catch (e) {
            console.warn("Failed to persist user names to localStorage");
          }
          return updated;
        });
      }
    });

    const handleChatCleared = ({ user1, user2, scope }) => {
      const clearedFor = normalizeEmail(user1);
      const partner = normalizeEmail(user2);
      if (clearedFor !== normalizeEmail(user.email)) return;

      setChatHistory((prev) => {
        const updated = { ...prev };
        // Keep the entry with an empty array so conversation stays visible
        updated[partner] = [];
        persistHistory(updated, user.email);
        return updated;
      });

      if (selectedUserRef.current && normalizeEmail(selectedUserRef.current) === partner) {
        setMessages([]);
      }

      setUnreadMessages((prev) => {
        const key = `${partner}_${normalizeEmail(user.email)}`;
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        try {
          localStorage.setItem(`unread_${user.email}`, JSON.stringify(next));
        } catch (e) {
          console.error("Failed to persist unread counts", e);
        }
        return next;
      });
    };

    socket.on("chat-cleared", handleChatCleared);

    const handleMessageSaved = ({ tempId, _id, timestamp, status }) => {
      const applySaved = (list) =>
        list.map((m) =>
          m.tempId === tempId
            ? { ...m, _id, timestamp: timestamp || m.timestamp, pending: false, status: status || m.status }
            : m
        );

      setChatHistory((prev) => {
        const updated = { ...prev };
        Object.keys(updated).forEach((key) => {
          updated[key] = applySaved(updated[key] || []);
        });
        persistHistory(updated, user.email);
        return updated;
      });

      if (selectedUserRef.current) {
        setMessages((prev) => applySaved(prev));
      }
    };

    socket.on("message-saved", handleMessageSaved);

    const handleMessageError = ({ tempId }) => {
      const markFailed = (list) =>
        list.map((m) => (m.tempId === tempId ? { ...m, failed: true, pending: false } : m));

      setMessages((prev) => markFailed(prev));
      setChatHistory((prev) => {
        const updated = { ...prev };
        Object.keys(updated).forEach((key) => {
          updated[key] = markFailed(updated[key] || []);
        });
        return updated;
      });
    };

    socket.on("message-error", handleMessageError);

    // Listen for message deletion
    socket.on("message-deleted", ({ messageId, sender, receiver }) => {
      const senderEmail = sender.toLowerCase();
      const receiverEmail = receiver.toLowerCase();
      const currentUserEmail = user.email.toLowerCase();
      const otherParty = senderEmail === currentUserEmail ? receiverEmail : senderEmail;

      setChatHistory((prev) => {
        const currentHistory = prev[otherParty] || [];
        const updated = {
          ...prev,
          [otherParty]: currentHistory.filter(m => (m._id !== messageId && m.tempId !== messageId))
        };
        persistHistory(updated, user?.email);
        return updated;
      });

      if (selectedUserRef.current && selectedUserRef.current.toLowerCase() === otherParty) {
        setMessages((prev) => prev.filter(m => (m._id !== messageId && m.tempId !== messageId)));
      }
    });

    // Listen for incoming messages globally (even when not in the room)
    const handleIncomingMessage = (msg) => {
      const otherParty = getOtherParty(msg, user.email);
      const isActiveChat =
        selectedUserRef.current &&
        normalizeEmail(selectedUserRef.current) === otherParty;

      setChatHistory((prev) => {
        const currentHistory = prev[otherParty] || [];
        const updated = {
          ...prev,
          [otherParty]: upsertMessageInList(currentHistory, msg),
        };
        persistHistory(updated, user.email);
        return updated;
      });

      if (isActiveChat) {
        setMessages((prev) => upsertMessageInList(prev, msg));
        socket.emit("mark-as-read", {
          user1: normalizeEmail(user.email),
          user2: otherParty,
        });
      } else if (normalizeEmail(msg.sender) !== normalizeEmail(user.email)) {
        setUnreadMessages((prev) => {
          const key = `${otherParty}_${normalizeEmail(user.email)}`;
          const newCounts = { ...prev, [key]: (prev[key] || 0) + 1 };
          try {
            localStorage.setItem(`unread_${user.email}`, JSON.stringify(newCounts));
          } catch (e) {
            console.error("Failed to persist unread counts", e);
          }
          return newCounts;
        });
      }
    };

    socket.on("receive-message", handleIncomingMessage);

    // Listen for undelivered messages (status: sent) sent while user was offline
    socket.on("undelivered-messages", (msgs) => {
      console.log("[undelivered] Undelivered messages received:", msgs.length);
      const myEmail = normalizeEmail(user.email);
      const unreadByPartner = {};

      msgs.forEach((msg) => {
        const otherParty = getOtherParty(msg, myEmail);
        setChatHistory((prev) => {
          const currentHistory = prev[otherParty] || [];
          const updated = {
            ...prev,
            [otherParty]: upsertMessageInList(currentHistory, msg),
          };
          persistHistory(updated, user.email);
          return updated;
        });

        if (
          selectedUserRef.current &&
          normalizeEmail(selectedUserRef.current) === otherParty
        ) {
          setMessages((prev) => upsertMessageInList(prev, msg));
          socket.emit("mark-as-read", {
            user1: myEmail,
            user2: otherParty,
          });
        } else if (normalizeEmail(msg.sender) !== myEmail) {
          unreadByPartner[otherParty] = (unreadByPartner[otherParty] || 0) + 1;
        }
      });

      if (Object.keys(unreadByPartner).length > 0) {
        setUnreadMessages((prev) => {
          const next = { ...prev };
          Object.entries(unreadByPartner).forEach(([partner, count]) => {
            const key = `${partner}_${myEmail}`;
            next[key] = Math.max(next[key] || 0, count);
          });
          try {
            localStorage.setItem(`unread_${user.email}`, JSON.stringify(next));
          } catch (e) {
            console.error("Failed to persist unread counts", e);
          }
          return next;
        });
      }
    });

    // Listen for message-status-update (sent ✓, delivered ✓✓)
    socket.on("message-status-update", ({ messageId, tempId, status }) => {
      const applyStatus = (list) =>
        list.map((m) =>
          (m._id === messageId || m.tempId === tempId)
            ? { ...m, status, pending: false }
            : m
        );

      setChatHistory((prev) => {
        const updated = { ...prev };
        Object.keys(updated).forEach((key) => {
          updated[key] = applyStatus(updated[key] || []);
        });
        return updated;
      });

      if (selectedUserRef.current) {
        setMessages((prev) => applyStatus(prev));
      }
    });

    // Listen for messages-read (receiver read our messages -> ✓✓ blue)
    socket.on("messages-read", ({ sender, receiver }) => {
      const myEmail = normalizeEmail(user.email);
      if (normalizeEmail(sender) === myEmail) {
        const otherParty = normalizeEmail(receiver);
        setChatHistory((prev) => {
          const updated = { ...prev };
          if (updated[otherParty]) {
            updated[otherParty] = updated[otherParty].map((m) =>
              normalizeEmail(m.sender) === myEmail ? { ...m, status: "read" } : m
            );
          }
          return updated;
        });
        if (
          selectedUserRef.current &&
          normalizeEmail(selectedUserRef.current) === otherParty
        ) {
          setMessages((prev) =>
            prev.map((m) =>
              normalizeEmail(m.sender) === myEmail ? { ...m, status: "read" } : m
            )
          );
        }
      }
    });

    return () => {
      socket.off("connect", handleJoin);
      socket.off("online-users", handleOnlineUsers);
      socket.off("typing");
      socket.off("stop-typing");
      socket.off("last-seen");
      socket.off("unread-update");
      socket.off("user-profile-update");
      socket.off("chat-cleared", handleChatCleared);
      socket.off("message-saved", handleMessageSaved);
      socket.off("message-error", handleMessageError);
      socket.off("message-deleted");
      socket.off("receive-message", handleIncomingMessage);
      socket.off("undelivered-messages");
      socket.off("message-status-update");
      socket.off("messages-read");
    };
  }, [socket, user]);

  // Visibility and offline handlers
  useEffect(() => {
    if (!socket || !user) return;

    const emitVisiblePresence = () => {
      if (document.hidden) {
        socket.emit("leave", { email: user.email.toLowerCase() });
      } else {
        const joinData = { email: user.email.toLowerCase() };
        if (user.profilePic) {
          joinData.profilePic = user.profilePic;
        }
        socket.emit("join", joinData);
      }
    };

    const handleBlur = () => {
      socket.emit("leave", { email: user.email.toLowerCase() });
    };

    const handleFocus = () => {
      const joinData = { email: user.email.toLowerCase() };
      if (user.profilePic) {
        joinData.profilePic = user.profilePic;
      }
      socket.emit("join", joinData);
    };

    const handleBeforeUnload = () => {
      socket.disconnect();
    };

    document.addEventListener("visibilitychange", emitVisiblePresence);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", emitVisiblePresence);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [socket, user]);

  // Fetch profiles for online users when list changes
  useEffect(() => {
    if (!user) return;
    const unknown = onlineUsers.filter(u => !userNames[u.toLowerCase().trim()] && u.toLowerCase().trim() !== user.email.toLowerCase());
    if (unknown.length === 0) return;
    const fetchProfiles = async () => {
      try {
        const res = await fetch(`${API_URL}/api/users/profiles?emails=${encodeURIComponent(unknown.join(","))}`);
        const data = await res.json();
        if (data.success && data.profiles) {
          Object.entries(data.profiles).forEach(([email, profile]) => {
            if (profile.avatarUrl) {
              setUserProfiles(p => ({ ...p, [email]: profile.avatarUrl }));
            }
            if (profile.displayName) {
              setUserNames(p => ({ ...p, [email]: profile.displayName }));
            }
          });
        }
      } catch {}
    };
    fetchProfiles();
  }, [onlineUsers, user]);

  // Socket heartbeat every 25 seconds
  useEffect(() => {
    if (!socket || !user) return;
    const sendHeartbeat = () => {
      if (socket.connected) {
        socket.emit("heartbeat", user.email);
      }
    };
    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 25000);
    return () => clearInterval(interval);
  }, [socket, user]);

  useEffect(() => {
    const syncChat = async () => {
      if (!user || !selectedUser || !socket) return;
      const partner = normalizeEmail(selectedUser);

      console.log(`[chat] Joining room and fetching history: ${user.email} <-> ${partner}`);

      // 1. Join room
      socket.emit("join-room", { user1: user.email, user2: partner });
      
      // 2. Mark messages as read
      socket.emit("mark-as-read", { user1: user.email, user2: partner });
      
      // 3. Fetch full history from Database (Fixes the "no msg show" issue)
      try {
        const history = await fetchMessages(user.email, partner) || [];
        
        setChatHistory(prev => {
          const updated = { ...prev, [partner]: history };
          persistHistory(updated, user.email);
          return updated;
        });
        setMessages(prev => {
          // Merge history with any new messages that arrived via socket while fetching
          const historyIds = new Set(history.map(m => m._id).filter(Boolean));
          const historyTempIds = new Set(history.map(m => m.tempId).filter(Boolean));
          const uniqueLiveMessages = prev.filter(m => !historyIds.has(m._id) && !historyTempIds.has(m.tempId));
          const merged = [...history, ...uniqueLiveMessages];
          // Always sort to ensure chronological order regardless of fetch timing
          return merged.sort((a, b) => new Date(a.timestamp || a.createdAt) - new Date(b.timestamp || b.createdAt));
        });
      } catch (err) {
        console.error("Failed to fetch messages:", err);
        const cached = chatHistoryRef.current[partner];
        if (cached?.length) {
          setMessages(
            cached.sort(
              (a, b) => new Date(a.timestamp || a.createdAt) - new Date(b.timestamp || b.createdAt)
            )
          );
        }
      }
    };

    syncChat();
  }, [selectedUser, user, socket]);

  const stopTyping = () => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    if (user && selectedUser && socket && socket.connected) {
      const normalizedUser = normalizeEmail(user.email);
      const normalizedSelected = normalizeEmail(selectedUser);
      
      if (!normalizedUser || !normalizedSelected) {
        console.warn("Error: Stop-typing aborted: invalid email normalization");
        return;
      }
      
      const stopPayload = { from: normalizedUser, to: normalizedSelected };
      console.log("[emit] Emitting stop-typing:", stopPayload);
      socket.emit("stop-typing", stopPayload);
    } else {
      console.debug("Warning: Stop-typing not sent: missing user, selectedUser, socket, or not connected");
    }
  };

  useEffect(() => {
    setTypingUser(null);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }

    if (user && socket && socket.connected && previousSelectedUserRef.current) {
      const stopPayload = {
        from: normalizeEmail(user.email),
        to: normalizeEmail(previousSelectedUserRef.current),
      };
      socket.emit("stop-typing", stopPayload);
    }

    previousSelectedUserRef.current = selectedUser;
  }, [selectedUser, user, socket]);

  const handleTyping = (e) => {
    const val = e.target.value;
    setMessage(val);

    if (!user || !selectedUser || !socket) {
      console.warn("Error: Typing aborted: missing user, selectedUser, or socket");
      return;
    }

    if (!socket.connected) {
      console.warn("Error: Socket not connected, typing not sent");
      return;
    }

    const normalizedUser = normalizeEmail(user.email);
    const normalizedSelected = normalizeEmail(selectedUser);

    if (!normalizedUser || !normalizedSelected) {
      console.warn("Error: Typing aborted: invalid email normalization", { user: user.email, selected: selectedUser });
      return;
    }

    if (val.trim() === "") {
      stopTyping();
      return;
    }

    const typingPayload = { from: normalizedUser, to: normalizedSelected };
    console.log("[emit] Emitting typing:", typingPayload);
    socket.emit("typing", typingPayload);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      console.log("[timer] Typing timeout reached - auto stopping typing");
      stopTyping();
    }, 3000); // Timeout for better UX
  };

  const sendMessage = () => {
    if (!user || !selectedUser || !message.trim() || !socket) return;

    // Check if socket is connected
    if (!socket.connected) {
      alert("Error: You are offline. Please check your connection.");
      return;
    }

    ensureSocketJoined();

    const msgText = message;
    const tempId = `${Date.now()}-${Math.random()}`;
    console.log(`[emit] Sending message from ${user.email} to ${selectedUser}: "${msgText}"`);

    // Create message object
    const newMsg = {
      sender: user.email,
      receiver: selectedUser,
      text: msgText,
      type: "text",
      tempId: tempId,
      timestamp: new Date().toISOString(),
      senderDisplayName: getDisplayName(user.email),
      textPreview: msgText.substring(0, 100),
      deviceId: localStorage.getItem("deviceId") || undefined,
    };

    // Add reply metadata if replying
    if (replyTo) {
      newMsg.replyTo = {
        id: replyTo._id || replyTo.tempId,
        text: replyTo.type === 'media' ? 'Media file' : replyTo.text,
        sender: replyTo.sender
      };
    }

    const optimisticMsg = { ...newMsg, pending: true, status: 'sent', _id: tempId };
    const partner = normalizeEmail(selectedUser);

    setChatHistory((prev) => ({
      ...prev,
      [partner]: upsertMessageInList(prev[partner] || [], optimisticMsg),
    }));
    setMessages((prev) => upsertMessageInList(prev, optimisticMsg));

    socket.emit("send-message", newMsg, (ack) => {
      if (ack && ack.ok === false) {
        setMessages((prev) =>
          prev.map((m) => (m.tempId === tempId ? { ...m, failed: true, pending: false } : m))
        );
      }
    });

    stopTyping();
    setMessage("");
    setReplyTo(null);
  };

  const handleMediaShare = async (e) => {
    const file = e.target.files[0];
    if (!file || !user || !selectedUser || !socket) return;

    if (!socket.connected) {
      alert("Error: You are offline. Please check your connection.");
      e.target.value = null;
      return;
    }

    ensureSocketJoined();

    if (isMediaSending) {
      alert("Please wait: File is already being sent. Please wait...");
      e.target.value = null;
      return;
    }

    const isImage = file.type.startsWith('image/');

    const ext = file.name?.split('.').pop()?.toLowerCase() || '';
    const audioExts = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'wma', 'opus', 'm4b', 'm4p', 'amr', '3gp', 'weba'];
    const videoExts = ['mp4', 'webm', 'avi', 'mov', 'mkv', 'flv', 'wmv', 'm4v', 'mpg', 'mpeg'];

    const mediaType = audioExts.includes(ext) ? 'audio' : videoExts.includes(ext) ? 'video' : file.type.split('/')[0];

    const maxSize = isImage ? 5 * 1024 * 1024 : 25 * 1024 * 1024;

    if (file.size > maxSize) {
      alert(`File size must be less than ${isImage ? '5MB' : '25MB'}. Your file is ${(file.size / 1024 / 1024).toFixed(2)}MB`);
      e.target.value = null;
      return;
    }

    setIsMediaSending(true);
    setUploadProgress(0);
    const tempId = `${Date.now()}-${Math.random()}`;

    try {
      let dataUrl;

      if (isImage) {
        dataUrl = await compressImage(file, 1200, 0.85);
        setUploadProgress(50);
      } else {
        dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onprogress = (e) => {
            if (e.lengthComputable) {
              setUploadProgress(Math.round((e.loaded / e.total) * 50));
            }
          };
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error("Failed to read file"));
          reader.readAsDataURL(file);
        });
      }

      setUploadProgress(70);

      let fileData = {
        name: file.name,
        type: isImage ? "image/jpeg" : file.type,
        size: isImage ? Math.round(dataUrl.length * 0.75) : file.size,
        data: dataUrl
      };

      const newMsg = {
        sender: user.email,
        receiver: selectedUser,
        text: fileData,
        type: "media",
        mediaType,
        tempId: tempId,
        timestamp: new Date().toISOString()
      };

      setUploadProgress(85);

      const optimisticMsg = { ...newMsg, pending: true, status: 'sent', _id: tempId };
      const partner = normalizeEmail(selectedUser);

      setChatHistory((prev) => ({
        ...prev,
        [partner]: upsertMessageInList(prev[partner] || [], optimisticMsg),
      }));
      setMessages((prev) => upsertMessageInList(prev, optimisticMsg));

      setUploadProgress(95);

      socket.emit("send-message", newMsg, (ack) => {
        if (!ack || ack.ok === false) {
          setMessages((prev) =>
            prev.map((m) => (m.tempId === tempId ? { ...m, failed: true, pending: false } : m))
          );
        }
        setUploadProgress(100);
        setTimeout(() => { setIsMediaSending(false); setUploadProgress(0); }, 500);
      });

    } catch (err) {
      console.error("Error: Error processing file:", err);
      alert("Error: Error sending file. Please try again.");
      setIsMediaSending(false);
      setUploadProgress(0);
    } finally {
      e.target.value = null;
    }
  };

  const clearChatForPartner = (partnerEmail) => {
    if (!user || !socket?.connected || !partnerEmail) return;

    socket.emit(
      "clear-chat",
      { user1: normalizeEmail(user.email), user2: normalizeEmail(partnerEmail) },
      (ack) => {
        if (!ack?.ok) {
          alert("Failed to clear chat. Please try again.");
        }
      }
    );

    const partner = normalizeEmail(partnerEmail);
    setChatHistory((prev) => {
      const updated = { ...prev };
      // Keep the entry with an empty array so the conversation stays in Recent Chats
      updated[partner] = [];
      persistHistory(updated, user.email);
      return updated;
    });

    if (selectedUser && normalizeEmail(selectedUser) === partner) {
      setMessages([]);
    }

    setUnreadMessages((prev) => {
      const key = `${partner}_${normalizeEmail(user.email)}`;
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      try {
        localStorage.setItem(`unread_${user.email}`, JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };

  const handleMarkAllRead = () => {
    if (!user) return;
    const key = `unread_${user.email}`;
    try {
      localStorage.setItem(key, JSON.stringify({}));
    } catch (e) {}
    setUnreadMessages({});
  };

  const handleClearCurrentChat = () => {
    if (!selectedUser) return;
    if (
      window.confirm(
        "Clear this chat for you only? The other person will still see all messages."
      )
    ) {
      clearChatForPartner(selectedUser);
    }
  };

  const handleClearAllHistory = () => {
    if (!user) return;
    if (
      window.confirm(
        "Clear all recent chats from your list? This will not delete the messages from the server."
      )
    ) {
      localStorage.removeItem(`chatHistory_${user.email}`);
      localStorage.removeItem(`unread_${user.email}`);
      setChatHistory({});
      setMessages([]);
      setUnreadMessages({});
      setSelectedUser(null);
    }
  };

  const handleRemoveChatFromRecent = (e, partnerEmail) => {
    e.stopPropagation();
    if (!user || !partnerEmail) return;

    if (window.confirm(`Remove ${partnerEmail} from your recent chats?`)) {
      const partner = normalizeEmail(partnerEmail);
      
      setChatHistory((prev) => {
        const updated = { ...prev };
        delete updated[partner];
        persistHistory(updated, user.email);
        return updated;
      });

      if (selectedUser && normalizeEmail(selectedUser) === partner) {
        setMessages([]);
        setSelectedUser(null);
      }

      setUnreadMessages((prev) => {
        const key = `${partner}_${normalizeEmail(user.email)}`;
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        try {
          localStorage.setItem(`unread_${user.email}`, JSON.stringify(next));
        } catch (e) {}
        return next;
      });

      fetch(`${API_URL}/api/messages/clear`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: user.email, partner }),
      }).catch(() => {});
    }
  };

  const handleArchiveChat = (e, partnerEmail) => {
    e.stopPropagation();
    if (!user || !partnerEmail) return;
    const partner = normalizeEmail(partnerEmail);
    const newArchived = [...archivedChats.filter(a => normalizeEmail(a) !== partner), partner];
    setArchivedChats(newArchived);
    try {
      localStorage.setItem(`archivedChats_${user.email}`, JSON.stringify(newArchived));
    } catch (e) {}
    if (selectedUser && normalizeEmail(selectedUser) === partner) {
      setMessages([]);
      setSelectedUser(null);
    }
  };

  const handleUnarchiveChat = (e, partnerEmail) => {
    e.stopPropagation();
    if (!user || !partnerEmail) return;
    const partner = normalizeEmail(partnerEmail);
    const newArchived = archivedChats.filter(a => normalizeEmail(a) !== partner);
    setArchivedChats(newArchived);
    setActiveTab("recent");
    try {
      localStorage.setItem(`archivedChats_${user.email}`, JSON.stringify(newArchived));
    } catch (e) {}
    // Ensure the conversation appears in chatHistory if we have data for it
    if (!chatHistory[partner]) {
      // Fetch from server if not in local history
      fetchMessages(user.email, partnerEmail).then(msgs => {
        if (msgs && msgs.length > 0) {
          setChatHistory(prev => ({ ...prev, [partner]: msgs }));
        } else {
          // Keep an empty entry so it shows in the list
          setChatHistory(prev => ({ ...prev, [partner]: prev[partner] || [] }));
        }
      }).catch(() => {
        setChatHistory(prev => ({ ...prev, [partner]: prev[partner] || [] }));
      });
    }
  };

  const handleContextMenu = (e, msg) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      message: msg
    });
  };

  const handleDeleteMessage = (msg) => {
    if (window.confirm("Are you sure you want to delete this message?")) {
      socket.emit("delete-message", { 
        messageId: msg._id || msg.tempId, 
        sender: msg.sender, 
        receiver: msg.receiver 
      });
    }
  };

  const handleUpdateProfilePic = async (e) => {
    const file = e.target.files[0];
    if (!file || !user) return;
    e.target.value = null;

    const validation = validateImageFile(file);
    if (!validation.valid) {
      alert(validation.error);
      return;
    }

    try {
      const compressed = await compressImage(file, 500, 0.8);
      setShowSettings(false);
      setProfilePreviewUser(null);
      setCropState({ open: true, src: compressed, file });
    } catch (err) {
      console.error("Failed to process image:", err);
      alert("Failed to process image. Please try a different file.");
    }
  };

  const handleCropSave = (croppedDataUrl) => {
    if (!user || !user.email) return;
    const email = user.email.toLowerCase();
    
    // Update local user state
    const updatedUser = { ...user, profilePic: croppedDataUrl };
    setUser(updatedUser);
    
    // Store in localStorage
    safeLocalStorageSet("user", JSON.stringify({ email: updatedUser.email, uid: updatedUser.uid }));
    safeLocalStorageSet(`profilePic_${email}`, croppedDataUrl);
    
    // Update userProfiles state
    setUserProfiles(prev => {
      const updated = { ...prev, [email]: croppedDataUrl };
      
      // Persist to localStorage
      try {
        const toStore = {};
        Object.entries(updated).forEach(([k, v]) => {
          if (v && typeof v === "string" && v.length < 500000) {
            toStore[k] = v;
          }
        });
        localStorage.setItem(`userProfiles_${email}`, JSON.stringify(toStore));
      } catch (e) {
        console.warn("Failed to persist user profiles to localStorage");
      }
      
      return updated;
    });

    // Persist to database
    fetch(`${API_URL}/api/users/avatar`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, avatarUrl: croppedDataUrl }),
    }).catch((err) => {
      console.error("Failed to update avatar on server:", err);
    });

    // Broadcast via socket to all connected clients
    if (socket && socket.connected) {
      socket.emit("update-profile", { email: user.email, profilePic: croppedDataUrl });
    }

    // Close crop modal
    setCropState({ open: false, src: null, file: null });
  };

  const handleSaveSettings = async () => {
    if (!user || !user.email) return;
    setIsSaving(true);
    try {
      const email = user.email.toLowerCase();
      const updatedUser = { ...user, displayName, bio };
      setUser(updatedUser);
      
      // Update local state immediately for real-time feel
      setUserNames(prev => ({ ...prev, [email]: displayName }));
      
      // Update localStorage
      try {
        const stored = JSON.parse(localStorage.getItem("user") || "{}");
        localStorage.setItem("user", JSON.stringify({ ...stored, displayName, bio }));
      } catch (e) {}

      // Persist to database
      const res = await fetch(`${API_URL}/api/users/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, displayName, bio }),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error("Failed to save profile");
      }

      // Broadcast to all connected users via socket
      if (socket) {
        socket.emit("update-profile", { email: user.email, displayName, bio });
      }

      setShowSettings(false);
    } catch (err) {
      console.error("Failed to save settings:", err);
      alert("Failed to save changes. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveProfilePic = () => {
    if (!user) return;
    const email = user.email.toLowerCase();
    
    // Update local user state
    const updatedUser = { ...user, profilePic: null };
    setUser(updatedUser);
    
    // Remove from localStorage
    localStorage.removeItem(`profilePic_${email}`);
    safeLocalStorageSet("user", JSON.stringify({
      email: updatedUser.email,
      uid: updatedUser.uid
    }));
    
    // Update userProfiles state
    setUserProfiles(prev => {
      const updated = { ...prev };
      delete updated[email];
      
      // Update localStorage for userProfiles
      try {
        const toStore = {};
        Object.entries(updated).forEach(([k, v]) => {
          if (v && typeof v === "string" && v.length < 500000) {
            toStore[k] = v;
          }
        });
        localStorage.setItem(`userProfiles_${email}`, JSON.stringify(toStore));
      } catch (e) {
        console.warn("Failed to update userProfiles in localStorage");
      }
      
      return updated;
    });

    // Persist to database
    fetch(`${API_URL}/api/users/avatar`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, avatarUrl: null }),
    }).catch((err) => {
      console.error("Failed to update avatar on server:", err);
    });

    // Broadcast via socket to all connected clients
    if (socket && socket.connected) {
      socket.emit("remove-profile-pic", { email: user.email });
    }
    
    // Close any open modals
    setShowSettings(false);
    setProfilePreviewUser(null);
  };

  const ensureSocketJoined = () => {
    if (!socket || !user) return;
    const joinData = { email: normalizeEmail(user.email) };
    if (user.profilePic) {
      joinData.profilePic = user.profilePic;
    }
    socket.emit("join", joinData);
  };

  const performLogout = () => {
    if (socket && user) {
      socket.emit("leave", { email: normalizeEmail(user.email) });
    }
    setShowLogoutConfirm(false);
    navigate("/feedback");
    auth.signOut().then(() => {
      localStorage.removeItem("user");
    });
  };

  const handleDeleteAccount = async () => {
    setDeleteError("");
    if (!deletePassword) {
      setDeleteError("Please enter your password to confirm.");
      return;
    }
    setDeleting(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, deletePassword);
      await reauthenticateWithCredential(auth.currentUser, credential);

      const res = await fetch(`${API_URL}/api/users/delete-account`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email }),
      });
      if (!res.ok) throw new Error("Failed to delete account data from server");

      await deleteUser(auth.currentUser);

      if (socket && user) {
        socket.emit("leave", { email: normalizeEmail(user.email) });
      }
      localStorage.clear();
      setShowDeleteConfirm(false);
      navigate("/");
    } catch (err) {
      const errorMap = {
        "auth/wrong-password": "Incorrect password.",
        "auth/invalid-credential": "Incorrect password.",
        "auth/too-many-requests": "Too many attempts. Try again later.",
        "auth/requires-recent-login": "Please log out and log back in, then try again.",
      };
      setDeleteError(errorMap[err.code] || err.message.replace("Firebase: ", ""));
    } finally {
      setDeleting(false);
    }
  };

  const handleUserSelect = (u) => {
    const partner = normalizeEmail(u);
    setSelectedUser(partner);
    setSidebarOpen(false);
    
    // Update messages when user is selected, ensuring chronological order
    if (chatHistory[partner]) {
      setMessages([...chatHistory[partner]].sort((a, b) => new Date(a.timestamp || a.createdAt) - new Date(b.timestamp || b.createdAt)));
    } else {
      setMessages([]);
    }

    // Mark messages as read on server
    if (socket && socket.connected && user) {
      socket.emit("mark-as-read", { user1: user.email, user2: partner });
      socket.emit("seen-message", { sender: partner, receiver: user.email });
    }

    // Clear unread badge for this chat immediately
    if (user) {
      setUnreadMessages(prev => {
        const key = `${partner}_${normalizeEmail(user.email)}`;
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        try { localStorage.setItem(`unread_${user.email}`, JSON.stringify(next)); } catch (e) {}
        return next;
      });
    }
  };

  // Filter out current user from the user list
  const otherOnlineUsers = onlineUsers.filter(u => 
    u.toLowerCase().trim() !== user?.email?.toLowerCase().trim()
  );
  
  // Get recent chats sorted by latest message (exclude archived)
  const archivedSet = new Set(archivedChats.map(a => normalizeEmail(a)));
  const recentChats = Object.keys(chatHistory)
    .filter(u => u !== user?.email && !archivedSet.has(normalizeEmail(u)))
    .sort((a, b) => {
      const historyA = chatHistory[a] || [];
      const historyB = chatHistory[b] || [];
      const lastA = historyA[historyA.length - 1];
      const lastB = historyB[historyB.length - 1];
      const timeA = new Date(lastA?.timestamp || lastA?.createdAt || 0);
      const timeB = new Date(lastB?.timestamp || lastB?.createdAt || 0);
      return new Date(timeB) - new Date(timeA);
    });

  // Archived chats list
  const archivedChatsList = archivedChats.filter(a => {
    return chatHistory[normalizeEmail(a)] || true;
  });

  const isUserOnline = (userEmail) =>
    onlineUsers.some((u) => normalizeEmail(u) === normalizeEmail(userEmail));

  // Get unread count for a user
  const getUnreadCount = (otherUser) => {
    if (!user || !otherUser) return 0;
    const key = `${otherUser.toLowerCase()}_${user.email.toLowerCase()}`;
    return unreadMessages[key] || 0;
  };

  const searchValue = searchTerm.trim().toLowerCase();
  const filteredRecentChats = recentChats.filter((u) => {
    const normalizedEmail = normalizeEmail(u);
    return (
      normalizedEmail.includes(searchValue) ||
      getDisplayName(u).includes(searchValue)
    );
  });
  const filteredOnlineUsers = otherOnlineUsers.filter((u) => {
    const normalizedEmail = normalizeEmail(u);
    return (
      normalizedEmail.includes(searchValue) ||
      getDisplayName(u).includes(searchValue)
    );
  });

  const totalUnread = filteredRecentChats.reduce((sum, u) => sum + getUnreadCount(u), 0);

  const renderTabContent = (type) => {
    if (type === "mobile-recent") {
      return (
        <div className="sidebar-section">
          <div className="sidebar-list">
            {filteredRecentChats.length > 0 ? filteredRecentChats.map((u, i) => {
              const unreadCount = getUnreadCount(u);
              return (
                <div key={`mr-${i}`} className={`user-item ${selectedUser === u ? "active" : ""}`} onClick={() => { handleUserSelect(u); setActiveTab("chat"); }}>
                  <div className="avatar-wrap">
                    <Avatar src={userProfiles[u]} email={u} size={40} className="user-avatar" onClick={(e) => handleAvatarClick(e, u, false)} />
                    {isUserOnline(u) && <span className="status-dot online" />}
                  </div>
                  <div className="user-item-copy">
                    <span className="user-name">{getDisplayName(u)}</span>
                    <span className="user-last">{isUserOnline(u) ? "Online" : formatLastSeen(lastSeen[u])}</span>
                  </div>
                  <div className="user-item-actions">
                    {unreadCount > 0 && <span className="unread-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>}
                    <button className="remove-recent-btn" onClick={(e) => handleArchiveChat(e, u)} title="Archive chat">
                      <Archive size={14} />
                    </button>
                    <button className="remove-recent-btn" onClick={(e) => handleRemoveChatFromRecent(e, u)} title="Remove from list">
                      <X size={14} />
                    </button>
                  </div>
                </div>
              );
            }) : (
              <div className="empty-list">Try searching or start a new conversation.</div>
            )}
          </div>
        </div>
      );
    }
    if (type === "mobile-contacts") {
      return (
        <div className="sidebar-section">
          <div className="sidebar-section-title">Online Users</div>
          <div className="sidebar-list">
            {filteredOnlineUsers.length > 0 ? filteredOnlineUsers.map((u, i) => (
              <div key={`mc-online-${i}`} className={`user-item ${selectedUser === u ? "active" : ""}`} onClick={() => { handleUserSelect(u); setActiveTab("chat"); }}>
                <div className="avatar-wrap">
                  <Avatar src={userProfiles[u]} email={u} size={40} className="user-avatar" onClick={(e) => handleAvatarClick(e, u, false)} />
                  <span className="status-dot online" />
                </div>
                <div className="user-item-copy">
                  <span className="user-name">{getDisplayName(u)}</span>
                  <span className="user-last">Available now</span>
                </div>
              </div>
            )) : (
              <div className="empty-list">No contacts are available right now.</div>
            )}
          </div>
        </div>
      );
    }
    if (type === "mobile-archive") {
      return (
        <div className="sidebar-section">
          <div className="sidebar-list">
            {archivedChatsList.length > 0 ? archivedChatsList.map((u, i) => {
              const unreadCount = getUnreadCount(u);
              return (
                <div key={`ma-${i}`} className={`user-item ${selectedUser === u ? "active" : ""}`} onClick={() => { handleUserSelect(u); setActiveTab("chat"); }}>
                  <div className="avatar-wrap">
                    <Avatar src={userProfiles[u]} email={u} size={40} className="user-avatar" />
                  </div>
                  <div className="user-item-copy">
                    <span className="user-name">{getDisplayName(u)}</span>
                    <span className="user-last">Archived</span>
                  </div>
                  <div className="user-item-actions">
                    {unreadCount > 0 && <span className="unread-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>}
                    <button className="remove-recent-btn" onClick={(e) => { e.stopPropagation(); handleUnarchiveChat(e, u); }} title="Unarchive chat">
                      <ArchiveRestore size={14} />
                    </button>
                  </div>
                </div>
              );
            }) : (
              <div className="empty-list">No archived chats.</div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  const totalMessagesSent = messages.length;
  const uniqueConversations = new Set(messages.map(m => m.sender === user?.email?.toLowerCase() ? m.receiver : m.sender)).size;
  const totalMediaShared = messages.filter(m => m.fileUrl).length;

  const allMessages = Object.values(chatHistory).flat();
  const totalChatMessages = allMessages.length;
  const totalChatMedia = allMessages.filter(m => m.type === "media" || m.fileUrl).length;
  const conversationsWithReplies = Object.values(chatHistory).filter(msgs => {
    const senders = [...new Set(msgs.map(m => m.sender?.toLowerCase()))];
    return senders.length > 1;
  }).length;
  const totalConversations = Object.keys(chatHistory).length;
  const responseRate = totalConversations > 0 ? Math.round((conversationsWithReplies / totalConversations) * 100) : 0;

  let mostActiveContact = "";
  let maxMsgs = 0;
  Object.entries(chatHistory).forEach(([email, msgs]) => {
    if (msgs.length > maxMsgs) {
      maxMsgs = msgs.length;
      mostActiveContact = email;
    }
  });

  const analyticsActiveChats = recentChats.length;
  const analyticsUnread = recentChats.reduce((sum, u) => sum + getUnreadCount(u), 0);

  const renderAnalytics = () => (
    <div className="analytics-panel">
      <div className="analytics-grid">
        <div className="analytics-stat-card">
          <div className="analytics-stat-icon active-chat"><MessageCircle size={20} /></div>
          <div className="analytics-stat-body">
            <span className="analytics-stat-value">{analyticsActiveChats}</span>
            <span className="analytics-stat-label">Active Chats</span>
          </div>
        </div>
        <div className="analytics-stat-card">
          <div className="analytics-stat-icon unread"><BellRing size={20} /></div>
          <div className="analytics-stat-body">
            <span className="analytics-stat-value">{analyticsUnread}</span>
            <span className="analytics-stat-label">Unread</span>
          </div>
        </div>
        <div className="analytics-stat-card">
          <div className="analytics-stat-icon online"><Users size={20} /></div>
          <div className="analytics-stat-body">
            <span className="analytics-stat-value">{otherOnlineUsers.length}</span>
            <span className="analytics-stat-label">Online</span>
          </div>
        </div>
        <div className="analytics-stat-card">
          <div className="analytics-stat-icon messages"><Send size={20} /></div>
          <div className="analytics-stat-body">
            <span className="analytics-stat-value">{totalChatMessages}</span>
            <span className="analytics-stat-label">Total Messages</span>
          </div>
        </div>
        <div className="analytics-stat-card">
          <div className="analytics-stat-icon media"><Image size={20} /></div>
          <div className="analytics-stat-body">
            <span className="analytics-stat-value">{totalChatMedia}</span>
            <span className="analytics-stat-label">Media Shared</span>
          </div>
        </div>
        <div className="analytics-stat-card">
          <div className="analytics-stat-icon response"><MessageCircle size={20} /></div>
          <div className="analytics-stat-body">
            <span className="analytics-stat-value">{responseRate}%</span>
            <span className="analytics-stat-label">Response Rate</span>
          </div>
        </div>
        <div className="analytics-stat-card">
          <div className="analytics-stat-icon archive"><Archive size={20} /></div>
          <div className="analytics-stat-body">
            <span className="analytics-stat-value">{archivedChatsList.length}</span>
            <span className="analytics-stat-label">Archived</span>
          </div>
        </div>
        <div className="analytics-stat-card">
          <div className="analytics-stat-icon top-chat"><MessageCircle size={20} /></div>
          <div className="analytics-stat-body">
            <span className="analytics-stat-value">{totalConversations}</span>
            <span className="analytics-stat-label">Conversations</span>
          </div>
        </div>
      </div>
      {mostActiveContact ? (
        <div className="analytics-active-badge">
          <span className="analytics-active-label">Most active</span>
          <span className="analytics-active-name">{getDisplayName(mostActiveContact)}</span>
          <span className="analytics-active-count">{maxMsgs} msgs</span>
        </div>
      ) : null}
    </div>
  );

  if (!user) return <h2>Loading...</h2>;

  return (
    <div className={`chat-layout ${isDarkMode ? "dark" : ""} w-full h-screen max-w-screen overflow-hidden md:grid md:grid-cols-[280px_1fr]`}>
      <div className={`sidebar-overlay ${sidebarOpen ? "visible" : ""}`} onClick={() => setSidebarOpen(false)} />
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-top">
          <div className="brand-head">
            <div className="brand-mark">C</div>
            <div className="brand-copy">
              <strong>Connect</strong>
              <span>Enterprise messenger</span>
            </div>
          </div>
          <div className="sidebar-top-actions">
            <button
              className="theme-toggle"
              onClick={() => setIsDarkMode((prev) => !prev)}
              aria-label="Toggle theme"
            >
              {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </div>

        <div className="profile-card">
          <div className="profile-card-main">
            <Avatar
              src={userProfiles[user.email.toLowerCase()] || user.profilePic}
              email={user.email}
              size={40}
              className="profile-card-avatar"
              onClick={(e) => handleAvatarClick(e, user.email, true)}
            />
            <div>
              <span className="profile-name">{getDisplayName(user.email)}</span>
              <span className="profile-meta">
                {isUserOnline(user.email) ? "Online" : "Offline"}
              </span>
            </div>
          </div>
          <button
            className="primary-btn"
            onClick={() => setSelectedUser(null)}
          >
            <PlusCircle size={16} /> New Message
          </button>
        </div>

        <div className="sidebar-tabs">
          <button
            className={`tab ${activeTab === "recent" ? "active" : ""}`}
            onClick={() => setActiveTab("recent")}
            title="Recent Chats"
          >
            <History size={18} />
            {totalUnread > 0 && <span className="tab-badge">{totalUnread > 99 ? "99+" : totalUnread}</span>}
          </button>
          <button
            className={`tab ${activeTab === "online" ? "active" : ""}`}
            onClick={() => setActiveTab("online")}
            title="Online Users"
          >
            <div style={{ position: 'relative' }}>
              <Users size={18} />
              {filteredOnlineUsers.length > 0 && <span className="tab-online-dot" style={{ position: 'absolute', top: -2, right: -2, border: '2px solid var(--background-sidebar)' }} />}
            </div>
          </button>
          <button
            className={`tab ${activeTab === "calls" ? "active" : ""}`}
            onClick={() => setActiveTab("calls")}
            title="Call History"
          >
            <div style={{ position: 'relative' }}>
              <PhoneCall size={18} />
              {callHistory.filter(c => c.status === "missed").length > 0 && (
                <span className="tab-badge missed-badge" style={{ position: 'absolute', top: -8, right: -12 }}>
                  {callHistory.filter(c => c.status === "missed").length}
                </span>
              )}
            </div>
          </button>
          <button
            className={`tab ${activeTab === "archive" ? "active" : ""}`}
            onClick={() => setActiveTab("archive")}
            title="Archived Chats"
          >
            <div style={{ position: 'relative' }}>
              <Archive size={18} />
              {archivedChatsList.length > 0 && <span className="tab-count" style={{ position: 'absolute', top: -8, right: -12, background: 'var(--text-light)', color: 'white', fontSize: '9px', padding: '2px 4px', borderRadius: '4px' }}>{archivedChatsList.length}</span>}
            </div>
          </button>
        </div>

        <div className={`sidebar-search ${activeTab === "calls" ? "mobile-hidden" : ""}`}>
          <Search size={16} />
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={activeTab === "recent" ? "Search conversations" : activeTab === "online" ? "Search online users" : activeTab === "calls" ? "Search call history" : "Search archived chats"}
          />
        </div>



          {activeTab === "recent" && (
          <div className="sidebar-section">
            <div className="sidebar-list">
              {filteredRecentChats.length > 0 ? filteredRecentChats.map((u, i) => {
                const unreadCount = getUnreadCount(u);
                return (
                  <div
                    key={`recent-${i}`}
                    className={`user-item ${selectedUser === u ? "active" : ""}`}
                    onClick={() => handleUserSelect(u)}
                  >
                    <div className="avatar-wrap">
                      <Avatar
                        src={userProfiles[u]}
                        email={u}
                        size={40}
                        className="user-avatar"
                        onClick={(e) => handleAvatarClick(e, u, false)}
                      />
                      {isUserOnline(u) && <span className="status-dot online" />}
                    </div>
                    <div className="user-item-copy">
                      <span className="user-name">{getDisplayName(u)}</span>
                      <span className="user-last">
                        {isUserOnline(u) ? "Online" : formatLastSeen(lastSeen[u])}
                      </span>
                    </div>
                    <div className="user-item-actions">
                      {unreadCount > 0 && (
                        <span className="unread-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
                      )}
                      <button
                        className="remove-recent-btn"
                        onClick={(e) => handleArchiveChat(e, u)}
                        title="Archive chat"
                      >
                        <Archive size={14} />
                      </button>
                      <button 
                        className="remove-recent-btn" 
                        onClick={(e) => handleRemoveChatFromRecent(e, u)}
                        title="Remove from list"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                );
              }) : (
                <div className="empty-list">Try searching or start a new conversation.</div>
              )}
            </div>
          </div>
        )}

        {activeTab === "online" && (
          <div className="sidebar-section">
            <div className="sidebar-list">
              {filteredOnlineUsers.length > 0 ? filteredOnlineUsers.map((u, i) => (
                <div
                  key={`online-${i}`}
                  className={`user-item ${selectedUser === u ? "active" : ""}`}
                  onClick={() => handleUserSelect(u)}
                >
                  <div className="avatar-wrap">
                      <Avatar
                        src={userProfiles[u]}
                        email={u}
                        size={40}
                        className="user-avatar"
                        onClick={(e) => handleAvatarClick(e, u, false)}
                      />
                    <span className="status-dot online" />
                  </div>
                  <div className="user-item-copy">
                    <span className="user-name">{getDisplayName(u)}</span>
                    <span className="user-last">Available now</span>
                  </div>
                </div>
              )) : (
                <div className="empty-list">No contacts are available right now.</div>
              )}
            </div>
          </div>
        )}

        {activeTab === "archive" && (
          <div className="sidebar-section">
            <div className="sidebar-list">
              {archivedChatsList.length > 0 ? archivedChatsList.map((u, i) => {
                const unreadCount = getUnreadCount(u);
                return (
                <div
                  key={`archived-${i}`}
                  className={`user-item ${selectedUser === u ? "active" : ""}`}
                  onClick={() => { handleUserSelect(u); setActiveTab("recent"); }}
                >
                  <div className="avatar-wrap">
                    <Avatar
                      src={userProfiles[u]}
                      email={u}
                      size={40}
                      className="user-avatar"
                    />
                  </div>
                  <div className="user-item-copy">
                    <span className="user-name">{getDisplayName(u)}</span>
                    <span className="user-last">Archived</span>
                  </div>
                  <div className="user-item-actions">
                    {unreadCount > 0 && (
                      <span className="unread-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
                    )}
                    <button
                      className="remove-recent-btn"
                      onClick={(e) => { e.stopPropagation(); handleUnarchiveChat(e, u); }}
                      title="Unarchive chat"
                    >
                      <ArchiveRestore size={14} />
                    </button>
                  </div>
                </div>
                );
              }) : (
                <div className="empty-list">No archived chats.</div>
              )}
            </div>
          </div>
        )}

        {activeTab === "calls" && (
          <CallHistory
            callHistory={callHistory}
            userProfiles={userProfiles}
            getDisplayName={getDisplayName}
            onCallBack={(email, type) => {
              handleUserSelect(email);
              startCall(email, type);
            }}
          />
        )}

        <div className="sidebar-footer">
          <div className="sidebar-footer-actions">
            <button className="sidebar-footer-btn" onClick={async () => { try { await navigator.clipboard.writeText("https://connect-it.vercel.app/"); alert("Invite link copied!"); } catch(e) { prompt("Copy this link:", "https://connect-it.vercel.app/"); } }} title="Invite team member">
              <UserPlus size={18} />
            </button>
            <button className="sidebar-footer-btn" onClick={() => setShowSettings(true)} title="Settings">
              <Settings size={18} />
            </button>
            <button className="sidebar-footer-btn sidebar-footer-logout" onClick={() => setShowLogoutConfirm(true)} title="Logout">
              <LogOut size={18} />
            </button>
            <button className="sidebar-footer-btn sidebar-footer-delete" onClick={() => setShowDeleteConfirm(true)} title="Delete account">
              <Trash2 size={18} />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile page - full screen for Contacts & Archive on mobile */}
      <div className={`mobile-page ${activeTab === "chat" ? "mobile-hidden" : ""}`}>
        <div className="mobile-page-header">
          <button className="mobile-page-back" onClick={() => setActiveTab("chat")}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <h3>{activeTab === "online" ? "Online Users" : activeTab === "calls" ? "Call History" : activeTab === "analytics" ? "Analytics" : activeTab === "archive" ? "Archive" : "Recent Chats"}</h3>
        </div>
        <div className={`sidebar-search ${activeTab === "analytics" ? "mobile-hidden" : ""}`}>
          <Search size={16} />
          <input type="search" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={activeTab === "recent" ? "Search conversations" : activeTab === "online" ? "Search contacts" : "Search archived chats"} />
        </div>
        <div className="mobile-page-body">
          {activeTab === "recent" && renderTabContent("mobile-recent")}
          {activeTab === "online" && renderTabContent("mobile-contacts")}
          {activeTab === "calls" && (
            <CallHistory
              callHistory={callHistory}
              userProfiles={userProfiles}
              getDisplayName={getDisplayName}
              onCallBack={(email, type) => {
                handleUserSelect(email);
                startCall(email, type);
              }}
            />
          )}
          {activeTab === "archive" && renderTabContent("mobile-archive")}
          {activeTab === "analytics" && renderAnalytics()}
        </div>
      </div>

      <main className={`chat-panel ${activeTab !== "chat" ? "mobile-hidden" : ""}`}>
        {/* Incoming call overlay - shown globally over the entire app */}

        <div className="chat-panel-header">
          <button className="mobile-menu-btn" onClick={() => { if (selectedUser) { setSelectedUser(null); setSidebarOpen(true); } else { setSidebarOpen(!sidebarOpen); } }} aria-label={selectedUser ? "Back" : "Open menu"}>
            {selectedUser ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            )}
          </button>
          <div className="chat-panel-title">
            <div className="header-avatar-wrap">
              <Avatar
                src={selectedUser ? userProfiles[selectedUser] : null}
                email={selectedUser || "default"}
                size={40}
                className="header-avatar"
                onClick={() => selectedUser && handleAvatarClick({ stopPropagation: () => {} }, selectedUser, false)}
              />
            </div>
            <div>
              <h3>{selectedUser ? getDisplayName(selectedUser) : "Welcome to Connect"}</h3>
              <p>{selectedUser ? <LastSeen userId={selectedUser} /> : "Choose a conversation or create a new one."}</p>
            </div>
          </div>
          <div className="chat-header-actions">
            {selectedUser && (
              <>
                {/* Voice & Video Call Buttons */}
                <button
                  id="voice-call-btn"
                  className="icon-btn call-btn"
                  title="Voice call"
                  onClick={() => startCall(selectedUser, "audio")}
                  disabled={callState !== "idle"}
                >
                  <Phone size={17} />
                </button>
                <button
                  id="video-call-btn"
                  className="icon-btn call-btn video-call-btn"
                  title="Video call"
                  onClick={() => startCall(selectedUser, "video")}
                  disabled={callState !== "idle"}
                >
                  <Video size={17} />
                </button>
                <button
                  className="icon-btn clear-chat-btn"
                  title="Clear chat for you only"
                  onClick={handleClearCurrentChat}
                >
                  <Trash2 size={16} />
                </button>
                <button 
                  className="icon-btn close-btn" 
                  title="Close chat"
                  onClick={() => {
                    setSelectedUser(null);
                    setIsChatMinimized(false);
                  }}
                >
                  <X size={18} />
                </button>
              </>
            )}
            <button className="icon-btn" title="Settings" onClick={() => setShowSettings(true)}>
              <Settings size={18} />
            </button>
          </div>
        </div>

        {!isChatMinimized && (
        <div className="chat-panel-body">
          {selectedUser ? (
            <div className="chat-messages">
              {messages.length === 0 ? (
                <div className="empty-chat-state">
                  <MessageCircle size={32} />
                  <h4>No messages yet</h4>
                  <p>Send the first message to start the conversation.</p>
                </div>
              ) : (
                <>
                {messages.map((msg, i) => {
                  const previousMsg = messages[i - 1];
                  const showDay = !previousMsg || new Date(msg.timestamp || msg.createdAt).toDateString() !== new Date(previousMsg.timestamp || previousMsg.createdAt).toDateString();
                  return (
                    <React.Fragment key={msg._id || msg.tempId || `msg-${i}`}>
                      {showDay && (
                        <div className="day-separator">
                          <span>{formatDay(msg.timestamp || msg.createdAt)}</span>
                        </div>
                      )}
                      <div className={`message ${normalizeEmail(msg.sender) === normalizeEmail(user.email) ? "sent" : "received"} message-animate`} onContextMenu={(e) => handleContextMenu(e, msg)}>
                        <div className="message-content">
                          {msg.replyTo && (
                            <div className="reply-quote">
                              <small>{normalizeEmail(msg.replyTo.sender) === normalizeEmail(user.email) ? "You" : msg.replyTo.sender.split('@')[0]}</small>
                              <p>{msg.replyTo.text}</p>
                            </div>
                          )}
                          {msg.type === "media" ? (
                            <div className="media-message">
                              {msg.pending && (
                                <div className="media-upload-progress">
                                  <div className="media-upload-bar-track">
                                    <div className="media-upload-bar-fill" style={{ width: `${uploadProgress}%` }} />
                                  </div>
                                  <span className="media-upload-label">{uploadProgress}%</span>
                                </div>
                              )}
                              {msg.mediaType === "image" && msg.text?.data?.startsWith("data:image/") && (
                                <img src={msg.text.data} alt="Shared" className="media-image" onClick={() => handleViewFullImage(msg.text.data, "media")} />
                              )}
                              {msg.mediaType === "video" && msg.text?.data && (
                                <div className="media-video-wrap">
                                  <video controls className="media-video" preload="metadata">
                                    <source src={msg.text.data} type={msg.text.type} />
                                  </video>
                                  <div className="media-download-area">
                                    {(downloadProgress[msg._id || msg.tempId] ?? -1) >= 0 && (downloadProgress[msg._id || msg.tempId] ?? 0) < 100 ? (
                                      <div className="media-download-progress">
                                        <div className="media-download-bar-track">
                                          <div className="media-download-bar-fill" style={{ width: `${downloadProgress[msg._id || msg.tempId]}%` }} />
                                        </div>
                                        <span className="media-download-label">{downloadProgress[msg._id || msg.tempId]}%</span>
                                      </div>
                                    ) : (
                                      <button
                                        className="download-btn"
                                        onClick={() => handleDownloadMedia(msg)}
                                        disabled={downloadingId === msg._id || downloadingId === msg.tempId}
                                      >
                                        {downloadingId === msg._id || downloadingId === msg.tempId ? "Preparing..." : "Download"}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )}
                              {msg.mediaType === "audio" && msg.text?.data && (
                                <div className="media-audio-wrap">
                                  <audio controls preload="metadata" className="media-audio-element">
                                    <source src={msg.text.data} type={msg.text.type || "audio/mpeg"} />
                                  </audio>
                                  <span className="media-audio-label">{msg.text?.name || "Audio"}</span>
                                  <div className="media-download-area">
                                    {(downloadProgress[msg._id || msg.tempId] ?? -1) >= 0 && (downloadProgress[msg._id || msg.tempId] ?? 0) < 100 ? (
                                      <div className="media-download-progress">
                                        <div className="media-download-bar-track">
                                          <div className="media-download-bar-fill" style={{ width: `${downloadProgress[msg._id || msg.tempId]}%` }} />
                                        </div>
                                        <span className="media-download-label">{downloadProgress[msg._id || msg.tempId]}%</span>
                                      </div>
                                    ) : (
                                      <button
                                        className="download-btn"
                                        onClick={() => handleDownloadMedia(msg)}
                                        disabled={downloadingId === msg._id || downloadingId === msg.tempId}
                                      >
                                        {downloadingId === msg._id || downloadingId === msg.tempId ? "Preparing..." : "Download"}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )}
                              {msg.mediaType === "application" && (
                                <div className="media-file">
                                  <div className="media-file-header">
                                    <div className={`media-file-icon ${msg.text?.name?.endsWith('.pdf') ? 'pdf' : msg.text?.name?.endsWith('.doc') || msg.text?.name?.endsWith('.docx') ? 'doc' : 'other'}`}>
                                      {msg.text?.name?.endsWith('.pdf') ? 'PDF' : msg.text?.name?.endsWith('.doc') || msg.text?.name?.endsWith('.docx') ? 'DOC' : 'FILE'}
                                    </div>
                                    <div className="media-file-info">
                                      <span className="media-file-name">{msg.text?.name || "Document"}</span>
                                      <span className="media-file-size">{msg.text?.size ? `${(msg.text.size / 1024).toFixed(1)} KB` : "File"}</span>
                                    </div>
                                  </div>
                                  {msg.text?.data?.startsWith("data:application/pdf") && (
                                    <iframe src={msg.text.data} className="pdf-preview" title={msg.text.name} />
                                  )}
                                  <div className="media-download-area">
                                    {(downloadProgress[msg._id || msg.tempId] ?? -1) >= 0 && (downloadProgress[msg._id || msg.tempId] ?? 0) < 100 ? (
                                      <div className="media-download-progress">
                                        <div className="media-download-bar-track">
                                          <div className="media-download-bar-fill" style={{ width: `${downloadProgress[msg._id || msg.tempId]}%` }} />
                                        </div>
                                        <span className="media-download-label">{downloadProgress[msg._id || msg.tempId]}%</span>
                                      </div>
                                    ) : (
                                      <button
                                        className="download-btn"
                                        onClick={() => handleDownloadMedia(msg)}
                                        disabled={downloadingId === msg._id || downloadingId === msg.tempId}
                                      >
                                        {downloadingId === msg._id || downloadingId === msg.tempId ? "Preparing..." : "Download"}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )}
                              {msg.text?.data && msg.mediaType !== "image" && msg.mediaType !== "video" && msg.mediaType !== "audio" && msg.mediaType !== "application" && (
                                <div className="media-file">
                                  <div className="media-file-header">
                                    <div className="media-file-icon other">FILE</div>
                                    <div className="media-file-info">
                                      <span className="media-file-name">{msg.text?.name || "Attachment"}</span>
                                      <span className="media-file-size">{msg.text?.size ? `${(msg.text.size / 1024).toFixed(1)} KB` : "File"}</span>
                                    </div>
                                  </div>
                                  <div className="media-download-area">
                                    {(downloadProgress[msg._id || msg.tempId] ?? -1) >= 0 && (downloadProgress[msg._id || msg.tempId] ?? 0) < 100 ? (
                                      <div className="media-download-progress">
                                        <div className="media-download-bar-track">
                                          <div className="media-download-bar-fill" style={{ width: `${downloadProgress[msg._id || msg.tempId]}%` }} />
                                        </div>
                                        <span className="media-download-label">{downloadProgress[msg._id || msg.tempId]}%</span>
                                      </div>
                                    ) : (
                                      <button
                                        className="download-btn"
                                        onClick={() => handleDownloadMedia(msg)}
                                        disabled={downloadingId === msg._id || downloadingId === msg.tempId}
                                      >
                                        {downloadingId === msg._id || downloadingId === msg.tempId ? "Preparing..." : "Download"}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )}
                              {!msg.text?.data && msg.type === "media" && (
                                <span className="media-unavailable">Media unavailable (reload chat)</span>
                              )}
                            </div>
                          ) : (
                            msg.text
                          )}
                        </div>
                        <div className="message-meta">
                          <span>{formatMessageTime(msg.timestamp || msg.createdAt)}</span>
                          {msg.pending && <span className="message-status pending">Sending...</span>}
                          {msg.failed && <span className="message-status failed">Failed</span>}
                          {normalizeEmail(msg.sender) === normalizeEmail(user.email) && !msg.pending && !msg.failed && (
                            <span className={`message-status-tick ${msg.status || 'sent'}`}>
                              {msg.status === "read" ? (
                                <span className="double-tick read">{"\u2713\u2713"}</span>
                              ) : msg.status === "delivered" ? (
                                <span className="double-tick delivered">{"\u2713\u2713"}</span>
                              ) : (
                                <span className="single-tick sent">{"\u2713"}</span>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })
              }
              </>
              )}

              <AnimatePresence>
                {typingUser && typingUser !== user.email && (
                  <div className="typing-indicator typing-animate" title="Someone is typing...">
                    <span />
                    <span />
                    <span />
                  </div>
                )}
              </AnimatePresence>
              <div ref={messagesEndRef} />
            </div>
          ) : (
            <div className="dashboard-empty-state">
              <div className="welcome-panel">
                <div className="welcome-brand">
                  <div className="welcome-logo">C</div>
                  <h1>Connect It</h1>
                </div>
                <div className="welcome-greeting">
                  <h2>Welcome back, {getDisplayName(user.email)}</h2>
                  <p className="welcome-subtitle">Real-time messaging platform for seamless team collaboration</p>
                </div>
                <div className="welcome-features">
                  <div className="welcome-feature">
                    <MessageCircle size={18} />
                    <span>Instant messaging with real-time delivery</span>
                  </div>
                  <div className="welcome-feature">
                    <Users size={18} />
                    <span>Connect with online team members</span>
                  </div>
                  <div className="welcome-feature">
                    <Image size={18} />
                    <span>Share images, videos & documents</span>
                  </div>
                  <div className="welcome-feature">
                    <Archive size={18} />
                    <span>Archive conversations for later</span>
                  </div>
                </div>
                <p className="welcome-tip">Select a conversation from the sidebar to start chatting</p>
              </div>
            </div>
          )}
        </div>
        )}

        {!isChatMinimized && (
        <div className="chat-panel-footer">
          {showEmojiPicker && (
            <div ref={emojiPickerRef} className="emoji-picker-wrapper">
              <EmojiPicker 
                onEmojiClick={(emojiData) => setMessage(prev => prev + emojiData.emoji)}
                theme={isDarkMode ? "dark" : "light"}
                width={320}
                height={400}
                searchPlaceholder="Search emoji..."
              />
            </div>
          )}
          {showAttachMenu && (
            <div className="attach-menu-overlay" onClick={() => setShowAttachMenu(false)}>
              <div className="attach-menu" ref={attachMenuRef} onClick={(e) => e.stopPropagation()}>
                <button className="attach-menu-item" onClick={() => { setShowAttachMenu(false); document.getElementById('attach-image').click(); }}>
                  <div className="attach-icon"><Image size={20} /></div>
                  <span>Image</span>
                </button>
                <button className="attach-menu-item" onClick={() => { setShowAttachMenu(false); document.getElementById('attach-video').click(); }}>
                  <div className="attach-icon"><Film size={20} /></div>
                  <span>Video</span>
                </button>
                <button className="attach-menu-item" onClick={() => { setShowAttachMenu(false); document.getElementById('attach-audio').click(); }}>
                  <div className="attach-icon"><Music size={20} /></div>
                  <span>Audio</span>
                </button>
                <button className="attach-menu-item" onClick={() => { setShowAttachMenu(false); document.getElementById('attach-document').click(); }}>
                  <div className="attach-icon"><FileText size={20} /></div>
                  <span>Document</span>
                </button>
                <button className="attach-menu-item" onClick={() => { setShowAttachMenu(false); document.getElementById('attach-file').click(); }}>
                  <div className="attach-icon"><FolderOpen size={20} /></div>
                  <span>File</span>
                </button>
              </div>
            </div>
          )}
          {replyTo && (
            <div className="reply-preview">
              <div className="reply-preview-content">
                <small>Replying to {replyTo.sender === user.email ? "yourself" : replyTo.sender.split('@')[0]}</small>
                <p>{replyTo.type === 'media' ? 'Media file' : replyTo.text}</p>
              </div>
              <button className="close-reply" onClick={() => setReplyTo(null)}><X size={14} /></button>
            </div>
          )}
          <button 
            className="secondary-icon-btn" 
            title="Emoji"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          >
            <Smile size={18} />
          </button>
          <div style={{ position: 'relative' }}>
            <button 
              className="secondary-icon-btn" 
              title="Attach file"
              onClick={() => setShowAttachMenu(!showAttachMenu)}
              disabled={!selectedUser}
            >
              <Paperclip size={18} />
            </button>
          </div>
          <input
            type="text"
            placeholder={selectedUser ? "Write a message..." : "Select a conversation to send a message"}
            value={message}
            onChange={handleTyping}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            onBlur={() => stopTyping()}
            disabled={!selectedUser}
          />
          <button className="send-btn" onClick={sendMessage} disabled={!selectedUser}>
            <Send size={18} />
          </button>
        </div>
        )}

        {/* Hidden file inputs for attachment menu */}
        <input id="attach-image" type="file" accept="image/*" onChange={handleMediaShare} disabled={!selectedUser} style={{ display: "none" }} />
        <input id="attach-video" type="file" accept="video/*" onChange={handleMediaShare} disabled={!selectedUser} style={{ display: "none" }} />
        <input id="attach-audio" type="file" accept="audio/*" onChange={handleMediaShare} disabled={!selectedUser} style={{ display: "none" }} />
        <input id="attach-document" type="file" accept=".pdf,.doc,.docx,.txt,.rtf" onChange={handleMediaShare} disabled={!selectedUser} style={{ display: "none" }} />
        <input id="attach-file" type="file" accept="*/*" onChange={handleMediaShare} disabled={!selectedUser} style={{ display: "none" }} />
      </main>

      {showLogoutConfirm && (
        <div className="logout-modal-overlay" onClick={() => setShowLogoutConfirm(false)}>
          <div className="logout-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Log out?</h3>
            <p>You will be signed out of Connect It.</p>
            <div className="logout-modal-actions">
              <button type="button" className="logout-cancel-btn" onClick={() => setShowLogoutConfirm(false)}>
                Cancel
              </button>
              <button type="button" className="logout-confirm-btn" onClick={performLogout}>
                Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="logout-modal-overlay" onClick={() => { setShowDeleteConfirm(false); setDeleteError(""); setDeletePassword(""); }}>
          <div className="logout-modal" onClick={(e) => e.stopPropagation()}>
            <h3><AlertTriangle size={18} style={{ verticalAlign: "middle", marginRight: 8, color: "#ef4444" }} />Delete Account</h3>
            <p style={{ color: "#ef4444", fontWeight: 500, marginBottom: 8 }}>
              This will permanently delete all your messages, chats, and account data. This action cannot be undone.
            </p>
            <p style={{ marginBottom: 12, fontSize: 13, opacity: 0.7 }}>
              Enter your password to confirm deletion.
            </p>
            {deleteError && <div className="login-error" style={{ marginBottom: 10 }}>{deleteError}</div>}
            <div style={{ position: "relative" }}>
              <input
                type={showDeletePwd ? "text" : "password"}
                placeholder="Enter your password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                className="delete-password-input"
                autoComplete="new-password"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowDeletePwd(!showDeletePwd)}
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-muted, #9ca3af)",
                  padding: 4,
                  display: "flex",
                }}
                tabIndex={-1}
              >
                {showDeletePwd ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <div className="logout-modal-actions" style={{ marginTop: 14 }}>
              <button type="button" className="logout-cancel-btn" onClick={() => { setShowDeleteConfirm(false); setDeleteError(""); setDeletePassword(""); }}>
                Cancel
              </button>
              <button type="button" className="logout-confirm-btn" style={{ background: "#ef4444" }} onClick={handleDeleteAccount} disabled={deleting}>
                {deleting ? "Deleting..." : "Delete Forever"}
              </button>
            </div>
          </div>
        </div>
      )}

      <aside className="dashboard-panel">
        <div className="dashboard-card welcome-card">
          <div className="dashboard-card-head">
            <div>
              <span className="eyebrow">Good day</span>
              <h4>Ready to connect?</h4>
            </div>
            <Home size={20} />
          </div>
          <p>Start a new chat, review mentions, and stay updated with your team activity.</p>
        </div>

        <div className="dashboard-card stats-card">
          <div className="dashboard-card-head">
            <span className="eyebrow">Analytics</span>
            <span>Live insights</span>
          </div>
          <div className="stats-grid">
            <div className="stat-item">
              <span>{recentChats.length}</span>
              <small>Active chats</small>
            </div>
            <div className="stat-item">
              <span>{Object.keys(chatHistory).reduce((s, p) => s + getUnreadCount(p), 0)}</span>
              <small>Unread</small>
            </div>
            <div className="stat-item">
              <span>{otherOnlineUsers.length}</span>
              <small>Online users</small>
            </div>
          </div>
          <div className="bar-chart" />
        </div>

        <div className="dashboard-card actions-card">
          <div className="dashboard-card-head">
            <span className="eyebrow">Quick actions</span>
            <span>Faster workflow</span>
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
            <div className="toast-notice toast-animate">
              <div className="toast-progress">
                <span className="toast-progress-label">Uploading... {uploadProgress}%</span>
                <div className="toast-progress-track">
                  <div className="toast-progress-fill" style={{ width: `${uploadProgress}%` }} />
                </div>
              </div>
            </div>
          )}
        </AnimatePresence>

      {contextMenu && (
        <div className="context-menu" style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x }}>
          <button onClick={() => { setReplyTo(contextMenu.message); setContextMenu(null); }}>
            <MessageCircle size={14} /> Reply
          </button>
          {contextMenu.message.sender === user.email && (
            <button className="delete-option" onClick={() => { handleDeleteMessage(contextMenu.message); setContextMenu(null); }}>
              <Trash2 size={14} /> Delete
            </button>
          )}
        </div>
      )}

      {/* Profile Preview Modal */}
      {profilePreviewUser && (
        <div className="profile-preview-overlay" onClick={() => setProfilePreviewUser(null)}>
          <div className="profile-preview-card profile-card-animate" onClick={(e) => e.stopPropagation()}>
            <button className="profile-preview-close" onClick={() => setProfilePreviewUser(null)}>
              <X size={20} />
            </button>
            <div className="profile-preview-avatar">
              <Avatar
                src={userProfiles[normalizeEmail(profilePreviewUser.email)] || null}
                email={profilePreviewUser.email}
                size={120}
              />
            </div>
            <h3 className="profile-preview-name">{getDisplayName(profilePreviewUser.email)}</h3>
            <p className="profile-preview-email">{profilePreviewUser.email}</p>
            <p className="profile-preview-status">
              {isUserOnline(profilePreviewUser.email) ? (
                <span className="last-seen online"><span className="online-dot" /> Online</span>
              ) : (
                <LastSeen userId={profilePreviewUser.email} />
              )}
            </p>
            <div className="profile-preview-actions">
              {userProfiles[normalizeEmail(profilePreviewUser.email)] && (
                <button
                  className="profile-preview-action-btn"
                  onClick={() => handleViewFullImage(
                    userProfiles[normalizeEmail(profilePreviewUser.email)],
                    "profile",
                    getDisplayName(profilePreviewUser.email),
                    profilePreviewUser.isOwn
                  )}
                >
                  View Full Image
                </button>
              )}
              {profilePreviewUser.isOwn && (
                <>
                  <label htmlFor="preview-change-photo" className="profile-preview-action-btn primary">
                    Change Photo
                  </label>
                  <input
                    id="preview-change-photo"
                    type="file"
                    accept="image/*"
                    onChange={handleUpdateProfilePic}
                    style={{ display: "none" }}
                  />
                  {userProfiles[normalizeEmail(profilePreviewUser.email)] && (
                    <button
                      className="profile-preview-action-btn danger"
                      onClick={() => { handleRemoveProfilePic(); setProfilePreviewUser(null); }}
                    >
                      Remove Photo
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Full-Screen Image Viewer */}
      {imageViewerState.open && (
        <div className="fullscreen-viewer-overlay" onClick={() => { setImageViewerState({ open: false, src: null, type: "media", name: "", isOwn: false }); setImageZoom(1); }}>
          <div className="fullscreen-viewer-toolbar" onClick={(e) => e.stopPropagation()}>
            <span className="fullscreen-viewer-title">{imageViewerState.name || "Image"}</span>
            <div className="fullscreen-viewer-controls">
              <button onClick={() => setImageZoom(z => Math.max(0.5, z - 0.25))} title="Zoom out"><ZoomOut size={20} /></button>
              <span className="fullscreen-zoom-level">{Math.round(imageZoom * 100)}%</span>
              <button onClick={() => setImageZoom(z => Math.min(3, z + 0.25))} title="Zoom in"><ZoomIn size={20} /></button>
              <button onClick={() => handleDownloadImage(imageViewerState.src, imageViewerState.name)} title="Download"><Download size={20} /></button>
              {imageViewerState.isOwn && (
                <>
                  <label htmlFor="viewer-change-photo" className="fullscreen-toolbar-btn" title="Change photo">
                    <Camera size={20} />
                  </label>
                  <input
                    id="viewer-change-photo"
                    type="file"
                    accept="image/*"
                    onChange={(e) => { handleUpdateProfilePic(e); setImageViewerState({ open: false, src: null, type: "media", name: "", isOwn: false }); }}
                    style={{ display: "none" }}
                  />
                  <button
                    className="fullscreen-toolbar-btn danger"
                    onClick={() => { handleRemoveProfilePic(); setImageViewerState({ open: false, src: null, type: "media", name: "", isOwn: false }); }}
                    title="Remove photo"
                  >
                    <Trash2 size={20} />
                  </button>
                </>
              )}
              <button onClick={() => { setImageViewerState({ open: false, src: null, type: "media", name: "", isOwn: false }); setImageZoom(1); }} title="Close"><X size={20} /></button>
            </div>
          </div>
          <div
            className="fullscreen-viewer-content"
            onClick={(e) => e.stopPropagation()}
            style={{ transform: `scale(${imageZoom})` }}
          >
            <img src={imageViewerState.src} alt={imageViewerState.name || "Full image"} />
          </div>
        </div>
      )}

      {/* Image Crop Modal */}
      {cropState.open && cropState.src && (
        <ImageCropModal
          src={cropState.src}
          onCrop={handleCropSave}
          onCancel={() => setCropState({ open: false, src: null, file: null })}
        />
      )}

      <nav className="bottom-nav">
        <button className={`bottom-nav-btn ${activeTab === "chat" ? "active" : ""}`} onClick={(e) => { e.stopPropagation(); setActiveTab("chat"); setSidebarOpen(false); }}><MessageCircle size={18} /><span>Chat</span></button>
        <button className={`bottom-nav-btn ${activeTab === "recent" ? "active" : ""}`} onClick={(e) => { e.stopPropagation(); setActiveTab("recent"); setSidebarOpen(false); }}>
          <span className="bottom-nav-icon-wrap">
            <History size={18} />
            {totalUnread > 0 && <span className="bottom-nav-badge">{totalUnread > 99 ? "99+" : totalUnread}</span>}
          </span>
          <span>Recent</span>
        </button>
        <button className={`bottom-nav-btn ${activeTab === "online" ? "active" : ""}`} onClick={(e) => { e.stopPropagation(); setActiveTab("online"); setSidebarOpen(false); }}>
          <span className="bottom-nav-icon-wrap">
            <Users size={18} />
            {filteredOnlineUsers.length > 0 && <span className="bottom-nav-green-dot" />}
          </span>
          <span>Online</span>
        </button>
        <button className={`bottom-nav-btn ${activeTab === "calls" ? "active" : ""}`} onClick={(e) => { e.stopPropagation(); setActiveTab("calls"); setSidebarOpen(false); }}>
          <span className="bottom-nav-icon-wrap">
            <PhoneCall size={18} />
            {callHistory.filter(c => c.status === "missed").length > 0 && (
              <span className="bottom-nav-badge">{callHistory.filter(c => c.status === "missed").length}</span>
            )}
          </span>
          <span>Calls</span>
        </button>
        <button className={`bottom-nav-btn ${activeTab === "archive" ? "active" : ""}`} onClick={(e) => { e.stopPropagation(); setActiveTab("archive"); setSidebarOpen(false); }}><Archive size={18} /><span>Archive</span></button>
        <button className={`bottom-nav-btn ${activeTab === "analytics" ? "active" : ""}`} onClick={(e) => { e.stopPropagation(); setActiveTab("analytics"); setSidebarOpen(false); }}><BarChart3 size={18} /><span>Analytics</span></button>
        <button className="bottom-nav-btn" onClick={(e) => { e.stopPropagation(); setShowSettings(true); setSidebarOpen(false); }}><Settings size={18} /><span>Settings</span></button>
      </nav>

      {showSettings && (
        <div className="settings-modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="settings-header">
              <h3>Settings</h3>
              <button className="settings-close-btn" onClick={() => setShowSettings(false)} aria-label="Close">
                <X size={20} />
              </button>
            </div>
            <div className="settings-body">
              <div className="settings-section settings-profile">
                <div className="settings-avatar-wrapper">
                  <Avatar
                    src={userProfiles[user?.email?.toLowerCase()] || user?.profilePic}
                    email={user?.email}
                    size={96}
                    className="settings-avatar"
                  />
                  <div className="avatar-actions">
                    <label htmlFor="update-profile-pic-settings" className="avatar-action-btn primary">
                      <Camera size={16} />
                      <span>Change Photo</span>
                    </label>
                    {(userProfiles[user?.email?.toLowerCase()] || user?.profilePic) && (
                      <button className="avatar-action-btn danger" onClick={handleRemoveProfilePic}>
                        <Trash2 size={16} />
                        <span>Remove</span>
                      </button>
                    )}
                  </div>
                  <input
                    id="update-profile-pic-settings"
                    type="file"
                    accept="image/*"
                    onChange={handleUpdateProfilePic}
                    className="avatar-file-input"
                  />
                </div>
                
                <div className="settings-form-grid">
                  <div className="settings-field">
                    <label htmlFor="display-name">Display Name</label>
                    <input
                      id="display-name"
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Enter your display name"
                      maxLength={30}
                    />
                    <span className="field-hint">{displayName.length}/30</span>
                  </div>
                  <div className="settings-field">
                    <label htmlFor="bio">Bio</label>
                    <textarea
                      id="bio"
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="Write something about yourself..."
                      rows={3}
                      maxLength={160}
                    />
                    <span className="field-hint">{bio.length}/160</span>
                  </div>
                </div>
              </div>

              <div className="settings-section settings-appearance">
                <h4 className="settings-section-title">
                  <Palette size={18} />
                  <span>Appearance</span>
                </h4>
                <div className="settings-toggle-row">
                  <div className="toggle-info">
                    <span className="toggle-icon">{isDarkMode ? <Sun size={20} /> : <Moon size={20} />}</span>
                    <div className="toggle-text">
                      <strong>Dark Mode</strong>
                      <small>{isDarkMode ? "Enabled" : "Disabled"}</small>
                    </div>
                  </div>
                  <button
                    className={`settings-toggle ${isDarkMode ? "active" : ""}`}
                    onClick={() => setIsDarkMode(!isDarkMode)}
                    aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
                  >
                    <span className="toggle-thumb" />
                  </button>
                </div>
              </div>

              <div className="settings-section settings-account">
                <h4 className="settings-section-title">
                  <User size={18} />
                  <span>Account</span>
                </h4>
                <div className="settings-info-list">
                  <div className="settings-info-item">
                    <span className="info-label">Email</span>
                    <span className="info-value">{user?.email}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="settings-footer">
              <button className="settings-btn danger" onClick={() => { setShowSettings(false); setShowLogoutConfirm(true); }}>
                <LogOut size={16} /> Logout
              </button>
              <button className="settings-btn delete" onClick={() => { setShowSettings(false); setShowDeleteConfirm(true); }}>
                <Trash2 size={16} /> Delete
              </button>
              <button className="settings-btn secondary" onClick={() => setShowSettings(false)} disabled={isSaving}>
                Cancel
              </button>
              <button
                className="settings-btn primary"
                onClick={handleSaveSettings}
                disabled={isSaving || (!displayName.trim() && !bio.trim())}
              >
                {isSaving ? (
                  <>
                    <Loader2 size={16} className="btn-spinner" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    <span>Save Changes</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Chat;


