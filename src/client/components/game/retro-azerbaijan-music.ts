/**
 * Expressbank Azerbaijani Melodic Synthesizer Engine
 * High-fidelity, warm acoustic & procedural synthesizer featuring iconic Azerbaijani melodies.
 * Produces authentic Balaban / Ney, Accordion, Horn, and Flute acoustic timbres
 * with expressive pitch vibrato (LFO), resonant lowpass filters, and warm concert-hall ambience.
 */

import { isArcadeMuted } from "./retro-arcade-sound.js";

interface Note {
  pitch: number; // Frequency in Hz (0 for rest)
  dur: number;   // Duration in seconds
}

export interface AzerbaijanTrack {
  id: "sarigelin" | "qaytagi" | "cangi" | "laleler";
  name: string;
  theme: string;
  bpm: number;
  timbre: "balaban" | "accordion" | "horn" | "flute";
  melody: Note[];
  bassline: Note[];
}

// Complete Musical Note Frequencies (Hz)
const N = {
  REST: 0,
  // Octave 2
  C2: 65.41, Cs2: 69.30, D2: 73.42, Eb2: 77.78, E2: 82.41, F2: 87.31, Fs2: 92.50, G2: 98.00, Ab2: 103.83, A2: 110.00, Bb2: 116.54, B2: 123.47,
  // Octave 3
  C3: 130.81, Cs3: 138.59, D3: 146.83, Eb3: 155.56, E3: 164.81, F3: 174.61, Fs3: 185.00, G3: 196.00, Ab3: 207.65, A3: 220.00, Bb3: 233.08, B3: 246.94,
  // Octave 4
  C4: 261.63, Cs4: 277.18, D4: 293.66, Eb4: 311.13, E4: 329.63, F4: 349.23, Fs4: 369.99, G4: 392.00, Ab4: 415.30, A4: 440.00, Bb4: 466.16, B4: 493.88,
  // Octave 5
  C5: 523.25, Cs5: 554.37, D5: 587.33, Eb5: 622.25, E5: 659.25, F5: 698.46, Fs5: 739.99, G5: 783.99, Ab5: 830.61, A5: 880.00, Bb5: 932.33, B5: 987.77,
  // Octave 6
  C6: 1046.50, D6: 1174.66,
};

