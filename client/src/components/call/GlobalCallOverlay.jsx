import React from "react";
import { AnimatePresence } from "framer-motion";
import { useCall } from "../../context/CallContext";
import IncomingCall from "./IncomingCall";
import ActiveCall from "./ActiveCall";

export default function GlobalCallOverlay() {
  const {
    callState,
    incomingCall,
    activeCall,
    duration,
    remoteStreamRef,
    localStreamRef,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleVideo,
    toggleSpeaker,
  } = useCall();

  // Load user profiles from localStorage for avatar display on non-chat pages
  const [userProfiles, setUserProfiles] = React.useState(() => {
    try {
      const email = JSON.parse(localStorage.getItem("user") || "{}").email;
      if (email) {
        const stored = localStorage.getItem(`userProfiles_${email.toLowerCase()}`);
        return stored ? JSON.parse(stored) : {};
      }
    } catch {}
    return {};
  });

  const [userNames, setUserNames] = React.useState(() => {
    try {
      const email = JSON.parse(localStorage.getItem("user") || "{}").email;
      if (email) {
        const stored = localStorage.getItem(`userNames_${email.toLowerCase()}`);
        return stored ? JSON.parse(stored) : {};
      }
    } catch {}
    return {};
  });

  const getDisplayName = (email) => {
    if (!email) return "";
    const normalized = email.toLowerCase().trim();
    if (userNames[normalized]) return userNames[normalized];
    return email.split("@")[0];
  };

  return (
    <>
      {/* Incoming call overlay — shown globally on all pages */}
      <IncomingCall
        call={incomingCall}
        onAccept={acceptCall}
        onReject={rejectCall}
        onMessage={() => rejectCall()}
        userProfiles={userProfiles}
        getDisplayName={getDisplayName}
      />

      {/* Active call overlay */}
      <AnimatePresence>
        {(callState === "calling" || callState === "active") && (
          <ActiveCall
            callState={callState}
            activeCall={activeCall}
            duration={duration}
            remoteStreamRef={remoteStreamRef}
            localStreamRef={localStreamRef}
            userProfiles={userProfiles}
            getDisplayName={getDisplayName}
            onToggleMute={toggleMute}
            onToggleVideo={toggleVideo}
            onToggleSpeaker={toggleSpeaker}
            onEndCall={endCall}
          />
        )}
      </AnimatePresence>
    </>
  );
}
