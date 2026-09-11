/**
 * Expressbank Cyber Shooter: IT Warfare (Krunker-Style 3D FPS)
 * Shared TypeScript definitions, role stats, weapon configs, and multiplayer network types.
 */

export type ShooterRole = "infosec" | "helpdesk" | "it_admin";

export type WeaponId =
  | "railgun"
  | "port_pistol"
  | "ticket_gatling"
  | "p1_grenade"
  | "flak_shotgun"
  | "sudo_blaster";

export interface WeaponSpec {
  id: WeaponId;
  nameAz: string;
  nameEn: string;
  role: ShooterRole;
  isPrimary: boolean;
  damageBody: number;
  damageHead: number;
  fireRateRpm: number; // Rounds per minute
  magSize: number;
  reloadTimeSec: number;
  spread: number; // degrees
  pelletsPerShot: number;
  range: number;
  projectileSpeed: number; // 0 = hitscan
  zoomFovMultiplier?: number; // ADS zoom e.g. 0.45 for railgun sniper
  recoilKick: number;
  accentColor: string;
  soundType: "railgun" | "pistol" | "gatling" | "grenade" | "shotgun" | "blaster";
}

export interface RoleSpec {
  id: ShooterRole;
  titleAz: string;
  titleEn: string;
  callsign: string;
  descriptionAz: string;
  descriptionEn: string;
  color: string;
  glowColor: string;
  maxHealth: number;
  maxShield: number;
  speedMultiplier: number;
  jumpMultiplier: number;
  primaryWeapon: WeaponId;
  secondaryWeapon: WeaponId;
  movementMechanicNameAz: string;
  movementMechanicNameEn: string;
  movementMechanicDescAz: string;
  movementMechanicDescEn: string;
  abilityNameAz: string;
  abilityNameEn: string;
  abilityDescAz: string;
  abilityDescEn: string;
  abilityCooldownSec: number;
}

export const ROLE_SPECS: Record<ShooterRole, RoleSpec> = {
  infosec: {
    id: "infosec",
    titleAz: "İnformasiya Təhlükəsizliyi (Infosec)",
    titleEn: "Information Security (Infosec)",
    callsign: "CYBER HUNTER",
    descriptionAz: "Uzaq məsafəli dəqiq snayper zərbələri, görünməz 'Ghost Dash' sürüşməsi və sistemləri iflic edən DDoS EMP dalğası.",
    descriptionEn: "Long-range piercing railgun sniper, stealth ghost slide dash, and crippling DDoS EMP blast.",
    color: "#00f576",
    glowColor: "rgba(0, 245, 118, 0.5)",
    maxHealth: 90,
    maxShield: 50,
    speedMultiplier: 1.05,
    jumpMultiplier: 1.0,
    primaryWeapon: "railgun",
    secondaryWeapon: "port_pistol",
    movementMechanicNameAz: "Ghost Packet Slide & Dash",
    movementMechanicNameEn: "Ghost Packet Slide & Dash",
    movementMechanicDescAz: "Shift sürüşməsi zamanı [E] klikləyin: 10m irəli görünməz sıçrayış edir, klon kölgə buraxır və sürəti +30% artırır.",
    movementMechanicDescEn: "While sliding press [E]: Instant 10m holographic stealth blink with +30% slide-hop speed boost.",
    abilityNameAz: "DDoS Disruption EMP",
    abilityNameEn: "DDoS Disruption EMP",
    abilityDescAz: "15m radiusda bütün rəqiblərin ekranını və radarlarını 4 saniyəlik sıradan çıxarır.",
    abilityDescEn: "Blasts a 15m EMP wave disabling enemy radars and scrambling HUDs for 4s.",
    abilityCooldownSec: 14,
  },
  helpdesk: {
    id: "helpdesk",
    titleAz: "Texniki Dəstək (Help Desk)",
    titleEn: "Help Desk (IT Support)",
    callsign: "RAPID RESPONSE",
    descriptionAz: "Sürətli RJ-45 pnevmatik tir kaskadı, havada ikiqat tullanma (Double Jump) və ani sistem canlandırma Hotfix yaması.",
    descriptionEn: "High-RPM pneumatic RJ-45 nailgun, mid-air double jump, and instant Hotfix health regeneration.",
    color: "#00e5ff",
    glowColor: "rgba(0, 229, 255, 0.5)",
    maxHealth: 100,
    maxShield: 40,
    speedMultiplier: 1.2,
    jumpMultiplier: 1.15,
    primaryWeapon: "ticket_gatling",
    secondaryWeapon: "p1_grenade",
    movementMechanicNameAz: "Coffee Boost & Double Jump",
    movementMechanicNameEn: "Coffee Boost & Double Jump",
    movementMechanicDescAz: "Havada olarkən yenidən Space basın: Reaktiv ikiqat tullanma və divardan sıçrayış!",
    movementMechanicDescEn: "Tap Space mid-air for an agile double jump and wall bounce momentum!",
    abilityNameAz: "P1 Hotfix Reboot Surge",
    abilityNameEn: "P1 Hotfix Reboot Surge",
    abilityDescAz: "Dərhal 60 HP bərpa edir, 5 saniyəlik limitsiz sursat və +40% sürət verir.",
    abilityDescEn: "Instantly restores 60 HP, grants unlimited ammo, and +40% speed for 5s.",
    abilityCooldownSec: 16,
  },
  it_admin: {
    id: "it_admin",
    titleAz: "Sistem Administratoru (IT Admin)",
    titleEn: "System Administrator (IT Admin)",
    callsign: "SYSADMIN TANK",
    descriptionAz: "Ağır Server Şkafı saçma tüfəngi, havadan zərbə dalğası (Ground Slam) və zərərləri dəf edən 'Root Access' qalxanı.",
    descriptionEn: "Devastating close-range server rack shotgun, aerial shockwave ground slam, and root privilege armor.",
    color: "#ffb800",
    glowColor: "rgba(255, 184, 0, 0.5)",
    maxHealth: 130,
    maxShield: 70,
    speedMultiplier: 0.95,
    jumpMultiplier: 0.95,
    primaryWeapon: "flak_shotgun",
    secondaryWeapon: "sudo_blaster",
    movementMechanicNameAz: "Ground Slam & Heavy Slide",
    movementMechanicNameEn: "Ground Slam & Heavy Slide",
    movementMechanicDescAz: "Havada olarkən Shift / Ctrl basın: Yerinə çırpılaraq 35 sahəvi zərər verən şok dalğası yaradır.",
    movementMechanicDescEn: "Press Shift/Crouch in air: Heavy ground stomp dealing 35 AoE shockwave damage.",
    abilityNameAz: "Root Access Bastion (`sudo`)",
    abilityNameEn: "Root Access Bastion (`sudo`)",
    abilityDescAz: "4 saniyə ərzində gələn bütün zərərlərin 80%-ni udan altıbucaqlı qızıl kiber qalxan.",
    abilityDescEn: "Activates a golden cyber barrier absorbing 80% of incoming damage for 4s.",
    abilityCooldownSec: 18,
  },
};

