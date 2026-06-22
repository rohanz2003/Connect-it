import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Phone, Video, Camera, Trash2, UserPlus, Check, Clock, XCircle, MessageCircle, Eye } from "lucide-react";
import Avatar from "./Avatar";
import LastSeen from "./LastSeen";
import "./ProfileViewer.css";

const normalizeEmail = (email) => (email || "").toLowerCase().trim();

const ProfileViewer = ({
  user,
  isOpen,
  onClose,
  userProfiles = {},
  userNames = {},
  isUserOnline,
  callHistory = [],
  requestStatuses = {},
  onSendMessage,
  onChangePhoto,
  onRemovePhoto,
  onViewFullImage,
}) => {
  const [imgLoaded, setImgLoaded] = useState(false);
  const overlayRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      setImgLoaded(false);
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  useEffect(() => {
    const handleEsc = (e) => { if (e.key === "Escape") onClose(); };
    if (isOpen) window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose]);

  if (!user || !isOpen) return null;

  const email = normalizeEmail(user.email);
  const avatarSrc = userProfiles[email] || null;
  const displayName = userNames[email] || email.split("@")[0];
  const online = isUserOnline ? isUserOnline(email) : false;

  const userCalls = callHistory.filter(c => normalizeEmail(c.with) === email);
  const totalCalls = userCalls.length;
  const audioCalls = userCalls.filter(c => c.type === "audio").length;
  const videoCalls = userCalls.filter(c => c.type === "video").length;
  const missedCalls = userCalls.filter(c => c.status === "missed").length;
  const reqStatus = requestStatuses[email];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={overlayRef}
          className="pv-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          onClick={onClose}
        >
          <motion.div
            className="pv-card"
            initial={{ opacity: 0, scale: 0.8, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 30 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button className="pv-close" onClick={onClose}>
              <X size={20} />
            </button>

            {/* Avatar Section */}
            <div className="pv-avatar-section">
              <div className={`pv-avatar-ring ${online ? "online" : ""}`}>
                <div className="pv-avatar-glow" />
                {avatarSrc ? (
                  <img
                    src={avatarSrc}
                    alt={displayName}
                    className="pv-avatar-img"
                    onLoad={() => setImgLoaded(true)}
                    onClick={() => avatarSrc && onViewFullImage?.(avatarSrc, "profile", displayName, user.isOwn)}
                    style={{ cursor: avatarSrc ? "pointer" : "default" }}
                  />
                ) : (
                  <Avatar src={null} email={user.email} size={160} className="pv-avatar-fallback" />
                )}
                {online && <div className="pv-online-badge"><span className="pv-online-dot" /></div>}
              </div>
            </div>

            {/* Info Section */}
            <motion.div
              className="pv-info"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
            >
              <h2 className="pv-name">{displayName}</h2>
              <p className="pv-email">{user.email}</p>
              <div className="pv-status">
                {online ? (
                  <span className="pv-status-online">
                    <span className="pv-status-dot online" /> Online
                  </span>
                ) : (
                  <span className="pv-status-offline">
                    <LastSeen userId={user.email} />
                  </span>
                )}
              </div>
            </motion.div>

            {/* Stats Section */}
            {(totalCalls > 0 || reqStatus) && (
              <motion.div
                className="pv-stats"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                {totalCalls > 0 && (
                  <div className="pv-stat-row">
                    <div className="pv-stat">
                      <div className="pv-stat-icon audio"><Phone size={16} /></div>
                      <div className="pv-stat-info">
                        <span className="pv-stat-value">{audioCalls}</span>
                        <span className="pv-stat-label">Audio</span>
                      </div>
                    </div>
                    <div className="pv-stat">
                      <div className="pv-stat-icon video"><Video size={16} /></div>
                      <div className="pv-stat-info">
                        <span className="pv-stat-value">{videoCalls}</span>
                        <span className="pv-stat-label">Video</span>
                      </div>
                    </div>
                    {missedCalls > 0 && (
                      <div className="pv-stat">
                        <div className="pv-stat-icon missed"><XCircle size={16} /></div>
                        <div className="pv-stat-info">
                          <span className="pv-stat-value">{missedCalls}</span>
                          <span className="pv-stat-label">Missed</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {reqStatus && (
                  <div className="pv-badge-row">
                    {reqStatus.status === "pending" && (
                      <span className="pv-badge pending"><Clock size={12} /> Request Pending</span>
                    )}
                    {reqStatus.status === "accepted" && (
                      <span className="pv-badge accepted"><Check size={12} /> Connected</span>
                    )}
                    {reqStatus.status === "rejected" && (
                      <span className="pv-badge rejected"><XCircle size={12} /> Rejected</span>
                    )}
                  </div>
                )}
              </motion.div>
            )}

            {/* Action Buttons */}
            <motion.div
              className="pv-actions"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
            >
              {!user.isOwn && onSendMessage && (
                <button className="pv-action primary" onClick={() => { onSendMessage(user.email); onClose(); }}>
                  <MessageCircle size={18} /> Message
                </button>
              )}
              {avatarSrc && (
                <button className="pv-action" onClick={() => onViewFullImage?.(avatarSrc, "profile", displayName, user.isOwn)}>
                  <Eye size={18} /> View Photo
                </button>
              )}
              {user.isOwn && (
                <>
                  <label className="pv-action primary" htmlFor="pv-change-photo">
                    <Camera size={18} /> Change Photo
                  </label>
                  <input
                    id="pv-change-photo"
                    type="file"
                    accept="image/*"
                    onChange={onChangePhoto}
                    style={{ display: "none" }}
                  />
                  {avatarSrc && (
                    <button className="pv-action danger" onClick={() => { onRemovePhoto?.(); onClose(); }}>
                      <Trash2 size={18} /> Remove Photo
                    </button>
                  )}
                </>
              )}
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ProfileViewer;
