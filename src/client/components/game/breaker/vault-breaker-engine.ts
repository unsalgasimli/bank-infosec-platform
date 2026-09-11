/**
 * Expressbank Vault Breaker - Game Engine
 * Arkanoid / Breakout physics, collision resolution, powerup system, and stage layouts.
 */

import {
  playBrickHitSound,
  playPaddleHitSound,
  playLaserShotSound,
  playPowerupSound,
  playEmpBlastSound,
  playStageClearSound,
  playLifeLostSound,
} from "./vault-breaker-sounds.js";

export const ARENA_WIDTH = 800;
export const ARENA_HEIGHT = 600;

export type PowerUpType =
  | "multiball"
  | "laser"
  | "wide"
  | "fireball"
  | "coin"
  | "life";

export type BrickType =
  | "mint"    // 1-hit Firewall (#00f576)
  | "cyan"    // 1-hit Data Buffer (#00e5ff)
  | "silver"  // 2-hit Armored Vault (#a0aec0)
  | "gold"    // 3-hit Gold Bullion (#ffb800)
  | "emp"     // Explosive EMP (#ff3344)
  | "bonus";  // Guaranteed Powerup (#ec4899)

export interface Brick {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: BrickType;
  maxHp: number;
  hp: number;
  points: number;
  color: string;
  glowColor: string;
}

export interface Ball {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  speed: number;
  isStuck: boolean;
  stuckOffsetX: number;
}

export interface Paddle {
  x: number;
  y: number;
  width: number;
  height: number;
  baseWidth: number;
  speed: number;
  laserTimer: number;
  wideTimer: number;
  fireballTimer: number;
  lastLaserShotTime: number;
}

export interface PowerUp {
  id: string;
  x: number;
  y: number;
  vy: number;
  type: PowerUpType;
  label: string;
  color: string;
}

