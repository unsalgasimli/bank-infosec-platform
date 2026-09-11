/**
 * Expressbank Cyber Shooter: IT Warfare (Krunker-Style 3D FPS)
 * Real-time Multiplayer Backend Service with Lobby Orchestration,
 * Autonomous AI Combatants, Hit Registration, and SSE Delta Streaming.
 */

import type { Response } from "express";
import {
  ShooterRole,
  ShooterPlayer,
  ShooterLobbyState,
  KillfeedEntry,
  PickupItem,
  Vector3D,
  ShotActionPayload,
  AbilityActionPayload,
  ROLE_SPECS,
  WEAPON_SPECS,
  WeaponId,
  ARENA_BOUNDS,
  SPAWN_POINTS,
  JUMP_PADS,
} from "../../shared/types/shooter.js";
import { logger } from "./logger.service.js";

// Re-export for compatibility
export { ARENA_BOUNDS, SPAWN_POINTS, JUMP_PADS };

const INITIAL_PICKUPS: PickupItem[] = [
  { id: "health-nw", type: "health", position: { x: -18, y: 0.8, z: -8 }, isAvailable: true, respawnInSec: 0 },
  { id: "health-se", type: "health", position: { x: 18, y: 0.8, z: 8 }, isAvailable: true, respawnInSec: 0 },
  { id: "ammo-ne", type: "ammo", position: { x: 18, y: 0.8, z: -8 }, isAvailable: true, respawnInSec: 0 },
  { id: "ammo-sw", type: "ammo", position: { x: -18, y: 0.8, z: 8 }, isAvailable: true, respawnInSec: 0 },
  { id: "overclock-center", type: "overclock", position: { x: 0, y: 6.2, z: 0 }, isAvailable: true, respawnInSec: 0 },
];

interface BotDefinition {
  id: string;
  name: string;
  role: ShooterRole;
  targetPlayerId: string | null;
  changeTargetTimer: number;
  fireCooldown: number;
  strafeTimer: number;
  strafeDirection: number;
}

export class CyberShooterService {
  private static lobbyState: ShooterLobbyState = {
    lobbyId: "cyber-arena-alpha",
    mapName: "Expressbank Central Datacenter",
    players: {},
    killfeed: [],
    pickups: JSON.parse(JSON.stringify(INITIAL_PICKUPS)),
    matchDurationSec: 600, // 10-minute rotation
    serverTime: Date.now(),
  };

  private static bots: Map<string, BotDefinition> = new Map();
  private static subscribers: Set<Response> = new Set();
  private static tickInterval: NodeJS.Timeout | null = null;
  private static isInitialized = false;
  private static lastShotAt = new Map<string, number>();
  private static abilityReadyAt = new Map<string, number>();
  private static syncTickCounter = 0;

  /**
   * Start the lobby simulation tick (30Hz)
   */
  public static init(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;

    // Seed initial AI Bot combatants
    this.ensureBotPopulation();

    this.tickInterval = setInterval(() => {
      this.serverTick(1 / 30);
    }, 1000 / 30);

    logger.info("CyberShooterService initialized at 30Hz tick");
  }

  /**
   * Stop the lobby simulation tick (for shutdown / testing)
   */
  public static stop(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    this.isInitialized = false;
    this.lastShotAt.clear();
    this.abilityReadyAt.clear();
  }

