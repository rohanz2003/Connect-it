import React from "react";
import { Mic, MicOff, Video, VideoOff, PhoneOff, Volume2, VolumeX } from "lucide-react";

export default function CallControls({
  isMuted,
  isVideoOff,
  isSpeakerOn,
  callType,
  onToggleMute,
  onToggleVideo,
  onToggleSpeaker,
  onEndCall,
}) {
  return (
    <div className="call-controls-bar">
      <button
        className={`call-control-btn ${isMuted ? "active danger" : ""}`}
        onClick={onToggleMute}
        title={isMuted ? "Unmute" : "Mute"}
      >
        {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
        <span className="call-control-label">{isMuted ? "Unmute" : "Mute"}</span>
      </button>

      {callType === "video" && (
        <button
          className={`call-control-btn ${isVideoOff ? "active danger" : ""}`}
          onClick={onToggleVideo}
          title={isVideoOff ? "Turn on video" : "Turn off video"}
        >
          {isVideoOff ? <VideoOff size={22} /> : <Video size={22} />}
          <span className="call-control-label">{isVideoOff ? "Video On" : "Video Off"}</span>
        </button>
      )}

      <button
        className={`call-control-btn ${isSpeakerOn ? "active" : ""}`}
        onClick={onToggleSpeaker}
        title={isSpeakerOn ? "Speaker off" : "Speaker on"}
      >
        {isSpeakerOn ? <Volume2 size={22} /> : <VolumeX size={22} />}
        <span className="call-control-label">{isSpeakerOn ? "Speaker" : "Speaker"}</span>
      </button>

      <button className="call-control-btn end-call-btn" onClick={onEndCall} title="End call">
        <PhoneOff size={24} />
        <span className="call-control-label">End</span>
      </button>
    </div>
  );
}
