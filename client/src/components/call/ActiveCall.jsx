import React, { useRef, useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Signal, Maximize2, Minimize2 } from "lucide-react";
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
  const remoteAudioRef = useRef(null);
  const hideTimerRef = useRef(null);
  const [showUi, setShowUi] = useState(true);
  const [selfViewFullscreen, setSelfViewFullscreen] = useState(false);

  // Callback ref: attach remote stream immediately when video mounts
  const remoteVideoCallbackRef = useCallback((node) => {
    if (node && remoteStreamRef?.current) {
      node.srcObject = remoteStreamRef.current;
    }
  }, [remoteStreamRef?.current]); // eslint-disable-line

  // Callback ref: attach local stream to PIP immediately when mounted
  const localPipCallbackRef = useCallback((node) => {
    if (node && localStreamRef?.current) {
      node.srcObject = localStreamRef.current;
    }
  }, [localStreamRef?.current]); // eslint-disable-line

  // Callback ref: attach local stream to fullscreen immediately when mounted
  const localFullscreenCallbackRef = useCallback((node) => {
    if (node && localStreamRef?.current) {
      node.srcObject = localStreamRef.current;
    }
  }, [localStreamRef?.current]); // eslint-disable-line

  // Re-attach remote stream when toggling self-view (PIP ↔ fullscreen)
  useEffect(() => {
    // Small delay to let DOM update after toggle
    const timer = setTimeout(() => {
      const remoteVideo = document.querySelector(".active-call-remote-video");
      if (remoteVideo && remoteStreamRef?.current && remoteVideo.srcObject !== remoteStreamRef.current) {
        remoteVideo.srcObject = remoteStreamRef.current;
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [selfViewFullscreen, remoteStreamRef?.current]); // eslint-disable-line

  // Re-attach local stream when toggling self-view
  useEffect(() => {
    const timer = setTimeout(() => {
      const localVideo = document.querySelector(selfViewFullscreen
        ? ".active-call-self-fullscreen-video"
        : ".active-call-pip-video");
      if (localVideo && localStreamRef?.current && localVideo.srcObject !== localStreamRef.current) {
        localVideo.srcObject = localStreamRef.current;
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [selfViewFullscreen, localStreamRef?.current]); // eslint-disable-line

  // Attach audio stream
  useEffect(() => {
    if (remoteAudioRef.current && remoteStreamRef?.current) {
      remoteAudioRef.current.srcObject = remoteStreamRef.current;
    }
  }, [remoteStreamRef?.current]); // eslint-disable-line

  const resetHideTimer = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    setShowUi(true);
    hideTimerRef.current = setTimeout(() => setShowUi(false), 5000);
  }, []);

  const handleTap = useCallback(() => {
    if (showUi) {
      resetHideTimer();
    } else {
      setShowUi(true);
      resetHideTimer();
    }
  }, [showUi, resetHideTimer]);

  const toggleSelfView = useCallback((e) => {
    e.stopPropagation();
    setSelfViewFullscreen(prev => !prev);
  }, []);

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
  const normalizedPeer = activeCall?.with?.toLowerCase().trim();
  const peerAvatar = normalizedPeer ? userProfiles?.[normalizedPeer] || null : null;
  const callerName = getDisplayName ? getDisplayName(activeCall?.with) : activeCall?.with || "Connecting...";

  return (
    <motion.div
      className="active-call-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={handleTap}
    >
      {/* Remote video — always rendered for video calls, hidden via CSS when self-view is fullscreen */}
      {isVideo && (
        <video
          ref={remoteVideoCallbackRef}
          autoPlay
          playsInline
          className={`active-call-remote-video ${selfViewFullscreen ? "pip-mode" : ""}`}
        />
      )}

      {/* Voice call UI */}
      {(!isVideo) && (
        <div className="active-call-voice-bg">
          <div className="active-call-voice-rings">
            <span className="active-call-voice-ring r1" />
            <span className="active-call-voice-ring r2" />
          </div>
          <div className="active-call-avatar-center">
            <Avatar
              src={peerAvatar}
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

      {/* Hidden audio element for voice calls */}
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

      {/* PIP self-view — always rendered, toggled via CSS visibility */}
      {isVideo && (
        <div
          className={`active-call-pip ${selfViewFullscreen ? "pip-hidden" : ""}`}
          onClick={toggleSelfView}
        >
          <video ref={localPipCallbackRef} autoPlay playsInline muted className="active-call-pip-video" />
          <div className="active-call-pip-expand">
            <Maximize2 size={14} />
          </div>
        </div>
      )}

      {/* Fullscreen self-view — always rendered, toggled via CSS visibility */}
      {isVideo && (
        <div
          className={`active-call-self-fullscreen ${selfViewFullscreen ? "visible" : ""}`}
          onClick={toggleSelfView}
        >
          <video ref={localFullscreenCallbackRef} autoPlay playsInline muted className="active-call-self-fullscreen-video" />
          <div className="active-call-self-fullscreen-badge">
            <Minimize2 size={14} /> Tap to minimize
          </div>
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