// ---------------------------------------------------------------------
// 1. SARI GƏLİN (Iconic Azerbaijani Folk Masterpiece in G Bayatı-Şiraz)
// ---------------------------------------------------------------------
// "Saçın ucun hörməzlər, Gülü sulu dərməzlər... Sarı gəlin..."
const SARIGELIN_MELODY: Note[] = [
  // --- Verse 1: "Sa-çın u-cun hör-məz-lər..." ---
  { pitch: N.D4, dur: 0.42 },
  { pitch: N.G4, dur: 0.42 },
  { pitch: N.A4, dur: 0.38 },
  { pitch: N.Bb4, dur: 0.58 },
  { pitch: N.A4, dur: 0.32 },
  { pitch: N.G4, dur: 0.38 },
  { pitch: N.A4, dur: 0.88 }, // Vibrato bloom
  { pitch: N.REST, dur: 0.18 },

  // --- "Gü-lü su-lu dər-məz-lər..." ---
  { pitch: N.D4, dur: 0.42 },
  { pitch: N.G4, dur: 0.42 },
  { pitch: N.A4, dur: 0.38 },
  { pitch: N.Bb4, dur: 0.52 },
  { pitch: N.C5, dur: 0.45 },
  { pitch: N.Bb4, dur: 0.35 },
  { pitch: N.A4, dur: 0.38 },
  { pitch: N.G4, dur: 0.95 }, // Sustained G
  { pitch: N.REST, dur: 0.22 },

  // --- "Sa-rı gə-lin..." (Cadence in Bayatı-Shiraz with F# and Eb) ---
  { pitch: N.D5, dur: 0.52 },
  { pitch: N.Eb5, dur: 0.40 },
  { pitch: N.D5, dur: 0.35 },
  { pitch: N.C5, dur: 0.38 },
  { pitch: N.Bb4, dur: 0.48 },
  { pitch: N.A4, dur: 0.40 },
  { pitch: N.G4, dur: 0.38 },
  { pitch: N.Fs4, dur: 0.48 }, // F#4 leading note gives pure Azerbaijani soul
  { pitch: N.G4, dur: 1.15 },
  { pitch: N.REST, dur: 0.30 },

  // --- Chorus: "Bu sev-da nə sev-da-dır..." ---
  { pitch: N.D5, dur: 0.48 },
  { pitch: N.D5, dur: 0.40 },
  { pitch: N.C5, dur: 0.35 },
  { pitch: N.Bb4, dur: 0.38 },
  { pitch: N.C5, dur: 0.48 },
  { pitch: N.D5, dur: 0.52 },
  { pitch: N.C5, dur: 0.35 },
  { pitch: N.Bb4, dur: 0.38 },
  { pitch: N.A4, dur: 0.88 },
  { pitch: N.REST, dur: 0.18 },

  // --- "Sə-ni mə-nə ver-məz-lər..." ---
  { pitch: N.Bb4, dur: 0.38 },
  { pitch: N.C5, dur: 0.38 },
  { pitch: N.Bb4, dur: 0.35 },
  { pitch: N.A4, dur: 0.35 },
  { pitch: N.G4, dur: 0.42 },
  { pitch: N.A4, dur: 0.45 },
  { pitch: N.Bb4, dur: 0.38 },
  { pitch: N.A4, dur: 0.35 },
  { pitch: N.G4, dur: 0.38 },
  { pitch: N.Fs4, dur: 0.48 },
  { pitch: N.G4, dur: 0.98 },
  { pitch: N.REST, dur: 0.22 },

  // --- "Ney-nim a-man, a-man..." ---
  { pitch: N.D5, dur: 0.58 },
  { pitch: N.C5, dur: 0.38 },
  { pitch: N.Bb4, dur: 0.38 },
  { pitch: N.A4, dur: 0.45 },
  { pitch: N.G4, dur: 0.38 },
  { pitch: N.A4, dur: 0.95 },
  { pitch: N.REST, dur: 0.20 },

  // --- "Sa-rı gə-lin..." (Final Resolution) ---
  { pitch: N.Fs4, dur: 0.48 },
  { pitch: N.G4, dur: 0.42 },
  { pitch: N.A4, dur: 0.48 },
  { pitch: N.G4, dur: 1.35 },
  { pitch: N.REST, dur: 0.45 },
];

// Rich acoustic cello / tar drone and bass accompaniment
const SARIGELIN_BASS: Note[] = [
  { pitch: N.G2, dur: 0.80 }, { pitch: N.D3, dur: 0.80 },
  { pitch: N.G2, dur: 0.80 }, { pitch: N.D3, dur: 0.80 },
  { pitch: N.D2, dur: 0.80 }, { pitch: N.A2, dur: 0.80 },
  { pitch: N.F2, dur: 0.80 }, { pitch: N.C3, dur: 0.80 },
  { pitch: N.Eb2, dur: 0.80 }, { pitch: N.Bb2, dur: 0.80 },
  { pitch: N.D2, dur: 0.80 }, { pitch: N.Fs2, dur: 0.80 },
  { pitch: N.G2, dur: 1.10 }, { pitch: N.REST, dur: 0.25 },
];

