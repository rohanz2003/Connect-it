import React, { useState, useEffect, useRef } from "react";
import io from "socket.io-client";
import DOMPurify from "dompurify";
import apiClient from "../services/apiClient";
import { importPublicKey, deriveSharedSecret, encryptMessage, decryptMessage } from "../utils/cryptoEngine";
import "../components/Chat.css";

function Chat({ user }) {
  const [users, setUsers] = useState([]);
  const [selectedRecipient, setSelectedRecipient] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState("");
  const [disappearingTimer, setDisappearingTimer] = useState(0); // 0 = standard persistence
  
  // Privacy preferences indicators mapping
  const [privacySettings, setPrivacySettings] = useState({
    hideLastSeen: false,
    hideOnlineStatus: false,
    hideReadReceipts: false
  });

  const socketRef = useRef(null);
  const derivedKeysCache = useRef(new Map()); // Caches derived shared keys: recipientEmail -> CryptoKey object

  /**
   * Recovers local base64 private string, converting it back to a CryptoKey reference
   */
  const getLocalPrivateKeyCryptoKey = async () => {
    try {
      const b64Private = localStorage.getItem(`e2ee_priv_${user.email.toLowerCase().trim()}`);
      if (!b64Private) return null;

      const binaryString = atob(b64Private);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      return await window.crypto.subtle.importKey(
        "pkcs8",
        bytes.buffer,
        { name: "ECDH", namedCurve: "P-256" },
        true,
        ["deriveKey", "deriveBits"]
      );
    } catch (err) {
      console.error("Failed to reimport local private key context:", err);
      return null;
    }
  };

  /**
   * Evaluates or derives a common shared secret on the fly for the selected recipient email
   */
  const resolveSharedSecretKey = async (recipientEmail, recipientPublicKeyBase64) => {
    const cachedKey = derivedKeysCache.current.get(recipientEmail);
    if (cachedKey) return cachedKey;

    if (!recipientPublicKeyBase64) {
      console.warn(`No public key recorded for target: ${recipientEmail}. Reverting to raw fallback handling.`);
      return null;
    }

    const localPrivKeyObj = await getLocalPrivateKeyCryptoKey();
    if (!localPrivKeyObj) return null;

    const remotePubKeyObj = await importPublicKey(recipientPublicKeyBase64);
    const sharedSecret = await deriveSharedSecret(localPrivKeyObj, remotePubKeyObj);
    
    derivedKeysCache.current.set(recipientEmail, sharedSecret);
    return sharedSecret;
  };

  // 1. Establish authenticated real-time channel loops
  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    const socketServerUrl = process.env.REACT_APP_SOCKET_URL || "http://localhost:5000";

    socketRef.current = io(socketServerUrl, {
      query: { token },
      headers: { Authorization: `Bearer ${token}` }
    });

    // Capture E2EE packet deliveries on the wire
    socketRef.current.on("receive_secure_message", async (packet) => {
      // Process packet only if it matches current selected view scope room
      const activeRoom = generateRoomId(user.email, selectedRecipient?.email);
      if (packet.roomId === activeRoom || packet.senderId === user.email || packet.receiverId === user.email) {
        
        // Transparently decrypt on the fly
        const matchEmail = packet.senderId === user.email ? packet.receiverId : packet.senderId;
        const keysList = users.find(u => u.email === matchEmail);
        
        let plainText = "[🔒 Encrypted Content Payload]";
        if (keysList?.publicKeyBase64 || user.publicKeyBase64) {
          const secretKey = await resolveSharedSecretKey(matchEmail, keysList?.publicKeyBase64);
          if (secretKey) {
            plainText = await decryptMessage(packet.ciphertext, packet.iv, secretKey);
          }
        }

        const normalizedMsg = {
          ...packet,
          plaintextDecrypted: DOMPurify.sanitize(plainText) // Complete XSS client-side sanitizing
        };

        setMessages((prev) => {
          // Prevent duplicates
          if (prev.some(m => m._id === packet._id)) return prev;
          return [...prev, normalizedMsg];
        });
      }
    });

    // Dynamic presence parameters listener
    socketRef.current.on("presence_change", (data) => {
      setUsers((prev) =>
        prev.map((u) => (u.email === data.email ? { ...u, isOnline: data.status === "online" } : u))
      );
    });

    // Populate user profiles array from server
    apiClient.get("/users/all").then((res) => {
      setUsers(res.data.filter(u => u.email !== user.email));
    }).catch(console.error);

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, [selectedRecipient, users]);

  const generateRoomId = (emailA, emailB) => {
    if (!emailA || !emailB) return "";
    return [emailA.toLowerCase().trim(), emailB.toLowerCase().trim()].sort().join("_");
  };

  /**
   * Handle active recipient change
   */
  const handleSelectRecipient = async (target) => {
    setSelectedRecipient(target);
    setMessages([]);
    const room = generateRoomId(user.email, target.email);

    try {
      // Load historically recorded encrypted conversation chunks from server
      const res = await apiClient.get(`/messages/history/${room}`);
      const rawHistory = res.data;

      const sharedSecret = await resolveSharedSecretKey(target.email, target.publicKeyBase64);

      const decipheredHistory = await Promise.all(
        rawHistory.map(async (m) => {
          let plainText = "🔒 [Decryption Error: Key Mismatch]";
          if (sharedSecret) {
            plainText = await decryptMessage(m.ciphertext, m.iv, sharedSecret);
          }
          return {
            ...m,
            plaintextDecrypted: DOMPurify.sanitize(plainText)
          };
        })
      );

      setMessages(decipheredHistory);
    } catch (err) {
      console.error("Failed to recover message threads:", err);
    }
  };

  /**
   * Transparently encrypt and dispatch payload
   */
  const handleDispatchSecurePayload = async (e) => {
    e.preventDefault();
    if (!messageText.trim() || !selectedRecipient) return;

    // Sanitize user inputs immediately to intercept persistent XSS vectors
    const cleanPlaintext = DOMPurify.sanitize(messageText.trim());
    const targetRoom = generateRoomId(user.email, selectedRecipient.email);

    try {
      const sharedSecret = await resolveSharedSecretKey(selectedRecipient.email, selectedRecipient.publicKeyBase64);
      if (!sharedSecret) {
        alert("E2EE Secret allocation not available for target profile.");
        return;
      }

      // Perform client side local AES-GCM encryption
      const encryptedBlob = await encryptMessage(cleanPlaintext, sharedSecret);

      const packetPayload = {
        receiverId: selectedRecipient.email,
        roomId: targetRoom,
        ciphertext: encryptedBlob.ciphertext,
        iv: encryptedBlob.iv,
        disappearingTimer
      };

      // 1. Submit through hardened API for index storage persistence
      await apiClient.post("/messages/send", packetPayload);

      // 2. Dispatch via secured realtime socket stream for transient distribution
      socketRef.current.emit("send_secure_message", packetPayload);

      setMessageText("");
    } catch (err) {
      console.error("Message delivery failed:", err);
      alert(err.response?.data?.error || "Failed to dispatch payload.");
    }
  };

  /**
   * Compliance blocking toggle action
   */
  const executeBlockUserAction = async (targetEmail) => {
    if (window.confirm(`Confirm blocking profile: ${targetEmail}?`)) {
      await apiClient.post("/users/privacy/block", { targetEmail });
      alert("User blocked successfully.");
    }
  };

  /**
   * Compliance reporting action
   */
  const executeReportUserAction = async (targetEmail) => {
    const reason = prompt("Input reason description for governance logging:");
    if (reason) {
      await apiClient.post("/users/privacy/report", { targetEmail, reason });
      alert("Report filed for server compliance inspection.");
    }
  };

  /**
   * Download personal E2EE backup history file locally
   */
  const triggerDownloadEncryptedBackup = async () => {
    try {
      const res = await apiClient.get("/messages/backup/export");
      const stringifiedBackup = JSON.stringify(res.data, null, 2);
      
      const elementBlob = new Blob([stringifiedBackup], { type: "application/json" });
      const downloadAnchor = document.createElement("a");
      downloadAnchor.href = URL.createObjectURL(elementBlob);
      downloadAnchor.download = `E2EE_SECURE_BACKUP_${user.email.toUpperCase()}.json`;
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      document.body.removeChild(downloadAnchor);
    } catch (err) {
      alert("Backup extraction rejected.");
    }
  };

  return (
    <div className="chat-workspace">
      {/* Sidebar Profile Selection Mapping */}
      <div className="chat-sidebar">
        <div className="sidebar-header">
          <h3>💬 Secure Nodes</h3>
          <button onClick={triggerDownloadEncryptedBackup} className="backup-btn" title="Export E2EE Backup">
            📥 Backup
          </button>
        </div>
        <div className="users-list">
          {users.map((u) => (
            <div
              key={u.email}
              className={`user-card ${selectedRecipient?.email === u.email ? "active" : ""}`}
              onClick={() => handleSelectRecipient(u)}
            >
              <div className="user-info">
                <span className="user-name">{u.displayName || u.email}</span>
                <span className="user-email">{u.email}</span>
              </div>
              <span className={`status-badge ${u.isOnline ? "online" : "offline"}`} />
            </div>
          ))}
        </div>
      </div>

      {/* Main Workspace Frame View */}
      <div className="chat-main-window">
        {selectedRecipient ? (
          <>
            <div className="chat-window-header">
              <div className="active-recipient-details">
                <h4>{selectedRecipient.displayName || selectedRecipient.email}</h4>
                <p>🔒 End-to-End Encrypted Node Channel</p>
              </div>
              <div className="window-controls-panel">
                <select 
                  value={disappearingTimer} 
                  onChange={(e) => setDisappearingTimer(Number(e.target.value))}
                  className="disappearing-dropdown"
                >
                  <option value={0}>Standard History</option>
                  <option value={24}>Disappear: 24 Hours</option>
                  <option value={168}>Disappear: 7 Days</option>
                </select>
                <button onClick={() => executeBlockUserAction(selectedRecipient.email)} className="control-btn block-btn">Block</button>
                <button onClick={() => executeReportUserAction(selectedRecipient.email)} className="control-btn report-btn">Report</button>
              </div>
            </div>

            {/* Conversation Log Flow Window */}
            <div className="chat-messages-flow">
              {messages.map((m, index) => (
                <div key={index} className={`message-bubble ${m.senderId === user.email ? "outgoing" : "incoming"}`}>
                  <div className="bubble-text">{m.plaintextDecrypted}</div>
                  <div className="bubble-time">
                    {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {m.disappearingTimer > 0 && <span className="vanishing-glyph"> ⏳</span>}
                  </div>
                </div>
              ))}
            </div>

            {/* Message Composing Field */}
            <form onSubmit={handleDispatchSecurePayload} className="chat-input-bar">
              <input
                type="text"
                className="message-composer-field"
                placeholder="Type your secure message here..."
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
              />
              <button type="submit" className="message-submit-btn">Send</button>
            </form>
          </>
        ) : (
          <div className="empty-workspace-state">
            <h3>🔒 E2EE Messaging Vault Secured</h3>
            <p>Select a verified contact profile node from the side directory tree grid to spin up an ephemeral communication layer.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default Chat;