export interface LaserShot {
  id: string;
  x: number;
  y: number;
  vy: number;
  width: number;
  height: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export interface StageMeta {
  title: string;
  subtitle: string;
  rows: number;
  cols: number;
  layout: (BrickType | null)[][];
}

export interface VaultBreakerState {
  score: number;
  highScore: number;
  lives: number;
  currentStage: number;
  totalStages: number;
  status: "ready" | "playing" | "stage_clear" | "game_over" | "victory";
  combo: number;
  paddle: Paddle;
  balls: Ball[];
  bricks: Brick[];
  powerups: PowerUp[];
  lasers: LaserShot[];
  particles: Particle[];
}

// -------------------------------------------------------------
// 5 Expressbank-Themed Stage Layouts
// -------------------------------------------------------------
export const STAGES: StageMeta[] = [
  // Stage 1: Expressbank Monogram (E Logo Layout)
  {
    title: "1. EXPRESSBANK MONOGRAM",
    subtitle: "Expressbank 'E' emblemi və təhlükəsizlik perimetri",
    rows: 7,
    cols: 10,
    layout: [
      [null, "gold", "gold", "gold", "gold", "gold", "gold", "gold", "gold", null],
      ["gold", "gold", null, null, null, null, null, "silver", "gold", "bonus"],
      ["gold", "cyan", null, null, null, null, null, null, "emp", "gold"],
      ["gold", "gold", "gold", "gold", "gold", "bonus", "gold", null, null, null],
      ["gold", "cyan", null, null, null, null, null, null, null, null],
      ["gold", "gold", null, null, null, null, null, null, null, null],
      [null, "gold", "gold", "gold", "gold", "gold", "gold", "gold", "gold", null],
    ],
  },
  // Stage 2: Core Banking Ledger (Expressbank Emblem Layout)
  {
    title: "2. CORE BANKING LEDGER",
    subtitle: "Expressbank emblem anbarı",
    rows: 6,
    cols: 10,
    layout: [
      [null, "silver", "gold", "gold", "emp", "emp", "gold", "gold", "silver", null],
      ["mint", "gold", "mint", null, "gold", "gold", null, "mint", "gold", "mint"],
      ["cyan", "gold", "gold", "gold", "bonus", "bonus", "gold", "gold", "gold", "cyan"],
      ["silver", "silver", "silver", "emp", "gold", "gold", "emp", "silver", "silver", "silver"],
      [null, "cyan", "cyan", "cyan", "gold", "gold", "cyan", "cyan", "cyan", null],
      [null, null, "mint", "mint", "silver", "silver", "mint", "mint", null, null],
    ],
  },
  // Stage 3: Biometric Vault Gateway
  {
    title: "3. BIOMETRIC VAULT GATEWAY",
    subtitle: "Zirehli qapılar və təhlükəsizlik şlüzləri",
    rows: 6,
    cols: 10,
    layout: [
      ["gold", "emp", "silver", "silver", "gold", "gold", "silver", "silver", "emp", "gold"],
      ["silver", "gold", "cyan", "cyan", "bonus", "bonus", "cyan", "cyan", "gold", "silver"],
      ["silver", "silver", "emp", "mint", "mint", "mint", "mint", "emp", "silver", "silver"],
      ["gold", "cyan", "silver", "gold", "silver", "silver", "gold", "silver", "cyan", "gold"],
      ["mint", "mint", "silver", "silver", "emp", "emp", "silver", "silver", "mint", "mint"],
      [null, "gold", "gold", null, "bonus", "bonus", null, "gold", "gold", null],
    ],
  },
  // Stage 4: Quantum Crypto Fortress
  {
    title: "4. QUANTUM CRYPTO FORTRESS",
    subtitle: "Şifrələnmiş alqoritm qalası",
    rows: 7,
    cols: 10,
    layout: [
      [null, null, "silver", "emp", "gold", "gold", "emp", "silver", null, null],
      [null, "silver", "gold", "bonus", "silver", "silver", "bonus", "gold", "silver", null],
      ["silver", "gold", "emp", "silver", "gold", "gold", "silver", "emp", "gold", "silver"],
      ["gold", "bonus", "silver", "cyan", "cyan", "cyan", "cyan", "silver", "bonus", "gold"],
      ["silver", "gold", "emp", "silver", "gold", "gold", "silver", "emp", "gold", "silver"],
      [null, "silver", "gold", "bonus", "silver", "silver", "bonus", "gold", "silver", null],
      [null, null, "silver", "emp", "gold", "gold", "emp", "silver", null, null],
    ],
  },
  // Stage 5: Vault Apex: Infinite Reserve
  {
    title: "5. VAULT APEX: INFINITE RESERVE",
    subtitle: "Expressbank qızıl anbarının zirvəsi",
    rows: 7,
    cols: 10,
    layout: [
      ["gold", "gold", "gold", "emp", "gold", "gold", "emp", "gold", "gold", "gold"],
      ["gold", "bonus", "silver", "gold", "bonus", "bonus", "gold", "silver", "bonus", "gold"],
      ["silver", "gold", "emp", "silver", "gold", "gold", "silver", "emp", "gold", "silver"],
      ["gold", "gold", "gold", "gold", "emp", "emp", "gold", "gold", "gold", "gold"],
      ["silver", "bonus", "silver", "gold", "gold", "gold", "gold", "silver", "bonus", "silver"],
      ["cyan", "silver", "gold", "emp", "gold", "gold", "emp", "gold", "silver", "cyan"],
      ["mint", "cyan", "silver", "gold", "bonus", "bonus", "gold", "silver", "cyan", "mint"],
    ],
  },
];

// Helper to construct bricks for a stage
export function buildBricksForStage(stageIndex: number): Brick[] {
  const stage = STAGES[stageIndex % STAGES.length];
  const bricks: Brick[] = [];

  const brickMargin = 8;
  const topOffset = 70;
  const sideMargin = 32;
  const availableWidth = ARENA_WIDTH - sideMargin * 2;
  const brickWidth = (availableWidth - (stage.cols - 1) * brickMargin) / stage.cols;
  const brickHeight = 22;

  stage.layout.forEach((row, rIdx) => {
    row.forEach((type, cIdx) => {
      if (!type) return;

      let maxHp = 1;
      let points = 100;
      let color = "#00f576";
      let glowColor = "rgba(0, 245, 118, 0.4)";

      switch (type) {
        case "mint":
          maxHp = 1;
          points = 100;
          color = "#00f576";
          glowColor = "rgba(0, 245, 118, 0.4)";
          break;
        case "cyan":
          maxHp = 1;
          points = 150;
          color = "#00e5ff";
          glowColor = "rgba(0, 229, 255, 0.4)";
          break;
        case "silver":
          maxHp = 2;
          points = 300;
          color = "#cbd5e1";
          glowColor = "rgba(203, 213, 225, 0.4)";
          break;
        case "gold":
          maxHp = 3;
          points = 500;
          color = "#ffb800";
          glowColor = "rgba(255, 184, 0, 0.5)";
          break;
        case "emp":
          maxHp = 1;
          points = 250;
          color = "#ff3344";
          glowColor = "rgba(255, 51, 68, 0.6)";
          break;
        case "bonus":
          maxHp = 1;
          points = 200;
          color = "#ec4899";
          glowColor = "rgba(236, 72, 153, 0.5)";
          break;
      }

      const x = sideMargin + cIdx * (brickWidth + brickMargin);
      const y = topOffset + rIdx * (brickHeight + brickMargin);

      bricks.push({
        id: `brick_${rIdx}_${cIdx}`,
        x,
        y,
        width: brickWidth,
        height: brickHeight,
        type,
        maxHp,
        hp: maxHp,
        points,
        color,
        glowColor,
      });
    });
  });

  return bricks;
}

export function createInitialVaultBreakerState(savedHighScore = 0): VaultBreakerState {
  const paddleWidth = 110;
  const paddle: Paddle = {
    x: ARENA_WIDTH / 2 - paddleWidth / 2,
    y: ARENA_HEIGHT - 38,
    width: paddleWidth,
    height: 14,
    baseWidth: paddleWidth,
    speed: 550,
    laserTimer: 0,
    wideTimer: 0,
    fireballTimer: 0,
    lastLaserShotTime: 0,
  };

  const ballRadius = 7;
  const ball: Ball = {
    id: "ball_1",
    x: paddle.x + paddle.width / 2,
    y: paddle.y - ballRadius - 2,
    vx: 0,
    vy: 0,
    radius: ballRadius,
    speed: 460,
    isStuck: true,
    stuckOffsetX: paddle.width / 2,
  };

  return {
    score: 0,
    highScore: savedHighScore,
    lives: 3,
    currentStage: 0,
    totalStages: STAGES.length,
    status: "ready",
    combo: 0,
    paddle,
    balls: [ball],
    bricks: buildBricksForStage(0),
    powerups: [],
    lasers: [],
    particles: [],
  };
}

// -------------------------------------------------------------
// Launch Ball
// -------------------------------------------------------------
export function launchBalls(state: VaultBreakerState): void {
  state.balls.forEach((ball) => {
    if (ball.isStuck) {
      ball.isStuck = false;
      const angle = -Math.PI / 2 + (Math.random() * 0.4 - 0.2); // Upwards with slight variance
      ball.vx = Math.cos(angle) * ball.speed;
      ball.vy = Math.sin(angle) * ball.speed;
    }
  });
  if (state.status === "ready") {
    state.status = "playing";
  }
}

// -------------------------------------------------------------
// Fire Paddle Lasers
// -------------------------------------------------------------
export function firePaddleLasers(state: VaultBreakerState): void {
  if (state.paddle.laserTimer <= 0) return;
  const now = Date.now();
  if (now - state.paddle.lastLaserShotTime < 180) return; // Cooldown
  state.paddle.lastLaserShotTime = now;

  playLaserShotSound();

  const pad = state.paddle;
  // Twin lasers from left and right of paddle
  state.lasers.push({
    id: `laser_${now}_l`,
    x: pad.x + 10,
    y: pad.y - 12,
    vy: -750,
    width: 3,
    height: 14,
  });
  state.lasers.push({
    id: `laser_${now}_r`,
    x: pad.x + pad.width - 13,
    y: pad.y - 12,
    vy: -750,
    width: 3,
    height: 14,
  });
}

// Helper to spawn particles on brick shatter
function spawnParticles(
  state: VaultBreakerState,
  x: number,
  y: number,
  color: string,
  count = 12
): void {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 60 + Math.random() * 180;
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      maxLife: 0.4 + Math.random() * 0.3,
      color,
      size: 2 + Math.random() * 3,
    });
  }
}

