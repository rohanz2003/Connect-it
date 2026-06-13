import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import useWebRTC from "../hooks/useWebRTC";
import useCallTimer from "../hooks/useCallTimer";
import { saveCallToHistory, getCallHistory } from "../utils/callHelpers";
import { playRingtone, stopRingtone, playConnectSound, playEndSound } from "../utils/callSounds";
import socket from "../services/socketService";

const CallContext = createContext(null);

export function CallProvider({ children, user }) {
  const [callState, setCallState] = useState("idle");
  const [incomingCall, setIncomingCall] = useState(null);
  const [activeCall, setActiveCall] = useState({
    type: null,
    with: null,
    remoteStream: null,
    isMuted: false,
    isVideoOff: false,
    isSpeakerOn: false,
    controlsVisible: true,
  });
  const [callHistory, setCallHistory] = useState([]);
  const [unviewedMissedCount, setUnviewedMissedCount] = useState(0);
  const [callId, setCallId] = useState(null);
  const remoteStreamRef = useRef(null);
  const pendingCallerRef = useRef(null);

  const timer = useCallTimer(callState === "active");

  // Refs to avoid stale closures in socket handlers
  const callStateRef = useRef(callState);
  const activeCallRef = useRef(activeCall);
  const callIdRef = useRef(callId);
  const secondsRef = useRef(timer.seconds);

  // Keep refs in sync with latest state (runs on every render, not just state change — but that's fine for refs)
  callStateRef.current = callState;
  activeCallRef.current = activeCall;
  callIdRef.current = callId;
  secondsRef.current = timer.seconds;

  const onRemoteStream = useCallback((stream) => {
    remoteStreamRef.current = stream;
    setActiveCall((prev) => ({ ...prev, remoteStream: stream }));
  }, []);

  const webrtc = useWebRTC({ socket, userId: user?.email, onRemoteStream });
  const webrtcRef = useRef(webrtc);
  webrtcRef.current = webrtc;

  useEffect(() => {
    const history = getCallHistory();
    setCallHistory(history);
    // Count missed calls that haven't been viewed yet
    const lastViewed = localStorage.getItem("missedCallsLastViewed");
    const unviewed = lastViewed
      ? history.filter(c => c.status === "missed" && c.timestamp > parseInt(lastViewed)).length
      : history.filter(c => c.status === "missed").length;
    setUnviewedMissedCount(unviewed);
  }, []);

  const markMissedCallsViewed = useCallback(() => {
    localStorage.setItem("missedCallsLastViewed", Date.now().toString());
    setUnviewedMissedCount(0);
  }, []);

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
    };

    const handleAccepted = ({ signal, from }) => {
      if (w.peerRef.current) {
        w.peerRef.current.signal(signal);
      }
      playConnectSound();
      setCallState("active");
    };

    const handleRejected = ({ from, callId: id }) => {
      if (callIdRef.current === id || !id) {
        w.endCall();
        playEndSound();
        setCallState("idle");
        setIncomingCall(null);
      }
    };

    const handleEnded = ({ from, callId: id }) => {
      if (callStateRef.current !== "idle") {
        const duration = secondsRef.current;
        if (activeCallRef.current.with) {
          // Only save as completed if the call was actually connected (duration > 0 or state was active)
          if (duration > 0 || callStateRef.current === "active") {
            saveCallToHistory({
              with: activeCallRef.current.with,
              type: activeCallRef.current.type,
              duration,
              status: "completed",
            });
            setCallHistory(getCallHistory());
          }
        }
        w.endCall();
        playEndSound();
        timer.reset();
        setCallState("idle");
        setActiveCall((p) => ({ ...p, remoteStream: null }));
        setIncomingCall(null);
        setCallId(null);
      }
    };

    const handleIceCandidate = ({ candidate, from }) => {
      if (w.peerRef.current && candidate) {
        w.peerRef.current.signal(candidate);
      }
    };

    const handleCallStarted = ({ callId: id, to }) => {
      // Server confirmed the call was initiated; store the server-generated callId
      setCallId(id);
    };

    const handleCallUserBusy = () => {
      // Target user is offline or busy — clean up the optimistic "calling" state
      w.endCall();
      timer.reset();
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
  }, [socket]);
  // Note: intentionally omitting callState/activeCall/callId/timer/webrtc from deps.
  // Handlers use refs (callStateRef, activeCallRef, callIdRef, secondsRef, webrtcRef)
  // to always read the latest values without re-registering socket listeners.

  const startCall = useCallback(async (targetUserId, type) => {
    try {
      const result = await webrtc.startCall(targetUserId, type);
      // Save outgoing call to history immediately
      saveCallToHistory({
        with: targetUserId,
        type,
        duration: 0,
        status: "outgoing",
      });
      setCallState("calling");
      setActiveCall({
        type,
        with: targetUserId,
        remoteStream: null,
        isMuted: false,
        isVideoOff: false,
        isSpeakerOn: false,
        controlsVisible: true,
      });
      setCallHistory(getCallHistory());
      setIncomingCall(null);
      return result;
    } catch (err) {
      setCallState("idle");
      throw err;
    }
  }, [webrtc]);

  const acceptCall = useCallback(async () => {
    if (!incomingCall) return;
    try {
      // Pass caller email explicitly to fix the stale-closure bug
      const result = await webrtc.answerCall(incomingCall.signal, incomingCall.type, incomingCall.from);
      playConnectSound();
      setCallState("active");
      setActiveCall({
        type: incomingCall.type,
        with: incomingCall.from,
        remoteStream: null,
        isMuted: false,
        isVideoOff: false,
        isSpeakerOn: false,
        controlsVisible: true,
      });
      setIncomingCall(null);
      return result;
    } catch (err) {
      setCallState("idle");
      setIncomingCall(null);
      throw err;
    }
  }, [incomingCall, webrtc]);

  const rejectCall = useCallback(() => {
    if (incomingCall) {
      socket.emit("reject-call", { to: incomingCall.from, callId });
      saveCallToHistory({
        with: incomingCall.from,
        type: incomingCall.type,
        duration: 0,
        status: "missed",
      });
      const newHistory = getCallHistory();
      setCallHistory(newHistory);
      setUnviewedMissedCount(prev => prev + 1);
    }
    setIncomingCall(null);
    setCallState("idle");
    setCallId(null);
  }, [incomingCall, callId]);

  const endCall = useCallback(() => {
    if (activeCall.with) {
      socket.emit("end-call", { to: activeCall.with, callId });
      saveCallToHistory({
        with: activeCall.with,
        type: activeCall.type,
        duration: timer.seconds,
        status: "completed",
      });
      setCallHistory(getCallHistory());
    }
    webrtc.endCall();
    playEndSound();
    timer.reset();
    setCallState("idle");
    setActiveCall((p) => ({ ...p, remoteStream: null }));
    setIncomingCall(null);
    setCallId(null);
  }, [activeCall, callId, webrtc, timer]);

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
    unviewedMissedCount,
    markMissedCallsViewed,
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
  };

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCall must be used within CallProvider");
  return ctx;
}
