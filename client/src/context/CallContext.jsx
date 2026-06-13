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
  const [callId, setCallId] = useState(null);
  const remoteStreamRef = useRef(null);
  const pendingCallerRef = useRef(null);

  const timer = useCallTimer(callState === "active");

  const onRemoteStream = useCallback((stream) => {
    remoteStreamRef.current = stream;
    setActiveCall((prev) => ({ ...prev, remoteStream: stream }));
  }, []);

  const webrtc = useWebRTC({ socket, userId: user?.email, onRemoteStream });

  useEffect(() => {
    setCallHistory(getCallHistory());
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

  useEffect(() => {
    if (!socket) return;

    const handleIncoming = ({ callId, from, type, signal }) => {
      pendingCallerRef.current = from;
      localStorage.setItem("pendingCaller", from);
      setCallId(callId);
      setIncomingCall({ from, type, signal });
      setCallState("ringing");
    };

    const handleAccepted = ({ signal, from }) => {
      if (webrtc.peerRef.current) {
        webrtc.peerRef.current.signal(signal);
      }
      playConnectSound();
      setCallState("active");
    };

    const handleRejected = ({ from, callId: id }) => {
      if (callId === id || !id) {
        webrtc.endCall();
        playEndSound();
        setCallState("idle");
        setIncomingCall(null);
      }
    };

    const handleEnded = ({ from, callId: id }) => {
      if (callState !== "idle") {
        const duration = timer.seconds;
        if (activeCall.with) {
          saveCallToHistory({
            with: activeCall.with,
            type: activeCall.type,
            duration,
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
      }
    };

    const handleIceCandidate = ({ candidate, from }) => {
      if (webrtc.peerRef.current && candidate) {
        webrtc.peerRef.current.signal(candidate);
      }
    };

    socket.on("incoming-call", handleIncoming);
    socket.on("call-accepted", handleAccepted);
    socket.on("call-rejected", handleRejected);
    socket.on("call-ended", handleEnded);
    socket.on("ice-candidate", handleIceCandidate);

    return () => {
      socket.off("incoming-call", handleIncoming);
      socket.off("call-accepted", handleAccepted);
      socket.off("call-rejected", handleRejected);
      socket.off("call-ended", handleEnded);
      socket.off("ice-candidate", handleIceCandidate);
    };
  }, [socket, callState, callId, activeCall, timer, webrtc]);

  const startCall = useCallback(async (targetUserId, type) => {
    try {
      const result = await webrtc.startCall(targetUserId, type);
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
      setCallHistory(getCallHistory());
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