// ---------------------------------------------------------------------
// 2. QAYTAĞI (Fast, Joyous 6/8 Azerbaijani Dance Melody)
// ---------------------------------------------------------------------
const QAYTAGI_MELODY: Note[] = [
  { pitch: N.E5, dur: 0.16 }, { pitch: N.E5, dur: 0.16 }, { pitch: N.E5, dur: 0.20 },
  { pitch: N.D5, dur: 0.16 }, { pitch: N.C5, dur: 0.16 }, { pitch: N.B4, dur: 0.16 },
  { pitch: N.C5, dur: 0.20 }, { pitch: N.D5, dur: 0.20 }, { pitch: N.E5, dur: 0.32 },
  { pitch: N.F5, dur: 0.18 }, { pitch: N.E5, dur: 0.16 }, { pitch: N.D5, dur: 0.16 },
  { pitch: N.C5, dur: 0.18 }, { pitch: N.B4, dur: 0.16 }, { pitch: N.A4, dur: 0.34 },
  { pitch: N.REST, dur: 0.10 },

  { pitch: N.B4, dur: 0.16 }, { pitch: N.C5, dur: 0.16 }, { pitch: N.D5, dur: 0.22 },
  { pitch: N.E5, dur: 0.22 }, { pitch: N.D5, dur: 0.16 }, { pitch: N.C5, dur: 0.16 },
  { pitch: N.B4, dur: 0.20 }, { pitch: N.A4, dur: 0.36 }, { pitch: N.G4, dur: 0.16 },
  { pitch: N.A4, dur: 0.44 }, { pitch: N.REST, dur: 0.12 },
];

const QAYTAGI_BASS: Note[] = [
  { pitch: N.A2, dur: 0.22 }, { pitch: N.E3, dur: 0.22 }, { pitch: N.A3, dur: 0.22 },
  { pitch: N.D3, dur: 0.22 }, { pitch: N.A3, dur: 0.22 }, { pitch: N.E3, dur: 0.22 },
  { pitch: N.A2, dur: 0.22 }, { pitch: N.E3, dur: 0.22 }, { pitch: N.A2, dur: 0.34 },
  { pitch: N.C3, dur: 0.22 }, { pitch: N.G3, dur: 0.22 }, { pitch: N.C3, dur: 0.22 },
  { pitch: N.D3, dur: 0.22 }, { pitch: N.A3, dur: 0.22 }, { pitch: N.E3, dur: 0.22 },
  { pitch: N.A2, dur: 0.40 }, { pitch: N.REST, dur: 0.10 },
];

// ---------------------------------------------------------------------
// 3. CƏNGİ / KOROĞLU (Epic Heroic Battle March)
// ---------------------------------------------------------------------
const CANGI_MELODY: Note[] = [
  { pitch: N.D5, dur: 0.22 }, { pitch: N.D5, dur: 0.20 }, { pitch: N.D5, dur: 0.32 },
  { pitch: N.A4, dur: 0.20 }, { pitch: N.D5, dur: 0.24 }, { pitch: N.F5, dur: 0.38 },
  { pitch: N.E5, dur: 0.22 }, { pitch: N.D5, dur: 0.22 }, { pitch: N.C5, dur: 0.28 },
  { pitch: N.D5, dur: 0.45 }, { pitch: N.REST, dur: 0.15 },

  { pitch: N.A5, dur: 0.30 }, { pitch: N.G5, dur: 0.22 }, { pitch: N.F5, dur: 0.22 },
  { pitch: N.E5, dur: 0.26 }, { pitch: N.F5, dur: 0.22 }, { pitch: N.D5, dur: 0.42 },
  { pitch: N.C5, dur: 0.22 }, { pitch: N.Bb4, dur: 0.22 }, { pitch: N.A4, dur: 0.52 },
  { pitch: N.REST, dur: 0.22 },
];

const CANGI_BASS: Note[] = [
  { pitch: N.D2, dur: 0.22 }, { pitch: N.D2, dur: 0.22 }, { pitch: N.A2, dur: 0.22 },
  { pitch: N.D2, dur: 0.22 }, { pitch: N.D2, dur: 0.22 }, { pitch: N.A2, dur: 0.22 },
  { pitch: N.F2, dur: 0.22 }, { pitch: N.C3, dur: 0.22 }, { pitch: N.D2, dur: 0.38 },
  { pitch: N.A2, dur: 0.22 }, { pitch: N.D2, dur: 0.44 }, { pitch: N.REST, dur: 0.10 },
];

