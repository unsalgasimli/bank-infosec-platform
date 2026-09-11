/**
 * Expressbank Cyber Sea Battle - 8-Bit Procedural Web Audio Synthesizer
 * Zero-dependency procedural naval combat sound effects.
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

/**
 * Sonar radar ping blip
 */
export function playSonarBlipSound(): void {
  if (isArcadeMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(1480, now);
  osc.frequency.exponentialRampToValueAtTime(880, now + 0.18);

  gain.gain.setValueAtTime(0.06, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.22);
}

/**
 * Cannon / Torpedo launch whoosh
 */
export function playCannonShotSound(): void {
  if (isArcadeMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(220, now);
  osc.frequency.exponentialRampToValueAtTime(60, now + 0.15);

  gain.gain.setValueAtTime(0.12, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.18);
}

/**
 * Water splash on MISS
 */
export function playWaterSplashSound(): void {
  if (isArcadeMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(320, now);
  osc.frequency.exponentialRampToValueAtTime(120, now + 0.2);

  gain.gain.setValueAtTime(0.07, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.24);
}

/**
 * Heavy metallic explosion on HIT
 */
export function playExplosionSound(): void {
  if (isArcadeMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // 1. Low rumble
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(160, now);
  osc.frequency.linearRampToValueAtTime(40, now + 0.3);

  gain.gain.setValueAtTime(0.18, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.38);

  // 2. High noise crunch
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();

  osc2.type = "square";
  osc2.frequency.setValueAtTime(340, now);
  osc2.frequency.setValueAtTime(180, now + 0.08);

  gain2.gain.setValueAtTime(0.12, now);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

  osc2.connect(gain2);
  gain2.connect(ctx.destination);

  osc2.start(now);
  osc2.stop(now + 0.22);
}

/**
 * Ship Sunk Naval Emergency Siren
 */
export function playShipSunkAlarmSound(): void {
  if (isArcadeMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const tones = [520, 680, 520, 680];

  tones.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const startT = now + idx * 0.12;

    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, startT);

    gain.gain.setValueAtTime(0.1, startT);
    gain.gain.exponentialRampToValueAtTime(0.001, startT + 0.18);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startT);
    osc.stop(startT + 0.2);
  });
}

/**
 * Victory fanfare
 */
export function playVictoryFanfare(): void {
  if (isArcadeMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const notes = [
    { f: 440, d: 0.12 },
    { f: 554.37, d: 0.12 },
    { f: 659.25, d: 0.14 },
    { f: 880, d: 0.45 },
  ];

  let cur = now;
  notes.forEach((n) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(n.f, cur);

    gain.gain.setValueAtTime(0.12, cur);
    gain.gain.exponentialRampToValueAtTime(0.001, cur + n.d);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(cur);
    osc.stop(cur + n.d + 0.05);
    cur += n.d;
  });
}

/**
 * Defeat descending horn
 */
export function playDefeatSound(): void {
  if (isArcadeMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const notes = [440, 392, 349.23, 293.66];

  notes.forEach((f, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const startT = now + idx * 0.18;

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(f, startT);

    gain.gain.setValueAtTime(0.08, startT);
    gain.gain.exponentialRampToValueAtTime(0.001, startT + 0.24);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startT);
    osc.stop(startT + 0.26);
  });
}