  private static ensureBotPopulation(): void {
    const BOT_ROSTER: { name: string; role: ShooterRole }[] = [
      { name: "SOC-Ghost (Infosec)", role: "infosec" },
      { name: "Helpdesk-Speedy (Support)", role: "helpdesk" },
      { name: "DevOps-Tank (IT Admin)", role: "it_admin" },
      { name: "Phish-Slayer (Infosec)", role: "infosec" },
    ];

    for (const b of BOT_ROSTER) {
      const botId = `bot-${b.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
      if (!this.lobbyState.players[botId]) {
        const roleSpec = ROLE_SPECS[b.role];
        const spawn = SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];
        this.lobbyState.players[botId] = {
          id: botId,
          name: b.name,
          isAi: true,
          role: b.role,
          activeWeapon: roleSpec.primaryWeapon,
          position: { ...spawn },
          velocity: { x: 0, y: 0, z: 0 },
          yaw: Math.random() * Math.PI * 2,
          pitch: 0,
          health: roleSpec.maxHealth,
          maxHealth: roleSpec.maxHealth,
          shield: roleSpec.maxShield,
          maxShield: roleSpec.maxShield,
          ammo: WEAPON_SPECS[roleSpec.primaryWeapon].magSize,
          maxAmmo: WEAPON_SPECS[roleSpec.primaryWeapon].magSize,
          isReloading: false,
          isSliding: false,
          isJumping: false,
          isShieldActive: false,
          kills: 0,
          deaths: 0,
          streak: 0,
          score: 0,
          lastActive: Date.now(),
        };

        this.bots.set(botId, {
          id: botId,
          name: b.name,
          role: b.role,
          targetPlayerId: null,
          changeTargetTimer: Math.random() * 3,
          fireCooldown: 1.0 + Math.random(),
          strafeTimer: 0,
          strafeDirection: 1,
        });
      }
    }
  }

  /**
   * Main 30Hz Server Tick
   */
  private static serverTick(dt: number): void {
    const now = Date.now();
    this.lobbyState.serverTime = now;

    // 1. Update Pickups
    for (const pickup of this.lobbyState.pickups) {
      if (!pickup.isAvailable) {
        pickup.respawnInSec = Math.max(0, pickup.respawnInSec - dt);
        if (pickup.respawnInSec <= 0) {
          pickup.isAvailable = true;
          this.broadcastEvent("pickup_spawn", { id: pickup.id, type: pickup.type });
        }
      }
    }

    // 2. Handle Player Respawns & Clean Inactive Humans
    for (const [pId, p] of Object.entries(this.lobbyState.players)) {
      if (p.health <= 0) {
        if (typeof p.respawnTimeRemaining === "number") {
          p.respawnTimeRemaining = Math.max(0, p.respawnTimeRemaining - dt);
          if (p.respawnTimeRemaining <= 0) {
            this.respawnPlayer(pId);
          }
        }
      }

      // Disconnect timeout for inactive human players (35 seconds without sync)
      if (!p.isAi && now - p.lastActive > 35000) {
        delete this.lobbyState.players[pId];
        this.broadcastEvent("player_left", { playerId: pId });
      }
    }

    // 3. Update AI Bots Behavior & Physics
    this.updateBots(dt);

    // 4. Periodic Broadcast (every 100ms / 10Hz, every 3 ticks at 30Hz)
    this.syncTickCounter = (this.syncTickCounter + 1) % 3000;
    if (this.syncTickCounter % 3 === 0) {
      this.broadcastLobbySync();
    }
  }

  /**
   * Autonomous AI Bot Navigation, Combat Targeting, and Firing
   */
  private static updateBots(dt: number): void {
    const playerList = Object.values(this.lobbyState.players).filter((p) => p.health > 0);

    for (const [botId, botDef] of this.bots.entries()) {
      const bot = this.lobbyState.players[botId];
      if (!bot || bot.health <= 0) continue;

      // Select / change target
      botDef.changeTargetTimer -= dt;
      if (botDef.changeTargetTimer <= 0 || !botDef.targetPlayerId || !this.lobbyState.players[botDef.targetPlayerId]?.health) {
        const potentialTargets = playerList.filter((p) => p.id !== botId);
        if (potentialTargets.length > 0) {
          const closest = potentialTargets.reduce((prev, curr) => {
            const dPrev = Math.hypot(prev.position.x - bot.position.x, prev.position.z - bot.position.z);
            const dCurr = Math.hypot(curr.position.x - bot.position.x, curr.position.z - bot.position.z);
            return dCurr < dPrev ? curr : prev;
          });
          botDef.targetPlayerId = closest.id;
        } else {
          botDef.targetPlayerId = null;
        }
        botDef.changeTargetTimer = 2.5 + Math.random() * 2;
      }

      const target = botDef.targetPlayerId ? this.lobbyState.players[botDef.targetPlayerId] : null;

      // Movement & Aiming towards target or patrol waypoint
      if (target && target.health > 0) {
        const dx = target.position.x - bot.position.x;
        const dz = target.position.z - bot.position.z;
        const dy = target.position.y - bot.position.y;
        const dist = Math.hypot(dx, dz);

        // Aim yaw & pitch
        bot.yaw = Math.atan2(dx, dz);
        bot.pitch = -Math.atan2(dy, Math.max(0.1, dist));

        // Movement logic
        const speed = 7.5 * ROLE_SPECS[bot.role].speedMultiplier;
        botDef.strafeTimer -= dt;
        if (botDef.strafeTimer <= 0) {
          botDef.strafeTimer = 1.2 + Math.random();
          botDef.strafeDirection = Math.random() > 0.5 ? 1 : -1;
        }

        // Keep optimal distance based on role
        let desiredDist = 15;
        if (bot.role === "it_admin") desiredDist = 7; // Shotgun rushes close
        if (bot.role === "infosec") desiredDist = 20; // Railgun snipes from afar

        let moveForward = 0;
        if (dist > desiredDist + 3) moveForward = 1;
        else if (dist < desiredDist - 2) moveForward = -0.6;

        const moveSide = botDef.strafeDirection * 0.7;

        // Apply bot velocity
        const forwardX = Math.sin(bot.yaw);
        const forwardZ = Math.cos(bot.yaw);
        const rightX = Math.cos(bot.yaw);
        const rightZ = -Math.sin(bot.yaw);

        bot.velocity.x = (forwardX * moveForward + rightX * moveSide) * speed;
        bot.velocity.z = (forwardZ * moveForward + rightZ * moveSide) * speed;

        // Jump pad usage if nearby
        for (const pad of JUMP_PADS) {
          if (Math.hypot(pad.x - bot.position.x, pad.z - bot.position.z) < 2.0 && bot.position.y <= 0.5) {
            bot.velocity.y = pad.boostY;
            bot.isJumping = true;
          }
        }

        // Firing logic
        botDef.fireCooldown -= dt;
        const weapon = WEAPON_SPECS[bot.activeWeapon];
        if (botDef.fireCooldown <= 0 && dist < weapon.range) {
          const shotInterval = 60 / weapon.fireRateRpm;
          botDef.fireCooldown = shotInterval * (1.1 + Math.random() * 0.4);

          // Simulated bot aim accuracy (80% chance on target)
          const isHit = Math.random() < 0.82;
          const isHeadshot = isHit && Math.random() < 0.28;

          this.fireShot(botId, {
            weaponId: bot.activeWeapon,
            origin: { x: bot.position.x, y: bot.position.y + 1.5, z: bot.position.z },
            direction: { x: Math.sin(bot.yaw), y: -Math.tan(bot.pitch), z: Math.cos(bot.yaw) },
            hitPlayerId: isHit ? target.id : undefined,
            hitPart: isHeadshot ? "head" : "body",
            hitDistance: dist,
          });
        }
      } else {
        // Idle wandering
        bot.velocity.x *= 0.9;
        bot.velocity.z *= 0.9;
      }

      // Apply gravity and update position
      bot.velocity.y -= 25 * dt; // gravity
      bot.position.x += bot.velocity.x * dt;
      bot.position.y = Math.max(0, bot.position.y + bot.velocity.y * dt);
      bot.position.z += bot.velocity.z * dt;

      if (bot.position.y <= 0) {
        bot.velocity.y = 0;
        bot.isJumping = false;
      }

      // Clamp inside arena walls
      bot.position.x = Math.max(ARENA_BOUNDS.minX, Math.min(ARENA_BOUNDS.maxX, bot.position.x));
      bot.position.z = Math.max(ARENA_BOUNDS.minZ, Math.min(ARENA_BOUNDS.maxZ, bot.position.z));
    }
  }

  /**
   * Register or update a human player
   */
  public static joinPlayer(
    userId: string,
    name: string,
    role: ShooterRole
  ): { player: ShooterPlayer; lobbyState: ShooterLobbyState } {
    this.init();

    const roleSpec = ROLE_SPECS[role] || ROLE_SPECS.infosec;
    const spawn = SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];

    const player: ShooterPlayer = {
      id: userId,
      userId,
      name,
      isAi: false,
      role,
      activeWeapon: roleSpec.primaryWeapon,
      position: { ...spawn },
      velocity: { x: 0, y: 0, z: 0 },
      yaw: 0,
      pitch: 0,
      health: roleSpec.maxHealth,
      maxHealth: roleSpec.maxHealth,
      shield: roleSpec.maxShield,
      maxShield: roleSpec.maxShield,
      ammo: WEAPON_SPECS[roleSpec.primaryWeapon].magSize,
      maxAmmo: WEAPON_SPECS[roleSpec.primaryWeapon].magSize,
      isReloading: false,
      isSliding: false,
      isJumping: false,
      isShieldActive: false,
      kills: 0,
      deaths: 0,
      streak: 0,
      score: 0,
      lastActive: Date.now(),
    };

    this.lobbyState.players[userId] = player;
    this.broadcastEvent("player_joined", { player });

    return { player, lobbyState: this.lobbyState };
  }

  /**
   * Sync human player position, rotation, and input packet
   */
  public static syncPlayer(
    userId: string,
    packet: {
      position: Vector3D;
      velocity: Vector3D;
      yaw: number;
      pitch: number;
      isSliding: boolean;
      isJumping: boolean;
      activeWeapon: WeaponId;
      ammo: number;
      isReloading: boolean;
    }
  ): ShooterLobbyState {
    const player = this.lobbyState.players[userId];
    if (player && player.health > 0) {
      const now = Date.now();
      if (!this.isFiniteVector(packet.position) || !this.isFiniteVector(packet.velocity) ||
          !Number.isFinite(packet.yaw) || !Number.isFinite(packet.pitch)) {
        return this.lobbyState;
      }
      const elapsedSec = Math.max(0.016, Math.min(1, (now - player.lastActive) / 1000));
      const maxSpeed = 12 * ROLE_SPECS[player.role].speedMultiplier;
      const dx = packet.position.x - player.position.x;
      const dy = packet.position.y - player.position.y;
      const dz = packet.position.z - player.position.z;
      const distance = Math.hypot(dx, dy, dz);
      const maxDistance = maxSpeed * elapsedSec + 1.25;
      const scale = distance > maxDistance ? maxDistance / distance : 1;
      player.position = {
        x: Math.max(ARENA_BOUNDS.minX, Math.min(ARENA_BOUNDS.maxX, player.position.x + dx * scale)),
        y: Math.max(ARENA_BOUNDS.floorY, Math.min(ARENA_BOUNDS.catwalkY + 3, player.position.y + dy * scale)),
        z: Math.max(ARENA_BOUNDS.minZ, Math.min(ARENA_BOUNDS.maxZ, player.position.z + dz * scale)),
      };
      player.velocity = {
        x: Math.max(-maxSpeed, Math.min(maxSpeed, packet.velocity.x)),
        y: Math.max(-20, Math.min(20, packet.velocity.y)),
        z: Math.max(-maxSpeed, Math.min(maxSpeed, packet.velocity.z)),
      };
      player.yaw = packet.yaw;
      player.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, packet.pitch));
      player.isSliding = Boolean(packet.isSliding);
      player.isJumping = Boolean(packet.isJumping);
      // Weapon and ammunition are server-authoritative. A sync packet cannot
      // equip another role's weapon or replenish a magazine.
      player.lastActive = now;

      // Check pickup collection
      for (const pickup of this.lobbyState.pickups) {
        if (pickup.isAvailable) {
          const d = Math.hypot(
            pickup.position.x - player.position.x,
            pickup.position.y - player.position.y,
            pickup.position.z - player.position.z
          );
          if (d < 2.0) {
            pickup.isAvailable = false;
            pickup.respawnInSec = 15;

            if (pickup.type === "health") {
              player.health = Math.min(player.maxHealth, player.health + 35);
            } else if (pickup.type === "ammo") {
              player.ammo = player.maxAmmo;
            } else if (pickup.type === "overclock") {
              player.shield = player.maxShield;
            }

            this.broadcastEvent("pickup_collected", {
              playerId: userId,
              pickupId: pickup.id,
              type: pickup.type,
            });
          }
        }
      }
    }
    return this.lobbyState;
  }

  /**
   * Process a weapon shot and register damage
   */
  public static fireShot(
    shooterId: string,
    action: ShotActionPayload
  ): { hit: boolean; damageDealt: number; killed: boolean } {
    const shooter = this.lobbyState.players[shooterId];
    if (!shooter || shooter.health <= 0) return { hit: false, damageDealt: 0, killed: false };

    shooter.lastActive = Date.now();
    const weapon = WEAPON_SPECS[action.weaponId];
    if (!weapon || action.weaponId !== shooter.activeWeapon || shooter.ammo <= 0) {
      return { hit: false, damageDealt: 0, killed: false };
    }
    if (!this.isFiniteVector(action.origin) || !this.isFiniteVector(action.direction)) {
      return { hit: false, damageDealt: 0, killed: false };
    }
    const now = Date.now();
    const minimumShotInterval = 60_000 / weapon.fireRateRpm;
    if (now - (this.lastShotAt.get(shooterId) ?? 0) < minimumShotInterval) {
      return { hit: false, damageDealt: 0, killed: false };
    }
    const muzzleDistance = Math.hypot(
      action.origin.x - shooter.position.x,
      action.origin.y - (shooter.position.y + 1.5),
      action.origin.z - shooter.position.z,
    );
    if (muzzleDistance > 2.5) return { hit: false, damageDealt: 0, killed: false };
    this.lastShotAt.set(shooterId, now);
    shooter.ammo -= 1;

    // Broadcast shot beam / tracer effect to all other players
    this.broadcastEvent("shot_fired", {
      shooterId,
      shooterName: shooter.name,
      weaponId: action.weaponId,
      origin: action.origin,
      direction: action.direction,
      hitPlayerId: action.hitPlayerId,
    });

    if (!action.hitPlayerId) return { hit: false, damageDealt: 0, killed: false };

    const victim = this.lobbyState.players[action.hitPlayerId];
    if (!victim || victim.health <= 0 || victim.id === shooterId) {
      return { hit: false, damageDealt: 0, killed: false };
    }
    const targetDistance = Math.hypot(
      victim.position.x - shooter.position.x,
      victim.position.y - shooter.position.y,
      victim.position.z - shooter.position.z,
    );
    const claimedHitDistance = action.hitDistance;
    if (typeof claimedHitDistance !== "number" || !Number.isFinite(claimedHitDistance) || claimedHitDistance < 0 || targetDistance > weapon.range + 1 || Math.abs(claimedHitDistance - targetDistance) > 4) {
      return { hit: false, damageDealt: 0, killed: false };
    }

    // Calculate damage
    const isHeadshot = action.hitPart === "head";
    let baseDamage = isHeadshot ? weapon.damageHead : weapon.damageBody;

    // Shotgun damage per pellet
    if (weapon.pelletsPerShot > 1) {
      const pelletsHit = Math.floor(Math.random() * 4) + 4; // 4 to 8 pellets hit
      baseDamage = pelletsHit * (isHeadshot ? weapon.damageHead : weapon.damageBody);
    }

    // Shield reduction if active
    if (victim.isShieldActive) {
      baseDamage = Math.round(baseDamage * 0.2); // 80% damage reduction
    }

    // Apply to victim shield first, then health
    let damageRemaining = baseDamage;
    if (victim.shield > 0) {
      const shieldDmg = Math.min(victim.shield, damageRemaining);
      victim.shield -= shieldDmg;
      damageRemaining -= shieldDmg;
    }
    victim.health = Math.max(0, victim.health - damageRemaining);

    // Broadcast damage indicator event
    this.broadcastEvent("damage_dealt", {
      shooterId,
      victimId: victim.id,
      damage: baseDamage,
      isHeadshot,
      remainingHealth: victim.health,
      remainingShield: victim.shield,
    });

    let killed = false;
    if (victim.health <= 0) {
      killed = true;
      victim.deaths += 1;
      victim.streak = 0;
      victim.respawnTimeRemaining = 3.0; // 3 second respawn countdown

      shooter.kills += 1;
      shooter.streak += 1;
      const scoreAdd = isHeadshot ? 150 : 100;
      shooter.score += scoreAdd;

      const killEntry: KillfeedEntry = {
        id: `kill-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        killerId: shooter.id,
        killerName: shooter.name,
        killerRole: shooter.role,
        victimId: victim.id,
        victimName: victim.name,
        victimRole: victim.role,
        weaponId: action.weaponId,
        isHeadshot,
        timestamp: Date.now(),
      };

      this.lobbyState.killfeed.unshift(killEntry);
      if (this.lobbyState.killfeed.length > 12) {
        this.lobbyState.killfeed.pop();
      }

      this.broadcastEvent("player_killed", {
        killEntry,
        shooterScore: shooter.score,
        shooterStreak: shooter.streak,
      });
    }