// ---------------------------------------------------------------------
// 4. LALƏLƏR (Telman Hacıyev's Joyful Classic)
// ---------------------------------------------------------------------
// "Yazın əvvəlində Gəncə çölündə... Çıxıblar yenə də dizə lalələr..."
const LALELER_MELODY: Note[] = [
  { pitch: N.E5, dur: 0.24 }, { pitch: N.E5, dur: 0.20 }, { pitch: N.D5, dur: 0.18 },
  { pitch: N.C5, dur: 0.22 }, { pitch: N.B4, dur: 0.22 }, { pitch: N.C5, dur: 0.22 },
  { pitch: N.A4, dur: 0.42 }, { pitch: N.REST, dur: 0.12 },

  { pitch: N.A4, dur: 0.20 }, { pitch: N.C5, dur: 0.22 }, { pitch: N.E5, dur: 0.24 },
  { pitch: N.G5, dur: 0.26 }, { pitch: N.F5, dur: 0.22 }, { pitch: N.E5, dur: 0.22 },
  { pitch: N.D5, dur: 0.42 }, { pitch: N.REST, dur: 0.14 },

  { pitch: N.D5, dur: 0.20 }, { pitch: N.F5, dur: 0.22 }, { pitch: N.E5, dur: 0.22 },
  { pitch: N.D5, dur: 0.22 }, { pitch: N.C5, dur: 0.22 }, { pitch: N.B4, dur: 0.22 },
  { pitch: N.A4, dur: 0.52 }, { pitch: N.REST, dur: 0.20 },
];

const LALELER_BASS: Note[] = [
  { pitch: N.A2, dur: 0.28 }, { pitch: N.E3, dur: 0.28 }, { pitch: N.A2, dur: 0.28 },
  { pitch: N.C3, dur: 0.28 }, { pitch: N.G3, dur: 0.28 }, { pitch: N.C3, dur: 0.28 },
  { pitch: N.D3, dur: 0.28 }, { pitch: N.A3, dur: 0.28 }, { pitch: N.E3, dur: 0.28 },
  { pitch: N.A2, dur: 0.48 }, { pitch: N.REST, dur: 0.15 },
];

export const AZERBAIJAN_TRACKS: AzerbaijanTrack[] = [
  {
    id: "sarigelin",
    name: "Sarı Gəlin",
    theme: "Xalq Musiqisi • Balaban & Ney",
    bpm: 76,
    timbre: "balaban",
    melody: SARIGELIN_MELODY,
    bassline: SARIGELIN_BASS,
  },
  {
    id: "qaytagi",
    name: "Qaytağı Rəqsi",
    theme: "Sürətli Xalq Rəqsi • Qarmon",
    bpm: 140,
    timbre: "accordion",
    melody: QAYTAGI_MELODY,
    bassline: QAYTAGI_BASS,
  },
  {
    id: "cangi",
    name: "Cəngi / Koroğlu",
    theme: "Epik Qəhrəmanlıq • Zurna",
    bpm: 130,
    timbre: "horn",
    melody: CANGI_MELODY,
    bassline: CANGI_BASS,
  },
  {
    id: "laleler",
    name: "Lalələr",
    theme: "Klassik Estrada • Tütək",
    bpm: 118,
    timbre: "flute",
    melody: LALELER_MELODY,
    bassline: LALELER_BASS,
  },
];

// -------------------------------------------------------------
// Advanced Acoustic Synthesizer State & Playback Engine
// -------------------------------------------------------------
let audioCtx: AudioContext | null = null;
let currentTrackIndex = 0;
let isPlaying = false;
let isMusicMuted = false;
let currentTimeoutId: number | null = null;
let currentPlaybackGeneration = 0;
let musicMasterGain: GainNode | null = null;
let delayEffectNode: DelayNode | null = null;
let activeOscillators: (OscillatorNode | AudioNode)[] = [];

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    void audioCtx.resume();
  }
  return audioCtx;
}

export function isBgmPlaying(): boolean {
  return isPlaying && !isMusicMuted && !isArcadeMuted();
}

