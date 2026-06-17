/**
 * callSounds.js — Web Audio API synthesized call sounds.
 * No external audio files required. Works offline.
 */

let audioCtx = null;
let ringtoneInterval = null;
let ringtoneNodes = [];

const getAudioCtx = () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  // Resume if suspended (browser autoplay policy)
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
};

const playTone = (frequency, duration, startTime, gainValue = 0.3, type = "sine") => {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, startTime);

    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(gainValue, startTime + 0.02);
    gainNode.gain.setValueAtTime(gainValue, startTime + duration - 0.05);
    gainNode.gain.linearRampToValueAtTime(0, startTime + duration);

    osc.start(startTime);
    osc.stop(startTime + duration);

    ringtoneNodes.push(osc);
    return osc;
  } catch (e) {
    console.warn("Audio playback error:", e);
  }
};

/**
 * Play WhatsApp-style incoming ringtone (repeating).
 * @param {boolean} outgoing - If true, play a softer outgoing dial tone.
 */
export const playRingtone = (outgoing = false) => {
  stopRingtone();

  const playPattern = () => {
    try {
      const ctx = getAudioCtx();
      const now = ctx.currentTime;

      if (outgoing) {
        // Outgoing: simple repeating beep at 440Hz
        playTone(440, 0.4, now, 0.15, "sine");
        playTone(440, 0.4, now + 0.6, 0.15, "sine");
      } else {
        // Incoming: two-tone WhatsApp-style ring (450Hz â†’ 480Hz)
        playTone(450, 0.25, now, 0.3, "sine");
        playTone(480, 0.25, now + 0.28, 0.3, "sine");
        playTone(450, 0.25, now + 0.56, 0.3, "sine");
        playTone(480, 0.25, now + 0.84, 0.3, "sine");
      }
    } catch (e) {
      console.warn("Ringtone error:", e);
    }
  };

  playPattern();
  ringtoneInterval = setInterval(playPattern, outgoing ? 2000 : 2200);
};

/** Stop all active ringtone sounds. */
export const stopRingtone = () => {
  if (ringtoneInterval) {
    clearInterval(ringtoneInterval);
    ringtoneInterval = null;
  }
  ringtoneNodes.forEach((node) => {
    try { node.stop(); } catch (_) {}
  });
  ringtoneNodes = [];
};

/** Play a short "call connected" chime. */
export const playConnectSound = () => {
  try {
    stopRingtone();
    const ctx = getAudioCtx();
    const now = ctx.currentTime;
    // Rising two-note chime
    playTone(520, 0.12, now, 0.25, "sine");
    playTone(660, 0.18, now + 0.14, 0.25, "sine");
  } catch (e) {
    console.warn("Connect sound error:", e);
  }
};

/** Play a short "call ended" descending tone. */
export const playEndSound = () => {
  try {
    stopRingtone();
    const ctx = getAudioCtx();
    const now = ctx.currentTime;
    // Descending two-note
    playTone(480, 0.15, now, 0.2, "sine");
    playTone(320, 0.2, now + 0.17, 0.2, "sine");
  } catch (e) {
    console.warn("End sound error:", e);
  }
};
