export type BirdFlightStatus = "ready" | "flying" | "crashed";

export interface BirdGate {
  id: number;
  x: number;
  gapY: number;
  gapHeight: number;
  scored: boolean;
}

export interface BirdFlight {
  y: number;
  velocity: number;
  pitch: number;
  wingPhase: number;
  gates: BirdGate[];
  score: number;
  best: number;
  status: BirdFlightStatus;
  lastScoreTime?: number;
}

export const BIRD_X = -2.2;
export const BIRD_RADIUS = 0.22;
export const GATE_WIDTH = 0.65;
export const WATER_SURFACE_Y = -2.55;
export const CEILING_Y = 2.95;
export const DEFAULT_GAP_HEIGHT = 2.55;
export const GATE_SPACING = 4.25;

/** Pseudo-random generator for consistent, natural gate heights */
function seededGapY(seed: number): number {
  const hash = (Math.imul(seed + 31, 1103515245) >>> 0) % 1000;
  // Gap center between -1.05 and +1.15
  return -1.05 + (hash / 1000) * 2.2;
}

export function createBirdFlight(best = 0): BirdFlight {
  return {
    y: 0.15,
    velocity: 0,
    pitch: 0,
    wingPhase: 0,
    gates: [
      { id: 1, x: 4.8, gapY: seededGapY(1), gapHeight: DEFAULT_GAP_HEIGHT, scored: false },
      { id: 2, x: 4.8 + GATE_SPACING, gapY: seededGapY(2), gapHeight: DEFAULT_GAP_HEIGHT, scored: false },
      { id: 3, x: 4.8 + GATE_SPACING * 2, gapY: seededGapY(3), gapHeight: DEFAULT_GAP_HEIGHT, scored: false },
    ],
    score: 0,
    best,
    status: "ready",
  };
}

export function flapBird(flight: BirdFlight): BirdFlight {
  if (flight.status === "crashed") {
    // Instant replay on click/space after crash: immediately restart and flap upwards
    const fresh = createBirdFlight(flight.best);
    return {
      ...fresh,
      velocity: 4.8,
      status: "flying",
      wingPhase: 1.0,
    };
  }

  return {
    ...flight,
    velocity: 4.8,
    status: "flying",
    wingPhase: 1.0, // Triggers wing beat animation
  };
}

export function advanceBird(flight: BirdFlight, seconds: number): BirdFlight {
  const dt = Math.min(seconds, 0.05); // Guard against giant lag spikes

  if (flight.status === "ready") {
    // Gentle idle breathing bob in place
    const idleY = 0.15 + Math.sin(performance.now() * 0.0035) * 0.12;
    return {
      ...flight,
      y: idleY,
      velocity: 0,
      pitch: 0,
      wingPhase: (flight.wingPhase + dt * 2.2) % 1,
    };
  }

  if (flight.status === "crashed") {
    // Gentle tumble or settle to the water surface
    const fallVelocity = Math.max(-6, flight.velocity - 18 * dt);
    const y = Math.max(WATER_SURFACE_Y, flight.y + fallVelocity * dt);
    return {
      ...flight,
      y,
      velocity: fallVelocity,
      pitch: Math.min(Math.PI * 0.45, flight.pitch + dt * 3.5),
    };
  }

  // Active flying physics
  const gravity = 12.2;
  const terminalVelocity = -7.8;
  const velocity = Math.max(terminalVelocity, flight.velocity - gravity * dt);
  let y = flight.y + velocity * dt;

  // Ceiling soft bounce
  if (y > CEILING_Y) {
    y = CEILING_Y;
  }

  // Dynamic pitch towards velocity
  const targetPitch = Math.max(-0.65, Math.min(0.48, velocity * 0.09));
  const pitch = flight.pitch + (targetPitch - flight.pitch) * Math.min(1, dt * 14);

  // Wing flap animation decay
  const wingPhase = Math.max(0, flight.wingPhase - dt * 2.8);

  // Obstacle movement and speed scaling
  const baseSpeed = 2.45;
  const speed = baseSpeed + Math.min(flight.score * 0.04, 1.2);
  let score = flight.score;
  let scoredThisFrame = false;

  let maxGateX = Math.max(...flight.gates.map((g) => g.x));

  const gates = flight.gates.map((gate) => {
    const x = gate.x - speed * dt;

    // Accurate score check: gate crosses behind bird's horizontal center
    let scored = gate.scored;
    if (!scored && x <= BIRD_X) {
      scored = true;
      score += 1;
      scoredThisFrame = true;
    }

    // Recycling off-screen gates back to the far right
    if (x < -6.5) {
      maxGateX = Math.max(maxGateX, BIRD_X + GATE_SPACING * 2);
      const newX = maxGateX + GATE_SPACING;
      maxGateX = newX;
      return {
        id: gate.id + 3,
        x: newX,
        gapY: seededGapY(gate.id + score + 7),
        gapHeight: Math.max(2.35, DEFAULT_GAP_HEIGHT - Math.min(score * 0.02, 0.4)),
        scored: false,
      };
    }

    return { ...gate, x, scored };
  });

  // Physical collision check
  const birdTop = y + BIRD_RADIUS * 0.85;
  const birdBottom = y - BIRD_RADIUS * 0.85;

  const hitsObstacle = gates.some((gate) => {
    const horizontalOverlap = Math.abs(gate.x - BIRD_X) < (GATE_WIDTH * 0.5 + BIRD_RADIUS * 0.7);
    if (!horizontalOverlap) return false;

    const archPassageTop = gate.gapY + gate.gapHeight * 0.5;
    const archPassageBottom = gate.gapY - gate.gapHeight * 0.5;

    // Collision occurs if bird hits top arch structure or bottom pillar
    return birdTop > archPassageTop || birdBottom < archPassageBottom;
  });

  const hitsWater = birdBottom <= WATER_SURFACE_Y;
  const crashed = hitsObstacle || hitsWater;

  return {
    y,
    velocity: crashed ? Math.min(0, velocity * 0.5) : velocity,
    pitch: crashed ? 0.35 : pitch,
    wingPhase,
    gates,
    score,
    best: Math.max(flight.best, score),
    status: crashed ? "crashed" : "flying",
    lastScoreTime: scoredThisFrame ? performance.now() : flight.lastScoreTime,
  };
}