export function getCurrentAzerbaijanTrack(): AzerbaijanTrack {
  return AZERBAIJAN_TRACKS[currentTrackIndex % AZERBAIJAN_TRACKS.length];
}

/**
 * Schedule a realistic, expressive melodic instrument note
 * Supports warm Balaban/Ney with soft breath attack, gentle vibrato, and harmonic body
 */
function scheduleAcousticLeadNote(
  ctx: AudioContext,
  masterGain: GainNode,
  reverbSend: GainNode,
  freq: number,
  startTime: number,
  duration: number,
  timbre: "balaban" | "accordion" | "horn" | "flute"
): void {
  if (freq === 0) return; // Rest note

  try {
    const now = startTime;
    const noteGain = ctx.createGain();

    // 1. Dual Oscillators for warm acoustic harmonic body
    // Osc 1: Pure singing fundamental
    const osc1 = ctx.createOscillator();
    osc1.type = timbre === "accordion" ? "triangle" : "sine";
    osc1.frequency.setValueAtTime(freq, now);

    // Osc 2: Warm second harmonic / subtle acoustic detune
    const osc2 = ctx.createOscillator();
    osc2.type = timbre === "balaban" ? "triangle" : timbre === "accordion" ? "sawtooth" : "sine";
    // Gentle natural chorus (detuned by ~0.15%)
    osc2.frequency.setValueAtTime(freq * 1.002, now);

    // Osc 2 level mixer
    const osc2Gain = ctx.createGain();
    osc2Gain.gain.setValueAtTime(timbre === "accordion" ? 0.28 : 0.35, now);
    osc2.connect(osc2Gain);

    // 2. Expressive Pitch Vibrato LFO (crucial for authentic Azerbaijani Balaban / Ney soul)
    if (duration > 0.28) {
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.setValueAtTime(5.3, now); // Natural vocal/balaban vibrato frequency (5.3 Hz)

      // Vibrato blooms after the initial attack (after 120ms)
      lfoGain.gain.setValueAtTime(0, now);
      lfoGain.gain.setValueAtTime(0, now + 0.12);
      const vibratoDepth = freq * (timbre === "balaban" ? 0.014 : 0.008);
      lfoGain.gain.linearRampToValueAtTime(vibratoDepth, now + Math.min(0.35, duration * 0.7));

      lfo.connect(lfoGain);
      lfoGain.connect(osc1.frequency);
      lfoGain.connect(osc2.frequency);

      lfo.start(now);
      lfo.stop(now + duration + 0.15);
      activeOscillators.push(lfo);
    }

    // 3. Acoustic Wooden Filter (cuts digital harshness, adds rich Balaban resonance)
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    const cutoffFreq =
      timbre === "balaban"
        ? 1400
        : timbre === "flute"
        ? 1800
        : timbre === "accordion"
        ? 2400
        : 1900;
    filter.frequency.setValueAtTime(cutoffFreq, now);
    filter.Q.setValueAtTime(timbre === "balaban" ? 2.2 : 1.2, now);

    // 4. Smooth Acoustic Breath ADSR Envelope (no harsh clicks or buzzer sounds)
    const peakVolume = timbre === "balaban" ? 0.065 : 0.055;
    const attackTime = timbre === "accordion" ? 0.025 : 0.065; // Soft breath swell for balaban
    const releaseTime = 0.12;

    noteGain.gain.setValueAtTime(0.0001, now);
    noteGain.gain.linearRampToValueAtTime(peakVolume, now + attackTime);
    // Sustain
    noteGain.gain.setValueAtTime(peakVolume * 0.85, now + Math.max(attackTime, duration - 0.05));
    // Soft natural release
    noteGain.gain.exponentialRampToValueAtTime(0.0001, now + duration + releaseTime);

    // Connections
    osc1.connect(filter);
    osc2Gain.connect(filter);
    filter.connect(noteGain);

    // Route main signal to Master Gain, and 25% to warm hall ambience delay
    noteGain.connect(masterGain);
    noteGain.connect(reverbSend);

    activeOscillators.push(osc1, osc2);
    const cleanup = () => {
      try {
        osc1.disconnect();
        osc2.disconnect();
        osc2Gain.disconnect();
        filter.disconnect();
        noteGain.disconnect();
      } catch {}
    };
    osc1.onended = cleanup;

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + duration + releaseTime + 0.05);
    osc2.stop(now + duration + releaseTime + 0.05);
  } catch {
    /* safely ignore Web Audio clock edge-cases */
  }
}

