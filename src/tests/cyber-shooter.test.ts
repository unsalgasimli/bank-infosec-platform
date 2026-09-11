/**
 * Unit Tests for Expressbank Cyber Shooter (IT Warfare) Engine & Backend Service
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  ROLE_SPECS,
  WEAPON_SPECS,
  ShooterRole,
  WeaponId,
} from "../shared/types/shooter.js";
import {
  CyberShooterService,
  ARENA_BOUNDS,
  SPAWN_POINTS,
  JUMP_PADS,
} from "../server/services/cyber-shooter.service.js";

test("Cyber Shooter Specs - Roles and Loadout Consistency", () => {
  const roles: ShooterRole[] = ["infosec", "helpdesk", "it_admin"];
  assert.equal(Object.keys(ROLE_SPECS).length, 3);

  for (const roleKey of roles) {
    const spec = ROLE_SPECS[roleKey];
    assert.ok(spec, `Role spec for ${roleKey} must exist`);
    assert.ok(spec.maxHealth >= 80 && spec.maxHealth <= 150, "Health must be balanced between 80 and 150");
    assert.ok(spec.maxShield >= 30 && spec.maxShield <= 100, "Shield must be balanced between 30 and 100");
    assert.ok(spec.primaryWeapon in WEAPON_SPECS, `Primary weapon ${spec.primaryWeapon} must be defined`);
    assert.ok(spec.secondaryWeapon in WEAPON_SPECS, `Secondary weapon ${spec.secondaryWeapon} must be defined`);
    assert.ok(spec.movementMechanicNameAz.length > 0, "Movement mechanic description required");
    assert.ok(spec.abilityCooldownSec > 0, "Ability cooldown must be positive");
  }

  // Check specific class archetype rules
  assert.equal(ROLE_SPECS.infosec.primaryWeapon, "railgun");
  assert.equal(ROLE_SPECS.helpdesk.primaryWeapon, "ticket_gatling");
  assert.equal(ROLE_SPECS.it_admin.primaryWeapon, "flak_shotgun");

  // Helpdesk has highest mobility
  assert.ok(ROLE_SPECS.helpdesk.speedMultiplier > ROLE_SPECS.it_admin.speedMultiplier);
  // IT Admin has highest health
  assert.ok(ROLE_SPECS.it_admin.maxHealth > ROLE_SPECS.infosec.maxHealth);
});

test("Cyber Shooter Specs - Weapons Balance and Damage Multipliers", () => {
  const weapons: WeaponId[] = [
    "railgun",
    "port_pistol",
    "ticket_gatling",
    "p1_grenade",
    "flak_shotgun",
    "sudo_blaster",
  ];

  for (const wId of weapons) {
    const w = WEAPON_SPECS[wId];
    assert.ok(w, `Weapon ${wId} must exist`);
    assert.ok(w.damageHead >= w.damageBody, "Headshot damage must be greater than or equal to body damage");
    assert.ok(w.magSize >= 1, "Magazine size must be at least 1");
    assert.ok(w.reloadTimeSec > 0, "Reload time must be positive");
  }

  // Railgun sniper must deal massive precision damage
  assert.ok(WEAPON_SPECS.railgun.damageHead >= 150, "Railgun headshot must deliver critical damage (>=150)");
  assert.equal(WEAPON_SPECS.railgun.projectileSpeed, 0, "Railgun must be instant hitscan");

  // Gatling must have high RPM
  assert.ok(WEAPON_SPECS.ticket_gatling.fireRateRpm >= 500, "Gatling RPM must be >= 500");

  // Shotgun must shoot 8 pellets
  assert.equal(WEAPON_SPECS.flak_shotgun.pelletsPerShot, 8);
});

test("Cyber Shooter Arena Geometry & Jump Pads", () => {
  assert.ok(ARENA_BOUNDS.minX < ARENA_BOUNDS.maxX);
  assert.ok(ARENA_BOUNDS.minZ < ARENA_BOUNDS.maxZ);
  assert.ok(SPAWN_POINTS.length >= 4, "Must have at least 4 spawn points");

  for (const spawn of SPAWN_POINTS) {
    assert.ok(spawn.x >= ARENA_BOUNDS.minX && spawn.x <= ARENA_BOUNDS.maxX);
    assert.ok(spawn.z >= ARENA_BOUNDS.minZ && spawn.z <= ARENA_BOUNDS.maxZ);
  }

  assert.ok(JUMP_PADS.length >= 4, "Must have jump pads across arena");
  for (const pad of JUMP_PADS) {
    assert.ok(pad.boostY >= 12, "Jump pad boost must launch player into air");
  }
});

test("Cyber Shooter Service - Lobby Initialization and Player Lifecycle", () => {
  CyberShooterService.init();
  const state = CyberShooterService.getLobbyState();

  assert.equal(state.lobbyId, "cyber-arena-alpha");
  assert.ok(Object.keys(state.players).length >= 4, "AI Bots must automatically populate arena");

  // Join a human player
  const testUserId = "test-user-soc-01";
  const { player, lobbyState } = CyberShooterService.joinPlayer(testUserId, "SOC Analyst Emin", "infosec");

  assert.equal(player.id, testUserId);
  assert.equal(player.role, "infosec");
  assert.equal(player.health, ROLE_SPECS.infosec.maxHealth);
  assert.equal(player.shield, ROLE_SPECS.infosec.maxShield);
  assert.equal(player.kills, 0);
  assert.equal(player.deaths, 0);
  assert.ok(lobbyState.players[testUserId]);

  // Sync player position
  const syncedState = CyberShooterService.syncPlayer(testUserId, {
    position: { x: 5, y: 0, z: 5 },
    velocity: { x: 2, y: 0, z: 0 },
    yaw: 1.5,
    pitch: 0.1,
    isSliding: false,
    isJumping: false,
    activeWeapon: "railgun",
    ammo: 4,
    isReloading: false,
  });

  assert.ok(syncedState.players[testUserId].position.x >= -28 && syncedState.players[testUserId].position.x <= 28);
  assert.equal(syncedState.players[testUserId].yaw, 1.5);
});

test("Cyber Shooter Service - Combat, Hit Registration and Kill Logic", () => {
  const p1 = CyberShooterService.joinPlayer("player-attacker", "Attacker", "infosec").player;
  const p2 = CyberShooterService.joinPlayer("player-target", "Target Dummy", "helpdesk").player;
  p1.position = { x: 0, y: 0, z: 0 };
  p2.position = { x: 10, y: 0, z: 0 };

  const initialHp = p2.health;
  const initialShield = p2.shield;

  // Fire a body shot with railgun (85 damage)
  const fireRes = CyberShooterService.fireShot(p1.id, {
    weaponId: "railgun",
    origin: { x: 0, y: 1.5, z: 0 },
    direction: { x: 1, y: 0, z: 0 },
    hitPlayerId: p2.id,
    hitPart: "body",
    hitDistance: 10,
  });

  assert.equal(fireRes.hit, true);
  assert.equal(fireRes.damageDealt, 85);

  const updatedTarget = CyberShooterService.getLobbyState().players[p2.id];
  // Target had 40 shield, 100 HP. 85 damage should break 40 shield and take 45 HP => 55 HP remaining
  assert.equal(updatedTarget.shield, 0, "Shield should be depleted first");
  assert.equal(updatedTarget.health, 55, "Remaining 45 damage should reduce health from 100 to 55");

  // The server throttles weapon fire. Advance the direct-service fixture's
  // clock boundary before issuing the next legitimate hit.
  (CyberShooterService as any).lastShotAt.set(p1.id, 0);

  // Fatal headshot shot to kill target
  const fatalRes = CyberShooterService.fireShot(p1.id, {
    weaponId: "railgun",
    origin: { x: 0, y: 1.5, z: 0 },
    direction: { x: 1, y: 0, z: 0 },
    hitPlayerId: p2.id,
    hitPart: "head",
    hitDistance: 10,
  });

  assert.equal(fatalRes.killed, true);
  assert.equal(updatedTarget.health, 0);
  assert.equal(updatedTarget.deaths, 1);

  const updatedAttacker = CyberShooterService.getLobbyState().players[p1.id];
  assert.equal(updatedAttacker.kills, 1);
  assert.ok(updatedAttacker.score >= 150);

  // Check Killfeed
  const latestKill = CyberShooterService.getLobbyState().killfeed[0];
  assert.ok(latestKill);
  assert.equal(latestKill.killerId, p1.id);
  assert.equal(latestKill.victimId, p2.id);
  assert.equal(latestKill.isHeadshot, true);

  // Respawn target
  const respawned = CyberShooterService.respawnPlayer(p2.id);
  assert.ok(respawned);
  assert.equal(respawned.health, ROLE_SPECS.helpdesk.maxHealth);
  assert.equal(respawned.shield, ROLE_SPECS.helpdesk.maxShield);

  // Clean up
  CyberShooterService.leavePlayer("player-attacker");
  CyberShooterService.leavePlayer("player-target");
});

test("Cyber Shooter Service - Role Abilities (EMP, Hotfix, Ground Slam)", () => {
  const pInfosec = CyberShooterService.joinPlayer("ability-infosec", "Hacker", "infosec").player;
  const pHelpdesk = CyberShooterService.joinPlayer("ability-helpdesk", "Support", "helpdesk").player;
  const pAdmin = CyberShooterService.joinPlayer("ability-admin", "Sysadmin", "it_admin").player;

  // 1. Infosec DDoS EMP ability (wipes shields within 15m)
  pInfosec.position = { x: 0, y: 0, z: 0 };
  pHelpdesk.position = { x: 2, y: 0, z: 2 };
  pHelpdesk.shield = 40;
  CyberShooterService.useAbility(pInfosec.id, {
    abilityType: "ult",
    position: { x: 0, y: 0, z: 0 },
  });
  assert.equal(CyberShooterService.getLobbyState().players[pHelpdesk.id].shield, 0, "DDoS EMP must wipe enemy shields");

  // 2. Helpdesk Hotfix Reboot (heals +60 HP)
  pHelpdesk.health = 30;
  CyberShooterService.useAbility(pHelpdesk.id, {
    abilityType: "ult",
    position: pHelpdesk.position,
  });
  assert.equal(CyberShooterService.getLobbyState().players[pHelpdesk.id].health, 90, "Hotfix must heal +60 HP");

  // 3. IT Admin Ground Slam (35 AoE damage within 6.5m)
  pHelpdesk.health = 90;
  pAdmin.position = { x: 3, y: 0, z: 2 };
  CyberShooterService.useAbility(pAdmin.id, {
    abilityType: "slam",
    position: pAdmin.position,
  });
  assert.equal(CyberShooterService.getLobbyState().players[pHelpdesk.id].health, 55, "Ground Slam must deal 35 AoE damage");

  // Clean up
  CyberShooterService.leavePlayer("ability-infosec");
  CyberShooterService.leavePlayer("ability-helpdesk");
  CyberShooterService.leavePlayer("ability-admin");
  CyberShooterService.stop();
});

test("Arcade Access Policy - Infosec & u.gasimli Exemption during Working Hours", async () => {
  const { isUserExemptFromArcadePolicy, checkArcadeAccess } = await import(
    "../client/components/game/arcade-access-policy.js"
  );

  // 1. Specific user u.gasimli
  const userGasimli = {
    username: "u.gasimli",
    email: "u.gasimli@expressbank.az",
    fullName: "Ünsal Qasımlı",
  };
  assert.equal(isUserExemptFromArcadePolicy(userGasimli), true, "u.gasimli must be exempt from working hours policy");

  // 2. Infosec department user
  const userInfosec = {
    username: "analyst1",
    departmentId: "infosec",
    roles: [],
  };
  assert.equal(isUserExemptFromArcadePolicy(userInfosec), true, "Infosec department user must be exempt");

  // 3. Security Role user (SOC Analyst)
  const userSoc = {
    username: "soc_lead",
    departmentId: "operations",
    roles: ["SOC_ANALYST" as any],
  };
  assert.equal(isUserExemptFromArcadePolicy(userSoc), true, "SOC_ANALYST role user must be exempt");

  // 4. Regular non-security user
  const userRegular = {
    username: "hr_specialist",
    departmentId: "hr",
    roles: ["REQUESTER" as any],
  };
  assert.equal(isUserExemptFromArcadePolicy(userRegular), false, "Regular HR user must NOT be exempt");

  // 5. Test working hours check (e.g. Wednesday 15:30 Baku time - strictly working hours)
  // 15:30 UTC+4 is 11:30 UTC
  const workdayDate = new Date("2026-09-16T11:30:00.000Z");

  const accessGasimli = checkArcadeAccess(userGasimli, workdayDate);
  assert.equal(accessGasimli.isAccessible, true, "u.gasimli must have 24/7 access even during afternoon work block");
  assert.equal(accessGasimli.isInfosecExempt, true);

  const accessRegular = checkArcadeAccess(userRegular, workdayDate);
  assert.equal(accessRegular.isAccessible, false, "Regular user must be blocked during 15:30 work hours");
});