// Helper to spawn powerup
function maybeSpawnPowerup(state: VaultBreakerState, brick: Brick): void {
  const roll = Math.random();
  const isGuaranteed = brick.type === "bonus";
  if (!isGuaranteed && roll > 0.22) return; // 22% chance from normal bricks

  const powerTypes: { type: PowerUpType; label: string; color: string }[] = [
    { type: "multiball", label: "MULTI-BALL", color: "#00f576" },
    { type: "laser", label: "LASER PADDLE", color: "#00e5ff" },
    { type: "wide", label: "WIDE PADDLE", color: "#ffb800" },
    { type: "fireball", label: "FIREBALL", color: "#ff3344" },
    { type: "coin", label: "+500 PTS", color: "#ffd700" },
    { type: "life", label: "+1 LIFE", color: "#ec4899" },
  ];

  const chosen = powerTypes[Math.floor(Math.random() * powerTypes.length)];
  state.powerups.push({
    id: `pow_${Date.now()}_${Math.random()}`,
    x: brick.x + brick.width / 2,
    y: brick.y + brick.height / 2,
    vy: 160,
    type: chosen.type,
    label: chosen.label,
    color: chosen.color,
  });
}

// -------------------------------------------------------------
// Main Game Update Loop
// -------------------------------------------------------------
export function updateVaultBreaker(
  state: VaultBreakerState,
  dt: number,
  input: {
    targetPaddleX: number | null;
    moveLeft: boolean;
    moveRight: boolean;
    shootLasers: boolean;
  }
): void {
  if (state.status !== "playing" && state.status !== "ready") {
    return;
  }

  // 1. Update Paddle Timers
  if (state.paddle.laserTimer > 0) {
    state.paddle.laserTimer -= dt;
  }
  if (state.paddle.wideTimer > 0) {
    state.paddle.wideTimer -= dt;
    state.paddle.width = state.paddle.baseWidth * 1.45;
  } else {
    state.paddle.width = state.paddle.baseWidth;
  }
  if (state.paddle.fireballTimer > 0) {
    state.paddle.fireballTimer -= dt;
  }

  // 2. Move Paddle
  if (input.targetPaddleX !== null) {
    state.paddle.x = Math.max(
      8,
      Math.min(ARENA_WIDTH - state.paddle.width - 8, input.targetPaddleX - state.paddle.width / 2)
    );
  } else {
    if (input.moveLeft) {
      state.paddle.x = Math.max(8, state.paddle.x - state.paddle.speed * dt);
    }
    if (input.moveRight) {
      state.paddle.x = Math.min(
        ARENA_WIDTH - state.paddle.width - 8,
        state.paddle.x + state.paddle.speed * dt
      );
    }
  }

  // Handle Laser auto-fire if shooting active
  if (input.shootLasers && state.paddle.laserTimer > 0) {
    firePaddleLasers(state);
  }

  // 3. Update Lasers
  for (let i = state.lasers.length - 1; i >= 0; i--) {
    const l = state.lasers[i];
    l.y += l.vy * dt;
    if (l.y < -20) {
      state.lasers.splice(i, 1);
      continue;
    }

    // Check collision with bricks
    for (let bIdx = state.bricks.length - 1; bIdx >= 0; bIdx--) {
      const b = state.bricks[bIdx];
      if (
        l.x >= b.x &&
        l.x <= b.x + b.width &&
        l.y >= b.y &&
        l.y <= b.y + b.height
      ) {
        state.lasers.splice(i, 1);
        b.hp--;
        state.combo++;
        playBrickHitSound(state.combo);
        spawnParticles(state, l.x, l.y, b.color, 8);

        if (b.hp <= 0) {
          state.score += b.points * Math.min(4, Math.floor(state.combo / 4) + 1);
          maybeSpawnPowerup(state, b);
          state.bricks.splice(bIdx, 1);
        }
        break;
      }
    }
  }

  // 4. Update Powerups
  for (let i = state.powerups.length - 1; i >= 0; i--) {
    const p = state.powerups[i];
    p.y += p.vy * dt;

    // Check collection by paddle
    const pad = state.paddle;
    if (
      p.y + 10 >= pad.y &&
      p.y - 10 <= pad.y + pad.height &&
      p.x >= pad.x - 10 &&
      p.x <= pad.x + pad.width + 10
    ) {
      playPowerupSound();
      state.powerups.splice(i, 1);
      spawnParticles(state, p.x, p.y, p.color, 16);

      // Apply powerup effect
      switch (p.type) {
        case "multiball": {
          const newBalls: Ball[] = [];
          state.balls.forEach((b) => {
            const ballSpeed = b.speed;
            newBalls.push({
              id: `ball_${Date.now()}_a`,
              x: b.x,
              y: b.y,
              vx: b.vx * 0.86 - b.vy * 0.5,
              vy: b.vy * 0.86 + b.vx * 0.5,
              radius: b.radius,
              speed: ballSpeed,
              isStuck: false,
              stuckOffsetX: 0,
            });
            newBalls.push({
              id: `ball_${Date.now()}_b`,
              x: b.x,
              y: b.y,
              vx: b.vx * 0.86 + b.vy * 0.5,
              vy: b.vy * 0.86 - b.vx * 0.5,
              radius: b.radius,
              speed: ballSpeed,
              isStuck: false,
              stuckOffsetX: 0,
            });
          });
          state.balls.push(...newBalls);
          break;
        }
        case "laser":
          state.paddle.laserTimer = 14;
          break;
        case "wide":
          state.paddle.wideTimer = 16;
          break;
        case "fireball":
          state.paddle.fireballTimer = 10;
          break;
        case "coin":
          state.score += 500;
          break;
        case "life":
          state.lives = Math.min(5, state.lives + 1);
          break;
      }
      continue;
    }

    if (p.y > ARENA_HEIGHT + 30) {
      state.powerups.splice(i, 1);
    }
  }

  // 5. Update Balls
  for (let i = state.balls.length - 1; i >= 0; i--) {
    const ball = state.balls[i];

    if (ball.isStuck) {
      ball.x = state.paddle.x + ball.stuckOffsetX;
      ball.y = state.paddle.y - ball.radius - 2;
      continue;
    }

    // Move ball
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    // Wall collisions (Left, Right, Top)
    if (ball.x - ball.radius <= 8) {
      ball.x = 8 + ball.radius;
      ball.vx = Math.abs(ball.vx);
      playPaddleHitSound();
    } else if (ball.x + ball.radius >= ARENA_WIDTH - 8) {
      ball.x = ARENA_WIDTH - 8 - ball.radius;
      ball.vx = -Math.abs(ball.vx);
      playPaddleHitSound();
    }
    if (ball.y - ball.radius <= 8) {
      ball.y = 8 + ball.radius;
      ball.vy = Math.abs(ball.vy);
      playPaddleHitSound();
    }

    // Bottom loss
    if (ball.y - ball.radius > ARENA_HEIGHT + 20) {
      state.balls.splice(i, 1);
      continue;
    }

    // Paddle collision
    const pad = state.paddle;
    if (
      ball.vy > 0 &&
      ball.y + ball.radius >= pad.y &&
      ball.y - ball.radius <= pad.y + pad.height &&
      ball.x >= pad.x - 4 &&
      ball.x <= pad.x + pad.width + 4
    ) {
      state.combo = 0; // Reset combo streak on paddle bounce
      playPaddleHitSound();

      // Classic Arkanoid angled bounce:
      // Center hit -> straight up. Left/Right edge hit -> up to 65 deg deflection
      const hitOffset = (ball.x - (pad.x + pad.width / 2)) / (pad.width / 2);
      const clampedOffset = Math.max(-0.95, Math.min(0.95, hitOffset));
      const bounceAngle = (clampedOffset * Math.PI) / 2.75 - Math.PI / 2;

      ball.vx = Math.cos(bounceAngle) * ball.speed;
      ball.vy = Math.sin(bounceAngle) * ball.speed;
      ball.y = pad.y - ball.radius - 1;

      spawnParticles(state, ball.x, pad.y, "#00f576", 6);
    }

    // Brick collisions
    const isFireball = state.paddle.fireballTimer > 0;

    for (let bIdx = state.bricks.length - 1; bIdx >= 0; bIdx--) {
      const b = state.bricks[bIdx];

      // AABB check
      const closestX = Math.max(b.x, Math.min(ball.x, b.x + b.width));
      const closestY = Math.max(b.y, Math.min(ball.y, b.y + b.height));
      const distX = ball.x - closestX;
      const distY = ball.y - closestY;
      const distanceSquared = distX * distX + distY * distY;

      if (distanceSquared <= ball.radius * ball.radius) {
        state.combo++;
        playBrickHitSound(state.combo);

        // Brick damage
        b.hp--;
        spawnParticles(state, closestX, closestY, b.color, 12);

        // If not fireball, resolve bounce vector
        if (!isFireball) {
          const overlapX = ball.radius - Math.abs(distX);
          const overlapY = ball.radius - Math.abs(distY);

          if (overlapX < overlapY) {
            ball.vx = -ball.vx;
          } else {
            ball.vy = -ball.vy;
          }
        }

        // Brick destroyed
        if (b.hp <= 0) {
          const comboMult = Math.min(4, Math.floor(state.combo / 4) + 1);
          state.score += b.points * comboMult;

          // EMP explosive detonation: destroys adjacent bricks!
          if (b.type === "emp") {
            playEmpBlastSound();
            spawnParticles(state, b.x + b.width / 2, b.y + b.height / 2, "#ff3344", 28);
            triggerEmpExplosion(state, b);
          } else {
            maybeSpawnPowerup(state, b);
          }

          state.bricks.splice(bIdx, 1);
        }

        if (!isFireball) {
          break; // Stop checking further bricks for this frame
        }
      }
    }
  }

  // 6. Check Ball Depletion / Life Loss
  if (state.balls.length === 0) {
    state.lives--;
    playLifeLostSound();
    state.combo = 0;

    if (state.lives <= 0) {
      state.status = "game_over";
      if (state.score > state.highScore) {
        state.highScore = state.score;
      }
    } else {
      // Spawn new stuck ball on paddle
      state.paddle.laserTimer = 0;
      state.paddle.fireballTimer = 0;
      state.balls.push({
        id: `ball_${Date.now()}`,
        x: state.paddle.x + state.paddle.width / 2,
        y: state.paddle.y - 7 - 2,
        vx: 0,
        vy: 0,
        radius: 7,
        speed: 460,
        isStuck: true,
        stuckOffsetX: state.paddle.width / 2,
      });
      state.status = "ready";
    }
  }

  // 7. Check Stage Clear
  if (state.bricks.length === 0) {
    playStageClearSound();
    if (state.currentStage + 1 < state.totalStages) {
      state.status = "stage_clear";
      state.currentStage++;
    } else {
      state.status = "victory";
    }
    if (state.score > state.highScore) {
      state.highScore = state.score;
    }
  }

  // 8. Update Particles
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const pt = state.particles[i];
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.life -= dt / pt.maxLife;
    if (pt.life <= 0) {
      state.particles.splice(i, 1);
    }
  }
}

