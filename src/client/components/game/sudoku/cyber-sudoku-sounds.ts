/**
 * Expressbank Cyber Sudoku - 8-Bit Web Audio Synthesizer
 * Zero-dependency procedural audio engine for cryptographic matrix solving.
 */

import { isArcadeMuted } from "../retro-arcade-sound.js";

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
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

// Pentatonic musical scale for digits 1..9 (Hz)
const DIGIT_NOTES: Record<number, number> = {
  1: 261.63, // C4
  2: 293.66, // D4
  3: 329.63, // E4
  4: 392.00, // G4
  5: 440.00, // A4
  6: 523.25, // C5
  7: 587.33, // D5
  8: 659.25, // E5
  9: 783.99, // G5
};

/**
 * Play subtle cell selection blip
 */
export function playSelectCellSound(): void {
  if (isArcadeMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(520, now);
  osc.frequency.exponentialRampToValueAtTime(380, now + 0.04);

  gain.gain.setValueAtTime(0.04, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.05);
}

/**
 * Play musical tone for digit placement (1..9 produces an ascending scale)
 */
export function playPlaceNumberSound(num: number): void {
  if (isArcadeMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const freq = DIGIT_NOTES[num] || 440;
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "triangle";
  osc.frequency.setValueAtTime(freq, now);

  gain.gain.setValueAtTime(0.09, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.24);
}

/**
 * Play pencil note toggle tick
 */
export function playToggleNoteSound(): void {
  if (isArcadeMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(800, now);
  osc.frequency.exponentialRampToValueAtTime(1100, now + 0.03);

  gain.gain.setValueAtTime(0.04, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.04);
}

/**
 * Play cell erase whoosh
 */
export function playEraseSound(): void {
  if (isArcadeMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(440, now);
  osc.frequency.exponentialRampToValueAtTime(160, now + 0.07);

  gain.gain.setValueAtTime(0.06, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.08);
}

/**
 * Play error buzz on mistake
 */
export function playErrorSound(): void {
  if (isArcadeMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(130, now);
  osc.frequency.setValueAtTime(110, now + 0.08);

  gain.gain.setValueAtTime(0.08, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.24);
}

/**
 * Play celebratory harmonic chime when a row/col/box is completed
 */
export function playBlockCompleteSound(): void {
  if (isArcadeMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C - E - G - C arpeggio

  notes.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const startT = now + idx * 0.055;

    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, startT);

    gain.gain.setValueAtTime(0.07, startT);
    gain.gain.exponentialRampToValueAtTime(0.001, startT + 0.28);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startT);
    osc.stop(startT + 0.3);
  });
}

/**
 * Play grand victory fanfare when the entire matrix is decrypted!
 */
export function playVictorySound(): void {
  if (isArcadeMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const fanfare = [
    { freq: 440.00, dur: 0.10 }, // A4
    { freq: 554.37, dur: 0.10 }, // C#5
    { freq: 659.25, dur: 0.12 }, // E5
    { freq: 880.00, dur: 0.25 }, // A5
    { freq: 783.99, dur: 0.14 }, // G5
    { freq: 880.00, dur: 0.50 }, // A5 grand hold
  ];

  let current = now;
  fanfare.forEach((n) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(n.freq, current);

    gain.gain.setValueAtTime(0.12, current);
    gain.gain.exponentialRampToValueAtTime(0.001, current + n.dur);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(current);
    osc.stop(current + n.dur + 0.05);

    current += n.dur;
  });
}
