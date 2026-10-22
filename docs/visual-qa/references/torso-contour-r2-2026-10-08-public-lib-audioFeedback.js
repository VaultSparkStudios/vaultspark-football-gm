// Synth audio + haptics layer (S70). Zero assets: every sound is synthesized
// through one lazily-created AudioContext, so the layer costs no bandwidth and
// stays static-host-safe. The context is only created inside playSound, which
// is only ever called from user-gesture handlers — satisfying autoplay policy.

const SOUND_KEY = "fa:sound-enabled";
const HAPTICS_KEY = "fa:haptics-enabled";

let audioContext = null;

function readFlag(key, fallback = true) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : raw === "1";
  } catch {
    return fallback;
  }
}

function writeFlag(key, value) {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // Storage unavailable — the toggle simply doesn't persist.
  }
}

export function isSoundEnabled() {
  return readFlag(SOUND_KEY, true);
}

export function setSoundEnabled(enabled) {
  writeFlag(SOUND_KEY, enabled === true);
}

export function isHapticsEnabled() {
  return readFlag(HAPTICS_KEY, true);
}

export function setHapticsEnabled(enabled) {
  writeFlag(HAPTICS_KEY, enabled === true);
}

function ensureContext() {
  if (audioContext) {
    if (audioContext.state === "suspended") {
      // observability-allow-silent: resume can only fail before a user gesture,
      // where staying silent IS the correct audible outcome.
      audioContext.resume().catch(() => {});
    }
    return audioContext;
  }
  try {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    audioContext = new Ctor();
    return audioContext;
  } catch {
    return null;
  }
}

// Each note: [frequencyHz, startSec, durationSec, oscillatorType, peakGain]
const PALETTE = {
  "advance-tick": [
    [523.25, 0, 0.05, "square", 0.025],
    [659.25, 0.06, 0.07, "square", 0.03]
  ],
  "win-chime": [
    [523.25, 0, 0.11, "sine", 0.06],
    [659.25, 0.09, 0.11, "sine", 0.06],
    [783.99, 0.18, 0.13, "sine", 0.06],
    [1046.5, 0.28, 0.24, "sine", 0.07]
  ],
  "loss-thud": [
    [174.61, 0, 0.16, "sawtooth", 0.045],
    [116.54, 0.12, 0.26, "sawtooth", 0.05]
  ],
  "sign-thunk": [
    [220, 0, 0.09, "triangle", 0.08],
    [330, 0.08, 0.06, "triangle", 0.045]
  ],
  "draft-brass": [
    [392, 0, 0.14, "sawtooth", 0.04],
    [523.25, 0.1, 0.14, "sawtooth", 0.045],
    [659.25, 0.2, 0.28, "sawtooth", 0.05]
  ],
  "tier-fanfare": [
    [523.25, 0, 0.12, "square", 0.04],
    [659.25, 0.1, 0.12, "square", 0.04],
    [783.99, 0.2, 0.12, "square", 0.045],
    [1046.5, 0.3, 0.3, "square", 0.05],
    [1318.5, 0.42, 0.34, "sine", 0.05]
  ],
  "td-flourish": [
    [659.25, 0, 0.07, "sine", 0.05],
    [783.99, 0.06, 0.07, "sine", 0.05],
    [987.77, 0.12, 0.14, "sine", 0.06]
  ],
  "trophy-unlock": [
    [1046.5, 0, 0.09, "sine", 0.05],
    [1567.98, 0.08, 0.2, "sine", 0.05],
    [2093, 0.16, 0.26, "sine", 0.04]
  ]
};

export function playSound(name) {
  if (!isSoundEnabled()) return false;
  const notes = PALETTE[name];
  if (!notes) return false;
  const context = ensureContext();
  if (!context) return false;
  try {
    const startAt = context.currentTime + 0.01;
    for (const [frequency, offset, duration, type, peak] of notes) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      const noteStart = startAt + offset;
      gain.gain.setValueAtTime(0.0001, noteStart);
      gain.gain.exponentialRampToValueAtTime(peak, noteStart + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(noteStart);
      oscillator.stop(noteStart + duration + 0.05);
    }
    return true;
  } catch {
    return false;
  }
}

export function vibrate(pattern) {
  if (!isHapticsEnabled()) return false;
  try {
    return navigator.vibrate ? navigator.vibrate(pattern) : false;
  } catch {
    return false;
  }
}

export const HAPTIC_PATTERNS = {
  tick: 12,
  win: [30, 40, 60],
  loss: [80],
  unlock: [20, 30, 20, 30, 50]
};