    return { hit: true, damageDealt: baseDamage, killed };
  }

  /**
   * Trigger role special ability (Dash, Ground Slam, EMP, Root Bastion)
   */
  public static useAbility(
    userId: string,
    action: AbilityActionPayload
  ): { success: boolean; effect: string } {
    const player = this.lobbyState.players[userId];
    if (!player || player.health <= 0) return { success: false, effect: "" };

    const now = Date.now();
    if (now < (this.abilityReadyAt.get(userId) ?? 0)) return { success: false, effect: "Ability cooling down" };
    const position = player.position;
    this.abilityReadyAt.set(userId, now + (action.abilityType === "ult" ? 20_000 : 6_000));

    const role = player.role;

    if (role === "infosec" && action.abilityType === "ult") {
      // DDoS EMP Blast: Disables enemy shields in 15m radius
      for (const other of Object.values(this.lobbyState.players)) {
        if (other.id !== userId && other.health > 0) {
          const d = Math.hypot(other.position.x - position.x, other.position.z - position.z);
          if (d <= 15) {
            other.shield = 0;
          }
        }
      }
      this.broadcastEvent("ability_used", {
        userId,
        role,
        ability: "ddos_emp",
        position,
      });
      return { success: true, effect: "DDoS EMP Blast Deployed!" };
    }

    if (role === "helpdesk" && action.abilityType === "ult") {
      // Hotfix Reboot Surge: Instant +60 HP heal, restores ammo
      player.health = Math.min(player.maxHealth, player.health + 60);
      player.ammo = player.maxAmmo;
      this.broadcastEvent("ability_used", {
        userId,
        role,
        ability: "hotfix_reboot",
        position,
      });
      return { success: true, effect: "P1 Hotfix Reboot Applied!" };
    }

    if (role === "it_admin") {
      if (action.abilityType === "slam") {
        // Ground Slam: 35 AoE damage to nearby opponents
        for (const other of Object.values(this.lobbyState.players)) {
          if (other.id !== userId && other.health > 0) {
          const d = Math.hypot(other.position.x - position.x, other.position.z - position.z);
            if (d <= 6.5) {
              other.health = Math.max(0, other.health - 35);
            }
          }
        }
        this.broadcastEvent("ability_used", {
          userId,
          role,
          ability: "ground_slam",
          position,
        });
        return { success: true, effect: "Ground Slam Shockwave!" };
      } else if (action.abilityType === "ult") {
        // Root Bastion Shield
        player.isShieldActive = true;
        setTimeout(() => {
          if (this.lobbyState.players[userId]) {
            this.lobbyState.players[userId].isShieldActive = false;
          }
        }, 4000);
        this.broadcastEvent("ability_used", {
          userId,
          role,
          ability: "root_bastion",
          position,
        });
        return { success: true, effect: "Root Access Bastion Activated!" };
      }
    }

    // Default movement dash
    this.broadcastEvent("ability_used", {
      userId,
      role,
      ability: "dash",
      position,
    });
    return { success: true, effect: "Dash!" };
  }

  /**
   * Respawn a player at a random spawn point
   */
  public static respawnPlayer(userId: string): ShooterPlayer | null {
    const player = this.lobbyState.players[userId];
    if (!player) return null;

    const roleSpec = ROLE_SPECS[player.role];
    const spawn = SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];

    player.position = { ...spawn };
    player.velocity = { x: 0, y: 0, z: 0 };
    player.health = roleSpec.maxHealth;
    player.shield = roleSpec.maxShield;
    player.ammo = WEAPON_SPECS[player.activeWeapon].magSize;
    player.isReloading = false;
    player.respawnTimeRemaining = 0;
    player.isShieldActive = false;

    this.broadcastEvent("player_respawned", { player });
    return player;
  }

  /**
   * Leave player cleanly
   */
  public static leavePlayer(userId: string): void {
    if (this.lobbyState.players[userId]) {
      delete this.lobbyState.players[userId];
      this.lastShotAt.delete(userId);
      this.abilityReadyAt.delete(userId);
      this.broadcastEvent("player_left", { playerId: userId });
    }
  }

  /**
   * Get current lobby state
   */
  public static getLobbyState(): ShooterLobbyState {
    this.init();
    return this.lobbyState;
  }

  /**
   * Register SSE Subscriber for real-time multiplayer updates
   */
  public static registerSubscriber(res: Response): void {
    this.init();
    this.subscribers.add(res);

    // Initial state push
    res.write(`event: init\ndata: ${JSON.stringify(this.lobbyState)}\n\n`);

    res.on("close", () => {
      this.subscribers.delete(res);
    });
  }

  /**
   * Broadcast an event to all SSE subscribers
   */
  private static broadcastEvent(event: string, data: any): void {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of this.subscribers) {
      try {
        res.write(payload);
      } catch (err) {
        this.subscribers.delete(res);
      }
    }
  }

  /**
   * Periodic full lobby state sync broadcast
   */
  private static broadcastLobbySync(): void {
    if (this.subscribers.size === 0) return;
    const payload = `event: sync\ndata: ${JSON.stringify({
      players: this.lobbyState.players,
      pickups: this.lobbyState.pickups,
      serverTime: this.lobbyState.serverTime,
    })}\n\n`;

    for (const res of this.subscribers) {
      try {
        res.write(payload);
      } catch {
        this.subscribers.delete(res);
      }
    }
  }

  private static isFiniteVector(vector: Vector3D | undefined): vector is Vector3D {
    if (!vector) return false;
    return Number.isFinite(vector.x) && Number.isFinite(vector.y) && Number.isFinite(vector.z);
  }
}
