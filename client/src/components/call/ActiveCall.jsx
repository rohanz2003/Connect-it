import React, { useRef, useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Signal } from "lucide-react";
import Avatar from "../Avatar";
import CallControls from "./CallControls";

export default function ActiveCall({
  callState,
  activeCall,
  duration,
  remoteStreamRef,
  localStreamRef,
  userProfiles,
  getDisplayName,
  onToggleMute,
  onToggleVideo,
  onToggleSpeaker,
  onEndCall,
}) {
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const localVideoRef = useRef(null);
  const hideTimerRef = useRef(null);
  const [showUi, setShowUi] = useState(true);

  // Attach remote stream to video or audio element
  useEffect(() => {
    if (remoteStreamRef?.current) {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStreamRef.current;
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStreamRef.current;
      }
    }
  }, [remoteStreamRef?.current]); // eslint-disable-line

  // Attach local stream to PIP video element
  useEffect(() => {
    if (localVideoRef.current && localStreamRef?.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [localStreamRef?.current]); // eslint-disable-line

  const resetHideTimer = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    setShowUi(true);
    hideTimerRef.current = setTimeout(() => setShowUi(false), 5000);
  }, []);

  const handleTap = useCallback(() => {
    if (showUi) {
      // Already visible — start hide timer
      resetHideTimer();
    } else {
      setShowUi(true);
      resetHideTimer();
    }
  }, [showUi, resetHideTimer]);

  // Auto-hide controls after 5s when call is active
  useEffect(() => {
    if (callState === "active") {
      resetHideTimer();
    }
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [callState, resetHideTimer]);

  const isVideo = activeCall?.type === "video";
  const hasRemoteStream = !!remoteStreamRef?.current;
  const callerName = getDisplayName ? getDisplayName(activeCall?.with) : activeCall?.with || "Connecting...";

  return (
    <motion.div
      className="active-call-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={handleTap}
    >
      {/* Remote video for video calls */}
      {isVideo && hasRemoteStream ? (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="active-call-remote-video"
        />
      ) : (
        <div className="active-call-voice-bg">
          <div className="active-call-voice-rings">
            <span className="active-call-voice-ring r1" />
            <span className="active-call-voice-ring r2" />
          </div>
          <div className="active-call-avatar-center">
            <Avatar
              src={userProfiles?.[activeCall?.with]}
              email={activeCall?.with}
              size={150}
              className="active-call-big-avatar"
            />
          </div>
          <div className="active-call-voice-name">{callerName}</div>
          <div className="active-call-voice-status">
            {callState === "calling" ? "Calling..." : callState === "ringing" ? "Ringing..." : duration || "00:00"}
          </div>
        </div>
      )}

      {/* Hidden audio element for voice calls — plays remote audio stream */}
      {!isVideo && (
        <audio
          ref={remoteAudioRef}
          autoPlay
          playsInline
          style={{ display: "none" }}
        />
      )}

      {/* Top bar — name + timer + signal quality */}
      <AnimatePresence>
        {showUi && (
          <motion.div
            className="active-call-top-bar"
            initial={{ y: -72, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -72, opacity: 0 }}
            transition={{ type: "spring", damping: 24, stiffness: 260 }}
          >
            <div className="active-call-top-left">
              <span className="active-call-name">{callerName}</span>
              <span className="active-call-duration">
                {callState === "calling" ? "Calling..." : callState === "active" ? duration || "00:00" : "Connecting..."}
              </span>
            </div>
            <div className="active-call-signal">
              <Signal size={16} className="active-call-signal-icon" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PIP self-view for video calls */}
      {isVideo && localStreamRef?.current && (
        <div className="active-call-pip" onClick={(e) => e.stopPropagation()}>
          <video ref={localVideoRef} autoPlay playsInline muted className="active-call-pip-video" />
        </div>
      )}

      {/* Bottom controls */}
      <AnimatePresence>
        {showUi && (
          <motion.div
            className="active-call-bottom-controls"
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: "spring", damping: 24, stiffness: 260 }}
            onClick={(e) => e.stopPropagation()}
          >
            <CallControls
              isMuted={activeCall?.isMuted}
              isVideoOff={activeCall?.isVideoOff}
              isSpeakerOn={activeCall?.isSpeakerOn}
              callType={activeCall?.type}
              onToggleMute={onToggleMute}
              onToggleVideo={onToggleVideo}
              onToggleSpeaker={onToggleSpeaker}
              onEndCall={onEndCall}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