/**
 * Schedule a warm acoustic bass & harmonic accompaniment note
 */
function scheduleAcousticBassNote(
  ctx: AudioContext,
  masterGain: GainNode,
  freq: number,
  startTime: number,
  duration: number
): void {
  if (freq === 0) return;

  try {
    const now = startTime;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, now);

    // Deep, warm acoustic body filter
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(380, now);
    filter.Q.setValueAtTime(1.0, now);

    const bassVolume = 0.045;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(bassVolume, now + 0.04);
    gain.gain.setValueAtTime(bassVolume * 0.8, now + Math.max(0.04, duration - 0.06));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration + 0.08);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);

    activeOscillators.push(osc);
    osc.onended = () => {
      try {
        osc.disconnect();
        filter.disconnect();
        gain.disconnect();
      } catch {}
    };

    osc.start(now);
    osc.stop(now + duration + 0.1);
  } catch {
    /* safely ignore */
  }
}

/**
 * Schedule a full loop of the current track with strict generation control
 */
function playTrackLoop(): void {
  if (!isPlaying || isMusicMuted || isArcadeMuted()) return;

  const ctx = getContext();
  if (!ctx) return;

  const thisGeneration = ++currentPlaybackGeneration;

  // Cleanly silence and disconnect previous master gain to guarantee zero sound overlap
  if (musicMasterGain) {
    try {
      musicMasterGain.gain.setValueAtTime(0, ctx.currentTime);
      musicMasterGain.disconnect();
    } catch {}
    musicMasterGain = null;
  }

  // Kill old active oscillators
  for (const node of activeOscillators) {
    try {
      if ("stop" in node && typeof (node as OscillatorNode).stop === "function") {
        (node as OscillatorNode).stop();
      }
      node.disconnect();
    } catch {}
  }
  activeOscillators = [];

  // 1. Create clean Master Output Gain
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.001, ctx.currentTime);
  masterGain.gain.linearRampToValueAtTime(0.48, ctx.currentTime + 0.04);
  masterGain.connect(ctx.destination);
  musicMasterGain = masterGain;

  // 2. Create Concert Hall Ambience Reverb / Delay Line
  const reverbSend = ctx.createGain();
  reverbSend.gain.setValueAtTime(0.26, ctx.currentTime); // 26% wet ambience

  const delay = ctx.createDelay();
  delay.delayTime.setValueAtTime(0.24, ctx.currentTime); // 240ms natural hall reflection

  const delayFilter = ctx.createBiquadFilter();
  delayFilter.type = "lowpass";
  delayFilter.frequency.setValueAtTime(1100, ctx.currentTime); // Warm acoustic echo

  const delayFeedback = ctx.createGain();
  delayFeedback.gain.setValueAtTime(0.25, ctx.currentTime);

  reverbSend.connect(delay);
  delay.connect(delayFilter);
  delayFilter.connect(delayFeedback);
  delayFeedback.connect(delay);
  delayFilter.connect(masterGain);

  const track = getCurrentAzerbaijanTrack();
  const now = ctx.currentTime + 0.05;

  // 3. Schedule the Singing Lead Melody (Balaban / Ney / Flute)
  let melodyTime = now;
  track.melody.forEach((note) => {
    scheduleAcousticLeadNote(
      ctx,
      masterGain,
      reverbSend,
      note.pitch,
      melodyTime,
      note.dur,
      track.timbre
    );
    melodyTime += note.dur;
  });

  // 4. Schedule Warm Acoustic Bass & Chord Drone
  let bassTime = now;
  while (bassTime < melodyTime) {
    track.bassline.forEach((note) => {
      if (bassTime >= melodyTime) return;
      scheduleAcousticBassNote(ctx, masterGain, note.pitch, bassTime, note.dur);
      bassTime += note.dur;
    });
  }

  // Loop automatically after the full piece concludes
  const totalLoopDuration = Math.max(melodyTime - now, 2);
  currentTimeoutId = window.setTimeout(() => {
    if (isPlaying && currentPlaybackGeneration === thisGeneration) {
      playTrackLoop();
    }
  }, totalLoopDuration * 1000);
}

