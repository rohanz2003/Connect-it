import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import useWebRTC from "../hooks/useWebRTC";
import useCallTimer from "../hooks/useCallTimer";
import {
  saveCallToHistory,
  getCallHistory,
  clearCallHistory,
  deleteCallHistoryEntry,
  saveCallEvent,
} from "../utils/callHelpers";
import { playRingtone, stopRingtone, playConnectSound, playEndSound } from "../utils/callSounds";
import { broadcastEvent } from "../utils/crossTabNotifications";
import socket from "../services/socketService";

const CallContext = createContext(null);

export function CallProvider({ children, user }) {
  const [callState, setCallState] = useState("idle");
  const [incomingCall, setIncomingCall] = useState(null);
  const [activeCall, setActiveCall] = useState({
    type: null,
    with: null,
    direction: null,
    remoteStream: null,
    isMuted: false,
    isVideoOff: false,
    isSpeakerOn: false,
    controlsVisible: true,
  });
  const [callHistory, setCallHistory] = useState([]);
  const [callId, setCallId] = useState(null);
  const remoteStreamRef = useRef(null);
  const pendingCallerRef = useRef(null);
  const incomingCallRef = useRef(null);
  const pendingIceCandidatesRef = useRef([]);

  const timer = useCallTimer(callState === "active");
  const timerRef = useRef(timer);
  timerRef.current = timer;

  // Refs to avoid stale closures in socket handlers
  const callStateRef = useRef(callState);
  const activeCallRef = useRef(activeCall);
  const callIdRef = useRef(callId);
  const secondsRef = useRef(timer.seconds);

  // Keep refs in sync with latest state (runs on every render, not just state change — but that's fine for refs)
  callStateRef.current = callState;
  activeCallRef.current = activeCall;
  callIdRef.current = callId;
  incomingCallRef.current = incomingCall;
  secondsRef.current = timer.seconds;

  const onRemoteStream = useCallback((stream) => {
    remoteStreamRef.current = stream;
    setActiveCall((prev) => ({ ...prev, remoteStream: stream }));
  }, []);

  const webrtc = useWebRTC({ socket, userId: user?.email, onRemoteStream });
  const webrtcRef = useRef(webrtc);
  webrtcRef.current = webrtc;

  const refreshCallHistory = useCallback(() => {
    setCallHistory(getCallHistory(user?.email));
  }, [user]);

  const addCallHistoryEntry = useCallback((entry) => {
    saveCallToHistory(entry, user?.email);
    refreshCallHistory();
  }, [refreshCallHistory, user]);

  const flushPendingIceCandidates = useCallback(() => {
    const peer = webrtcRef.current?.peerRef?.current;
    if (!peer || pendingIceCandidatesRef.current.length === 0) return;

    const queued = [...pendingIceCandidatesRef.current];
    pendingIceCandidatesRef.current = [];
    queued.forEach((candidate) => {
      try {
        peer.signal(candidate);
      } catch (err) {
        console.warn("Failed to apply queued ICE candidate:", err.message);
      }
    });
  }, []);

  const clearAllCallHistory = useCallback(() => {
    clearCallHistory(user?.email);
    setCallHistory([]);
  }, [user]);

  const deleteCallHistoryItem = useCallback((id) => {
    deleteCallHistoryEntry(id, user?.email);
    refreshCallHistory();
  }, [refreshCallHistory, user]);

  useEffect(() => {
    if (user?.email) {
      setCallHistory(getCallHistory(user.email));
    }
  }, [user]);

  // Sound effects: ringtone on ringing, stop on any state change
  useEffect(() => {
    if (callState === "ringing") {
      playRingtone();
      // Vibrate if supported (mobile)
      if (navigator.vibrate) {
        const pattern = [400, 200, 400, 200, 400];
        const vibInterval = setInterval(() => navigator.vibrate(pattern), 1800);
        return () => {
          clearInterval(vibInterval);
          stopRingtone();
          navigator.vibrate(0);
        };
      }
      return () => stopRingtone();
    }
    if (callState === "calling") {
      // Play a subtle outgoing call beep
      playRingtone(true); // outgoing mode
      return () => stopRingtone();
    }
    stopRingtone();
  }, [callState]);

  // Socket event listeners — uses refs to avoid stale closures,
  // so the effect only depends on the stable socket reference.
  // webrtcRef, callStateRef, activeCallRef, callIdRef, secondsRef are
  // synced each render so handlers always read the latest values.
  useEffect(() => {
    if (!socket) return;

    const w = webrtcRef.current;

    const handleIncoming = ({ callId, from, type, signal }) => {
      pendingCallerRef.current = from;
      localStorage.setItem("pendingCaller", from);
      setCallId(callId);
      setIncomingCall({ from, type, signal });
      setCallState("ringing");
      pendingIceCandidatesRef.current = []; // Clear queue for new call
      broadcastEvent({ type: "call", sender: from, callType: type, senderName: from?.split("@")[0] || "Someone" });
    };

    const handleAccepted = ({ signal, from }) => {
      if (w.peerRef.current) {
        w.peerRef.current.signal(signal);
        // Flush any candidates received while waiting for acceptance
        setTimeout(flushPendingIceCandidates, 100);
      }
      playConnectSound();
      setCallState("active");
    };

    const handleRejected = ({ from, callId: id }) => {
      if (callIdRef.current === id || !id) {
        if (activeCallRef.current.with) {
          addCallHistoryEntry({
            with: activeCallRef.current.with,
            type: activeCallRef.current.type,
            duration: 0,
            status: "outgoing",
          });
          saveCallEvent(user?.email, activeCallRef.current.with, {
            callType: activeCallRef.current.type,
            status: "outgoing",
            duration: 0,
          });
        }
        w.endCall();
        playEndSound();
        setCallState("idle");
        setIncomingCall(null);
      }
    };

    const handleEnded = ({ from, callId: id }) => {
      if (callStateRef.current !== "idle") {
        const duration = secondsRef.current;
        const state = callStateRef.current;

        if (activeCallRef.current.with) {
          addCallHistoryEntry({
            with: activeCallRef.current.with,
            type: activeCallRef.current.type,
            duration,
            status: activeCallRef.current.direction || "outgoing",
          });
          saveCallEvent(user?.email, activeCallRef.current.with, {
            callType: activeCallRef.current.type,
            status: activeCallRef.current.direction || "outgoing",
            duration,
          });
        } else if (state === "ringing" && incomingCallRef.current) {
          addCallHistoryEntry({
            with: incomingCallRef.current.from,
            type: incomingCallRef.current.type,
            duration: 0,
            status: "missed",
          });
          saveCallEvent(user?.email, incomingCallRef.current.from, {
            callType: incomingCallRef.current.type,
            status: "missed",
            duration: 0,
          });
        }

        w.endCall();
        playEndSound();
        timerRef.current.reset();
        setCallState("idle");
        setActiveCall((p) => ({ ...p, remoteStream: null }));
        setIncomingCall(null);
        setCallId(null);
      }
    };

    const handleIceCandidate = ({ candidate, from }) => {
      const peer = w.peerRef.current;
      if (peer && !peer.destroyed) {
        try {
          peer.signal(candidate);
        } catch (e) {
          console.warn("Signal error", e);
        }
      } else {
        // Queue candidates if peer isn't ready
        pendingIceCandidatesRef.current.push(candidate);
      }
    };

    const handleCallStarted = ({ callId: id, to }) => {
      setCallId(id);
    };

    const handleCallUserBusy = () => {
      w.endCall();
      timerRef.current.reset();
      setCallState("idle");
      setActiveCall((p) => ({ ...p, remoteStream: null }));
      setCallId(null);
    };

    socket.on("incoming-call", handleIncoming);
    socket.on("call-accepted", handleAccepted);
    socket.on("call-rejected", handleRejected);
    socket.on("call-ended", handleEnded);
    socket.on("ice-candidate", handleIceCandidate);
    socket.on("call-started", handleCallStarted);
    socket.on("call-user-busy", handleCallUserBusy);

    return () => {
      socket.off("incoming-call", handleIncoming);
      socket.off("call-accepted", handleAccepted);
      socket.off("call-rejected", handleRejected);
      socket.off("call-ended", handleEnded);
      socket.off("ice-candidate", handleIceCandidate);
      socket.off("call-started", handleCallStarted);
      socket.off("call-user-busy", handleCallUserBusy);
    };
  }, [socket, flushPendingIceCandidates, addCallHistoryEntry, user]);

  const startCall = useCallback(async (targetUserId, type) => {
    try {
      const result = await webrtc.startCall(targetUserId, type);
      setCallState("calling");
      setActiveCall({
        type,
        with: targetUserId,
        direction: "outgoing",
        remoteStream: null,
        isMuted: false,
        isVideoOff: false,
        isSpeakerOn: false,
        controlsVisible: true,
      });
      setIncomingCall(null);
      pendingIceCandidatesRef.current = [];
      return result;
    } catch (err) {
      setCallState("idle");
      throw err;
    }
  }, [webrtc]);

  const acceptCall = useCallback(async () => {
    if (!incomingCall) return;
    try {
      const result = await webrtc.answerCall(incomingCall.signal, incomingCall.type, incomingCall.from);
      playConnectSound();
      setCallState("active");
      setActiveCall({
        type: incomingCall.type,
        with: incomingCall.from,
        direction: "incoming",
        remoteStream: null,
        isMuted: false,
        isVideoOff: false,
        isSpeakerOn: false,
        controlsVisible: true,
      });
      setIncomingCall(null);
      // Flush candidates after answering
      setTimeout(flushPendingIceCandidates, 100);
      return result;
    } catch (err) {
      setCallState("idle");
      setIncomingCall(null);
      throw err;
    }
  }, [incomingCall, webrtc, flushPendingIceCandidates]);

  const rejectCall = useCallback(() => {
    if (incomingCall) {
      socket.emit("reject-call", { to: incomingCall.from, callId });
      addCallHistoryEntry({
        with: incomingCall.from,
        type: incomingCall.type,
        duration: 0,
        status: "missed",
      });
      saveCallEvent(user?.email, incomingCall.from, {
        callType: incomingCall.type,
        status: "missed",
        duration: 0,
      });
    }
    setIncomingCall(null);
    setCallState("idle");
    setCallId(null);
  }, [incomingCall, callId, addCallHistoryEntry, user]);

  const endCall = useCallback(() => {
    if (activeCall.with) {
      socket.emit("end-call", { to: activeCall.with, callId });
      addCallHistoryEntry({
        with: activeCall.with,
        type: activeCall.type,
        duration: timer.seconds,
        status: activeCall.direction || "outgoing",
      });
      saveCallEvent(user?.email, activeCall.with, {
        callType: activeCall.type,
        status: activeCall.direction || "outgoing",
        duration: timer.seconds,
      });
    }
    webrtc.endCall();
    playEndSound();
    timer.reset();
    setCallState("idle");
    setActiveCall((p) => ({ ...p, remoteStream: null }));
    setIncomingCall(null);
    setCallId(null);
  }, [activeCall, callId, webrtc, timer, addCallHistoryEntry, user]);

  const toggleMute = useCallback(() => {
    const enabled = webrtc.toggleMute();
    setActiveCall((prev) => ({ ...prev, isMuted: !enabled }));
  }, [webrtc]);

  const toggleVideo = useCallback(() => {
    const enabled = webrtc.toggleVideo();
    setActiveCall((prev) => ({ ...prev, isVideoOff: !enabled }));
  }, [webrtc]);

  const toggleSpeaker = useCallback(() => {
    setActiveCall((prev) => ({ ...prev, isSpeakerOn: !prev.isSpeakerOn }));
  }, []);

  const showControls = useCallback(() => {
    setActiveCall((prev) => ({ ...prev, controlsVisible: true }));
  }, []);

  const hideControls = useCallback(() => {
    setActiveCall((prev) => ({ ...prev, controlsVisible: false }));
  }, []);

  const value = {
    callState,
    incomingCall,
    activeCall,
    callHistory,
    callId,
    duration: timer.duration,
    seconds: timer.seconds,
    remoteStreamRef,
    localStreamRef: webrtc.localStreamRef,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleVideo,
    toggleSpeaker,
    showControls,
    hideControls,
    clearAllCallHistory,
    deleteCallHistoryItem,
    refreshCallHistory,
  };

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCall must be used within CallProvider");
  return ctx;
}
