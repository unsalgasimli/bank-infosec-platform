/**
 * Expressbank Cyber Sea Battle (Battleship) & Challenge Service
 * Enterprise real-time multiplayer orchestrator with secure turn-based state synchronization,
 * anti-cheat fog-of-war sanitization, and autonomous SOC AI bot fallback.
 */

import { BankUser } from "../../shared/types/auth.js";
import type { Response } from "express";

export interface ShipCoordinate {
  row: number; // 0..9
  col: number; // 0..9
}

export interface Ship {
  id: string;
  name: string;
  size: number;
  coordinates: ShipCoordinate[];
  isSunk?: boolean;
}

export interface ShotResult {
  row: number;
  col: number;
  result: "MISS" | "HIT" | "SUNK";
  sunkShip?: { id: string; name: string; size: number; coordinates: ShipCoordinate[] };
  byUserId: string;
  timestamp: string;
}

export interface BattlePlayer {
  userId: string;
  username: string;
  displayName: string;
  isAi?: boolean;
  isReady: boolean;
  ships: Ship[];
  shotsTaken: ShotResult[];
  shotsReceived: ShotResult[];
}

export type MatchStatus =
  | "PENDING"
  | "DECLINED"
  | "PREPARING" // Placing ships
  | "BATTLE_ACTIVE" // Blind firing phase
  | "FINISHED"
  | "ABANDONED";

export interface MatchRoom {
  id: string;
  player1: BattlePlayer;
  player2: BattlePlayer;
  status: MatchStatus;
  currentTurnUserId: string;
  winnerUserId: string | null;
  declineReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SanitizedMatchState {
  id: string;
  status: MatchStatus;
  currentTurnUserId: string;
  isMyTurn: boolean;
  winnerUserId: string | null;
  me: {
    userId: string;
    username: string;
    displayName: string;
    isReady: boolean;
    ships: Ship[]; // My fleet (visible to me)
    shotsTaken: ShotResult[]; // My shots on enemy radar
    shotsReceived: ShotResult[]; // Enemy shots on my fleet
    remainingShipsCount: number;
  };
  opponent: {
    userId: string;
    username: string;
    displayName: string;
    isAi?: boolean;
    isReady: boolean;
    remainingShipsCount: number;
    // Note: Opponent's ships are strictly hidden to prevent cheating!
  };
  createdAt: string;
  updatedAt: string;
}

// Global In-Memory Match Store & SSE Subscribers
const matches = new Map<string, MatchRoom>();
const sseSubscribers = new Map<string, Set<Response>>();
const PENDING_MATCH_TTL_MS = 10 * 60 * 1000;
const TERMINAL_MATCH_TTL_MS = 60 * 60 * 1000;

// Standard Expressbank Cyber Fleet Definition
export const STANDARD_FLEET_CONFIG = [
  { name: "Fladşip (Flagship)", size: 4, count: 1 },
  { name: "Kruizer (Cruiser)", size: 3, count: 2 },
  { name: "Eskadra (Destroyer)", size: 2, count: 3 },
  { name: "Kəşfiyyat (Patrol Drone)", size: 1, count: 4 },
];

export class BattleChallengeService {
  private static pruneExpiredMatches(now = Date.now()): void {
    for (const [matchId, match] of matches) {
      const age = now - new Date(match.updatedAt).getTime();
      const pendingExpired = match.status === "PENDING" && age >= PENDING_MATCH_TTL_MS;
      const terminalExpired = ["DECLINED", "FINISHED", "ABANDONED"].includes(match.status) && age >= TERMINAL_MATCH_TTL_MS;
      if (pendingExpired || terminalExpired) {
        matches.delete(matchId);
        const subscribers = sseSubscribers.get(matchId);
        if (subscribers) {
          for (const subscriber of subscribers) subscriber.end();
          sseSubscribers.delete(matchId);
        }
      }
    }
  }
  /**
   * Broadcast match update to all active SSE subscribers for this match
   */
  private static broadcastMatchState(matchId: string): void {
    const match = matches.get(matchId);
    if (!match) return;

    const subs = sseSubscribers.get(matchId);
    if (!subs || subs.size === 0) return;

    for (const res of subs) {
      try {
        const userId = (res as any).__battleUserId;
        if (userId) {
          const sanitized = this.getSanitizedMatchState(matchId, userId);
          if (sanitized) {
            res.write(`data: ${JSON.stringify({ type: "MATCH_UPDATE", state: sanitized })}\n\n`);
          }
        }
      } catch {
        subs.delete(res);
      }
    }
  }