export const WEAPON_SPECS: Record<WeaponId, WeaponSpec> = {
  railgun: {
    id: "railgun",
    nameAz: "Zero-Day Reylqan Snayper",
    nameEn: "Zero-Day Railgun",
    role: "infosec",
    isPrimary: true,
    damageBody: 85,
    damageHead: 155,
    fireRateRpm: 55,
    magSize: 4,
    reloadTimeSec: 2.2,
    spread: 0,
    pelletsPerShot: 1,
    range: 120,
    projectileSpeed: 0, // Instant hitscan
    zoomFovMultiplier: 0.42,
    recoilKick: 0.08,
    accentColor: "#00f576",
    soundType: "railgun",
  },
  port_pistol: {
    id: "port_pistol",
    nameAz: "Port Scanner Tapança",
    nameEn: "Port Scanner Burst Pistol",
    role: "infosec",
    isPrimary: false,
    damageBody: 24,
    damageHead: 42,
    fireRateRpm: 360,
    magSize: 18,
    reloadTimeSec: 1.3,
    spread: 0.015,
    pelletsPerShot: 1,
    range: 65,
    projectileSpeed: 0,
    recoilKick: 0.03,
    accentColor: "#34d399",
    soundType: "pistol",
  },
  ticket_gatling: {
    id: "ticket_gatling",
    nameAz: "RJ-45 Kabel & Bilet Pulemyotu",
    nameEn: "RJ-45 Spike Gatling",
    role: "helpdesk",
    isPrimary: true,
    damageBody: 20,
    damageHead: 36,
    fireRateRpm: 600,
    magSize: 36,
    reloadTimeSec: 1.4,
    spread: 0.02,
    pelletsPerShot: 1,
    range: 75,
    projectileSpeed: 0,
    zoomFovMultiplier: 0.8,
    recoilKick: 0.025,
    accentColor: "#00e5ff",
    soundType: "gatling",
  },
  p1_grenade: {
    id: "p1_grenade",
    nameAz: "P1 Kritik Xəta Qumbaratanı",
    nameEn: "P1 Escalation Grenade Launcher",
    role: "helpdesk",
    isPrimary: false,
    damageBody: 70,
    damageHead: 90,
    fireRateRpm: 80,
    magSize: 3,
    reloadTimeSec: 2.0,
    spread: 0.01,
    pelletsPerShot: 1,
    range: 50,
    projectileSpeed: 38,
    recoilKick: 0.06,
    accentColor: "#38bdf8",
    soundType: "grenade",
  },
  flak_shotgun: {
    id: "flak_shotgun",
    nameAz: "Server Şkafı Flak Tüfəngi",
    nameEn: "Server Rack Flak Shotgun",
    role: "it_admin",
    isPrimary: true,
    damageBody: 15, // x 8 pellets = 120 max
    damageHead: 24, // x 8 pellets = 192 max
    fireRateRpm: 85,
    magSize: 6,
    reloadTimeSec: 2.4,
    spread: 0.065,
    pelletsPerShot: 8,
    range: 40,
    projectileSpeed: 0,
    zoomFovMultiplier: 0.85,
    recoilKick: 0.12,
    accentColor: "#ffb800",
    soundType: "shotgun",
  },
  sudo_blaster: {
    id: "sudo_blaster",
    nameAz: "`sudo kill -9` Terminal Blaster",
    nameEn: "`sudo kill -9` Terminal Blaster",
    role: "it_admin",
    isPrimary: false,
    damageBody: 55,
    damageHead: 75,
    fireRateRpm: 120,
    magSize: 8,
    reloadTimeSec: 1.8,
    spread: 0.01,
    pelletsPerShot: 1,
    range: 60,
    projectileSpeed: 45,
    recoilKick: 0.05,
    accentColor: "#f59e0b",
    soundType: "blaster",
  },
};

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface PlayerInputPacket {
  seq: number;
  position: Vector3D;
  velocity: Vector3D;
  yaw: number;
  pitch: number;
  isSliding: boolean;
  isJumping: boolean;
  isShooting: boolean;
  activeWeapon: WeaponId;
}

