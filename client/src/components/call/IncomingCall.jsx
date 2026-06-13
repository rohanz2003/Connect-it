import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, PhoneOff, MessageCircle, Video } from "lucide-react";
import Avatar from "../Avatar";

export default function IncomingCall({ call, onAccept, onReject, onMessage, userProfiles, getDisplayName }) {
  // Vibrate on mount (mobile)
  useEffect(() => {
    if (!call) return;
    if (navigator.vibrate) {
      const pattern = [300, 150, 300, 150, 300];
      navigator.vibrate(pattern);
    }
    return () => {
      if (navigator.vibrate) navigator.vibrate(0);
    };
  }, [call]);

  const callerName = getDisplayName ? getDisplayName(call?.from) : call?.from;

  return (
    <AnimatePresence>
      {call && (
        <motion.div
          className="incoming-call-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <motion.div
            className="incoming-call-card"
            initial={{ y: 60, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 60, opacity: 0, scale: 0.9 }}
            transition={{ type: "spring", damping: 22, stiffness: 280 }}
          >
            {/* Pulse rings behind avatar */}
            <div className="incoming-call-pulse-wrap">
              <span className="incoming-call-pulse ring1" />
              <span className="incoming-call-pulse ring2" />
              <span className="incoming-call-pulse ring3" />
              <div className="incoming-call-avatar">
                <Avatar
                  src={userProfiles?.[call.from]}
                  email={call.from}
                  size={110}
                  className="incoming-avatar-img"
                />
              </div>
            </div>

            <h2 className="incoming-call-name">{callerName}</h2>
            <p className="incoming-call-type">
              {call.type === "video" ? (
                <><Video size={14} style={{ display: "inline", marginRight: 5 }} />Incoming Video Call</>
              ) : (
                <><Phone size={14} style={{ display: "inline", marginRight: 5 }} />Incoming Voice Call</>
              )}
            </p>

            <div className="incoming-call-actions">
              {/* Decline */}
              <div className="incoming-call-action-wrap">
                <button className="incoming-call-btn decline" onClick={onReject} title="Decline" id="call-decline-btn">
                  <PhoneOff size={26} />
                </button>
                <span className="incoming-btn-label">Decline</span>
              </div>

              {/* Message */}
              {onMessage && (
                <div className="incoming-call-action-wrap">
                  <button className="incoming-call-btn message" onClick={onMessage} title="Message" id="call-message-btn">
                    <MessageCircle size={22} />
                  </button>
                  <span className="incoming-btn-label">Message</span>
                </div>
              )}

              {/* Accept */}
              <div className="incoming-call-action-wrap">
                <button className="incoming-call-btn accept" onClick={onAccept} title="Accept" id="call-accept-btn">
                  <Phone size={26} />
                </button>
                <span className="incoming-btn-label">Accept</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