  /**
   * Get raw match room by ID
   */
  static getMatch(matchId: string): MatchRoom | undefined {
    return matches.get(matchId);
  }

  /**
   * Register an SSE subscriber
   */
  static registerSubscriber(matchId: string, userId: string, res: Response): void {
    if (!sseSubscribers.has(matchId)) {
      sseSubscribers.set(matchId, new Set());
    }
    (res as any).__battleUserId = userId;
    sseSubscribers.get(matchId)!.add(res);

    // Send immediate state
    const sanitized = this.getSanitizedMatchState(matchId, userId);
    if (sanitized) {
      res.write(`data: ${JSON.stringify({ type: "MATCH_UPDATE", state: sanitized })}\n\n`);
    }

    res.on("close", () => {
      const subs = sseSubscribers.get(matchId);
      if (subs) {
        subs.delete(res);
        if (subs.size === 0) sseSubscribers.delete(matchId);
      }
    });
  }

  /**
   * Create a challenge against another user or against SOC Bot AI
   */
  static createChallenge(
    initiator: BankUser,
    targetUser: { id: string; username: string; fullName: string }
  ): MatchRoom {
    this.pruneExpiredMatches();
    if (!targetUser.id || targetUser.id === initiator.id) {
      throw new Error("A challenge must target another player");
    }
    const matchId = `match_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const isAi = targetUser.id === "ai_soc_bot" || targetUser.username === "soc.bot";

    const match: MatchRoom = {
      id: matchId,
      player1: {
        userId: initiator.id,
        username: initiator.username,
        displayName: initiator.fullName || initiator.username,
        isReady: false,
        ships: [],
        shotsTaken: [],
        shotsReceived: [],
      },
      player2: {
        userId: targetUser.id,
        username: targetUser.username,
        displayName: targetUser.fullName || targetUser.username,
        isAi,
        isReady: isAi, // AI is immediately ready with auto-deployed fleet
        ships: isAi ? this.generateRandomFleet() : [],
        shotsTaken: [],
        shotsReceived: [],
      },
      status: isAi ? "PREPARING" : "PENDING",
      currentTurnUserId: initiator.id,
      winnerUserId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    matches.set(matchId, match);
    this.broadcastMatchState(matchId);
    return match;
  }

  /**
   * Find any pending challenges for a specific user
   */
  static getPendingChallengesForUser(user: BankUser | string): MatchRoom[] {
    this.pruneExpiredMatches();
    const now = Date.now();
    const result: MatchRoom[] = [];
    const userId = typeof user === "string" ? user : user.id;

    for (const match of matches.values()) {
      if (match.status === "PENDING") {
        const matchesUser = match.player2.userId === userId;

        if (matchesUser) {
          // Expire challenges older than 10 minutes
          const age = now - new Date(match.createdAt).getTime();
          if (age < PENDING_MATCH_TTL_MS) {
            result.push(match);
          }
        }
      }
    }

    return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /**
   * Accept an incoming challenge
   */
  static acceptChallenge(matchId: string, user: BankUser): MatchRoom {
    const match = matches.get(matchId);
    if (!match) throw new Error("Match not found");
    const isTarget = match.player2.userId === user.id;
    if (!isTarget) throw new Error("Unauthorized to accept this challenge");
    if (match.status !== "PENDING") throw new Error("Match is no longer pending");

    match.player2.userId = user.id;
    match.player2.displayName = user.fullName || user.username || match.player2.displayName;
    match.status = "PREPARING";
    match.updatedAt = new Date().toISOString();
    this.broadcastMatchState(matchId);
    return match;
  }

  /**
   * Decline an incoming challenge
   */
  static declineChallenge(matchId: string, user: BankUser, reason = "User declined"): MatchRoom {
    const match = matches.get(matchId);
    if (!match) throw new Error("Match not found");
    const isTargetOrInitiator = match.player2.userId === user.id || match.player1.userId === user.id;
    if (!isTargetOrInitiator) {
      throw new Error("Unauthorized");
    }

    match.status = "DECLINED";
    match.declineReason = reason;
    match.updatedAt = new Date().toISOString();
    this.broadcastMatchState(matchId);
    return match;
  }

  /**
   * Submit ship placements for a player and mark as ready
   */
  static submitFleetPlacement(matchId: string, userId: string, ships: Ship[]): MatchRoom {
    const match = matches.get(matchId);
    if (!match) throw new Error("Match not found");
    if (match.status !== "PREPARING" && match.status !== "PENDING") {
      throw new Error("Fleet deployment is closed");
    }

    // Validate fleet placement
    this.validateFleet(ships);

    const isP1 = match.player1.userId === userId;
    const isP2 = match.player2.userId === userId;
    if (!isP1 && !isP2) throw new Error("User not in this match");

    const player = isP1 ? match.player1 : match.player2;
    player.ships = ships.map((s) => ({ ...s, isSunk: false }));
    player.isReady = true;

    // If opponent is AI, guarantee AI has valid fleet ready
    if (match.player2.isAi && (!match.player2.ships || match.player2.ships.length === 0)) {
      match.player2.ships = this.generateRandomFleet();
      match.player2.isReady = true;
    }

    // If both players ready, transition to BATTLE_ACTIVE
    if (match.player1.isReady && match.player2.isReady) {
      match.status = "BATTLE_ACTIVE";
      match.currentTurnUserId = match.player1.userId; // Player 1 starts
    }

    match.updatedAt = new Date().toISOString();
    this.broadcastMatchState(matchId);
    return match;
  }

  /**
   * Player fires a shot at enemy radar coordinates (row, col)
   */
  static fireShot(matchId: string, userId: string, row: number, col: number): ShotResult {
    const match = matches.get(matchId);
    if (!match) throw new Error("Match not found");
    if (match.status !== "BATTLE_ACTIVE") throw new Error("Battle is not active");
    if (match.currentTurnUserId !== userId) throw new Error("It is not your turn");

    if (row < 0 || row > 9 || col < 0 || col > 9) throw new Error("Coordinates out of bounds (0..9)");

    const isP1 = match.player1.userId === userId;
    const shooter = isP1 ? match.player1 : match.player2;
    const target = isP1 ? match.player2 : match.player1;

    // Check duplicate shot
    const alreadyFired = shooter.shotsTaken.some((s) => s.row === row && s.col === col);
    if (alreadyFired) throw new Error("You already targeted this coordinate!");

    // Evaluate hit
    let hitShip: Ship | null = null;
    for (const ship of target.ships) {
      if (ship.coordinates.some((c) => c.row === row && c.col === col)) {
        hitShip = ship;
        break;
      }
    }

    let shotType: "MISS" | "HIT" | "SUNK" = "MISS";
    let sunkShipData: Ship | undefined = undefined;

    if (hitShip) {
      shotType = "HIT";

      // Check if all coordinates of hitShip have been struck
      const allHits = [...shooter.shotsTaken, { row, col } as any];
      const isSunk = hitShip.coordinates.every((coord) =>
        allHits.some((h) => h.row === coord.row && h.col === coord.col)
      );

      if (isSunk) {
        shotType = "SUNK";
        hitShip.isSunk = true;
        sunkShipData = { ...hitShip };
      }
    }

    const shotRecord: ShotResult = {
      row,
      col,
      result: shotType,
      sunkShip: sunkShipData,
      byUserId: userId,
      timestamp: new Date().toISOString(),
    };

    shooter.shotsTaken.push(shotRecord);
    target.shotsReceived.push(shotRecord);

    // Check Victory condition: all opponent ships sunk
    const remainingShips = target.ships.filter((s) => !s.isSunk).length;
    if (remainingShips === 0) {
      match.status = "FINISHED";
      match.winnerUserId = userId;
    } else {
      // If MISS, switch turn. If HIT or SUNK, shooter gets another shot!
      if (shotType === "MISS") {
        match.currentTurnUserId = target.userId;
      }
    }

    match.updatedAt = new Date().toISOString();
    this.broadcastMatchState(matchId);

    // If it is now AI's turn, trigger autonomous AI firing
    if (match.status === "BATTLE_ACTIVE" && match.currentTurnUserId === match.player2.userId && match.player2.isAi) {
      const aiTurnTimer = setTimeout(() => {
        this.executeAiTurn(matchId);
      }, 750);
      aiTurnTimer.unref?.();
    }

    return shotRecord;
  }

  /**
   * Autonomous SOC AI Bot Turn execution
   */
  private static executeAiTurn(matchId: string): void {
    const match = matches.get(matchId);
    if (!match || match.status !== "BATTLE_ACTIVE" || !match.player2.isAi) return;
    if (match.currentTurnUserId !== match.player2.userId) return;

    const ai = match.player2;
    const human = match.player1;

    // AI Targeting Logic: Check previous hits with unsunk ships (Hunt mode)
    let targetCoord: ShipCoordinate | null = null;

    const hitsWithUnfinishedShips: ShipCoordinate[] = [];
    for (const shot of ai.shotsTaken) {
      if (shot.result === "HIT") {
        // Verify this hit does not belong to an already sunk ship
        const belongsToSunk = human.ships
          .filter((s) => s.isSunk)
          .some((s) => s.coordinates.some((c) => c.row === shot.row && c.col === shot.col));
        if (!belongsToSunk) {
          hitsWithUnfinishedShips.push({ row: shot.row, col: shot.col });
        }
      }
    }

    if (hitsWithUnfinishedShips.length > 0) {
      // Pick adjacent cells (up, down, left, right) of recent hits
      for (const hit of hitsWithUnfinishedShips) {
        const deltas = [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ];
        // Shuffle deltas
        deltas.sort(() => Math.random() - 0.5);

        for (const [dr, dc] of deltas) {
          const nr = hit.row + dr;
          const nc = hit.col + dc;
          if (nr >= 0 && nr <= 9 && nc >= 0 && nc <= 9) {
            const alreadyShot = ai.shotsTaken.some((s) => s.row === nr && s.col === nc);
            if (!alreadyShot) {
              targetCoord = { row: nr, col: nc };
              break;
            }
          }
        }
        if (targetCoord) break;
      }
    }

    // Parity / Random search mode if no hot targets
    if (!targetCoord) {
      const candidates: ShipCoordinate[] = [];
      for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 10; c++) {
          const already = ai.shotsTaken.some((s) => s.row === r && s.col === c);
          if (!already) {
            // Prefer checkerboard cells for efficiency
            if ((r + c) % 2 === 0) {
              candidates.push({ row: r, col: c });
            }
          }
        }
      }

      if (candidates.length > 0) {
        targetCoord = candidates[Math.floor(Math.random() * candidates.length)];
      } else {
        // Any remaining cell
        for (let r = 0; r < 10; r++) {
          for (let c = 0; c < 10; c++) {
            if (!ai.shotsTaken.some((s) => s.row === r && s.col === c)) {
              targetCoord = { row: r, col: c };
              break;
            }
          }
          if (targetCoord) break;
        }
      }
    }

    if (targetCoord) {
      try {
        this.fireShot(matchId, ai.userId, targetCoord.row, targetCoord.col);
      } catch (err) {
        // Fallback
      }
    }
  }

  /**
   * Sanitize match state so players cannot inspect network requests to see opponent's hidden ships!
   */
  static getSanitizedMatchState(matchId: string, userId: string): SanitizedMatchState | null {
    const match = matches.get(matchId);
    if (!match) return null;

    const isP1 = match.player1.userId === userId;
    const isP2 = match.player2.userId === userId;
    if (!isP1 && !isP2) return null;

    const me = isP1 ? match.player1 : match.player2;
    const opp = isP1 ? match.player2 : match.player1;

    return {
      id: match.id,
      status: match.status,
      currentTurnUserId: match.currentTurnUserId,
      isMyTurn: match.currentTurnUserId === userId && match.status === "BATTLE_ACTIVE",
      winnerUserId: match.winnerUserId,
      me: {
        userId: me.userId,
        username: me.username,
        displayName: me.displayName,
        isReady: me.isReady,
        ships: me.ships,
        shotsTaken: me.shotsTaken,
        shotsReceived: me.shotsReceived,
        remainingShipsCount: me.ships.filter((s) => !s.isSunk).length,
      },
      opponent: {
        userId: opp.userId,
        username: opp.username,
        displayName: opp.displayName,
        isAi: opp.isAi,
        isReady: opp.isReady,
        remainingShipsCount: opp.ships.filter((s) => !s.isSunk).length,
      },
      createdAt: match.createdAt,
      updatedAt: match.updatedAt,
    };
  }

  /**
   * Validate user-placed fleet configuration
   */
  private static validateFleet(ships: Ship[]): void {
    const expectedSizes = STANDARD_FLEET_CONFIG.flatMap((spec) => Array.from({ length: spec.count }, () => spec.size)).sort((a, b) => a - b);
    if (!Array.isArray(ships) || ships.length !== expectedSizes.length) {
      throw new Error("Fleet must contain the standard 10 ships");
    }

    const actualSizes = ships.map((ship) => ship?.size).sort((a, b) => a - b);
    if (actualSizes.some((size, index) => size !== expectedSizes[index])) {
      throw new Error("Fleet composition does not match the standard configuration");
    }

    const occupied = new Set<string>();

    for (const ship of ships) {
      if (!ship || !Array.isArray(ship.coordinates) || !Number.isInteger(ship.size) || ship.coordinates.length !== ship.size) {
        throw new Error(`Gəmi ölçüsü uyğunsuzluğu: ${ship.name}`);
      }

      const rows = new Set<number>();
      const cols = new Set<number>();

      for (const coord of ship.coordinates) {
        if (!Number.isInteger(coord.row) || !Number.isInteger(coord.col) || coord.row < 0 || coord.row > 9 || coord.col < 0 || coord.col > 9) {
          throw new Error("Gəmi koordinatları torun xaricindədir (0..9)");
        }
        rows.add(coord.row);
        cols.add(coord.col);
        const key = `${coord.row},${coord.col}`;
        if (occupied.has(key)) {
          throw new Error("Gəmilər üst-üstə düşə bilməz (Ships cannot overlap)");
        }
        occupied.add(key);
      }

      const horizontal = rows.size === 1 && cols.size === ship.size;
      const vertical = cols.size === 1 && rows.size === ship.size;
      const ordered = (horizontal ? [...cols] : [...rows]).sort((a, b) => a - b);
      if ((!horizontal && !vertical) || ordered.some((value, index) => index > 0 && value !== ordered[index - 1] + 1)) {
        throw new Error("Ships must be placed in one contiguous horizontal or vertical line");
      }
    }
  }

  /**
   * Procedural random fleet generator for auto-placement and AI deployment
   */
  static generateRandomFleet(): Ship[] {
    const fleet: Ship[] = [];
    const occupied = new Set<string>();

    const specs = [
      { name: "Fladşip (Flagship)", size: 4, count: 1 },
      { name: "Kruizer (Cruiser)", size: 3, count: 2 },
      { name: "Eskadra (Destroyer)", size: 2, count: 3 },
      { name: "Kəşfiyyat (Patrol)", size: 1, count: 4 },
    ];

    let shipCounter = 1;

    for (const spec of specs) {
      for (let i = 0; i < spec.count; i++) {
        let placed = false;
        let attempts = 0;

        while (!placed && attempts < 200) {
          attempts++;
          const isHorizontal = Math.random() > 0.5;
          const maxR = isHorizontal ? 9 : 9 - spec.size + 1;
          const maxC = isHorizontal ? 9 - spec.size + 1 : 9;

          const startR = Math.floor(Math.random() * (maxR + 1));
          const startC = Math.floor(Math.random() * (maxC + 1));

          const coords: ShipCoordinate[] = [];
          let collision = false;

          for (let s = 0; s < spec.size; s++) {
            const r = isHorizontal ? startR : startR + s;
            const c = isHorizontal ? startC + s : startC;

            // Check collision with existing ships or their immediate perimeter
            for (let dr = -1; dr <= 1; dr++) {
              for (let dc = -1; dc <= 1; dc++) {
                if (occupied.has(`${r + dr},${c + dc}`)) {
                  collision = true;
                  break;
                }
              }
              if (collision) break;
            }

            coords.push({ row: r, col: c });
          }

          if (!collision) {
            for (const c of coords) {
              occupied.add(`${c.row},${c.col}`);
            }
            fleet.push({
              id: `ship_${shipCounter++}`,
              name: spec.name,
              size: spec.size,
              coordinates: coords,
              isSunk: false,
            });
            placed = true;
          }
        }
      }
    }

    return fleet;
  }

  /**
   * Leave or forfeit a match
   */
  static leaveMatch(matchId: string, userId: string): MatchRoom {
    const match = matches.get(matchId);
    if (!match) throw new Error("Match not found");

    if (match.player1.userId !== userId && match.player2.userId !== userId) {
      throw new Error("User not in this match");
    }
    if (match.status === "BATTLE_ACTIVE" || match.status === "PREPARING") {
      match.status = "FINISHED";
      match.winnerUserId = match.player1.userId === userId ? match.player2.userId : match.player1.userId;
    }

    match.updatedAt = new Date().toISOString();
    this.broadcastMatchState(matchId);
    return match;
  }
}
