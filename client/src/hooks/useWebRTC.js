import { useRef, useCallback, useEffect } from "react";
import SimplePeer from "simple-peer";

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export default function useWebRTC({ socket, userId, onRemoteStream }) {
  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const callerEmailRef = useRef(null); // Fix: store caller email in ref for use in closures

  const createPeer = useCallback((initiator, stream) => {
    const peer = new SimplePeer({
      initiator,
      stream,
      config: ICE_SERVERS,
      trickle: true,
    });
    return peer;
  }, []);

  const startCall = useCallback((targetUserId, type) => {
    return navigator.mediaDevices
      .getUserMedia({ video: type === "video", audio: true })
      .then((stream) => {
        localStreamRef.current = stream;
        const peer = createPeer(true, stream);
        peerRef.current = peer;

        peer.on("signal", (signal) => {
          socket.emit("call-user", {
            userToCall: targetUserId,
            signalData: signal,
            from: userId,
            type,
          });
        });

        peer.on("stream", (remoteStream) => {
          if (onRemoteStream) onRemoteStream(remoteStream);
        });

        peer.on("error", (err) => {
          console.error("Peer error:", err);
        });

        return { peer, localStream: stream };
      })
      .catch((err) => {
        console.error("getUserMedia error:", err);
        throw err;
      });
  }, [socket, userId, createPeer, onRemoteStream]);

  const answerCall = useCallback((signal, type, callerEmail) => {
    // Fix: accept callerEmail as explicit param and store in ref
    callerEmailRef.current = callerEmail || localStorage.getItem("pendingCaller");

    return navigator.mediaDevices
      .getUserMedia({ video: type === "video", audio: true })
      .then((stream) => {
        localStreamRef.current = stream;
        const peer = createPeer(false, stream);
        peerRef.current = peer;

        peer.on("signal", (outSignal) => {
          // Use the ref — safe inside closure, no stale value
          const to = callerEmailRef.current;
          socket.emit("answer-call", { signal: outSignal, to });
        });

        peer.on("stream", (remoteStream) => {
          if (onRemoteStream) onRemoteStream(remoteStream);
        });

        peer.on("error", (err) => {
          console.error("Peer error:", err);
        });

        peer.signal(signal);
        return { peer, localStream: stream };
      })
      .catch((err) => {
        console.error("getUserMedia error:", err);
        throw err;
      });
  }, [socket, createPeer, onRemoteStream]);

  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        return audioTrack.enabled;
      }
    }
    return false;
  }, []);

  const toggleVideo = useCallback(() => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        return videoTrack.enabled;
      }
    }
    return false;
  }, []);

  const endCall = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
    callerEmailRef.current = null;
  }, []);

  const handleSignal = useCallback((signal) => {
    if (peerRef.current) {
      peerRef.current.signal(signal);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (peerRef.current) {
        peerRef.current.destroy();
      }
    };
  }, []);

  return { startCall, answerCall, endCall, toggleMute, toggleVideo, handleSignal, localStreamRef, peerRef };
}