type TrackListener = (track: AzerbaijanTrack, isPlaying: boolean) => void;
const listeners = new Set<TrackListener>();

function notifyListeners(): void {
  const current = getCurrentAzerbaijanTrack();
  const playing = isBgmPlaying();
  listeners.forEach((fn) => {
    try {
      fn(current, playing);
    } catch {
      /* ignore */
    }
  });
}

export function subscribeAzerbaijanMusic(fn: TrackListener): () => void {
  listeners.add(fn);
  fn(getCurrentAzerbaijanTrack(), isBgmPlaying());
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Start playing a specific track with 100% instant cancellation of any previous audio
 */
export function playAzerbaijanTrack(trackId?: "qaytagi" | "sarigelin" | "cangi" | "laleler"): void {
  if (trackId) {
    const idx = AZERBAIJAN_TRACKS.findIndex((t) => t.id === trackId);
    if (idx !== -1) {
      currentTrackIndex = idx;
    }
  }

  stopAzerbaijanMusic();
  isPlaying = true;
  isMusicMuted = false;

  const ctx = getContext();
  if (ctx && ctx.state === "suspended") {
    void ctx.resume();
  }

  playTrackLoop();
  notifyListeners();
}

/**
 * Immediately stop music playback, kill all scheduled oscillators and disconnect master gain
 */
export function stopAzerbaijanMusic(): void {
  isPlaying = false;
  currentPlaybackGeneration++;

  if (currentTimeoutId !== null) {
    clearTimeout(currentTimeoutId);
    currentTimeoutId = null;
  }

  // Instantly fade out master gain in 15ms and disconnect
  if (musicMasterGain && audioCtx) {
    try {
      const now = audioCtx.currentTime;
      musicMasterGain.gain.cancelScheduledValues(now);
      musicMasterGain.gain.setValueAtTime(musicMasterGain.gain.value, now);
      musicMasterGain.gain.linearRampToValueAtTime(0.0001, now + 0.015);
      const oldGain = musicMasterGain;
      setTimeout(() => {
        try {
          oldGain.disconnect();
        } catch {}
      }, 40);
    } catch {}
    musicMasterGain = null;
  }

  // Stop and disconnect all active oscillators
  for (const node of activeOscillators) {
    try {
      if ("stop" in node && typeof (node as OscillatorNode).stop === "function") {
        (node as OscillatorNode).stop();
      }
      node.disconnect();
    } catch {}
  }
  activeOscillators = [];

  notifyListeners();
}

/**
 * Toggle BGM on / off
 */
export function toggleAzerbaijanMusic(): boolean {
  if (isPlaying) {
    stopAzerbaijanMusic();
    return false;
  } else {
    playAzerbaijanTrack();
    return true;
  }
}

/**
 * Switch to next Azerbaijani track and immediately play it cleanly
 */
export function nextAzerbaijanTrack(): AzerbaijanTrack {
  currentTrackIndex = (currentTrackIndex + 1) % AZERBAIJAN_TRACKS.length;
  playAzerbaijanTrack(AZERBAIJAN_TRACKS[currentTrackIndex].id);
  return getCurrentAzerbaijanTrack();
}

/**
 * Direct track selection by ID
 */
export function selectAzerbaijanTrack(trackId: "qaytagi" | "sarigelin" | "cangi" | "laleler"): AzerbaijanTrack {
  playAzerbaijanTrack(trackId);
  return getCurrentAzerbaijanTrack();
}
