import test from "node:test";
import assert from "node:assert/strict";
import {
  GRID_SIZE,
  FLEET_SPECS,
  canPlaceShip,
  generateRandomFleet,
  isFleetDeploymentComplete,
  getSunkPerimeterKeys,
  type PlacedShip,
} from "../client/components/game/battle/cyber-battle-engine.js";
import {
  BattleChallengeService,
} from "../server/services/battle-challenge.service.js";
import type { BankUser } from "../shared/types/auth.js";

test("Cyber Battle Engine - Fleet Specs and Grid Rules", () => {
  assert.equal(GRID_SIZE, 10);
  assert.equal(FLEET_SPECS.length, 4);

  const totalShips = FLEET_SPECS.reduce((sum, s) => sum + s.count, 0);
  assert.equal(totalShips, 10, "Standard naval fleet must consist of 10 ships");

  const totalCells = FLEET_SPECS.reduce((sum, s) => sum + s.count * s.size, 0);
  assert.equal(totalCells, 20, "Total ship cells must equal 20 (4x1 + 3x2 + 2x3 + 1x4)");
});

test("Cyber Battle Engine - Ship Placement and Perimeter Collision", () => {
  const placed: PlacedShip[] = [];

  // Out of bounds test
  const outOfBounds = canPlaceShip(placed, 8, 8, 4, true);
  assert.equal(outOfBounds.canPlace, false, "Ship exceeding horizontal grid boundary must be invalid");

  // Valid placement
  const validShip = canPlaceShip(placed, 0, 0, 4, true);
  assert.equal(validShip.canPlace, true);

  placed.push({
    id: "ship_flagship",
    typeId: "flagship",
    name: "Flagship",
    size: 4,
    coordinates: validShip.coordinates,
    isSunk: false,
  });

  // Overlap test
  const overlapping = canPlaceShip(placed, 0, 2, 2, false);
  assert.equal(overlapping.canPlace, false, "Overlapping placement must be rejected");

  // Immediate adjacent perimeter test (classic Battleship rule: ships cannot touch)
  const adjacent = canPlaceShip(placed, 1, 1, 2, true);
  assert.equal(adjacent.canPlace, false, "Directly adjacent placement within 1-cell perimeter must be rejected");

  // Distant valid placement
  const isolated = canPlaceShip(placed, 3, 0, 3, true);
  assert.equal(isolated.canPlace, true, "Ship placed outside neighbor perimeter must be accepted");
});

test("Cyber Battle Engine - Procedural Fleet Generator & Sunk Perimeter", () => {
  const randomFleet = generateRandomFleet();
  assert.equal(randomFleet.length, 10, "Auto-deploy must place exactly 10 ships");
  assert.equal(isFleetDeploymentComplete(randomFleet), true, "Random fleet must be complete");

  // Verify all coordinates are within 10x10 and non-overlapping
  const occupied = new Set<string>();
  for (const ship of randomFleet) {
    for (const c of ship.coordinates) {
      assert.ok(c.row >= 0 && c.row < 10);
      assert.ok(c.col >= 0 && c.col < 10);
      const key = `${c.row},${c.col}`;
      assert.ok(!occupied.has(key), `Duplicate coordinate detected: ${key}`);
      occupied.add(key);
    }
  }
  assert.equal(occupied.size, 20);

  // Sunk perimeter calculation
  const firstShip = randomFleet[0];
  const perimeterSet = getSunkPerimeterKeys([firstShip]);
  assert.ok(perimeterSet.size > 0, "Sunk ship must have surrounding perimeter cells");
  for (const pKey of perimeterSet) {
    assert.ok(!firstShip.coordinates.some((c) => `${c.row},${c.col}` === pKey), "Perimeter cannot be ship cell itself");
  }
});

test("BattleChallengeService - Match Lifecycle, Anti-Cheat Fog of War & AI Battle", () => {
  const userA: BankUser = {
    id: "u_alice",
    username: "alice",
    fullName: "Alice Vance",
    role: "SOC_ANALYST",
    departmentId: "CYBER_DEFENSE",
    active: true,
  };

  const userB: BankUser = {
    id: "u_bob",
    username: "bob",
    fullName: "Bob Stone",
    role: "SOC_ANALYST",
    departmentId: "CYBER_DEFENSE",
    active: true,
  };

  // 1. User A challenges User B
  const match = BattleChallengeService.createChallenge(userA, {
    id: userB.id,
    username: userB.username,
    fullName: userB.fullName,
  });

  assert.ok(match.id.startsWith("match_"));
  assert.equal(match.status, "PENDING");

  // 2. User B checks pending
  const pendingB = BattleChallengeService.getPendingChallengesForUser(userB);
  assert.ok(pendingB.some((m) => m.id === match.id), "Pending challenge must be visible to User B");

  // 3. User B accepts challenge
  const accepted = BattleChallengeService.acceptChallenge(match.id, userB);
  assert.equal(accepted.status, "PREPARING");

  // 4. Anti-Cheat Fog of War verification
  const sanitizedForA = BattleChallengeService.getSanitizedMatchState(match.id, userA.id);
  assert.ok(sanitizedForA);
  assert.equal((sanitizedForA.opponent as any).ships, undefined, "Opponent ships must be hidden from client state");

  // 5. Deploy fleets
  const fleetA = BattleChallengeService.generateRandomFleet();
  const fleetB = BattleChallengeService.generateRandomFleet();

  BattleChallengeService.submitFleetPlacement(match.id, userA.id, fleetA);
  const updatedMatch = BattleChallengeService.submitFleetPlacement(match.id, userB.id, fleetB);
  assert.equal(updatedMatch.status, "BATTLE_ACTIVE", "Match must transition to BATTLE_ACTIVE when both are ready");

  // 6. Test Blind Fire
  const activeMatch = BattleChallengeService.getMatch(match.id)!;
  const currentTurn = activeMatch.currentTurnUserId;
  const shooter = currentTurn === userA.id ? userA : userB;
  const targetFleet = shooter.id === userA.id ? activeMatch.player2.ships : activeMatch.player1.ships;

  // Fire at known target ship coordinate
  const hitTargetCoord = targetFleet[0].coordinates[0];
  const fireResult = BattleChallengeService.fireShot(match.id, shooter.id, hitTargetCoord.row, hitTargetCoord.col);
  assert.ok(fireResult.result === "HIT" || fireResult.result === "SUNK");

  const stateAfterFire = BattleChallengeService.getMatch(match.id)!;
  assert.equal(stateAfterFire.currentTurnUserId, shooter.id, "Player who scored a hit must retain the turn");

  // 7. Test AI Bot Matchmaking
  const aiMatch = BattleChallengeService.createChallenge(userA, {
    id: "ai_soc_bot",
    username: "soc.bot",
    fullName: "Expressbank SOC AI Bot",
  });
  assert.equal(aiMatch.player2.isAi, true);
  assert.equal(aiMatch.player2.isReady, true);
  assert.equal(aiMatch.status, "PREPARING");

  const aiState = BattleChallengeService.submitFleetPlacement(aiMatch.id, userA.id, fleetA);
  assert.equal(aiState.status, "BATTLE_ACTIVE", "AI match immediately becomes active once human places fleet");
});