export interface ShooterPlayer {
  id: string;
  userId?: string;
  name: string;
  isAi: boolean;
  role: ShooterRole;
  activeWeapon: WeaponId;
  position: Vector3D;
  velocity: Vector3D;
  yaw: number;
  pitch: number;
  health: number;
  maxHealth: number;
  shield: number;
  maxShield: number;
  ammo: number;
  maxAmmo: number;
  isReloading: boolean;
  isSliding: boolean;
  isJumping: boolean;
  isShieldActive: boolean;
  kills: number;
  deaths: number;
  streak: number;
  score: number;
  lastActive: number;
  respawnTimeRemaining?: number; // seconds
}

export interface KillfeedEntry {
  id: string;
  killerId: string;
  killerName: string;
  killerRole: ShooterRole;
  victimId: string;
  victimName: string;
  victimRole: ShooterRole;
  weaponId: WeaponId;
  isHeadshot: boolean;
  timestamp: number;
}

export interface PickupItem {
  id: string;
  type: "health" | "ammo" | "overclock";
  position: Vector3D;
  isAvailable: boolean;
  respawnInSec: number;
}

export interface ShooterLobbyState {
  lobbyId: string;
  mapName: string;
  players: Record<string, ShooterPlayer>;
  killfeed: KillfeedEntry[];
  pickups: PickupItem[];
  matchDurationSec: number;
  serverTime: number;
}

export interface ShotActionPayload {
  weaponId: WeaponId;
  origin: Vector3D;
  direction: Vector3D;
  hitPlayerId?: string;
  hitPart?: "head" | "body" | "limb";
  hitDistance?: number;
}

export interface AbilityActionPayload {
  abilityType: "dash" | "slam" | "ult";
  position: Vector3D;
}

export const ARENA_BOUNDS = {
  minX: -28,
  maxX: 28,
  minZ: -28,
  maxZ: 28,
  floorY: 0,
  catwalkY: 5.5,
};

export const SPAWN_POINTS: Vector3D[] = [
  { x: -22, y: 0, z: -22 },
  { x: 22, y: 0, z: -22 },
  { x: -22, y: 0, z: 22 },
  { x: 22, y: 0, z: 22 },
  { x: 0, y: 0, z: -24 },
  { x: 0, y: 0, z: 24 },
  { x: -20, y: 5.5, z: 0 },
  { x: 20, y: 5.5, z: 0 },
  { x: 0, y: 5.5, z: 0 },
];

export const JUMP_PADS: { id: string; x: number; z: number; boostY: number; boostHoriz?: Vector3D }[] = [
  { id: "pad-nw", x: -16, z: -16, boostY: 14, boostHoriz: { x: 8, y: 0, z: 8 } },
  { id: "pad-ne", x: 16, z: -16, boostY: 14, boostHoriz: { x: -8, y: 0, z: 8 } },
  { id: "pad-sw", x: -16, z: 16, boostY: 14, boostHoriz: { x: 8, y: 0, z: -8 } },
  { id: "pad-se", x: 16, z: 16, boostY: 14, boostHoriz: { x: -8, y: 0, z: -8 } },
  { id: "pad-center", x: 0, z: 0, boostY: 17 },
];