// EMP explosion triggers adjacent brick destructions
function triggerEmpExplosion(state: VaultBreakerState, centerBrick: Brick): void {
  const blastRadius = 90;
  const cx = centerBrick.x + centerBrick.width / 2;
  const cy = centerBrick.y + centerBrick.height / 2;

  for (let i = state.bricks.length - 1; i >= 0; i--) {
    const b = state.bricks[i];
    const bx = b.x + b.width / 2;
    const by = b.y + b.height / 2;
    const dist = Math.hypot(bx - cx, by - cy);

    if (dist <= blastRadius) {
      b.hp = 0;
      state.score += b.points;
      spawnParticles(state, bx, by, b.color, 8);
      state.bricks.splice(i, 1);
    }
  }
}

// Advance to next stage
export function advanceToNextStage(state: VaultBreakerState): void {
  state.bricks = buildBricksForStage(state.currentStage);
  state.balls = [
    {
      id: `ball_${Date.now()}`,
      x: state.paddle.x + state.paddle.width / 2,
      y: state.paddle.y - 7 - 2,
      vx: 0,
      vy: 0,
      radius: 7,
      speed: 460 + state.currentStage * 20,
      isStuck: true,
      stuckOffsetX: state.paddle.width / 2,
    },
  ];
  state.lasers = [];
  state.powerups = [];
  state.combo = 0;
  state.status = "ready";
}
