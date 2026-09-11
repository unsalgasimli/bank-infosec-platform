import {
  generateUpgradeOptions,
  type CyberUpgrade,
} from "./cyber-upgrades.js";

export type ThreatKind =
  | "phishing"
  | "trojan"
  | "ransomware"
  | "ddos"
  | "stealth"
  | "buffer_overflow"
  | "cryptolocker"
  | "mitm_proxy"
  | "polymorphic_worm"
  | "worm_fragment"
  | "boss";

export type DropKind = "coin" | "emp" | "shield";

export interface CyberThreat {
  id: number;
  kind: ThreatKind;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  maxHp: number;
  points: number;
  oscillationPhase?: number;
  isBoss?: boolean;
  bossType?: "phishing_master" | "ransomware_cartel" | "quantum_leviathan";
  cloaked?: boolean;
  stunTimer?: number;
  tetherActive?: boolean;
  overflowTriggered?: boolean;
}

export interface CyberLaser {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  damage: number;
  pierceLeft: number;
  isCrit?: boolean;
  isDroneShot?: boolean;
  bouncesLeft?: number;
}

export interface CyberDrop {
  id: number;
  kind: DropKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  rotation: number;
}

export interface CyberParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  alpha: number;
  decay: number;
}

export interface FloatingText {
  id: number;
  text: string;
  x: number;
  y: number;
  vy: number;
  color: string;
  alpha: number;
  scale: number;
}

export interface CyberMine {
  id: number;
  x: number;
  y: number;
  timer: number;
}

export interface WaveConfig {
  wave: number;
  name: { en: string; az: string };
  subtitle: { en: string; az: string };
  targetCount: number;
  threatRoster: ThreatKind[];
  speedBase: number;
  spawnRate: number;
  isBossWave?: boolean;
  bossType?: "phishing_master" | "ransomware_cartel" | "quantum_leviathan";
}

export interface CyberDefenseState {
  status: "ready" | "playing" | "gameover";
  score: number;
  best: number;
  wave: number;
  waveProgress: number;
  waveTarget: number;
  waveState: "briefing" | "spawning" | "upgrading" | "cleared";
  waveBriefingTime: number;
  currentWaveConfig: WaveConfig;
  playerX: number;
  playerTargetX: number;
  shields: number;
  maxShields: number;
  vaultBarrier: number;
  maxVaultBarrier: number;
  invulnerableTime: number;
  comboStreak: number;
  multiplier: number;
  threats: CyberThreat[];
  lasers: CyberLaser[];
  drops: CyberDrop[];
  particles: CyberParticle[];
  floatingTexts: FloatingText[];
  mines: CyberMine[];
  mineCooldown: number;
  orbitalAngle: number;
  shakeTime: number;
  shakeMagnitude: number;
  fireCooldown: number;
  threatsNeutralized: number;
  coinsCollected: number;

  // Upgrades & Arsenal
  activeUpgrades: Record<string, number>;
  upgradeOptions: CyberUpgrade[];
  droneAngle: number;
  droneFireCooldown: number;
  regenTimer: number;
  emergencyEmpUsedThisWave: boolean;
}

let nextId = 1;

export const WAVE_DATABASE: WaveConfig[] = [
  {
    wave: 1,
    name: { en: "Perimeter Sweep", az: "Perimetr Təmizlənməsi" },
    subtitle: {
      en: "Scouting phishing packets detected at outer firewall.",
      az: "Xarici firewall sərhədində kəşfiyyat fişinq paketləri aşkarlandı.",
    },
    targetCount: 8,
    threatRoster: ["phishing"],
    speedBase: 70,
    spawnRate: 1.6,
  },
  {
    wave: 2,
    name: { en: "Credential Spray", az: "Giriş Məlumatları Axını" },
    subtitle: {
      en: "Automated brute-force probes targeting login portals.",
      az: "Giriş portallarına yönəlmiş avtomatlaşdırılmış sınaqlar.",
    },
    targetCount: 11,
    threatRoster: ["phishing", "phishing", "ddos"],
    speedBase: 80,
    spawnRate: 1.4,
  },
  {
    wave: 3,
    name: { en: "Polymorphic Mutation", az: "Polimorfik Zərərverici İnfeksiyası" },
    subtitle: {
      en: "Mutating worms that fragment into agile secondary payloads upon defeat.",
      az: "Məhv edildikdə çevik mini-paketlərə parçalanan mutasiyalı soxulcanlar.",
    },
    targetCount: 13,
    threatRoster: ["phishing", "polymorphic_worm", "ddos"],
    speedBase: 85,
    spawnRate: 1.3,
  },
  {
    wave: 4,
    name: { en: "Buffer Overflow Rush", az: "RAM Bufer Daşması Hücumu" },
    subtitle: {
      en: "High-velocity kinetic overflow probes accelerating upon lock-on.",
      az: "Hədəf aldıqda kəskin sürətlənən yüksək kinetik bufer daşması raketləri.",
    },
    targetCount: 16,
    threatRoster: ["trojan", "buffer_overflow", "ddos"],
    speedBase: 90,
    spawnRate: 1.2,
  },
  {
    wave: 5,
    name: { en: "MINI-BOSS: Dark Web Broker", az: "MİNİ-BOSS: Dark Web Brokeri" },
    subtitle: {
      en: "High-value coordinator firing encrypted packets with rush escorts.",
      az: "Sürətli raket mühafizəçiləri ilə hücum edən təhdid rəhbəri.",
    },
    targetCount: 14,
    threatRoster: ["buffer_overflow", "ddos", "trojan"],
    speedBase: 95,
    spawnRate: 1.2,
    isBossWave: true,
    bossType: "phishing_master",
  },
  {
    wave: 6,
    name: { en: "Ransomware Enclave", az: "Ransomware Zirehliləri" },
    subtitle: {
      en: "Armored cryptolocker tanks with reinforced data shells.",
      az: "Möhkəm məlumat qabıqlı zirehli şifrələyici tanklar.",
    },
    targetCount: 17,
    threatRoster: ["ransomware", "buffer_overflow", "phishing"],
    speedBase: 100,
    spawnRate: 1.15,
  },
  {
    wave: 7,
    name: { en: "MITM Proxy Interception", az: "Ortadakı Adam (MITM) Proksi Zərbəsi" },
    subtitle: {
      en: "Deflector-shielded proxy nodes neutralizing frontal laser fire.",
      az: "Ön lazer atəşini dəf edən enerjili qoruyucu sipərli proksi qovşaqları.",
    },
    targetCount: 18,
    threatRoster: ["mitm_proxy", "stealth", "polymorphic_worm"],
    speedBase: 105,
    spawnRate: 1.1,
  },
  {
    wave: 8,
    name: { en: "Zero-Day Stealth Swarm", az: "Gizli Sıfırıncı Gün Legionu" },
    subtitle: {
      en: "Cloaked malware packets evading heuristic signatures.",
      az: "Evristik imzalardan yayınan maskalanmış zərərvericilər.",
    },
    targetCount: 22,
    threatRoster: ["stealth", "buffer_overflow", "mitm_proxy"],
    speedBase: 115,
    spawnRate: 0.95,
  },
  {
    wave: 9,
    name: { en: "Cryptolocker Vault Siege", az: "Cryptolocker Kassa Blokadası" },
    subtitle: {
      en: "Heavy ransomware units projecting data tethers that drain ship agility.",
      az: "Gəmiyə şifrəli bağ ataraq manevr sürətini zəiflədən ağır təhdidlər.",
    },
    targetCount: 20,
    threatRoster: ["cryptolocker", "mitm_proxy", "polymorphic_worm"],
    speedBase: 110,
    spawnRate: 1.0,
  },
  {
    wave: 10,
    name: { en: "MINI-BOSS: Ransomware Dreadnought", az: "MİNİ-BOSS: Ransomware Sindikatı" },
    subtitle: {
      en: "Heavy armored payload vessel deploying encrypted cruise missiles.",
      az: "Şifrəli raketlər buraxan ağır zirehli sindikat kreyseri.",
    },
    targetCount: 16,
    threatRoster: ["cryptolocker", "buffer_overflow", "mitm_proxy"],
    speedBase: 110,
    spawnRate: 1.1,
    isBossWave: true,
    bossType: "ransomware_cartel",
  },
  {
    wave: 11,
    name: { en: "State-Sponsored APT-42", az: "Dövlət Dəstəkli APT-42" },
    subtitle: {
      en: "Advanced persistent threat actor utilizing multi-vector logic.",
      az: "Çoxvektorlu məntiqlə hücum edən qabaqcıl hədəfli təhlükə qrupu.",
    },
    targetCount: 24,
    threatRoster: ["stealth", "cryptolocker", "buffer_overflow", "mitm_proxy"],
    speedBase: 125,
    spawnRate: 0.9,
  },
  {
    wave: 12,
    name: { en: "Supply Chain Contagion", az: "Təchizat Zənciri Zəhərlənməsi" },
    subtitle: {
      en: "Cascading polymorphic code replicating aggressively across channels.",
      az: "Bütün kanallar üzrə kütləvi çoxalan polimorfik virus infeksiyası.",
    },
    targetCount: 26,
    threatRoster: ["polymorphic_worm", "buffer_overflow", "ransomware", "ddos"],
    speedBase: 130,
    spawnRate: 0.85,
  },
  {
    wave: 13,
    name: { en: "Deepfake Biometric Bypass", az: "Deepfake Biometrik Aldatma" },
    subtitle: {
      en: "Illusionary decoy streams disguising heavy cryptolocker siege units.",
      az: "Ağır şifrələyiciləri maskalayan illüziya xarakterli aldadıcı axınlar.",
    },
    targetCount: 28,
    threatRoster: ["stealth", "cryptolocker", "mitm_proxy", "buffer_overflow"],
    speedBase: 135,
    spawnRate: 0.8,
  },
  {
    wave: 14,
    name: { en: "Mainframe Meltdown Precursor", az: "Server Qəzası Ərəfəsi" },
    subtitle: {
      en: "Overwhelming multi-class assault threatening vault containment.",
      az: "Bank kassanın saxlanma sistemini təhdid edən kütləvi hücum.",
    },
    targetCount: 32,
    threatRoster: [
      "buffer_overflow",
      "cryptolocker",
      "mitm_proxy",
      "polymorphic_worm",
      "stealth",
      "ransomware",
    ],
    speedBase: 140,
    spawnRate: 0.72,
  },
  {
    wave: 15,
    name: {
      en: "FINAL BOSS: Quantum AI Leviathan",
      az: "BÖYÜK BOSS: Kvant Süni İntellekt Leviatanı",
    },
    subtitle: {
      en: "Autonomous self-evolving quantum core assaulting Tier-1 vault.",
      az: "1-ci dərəcəli bank kassasına hücum edən kvant süni intellekt nəhəngi.",
    },
    targetCount: 18,
    threatRoster: ["cryptolocker", "buffer_overflow", "mitm_proxy", "stealth"],
    speedBase: 115,
    spawnRate: 0.95,
    isBossWave: true,
    bossType: "quantum_leviathan",
  },
];

export function getWaveConfig(wave: number): WaveConfig {
  if (wave <= 15) {
    return WAVE_DATABASE[wave - 1];
  }
  return {
    wave,
    name: {
      en: `Prestige Wave ${wave}: Autonomous Zero-Trust`,
      az: `Prestij Dalğa ${wave}: Avtonom Sıfır-Etibar`,
    },
    subtitle: {
      en: "Infinite algorithmic siege against the Expressbank Core Vault.",
      az: "Expressbank Əsas Kassasına qarşı sonsuz alqoritmik mühasirə.",
    },
    targetCount: 26 + (wave - 15) * 3,
    threatRoster: ["cryptolocker", "buffer_overflow", "mitm_proxy", "polymorphic_worm", "stealth"],
    speedBase: Math.min(170, 140 + (wave - 15) * 3),
    spawnRate: Math.max(0.45, 0.75 - (wave - 15) * 0.03),
    isBossWave: wave % 5 === 0,
    bossType: "quantum_leviathan",
  };
}

export function createCyberDefenseState(best = 0): CyberDefenseState {
  const initialWaveConfig = getWaveConfig(1);
  return {
    status: "ready",
    score: 0,
    best,
    wave: 1,
    waveProgress: 0,
    waveTarget: initialWaveConfig.targetCount,
    waveState: "briefing",
    waveBriefingTime: 2.2,
    currentWaveConfig: initialWaveConfig,
    playerX: 0.5,
    playerTargetX: 0.5,
    shields: 4,
    maxShields: 4,
    vaultBarrier: 3,
    maxVaultBarrier: 3,
    invulnerableTime: 0,
    comboStreak: 0,
    multiplier: 1,
    threats: [],
    lasers: [],
    drops: [],
    particles: [],
    floatingTexts: [],
    mines: [],
    mineCooldown: 6.0,
    orbitalAngle: 0,
    shakeTime: 0,
    shakeMagnitude: 0,
    fireCooldown: 0,
    threatsNeutralized: 0,
    coinsCollected: 0,
    activeUpgrades: {},
    upgradeOptions: [],
    droneAngle: 0,
    droneFireCooldown: 0,
    regenTimer: 0,
    emergencyEmpUsedThisWave: false,
  };
}

export function startCyberGame(prev: CyberDefenseState): CyberDefenseState {
  return {
    ...createCyberDefenseState(prev.best),
    status: "playing",
    waveBriefingTime: 2.0,
  };
}

export function getComboMultiplier(streak: number): number {
  if (streak >= 35) return 10;
  if (streak >= 20) return 5;
  if (streak >= 10) return 3;
  if (streak >= 5) return 2;
  return 1;
}

export function spawnThreat(config: WaveConfig, width: number, forceBoss = false): CyberThreat {
  let kind: ThreatKind = "phishing";

  if (forceBoss && config.bossType) {
    kind = "boss";
  } else {
    const roster = config.threatRoster;
    kind = roster[Math.floor(Math.random() * roster.length)] || "phishing";
  }

  const radiusMap: Record<ThreatKind, number> = {
    phishing: 15,
    ddos: 14,
    trojan: 20,
    stealth: 16,
    buffer_overflow: 16,
    cryptolocker: 24,
    mitm_proxy: 20,
    polymorphic_worm: 18,
    worm_fragment: 10,
    ransomware: 26,
    boss: 48,
  };

  const hpMap: Record<ThreatKind, number> = {
    phishing: 1,
    ddos: 1,
    trojan: 2,
    stealth: 2,
    buffer_overflow: 2,
    cryptolocker: 8,
    mitm_proxy: 4,
    polymorphic_worm: 3,
    worm_fragment: 1,
    ransomware: 4,
    boss:
      config.bossType === "quantum_leviathan"
        ? 50
        : config.bossType === "ransomware_cartel"
          ? 35
          : 22,
  };

  const pointsMap: Record<ThreatKind, number> = {
    phishing: 100,
    ddos: 140,
    trojan: 220,
    stealth: 260,
    buffer_overflow: 300,
    cryptolocker: 650,
    mitm_proxy: 450,
    polymorphic_worm: 350,
    worm_fragment: 150,
    ransomware: 420,
    boss: 4000,
  };

  const speedBase = config.speedBase;
  let vy = speedBase * 0.95;
  if (kind === "boss") {
    vy = 30;
  } else if (kind === "phishing") {
    vy = speedBase * 1.15;
  } else if (kind === "stealth") {
    vy = speedBase * 1.25;
  } else if (kind === "buffer_overflow") {
    vy = speedBase * 1.35;
  } else if (kind === "cryptolocker") {
    vy = speedBase * 0.70;
  } else if (kind === "mitm_proxy") {
    vy = speedBase * 0.90;
  } else if (kind === "polymorphic_worm") {
    vy = speedBase * 1.05;
  } else if (kind === "worm_fragment") {
    vy = speedBase * 1.38;
  }

  const radius = radiusMap[kind];
  const margin = radius + 25;
  const x = margin + Math.random() * (width - margin * 2);

  return {
    id: nextId++,
    kind,
    name: kind.toUpperCase(),
    x,
    y: -radius - 12,
    vx: (Math.random() - 0.5) * (kind === "ddos" ? 85 : kind === "stealth" ? 55 : 25),
    vy,
    radius,
    hp: hpMap[kind],
    maxHp: hpMap[kind],
    points: pointsMap[kind],
    oscillationPhase: Math.random() * Math.PI * 2,
    isBoss: kind === "boss",
    bossType: kind === "boss" ? config.bossType : undefined,
    cloaked: kind === "stealth",
  };
}

/**
 * Highly optimized particle spawner. Uses small count (6-12) and fast decay.
 */
export function spawnExplosion(
  x: number,
  y: number,
  color: string,
  count = 6,
): CyberParticle[] {
  const particles: CyberParticle[] = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 70 + Math.random() * 160;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      color,
      size: 2.5 + Math.random() * 2,
      alpha: 1,
      decay: 2.4 + Math.random() * 1.6, // Fades out in ~0.35s
    });
  }
  return particles;
}

/**
 * Fires player lasers incorporating Diep.io-style multi-barrel upgrades
 */
export function fireLasers(
  state: CyberDefenseState,
  width: number,
  height: number,
): CyberDefenseState {
  if (state.status !== "playing" || state.fireCooldown > 0) return state;

  const playerPxX = state.playerX * width;
  const playerPxY = height - 60;
  const upgrades = state.activeUpgrades;

  // Base fire rate calculations:
  // Deliberate, tactical starting cooldown (0.28s ~ 3.57 shots/sec)
  // Immensely expandable down to 0.045s (~22 shots/sec hyper gatling) with upgrades!
  const vulcanLvl = upgrades.rapid_vulcan || 0;
  const coolingLvl = upgrades.accelerator_cooling || 0;
  const legendarySingularity = upgrades.quantum_overdrive ? 0.06 : 0;
  const cooldownReduction = vulcanLvl * 0.038 + coolingLvl * 0.032 + legendarySingularity;
  const fireCooldown = Math.max(0.045, 0.28 - cooldownReduction);

  // Critical Strike Roll
  const critLvl = upgrades.golden_critical_protocol || 0;
  const isCrit = critLvl > 0 && Math.random() < 0.25 * critLvl;
  const baseColor = isCrit ? "#FFD700" : "#FAA61A";
  const damage = isCrit ? 3 : 1;

  // Piercing Railgun
  const railgunLvl = upgrades.plasma_railgun || 0;
  const pierceCount = railgunLvl > 0 ? railgunLvl + 1 : 1;
  const finalColor = railgunLvl > 0 && !isCrit ? "#00E5FF" : baseColor;

  // Bouncing Ricochet
  const bouncesLeft = (upgrades.bouncing_lasers || 0) * 2;

  const newLasers: CyberLaser[] = [];

  if (upgrades.pentashot) {
    const angles = [-26, -13, 0, 13, 26];
    angles.forEach((deg) => {
      const rad = (deg * Math.PI) / 180;
      const speed = 980;
      newLasers.push({
        id: nextId++,
        x: playerPxX + Math.sin(rad) * 16,
        y: playerPxY - 14,
        vx: Math.sin(rad) * speed,
        vy: -Math.cos(rad) * speed,
        color: finalColor,
        damage,
        pierceLeft: pierceCount,
        isCrit,
        bouncesLeft,
      });
    });
  } else if (upgrades.triple_spread) {
    const angles = [-18, 0, 18];
    angles.forEach((deg) => {
      const rad = (deg * Math.PI) / 180;
      const speed = 960;
      newLasers.push({
        id: nextId++,
        x: playerPxX + Math.sin(rad) * 14,
        y: playerPxY - 14,
        vx: Math.sin(rad) * speed,
        vy: -Math.cos(rad) * speed,
        color: finalColor,
        damage,
        pierceLeft: pierceCount,
        isCrit,
        bouncesLeft,
      });
    });
  } else if (upgrades.twin_cannons) {
    const offset = 22;
    newLasers.push(
      {
        id: nextId++,
        x: playerPxX - offset,
        y: playerPxY - 14,
        vx: 0,
        vy: -940,
        color: finalColor,
        damage,
        pierceLeft: pierceCount,
        isCrit,
        bouncesLeft,
      },
      {
        id: nextId++,
        x: playerPxX + offset,
        y: playerPxY - 14,
        vx: 0,
        vy: -940,
        color: finalColor,
        damage,
        pierceLeft: pierceCount,
        isCrit,
        bouncesLeft,
      },
    );
  } else {
    const offset = 16;
    newLasers.push(
      {
        id: nextId++,
        x: playerPxX - offset,
        y: playerPxY - 14,
        vx: 0,
        vy: -920,
        color: finalColor,
        damage,
        pierceLeft: pierceCount,
        isCrit,
        bouncesLeft,
      },
      {
        id: nextId++,
        x: playerPxX + offset,
        y: playerPxY - 14,
        vx: 0,
        vy: -920,
        color: finalColor,
        damage,
        pierceLeft: pierceCount,
        isCrit,
        bouncesLeft,
      },
    );
  }

  return {
    ...state,
    lasers: [...state.lasers, ...newLasers],
    fireCooldown,
  };
}

/**
 * Apply a selected upgrade and advance to the next wave
 */
export function applyUpgradeChoice(
  state: CyberDefenseState,
  upgrade: CyberUpgrade,
): CyberDefenseState {
  const activeUpgrades = {
    ...state.activeUpgrades,
    [upgrade.id]: (state.activeUpgrades[upgrade.id] || 0) + 1,
  };

  let maxShields = state.maxShields;
  let shields = state.shields;
  let maxVaultBarrier = state.maxVaultBarrier;

  if (upgrade.id === "hardened_firewall") {
    maxShields += 1;
    shields = Math.min(maxShields, shields + 2);
  } else if (upgrade.id === "perimeter_barrier") {
    maxVaultBarrier += 2;
  } else if (upgrade.id === "quantum_overdrive") {
    maxShields += 1;
    shields = Math.min(maxShields, shields + 1);
  }

  const nextWaveNum = state.wave + 1;
  const nextWaveCfg = getWaveConfig(nextWaveNum);

  return {
    ...state,
    wave: nextWaveNum,
    currentWaveConfig: nextWaveCfg,
    waveState: "briefing",
    waveBriefingTime: 2.4,
    waveProgress: 0,
    waveTarget: nextWaveCfg.targetCount,
    activeUpgrades,
    upgradeOptions: [],
    maxShields,
    shields,
    maxVaultBarrier,
    vaultBarrier: maxVaultBarrier,
    emergencyEmpUsedThisWave: false,
    floatingTexts: [
      {
        id: nextId++,
        text: `UPGRADED: ${upgrade.name.en.toUpperCase()}`,
        x: 400,
        y: 280,
        vy: -40,
        color: upgrade.color,
        alpha: 1,
        scale: 1.3,
      },
    ],
  };
}

/**
 * Executes an EMP blast across active threats.
 * Heavy threats and bosses survive with significant damage and disruption stun,
 * while light swarm threats are instantly neutralized.
 */
export function executeEmpBlast(
  threats: CyberThreat[],
  width: number,
  height: number,
  dividendMult: number,
  empBonus: number,
  isEmergency = false,
): {
  survivingThreats: CyberThreat[];
  scoreGained: number;
  neutralizedCount: number;
  particles: CyberParticle[];
  floatingTexts: FloatingText[];
} {
  const survivingThreats: CyberThreat[] = [];
  const particles: CyberParticle[] = [];
  const floatingTexts: FloatingText[] = [];
  let scoreGained = empBonus;
  let neutralizedCount = 0;

  for (let i = 0; i < threats.length; i++) {
    const t = threats[i];

    if (t.isBoss || t.kind === "boss") {
      // Boss: Stunned for 2.0s, take -25% of max HP (minimum 12 dmg), NEVER one-shot!
      const damage = Math.max(12, Math.round(t.maxHp * 0.25));
      const remainingHp = t.hp - damage;
      particles.push(...spawnExplosion(t.x, t.y, "#00E5FF", 12));

      if (remainingHp <= 0) {
        neutralizedCount++;
        scoreGained += Math.round(t.points * dividendMult);
        floatingTexts.push({
          id: nextId++,
          text: `BOSS CRUSHED BY EMP!`,
          x: t.x,
          y: t.y - 30,
          vy: -45,
          color: "#00E5FF",
          alpha: 1,
          scale: 1.4,
        });
      } else {
        survivingThreats.push({
          ...t,
          hp: remainingHp,
          stunTimer: 2.0,
        });
        floatingTexts.push({
          id: nextId++,
          text: `EMP STUN & -${damage} HP!`,
          x: t.x,
          y: t.y - 35,
          vy: -45,
          color: "#00E5FF",
          alpha: 1,
          scale: 1.3,
        });
      }
    } else if (
      t.kind === "cryptolocker" ||
      t.kind === "ransomware" ||
      t.kind === "mitm_proxy"
    ) {
      // Heavy threat: -4 HP and stunned for 1.6s
      const damage = 4;
      const remainingHp = t.hp - damage;
      particles.push(...spawnExplosion(t.x, t.y, "#00E5FF", 8));

      if (remainingHp <= 0) {
        neutralizedCount++;
        scoreGained += Math.round(t.points * dividendMult);
        floatingTexts.push({
          id: nextId++,
          text: `HEAVY THREAT PURGED!`,
          x: t.x,
          y: t.y - 20,
          vy: -40,
          color: "#00E5FF",
          alpha: 1,
          scale: 1.2,
        });
      } else {
        survivingThreats.push({
          ...t,
          hp: remainingHp,
          stunTimer: 1.6,
        });
        floatingTexts.push({
          id: nextId++,
          text: `EMP DISRUPTED -4 HP`,
          x: t.x,
          y: t.y - 25,
          vy: -40,
          color: "#00E5FF",
          alpha: 1,
          scale: 1.15,
        });
      }
    } else {
      // Light threats & minions: vaporized by EMP!
      neutralizedCount++;
      scoreGained += Math.round(t.points * dividendMult);
      particles.push(...spawnExplosion(t.x, t.y, "#00E5FF", 5));
    }
  }

  floatingTexts.push({
    id: nextId++,
    text: isEmergency ? "EMERGENCY EMP DEFENSE MATRIX!" : "EMP SECURITY BLAST!",
    x: width * 0.5,
    y: height * 0.5,
    vy: -40,
    color: "#00E5FF",
    alpha: 1,
    scale: 1.4,
  });

  return {
    survivingThreats,
    scoreGained,
    neutralizedCount,
    particles,
    floatingTexts,
  };
}

/**
 * Main 60FPS physics and state tick with optimized, zero-allocation loops
 */
export function advanceCyberDefense(
  prev: CyberDefenseState,
  dt: number,
  width: number,
  height: number,
): CyberDefenseState {
  if (prev.status !== "playing") return prev;

  const boundedDt = Math.min(dt, 0.05);

  let {
    score,
    best,
    wave,
    waveProgress,
    waveTarget,
    waveState,
    waveBriefingTime,
    currentWaveConfig,
    playerX,
    playerTargetX,
    shields,
    maxShields,
    vaultBarrier,
    maxVaultBarrier,
    invulnerableTime,
    comboStreak,
    threats,
    lasers,
    drops,
    particles,
    floatingTexts,
    mines,
    mineCooldown,
    orbitalAngle,
    shakeTime,
    shakeMagnitude,
    fireCooldown,
    threatsNeutralized,
    coinsCollected,
    activeUpgrades,
    upgradeOptions,
    droneAngle,
    droneFireCooldown,
    regenTimer,
    emergencyEmpUsedThisWave,
  } = prev;

  if (waveState === "upgrading") {
    return prev;
  }

  // 1. Player Movement & Agility Scaling
  // Check if tethered by any Cryptolocker
  const isTethered = threats.some((th) => th.kind === "cryptolocker" && th.tetherActive);

  // Deliberate, tactical starting movement speed (13.5), heavily scalable with upgrades!
  const agilityBonus =
    (activeUpgrades.overdrive_thrusters || 0) * 0.28 +
    (activeUpgrades.vector_afterburners || 0) * 0.40 +
    (activeUpgrades.quantum_overdrive ? 0.45 : 0);

  let moveSpeed = 13.5 * (1 + agilityBonus);
  if (isTethered) {
    moveSpeed *= 0.65; // Agility suppressed by Cryptolocker encrypted tether!
  }

  playerX += (playerTargetX - playerX) * Math.min(1, boundedDt * moveSpeed);
  playerX = Math.max(0.06, Math.min(0.94, playerX));

  invulnerableTime = Math.max(0, invulnerableTime - boundedDt);
  fireCooldown = Math.max(0, fireCooldown - boundedDt);
  shakeTime = Math.max(0, shakeTime - boundedDt);

  // 2. Orbital Shield Rotation
  if (activeUpgrades.orbital_shield) {
    orbitalAngle = (orbitalAngle + boundedDt * 3.6) % (Math.PI * 2);
  }

  // 3. Proximity Cyber Mines
  if (activeUpgrades.cyber_mines) {
    mineCooldown -= boundedDt;
    if (mineCooldown <= 0 && mines.length < 4) {
      mineCooldown = 6.0;
      mines.push({
        id: nextId++,
        x: playerX * width,
        y: height - 85,
        timer: 15.0,
      });
    }
  }

  // 4. Nanite Auto-Regeneration
  const naniteLvl = activeUpgrades.nanite_regeneration || 0;
  if (naniteLvl > 0 && shields < maxShields) {
    regenTimer += boundedDt;
    const interval = naniteLvl === 2 ? 14 : 18;
    if (regenTimer >= interval) {
      regenTimer = 0;
      shields = Math.min(maxShields, shields + 1);
      particles.push(...spawnExplosion(playerX * width, height - 60, "#00E676", 6));
      floatingTexts.push({
        id: nextId++,
        text: "NANITE REPAIR!",
        x: playerX * width,
        y: height - 90,
        vy: -40,
        color: "#00E676",
        alpha: 1,
        scale: 1.1,
      });
    }
  }

  // 5. Autonomous Companion Drones
  const droneLvl = activeUpgrades.crypto_drones || 0;
  if (droneLvl > 0) {
    droneAngle = (droneAngle + boundedDt * 3.2) % (Math.PI * 2);
    droneFireCooldown -= boundedDt;

    if (droneFireCooldown <= 0 && threats.length > 0) {
      droneFireCooldown = 0.36;
      const playerPxX = playerX * width;
      const playerPxY = height - 60;
      const droneCount = droneLvl;

      for (let i = 0; i < droneCount; i++) {
        const offsetAngle = droneAngle + (i * Math.PI);
        const dX = playerPxX + Math.cos(offsetAngle) * 44;
        const dY = playerPxY + Math.sin(offsetAngle) * 32;

        let nearest: CyberThreat | null = null;
        let minDist = Infinity;
        for (let tIdx = 0; tIdx < threats.length; tIdx++) {
          const t = threats[tIdx];
          const dist = Math.hypot(t.x - dX, t.y - dY);
          if (dist < minDist) {
            minDist = dist;
            nearest = t;
          }
        }

        if (nearest) {
          const angleToTarget = Math.atan2(nearest.y - dY, nearest.x - dX);
          const bulletSpeed = 950;
          lasers.push({
            id: nextId++,
            x: dX,
            y: dY,
            vx: Math.cos(angleToTarget) * bulletSpeed,
            vy: Math.sin(angleToTarget) * bulletSpeed,
            color: "#FFB300",
            damage: 1,
            pierceLeft: 1,
            isDroneShot: true,
          });
        }
      }
    }
  }

  // 6. Wave Progression
  if (waveState === "briefing") {
    waveBriefingTime -= boundedDt;
    if (waveBriefingTime <= 0) {
      waveState = "spawning";
      waveProgress = 0;
      waveTarget = currentWaveConfig.targetCount;

      if (currentWaveConfig.isBossWave) {
        threats.push(spawnThreat(currentWaveConfig, width, true));
      }
    }
  } else if (waveState === "spawning") {
    const spawnChance = boundedDt / currentWaveConfig.spawnRate;
    if (Math.random() < spawnChance && waveProgress < waveTarget) {
      threats.push(spawnThreat(currentWaveConfig, width, false));
      waveProgress++;
    }

    if (waveProgress >= waveTarget && threats.length === 0) {
      const bonus = wave * 600;
      score += bonus;
      floatingTexts.push({
        id: nextId++,
        text: `WAVE ${wave} DEFENDED! +${bonus}`,
        x: width * 0.5,
        y: height * 0.38,
        vy: -40,
        color: "#FAA61A",
        alpha: 1,
        scale: 1.4,
      });

      waveState = "upgrading";
      upgradeOptions = generateUpgradeOptions(activeUpgrades, wave);
    }
  }

  // 7. Move Lasers & Homing/Ricochet
  const hasHoming = (activeUpgrades.homing_seekers || 0) > 0;
  const nextLasers: CyberLaser[] = [];

  for (let i = 0; i < lasers.length; i++) {
    const l = lasers[i];

    // Homing logic
    if (hasHoming && !l.isDroneShot && threats.length > 0 && l.y > 60) {
      let nearestT: CyberThreat | null = null;
      let minD = 220;
      for (let j = 0; j < threats.length; j++) {
        const th = threats[j];
        if (th.y < l.y) {
          const d = Math.hypot(th.x - l.x, th.y - l.y);
          if (d < minD) {
            minD = d;
            nearestT = th;
          }
        }
      }
      if (nearestT) {
        const steerX = Math.sign(nearestT.x - l.x) * 220;
        l.vx += steerX * boundedDt * 8;
      }
    }

    l.x += l.vx * boundedDt;
    l.y += l.vy * boundedDt;

    // Ricochet off walls
    if (l.bouncesLeft && l.bouncesLeft > 0) {
      if (l.x <= 8) {
        l.x = 9;
        l.vx = Math.abs(l.vx || 120);
        l.bouncesLeft--;
      } else if (l.x >= width - 8) {
        l.x = width - 9;
        l.vx = -Math.abs(l.vx || 120);
        l.bouncesLeft--;
      }
    }

    if (l.y > -25 && l.x > -20 && l.x < width + 20) {
      nextLasers.push(l);
    }
  }
  lasers = nextLasers;

  // 8. Move Drops & Magnet Ingest
  const playerPxX = playerX * width;
  const playerPxY = height - 60;
  const playerCatchRadius = 38;
  const magnetLvl = activeUpgrades.token_magnetron || 0;
  const magnetRadius = magnetLvl === 2 ? 380 : magnetLvl === 1 ? 260 : 0;

  const nextDrops: CyberDrop[] = [];
  for (let i = 0; i < drops.length; i++) {
    const d = drops[i];

    if (magnetRadius > 0) {
      const distToPlayer = Math.hypot(playerPxX - d.x, playerPxY - d.y);
      if (distToPlayer < magnetRadius) {
        const pullAngle = Math.atan2(playerPxY - d.y, playerPxX - d.x);
        const pullSpeed = 420;
        d.vx += Math.cos(pullAngle) * pullSpeed * boundedDt * 5;
        d.vy += Math.sin(pullAngle) * pullSpeed * boundedDt * 5;
      }
    }

    d.x += d.vx * boundedDt;
    d.y += d.vy * boundedDt;
    d.rotation += boundedDt * 3.5;

    const dist = Math.hypot(d.x - playerPxX, d.y - playerPxY);

    if (dist < playerCatchRadius + d.radius) {
      const dividendMult = 1 + (activeUpgrades.crypto_dividend_boost || 0) * 0.5;
      if (d.kind === "coin") {
        const coinPoints = Math.round(180 * getComboMultiplier(comboStreak) * dividendMult);
        score += coinPoints;
        coinsCollected++;
        floatingTexts.push({
          id: nextId++,
          text: `+${coinPoints}`,
          x: d.x,
          y: d.y,
          vy: -50,
          color: "#FFD54F",
          alpha: 1,
          scale: 1.1,
        });
        particles.push(...spawnExplosion(d.x, d.y, "#FFD54F", 4));
      } else if (d.kind === "shield") {
        if (shields < maxShields) shields++;
        score += 350;
        floatingTexts.push({
          id: nextId++,
          text: "FIREWALL RESTORED!",
          x: d.x,
          y: d.y,
          vy: -50,
          color: "#4CAF50",
          alpha: 1,
          scale: 1.2,
        });
        particles.push(...spawnExplosion(d.x, d.y, "#4CAF50", 6));
      } else if (d.kind === "emp") {
        const empBonus = (activeUpgrades.emp_overcharge || 0) * 1200;
        const blastResult = executeEmpBlast(
          threats,
          width,
          height,
          dividendMult,
          empBonus,
          false,
        );
        threats = blastResult.survivingThreats;
        score += blastResult.scoreGained;
        threatsNeutralized += blastResult.neutralizedCount;
        particles.push(...blastResult.particles);
        floatingTexts.push(...blastResult.floatingTexts);
        shakeTime = 0.38;
        shakeMagnitude = 11;
      }
    } else if (d.y < height + 40) {
      nextDrops.push(d);
    }
  }
  drops = nextDrops;

  // 9. Cyber Mines Detonation
  const nextMines: CyberMine[] = [];
  for (let mIdx = 0; mIdx < mines.length; mIdx++) {
    const m = mines[mIdx];
    m.timer -= boundedDt;
    let detonated = false;

    for (let tIdx = 0; tIdx < threats.length; tIdx++) {
      const t = threats[tIdx];
      if (Math.hypot(t.x - m.x, t.y - m.y) < t.radius + 24) {
        detonated = true;
        break;
      }
    }

    if (detonated || m.timer <= 0) {
      if (detonated) {
        shakeTime = 0.25;
        shakeMagnitude = 7;
        particles.push(...spawnExplosion(m.x, m.y, "#FF5252", 10));
        floatingTexts.push({
          id: nextId++,
          text: "MINE DETONATED!",
          x: m.x,
          y: m.y - 20,
          vy: -40,
          color: "#FF5252",
          alpha: 1,
          scale: 1.2,
        });
        // Damage threats in radius 80
        for (let tIdx = 0; tIdx < threats.length; tIdx++) {
          const t = threats[tIdx];
          if (Math.hypot(t.x - m.x, t.y - m.y) < 80) {
            t.hp -= 3;
          }
        }
      }
    } else {
      nextMines.push(m);
    }
  }
  mines = nextMines;

  // 10. Move Threats, Collisions, Orbital Shield
  const remainingThreats: CyberThreat[] = [];
  const hitLaserIds = new Set<number>();
  const speedScale = activeUpgrades.glitch_dilation ? 0.8 : 1.0;

  // Orbital Shield position
  const orbX = activeUpgrades.orbital_shield
    ? playerPxX + Math.cos(orbitalAngle) * 48
    : -999;
  const orbY = activeUpgrades.orbital_shield
    ? playerPxY + Math.sin(orbitalAngle) * 36
    : -999;

  for (let i = 0; i < threats.length; i++) {
    const t = threats[i];
    let tX = t.x + t.vx * boundedDt * speedScale;
    let tY = t.y + t.vy * boundedDt * speedScale;
    let tHp = t.hp;

    // Handle Stun Timer from EMP
    if (t.stunTimer && t.stunTimer > 0) {
      t.stunTimer -= boundedDt;
      if (Math.random() < 0.25) {
        particles.push(...spawnExplosion(tX, tY, "#00E5FF", 1));
      }
      // Stunned enemy stays stationary for duration
      remainingThreats.push({ ...t, x: tX, y: tY, hp: tHp });
      continue;
    }

    // Threat Specific Mechanics
    if (t.kind === "ddos") {
      const phase = (t.oscillationPhase ?? 0) + boundedDt * 5;
      tX += Math.sin(phase) * 65 * boundedDt;
      t.oscillationPhase = phase;
    } else if (t.kind === "polymorphic_worm") {
      const phase = (t.oscillationPhase ?? 0) + boundedDt * 6;
      tX += Math.sin(phase) * 75 * boundedDt;
      t.oscillationPhase = phase;
    } else if (t.kind === "buffer_overflow") {
      // Accelerates downward violently if aligned with player
      if (!t.overflowTriggered && Math.abs(tX - playerPxX) < 48 && tY > 40 && tY < height - 140) {
        t.overflowTriggered = true;
        t.vy += 260;
        floatingTexts.push({
          id: nextId++,
          text: "RAM OVERFLOW RUSH!",
          x: tX,
          y: tY - 15,
          vy: -35,
          color: "#FF3D00",
          alpha: 1,
          scale: 1.1,
        });
      }
      if (t.overflowTriggered && Math.random() < 0.35) {
        particles.push({
          x: tX,
          y: tY - t.radius,
          vx: (Math.random() - 0.5) * 20,
          vy: -80,
          color: "#FF5722",
          size: 2,
          alpha: 0.9,
          decay: 3.5,
        });
      }
    } else if (t.kind === "cryptolocker") {
      // Emits tether if within 330px
      const distToPlayer = Math.hypot(tX - playerPxX, tY - playerPxY);
      t.tetherActive = distToPlayer < 330 && tY < playerPxY - 20;
    }

    if (tX < t.radius) {
      tX = t.radius;
      t.vx = Math.abs(t.vx);
    } else if (tX > width - t.radius) {
      tX = width - t.radius;
      t.vx = -Math.abs(t.vx);
    }

    // Check Orbital Shield Collision
    if (activeUpgrades.orbital_shield) {
      if (Math.hypot(tX - orbX, tY - orbY) < t.radius + 14) {
        tHp -= 4;
        particles.push(...spawnExplosion(orbX, orbY, "#00B0FF", 4));
      }
    }

    // Laser collision checks
    for (let lIdx = 0; lIdx < lasers.length; lIdx++) {
      const l = lasers[lIdx];
      if (hitLaserIds.has(l.id)) continue;
      if (Math.hypot(l.x - tX, l.y - tY) < t.radius + 9) {
        // MITM Proxy frontal shield check:
        // Deflects non-piercing / non-crit lasers coming from below
        const isFrontalHit = l.y > tY && Math.abs(l.x - tX) < t.radius * 0.78;
        if (t.kind === "mitm_proxy" && isFrontalHit && !l.isCrit && l.pierceLeft <= 1) {
          hitLaserIds.add(l.id);
          particles.push(...spawnExplosion(l.x, l.y, "#00E5FF", 2));
          floatingTexts.push({
            id: nextId++,
            text: "PROXY DEFLECTED!",
            x: tX,
            y: tY + 15,
            vy: -20,
            color: "#00E5FF",
            alpha: 0.8,
            scale: 0.9,
          });
          continue; // No damage taken from frontal laser
        }

        tHp -= l.damage;
        particles.push(...spawnExplosion(l.x, l.y, l.color, 2));

        l.pierceLeft -= 1;
        if (l.pierceLeft <= 0) {
          hitLaserIds.add(l.id);
        }

        // Cluster bomblets upgrade
        if (activeUpgrades.cluster_bomblets && Math.random() < 0.4) {
          particles.push(...spawnExplosion(l.x, l.y, "#FF6E40", 3));
        }

        if (tHp <= 0) break;
      }
    }

    // Check destruction
    if (tHp <= 0) {
      threatsNeutralized++;
      comboStreak++;
      const currentMult = getComboMultiplier(comboStreak);
      const dividendMult = 1 + (activeUpgrades.crypto_dividend_boost || 0) * 0.5;
      const earned = Math.round(t.points * currentMult * dividendMult);
      score += earned;

      floatingTexts.push({
        id: nextId++,
        text: currentMult > 1 ? `+${earned} (x${currentMult})` : `+${earned}`,
        x: tX,
        y: tY,
        vy: -55,
        color: currentMult >= 5 ? "#FF5252" : currentMult >= 2 ? "#FFD54F" : "#FFFFFF",
        alpha: 1,
        scale: currentMult >= 3 ? 1.25 : 1.0,
      });

      const blastColor =
        t.kind === "ransomware" || t.kind === "cryptolocker"
          ? "#FF1744"
          : t.kind === "boss"
            ? "#FF9100"
            : t.kind === "stealth"
              ? "#E040FB"
              : t.kind === "polymorphic_worm"
                ? "#76FF03"
                : t.kind === "buffer_overflow"
                  ? "#FF3D00"
                  : "#00E5FF";
      particles.push(...spawnExplosion(tX, tY, blastColor, t.kind === "boss" ? 14 : 6));

      // Polymorphic Worm Replication
      if (t.kind === "polymorphic_worm") {
        floatingTexts.push({
          id: nextId++,
          text: "WORM REPLICATED!",
          x: tX,
          y: tY - 15,
          vy: -40,
          color: "#76FF03",
          alpha: 1,
          scale: 1.1,
        });
        remainingThreats.push(
          {
            id: nextId++,
            kind: "worm_fragment",
            name: "WORM_FRAGMENT",
            x: Math.max(20, tX - 18),
            y: tY,
            vx: -70,
            vy: currentWaveConfig.speedBase * 1.35,
            radius: 10,
            hp: 1,
            maxHp: 1,
            points: 150,
          },
          {
            id: nextId++,
            kind: "worm_fragment",
            name: "WORM_FRAGMENT",
            x: Math.min(width - 20, tX + 18),
            y: tY,
            vx: 70,
            vy: currentWaveConfig.speedBase * 1.35,
            radius: 10,
            hp: 1,
            maxHp: 1,
            points: 150,
          },
        );
      }

      // Chain Lightning Upgrade
      if (activeUpgrades.chain_lightning && threats.length > 1) {
        for (let c = 0; c < threats.length; c++) {
          const other = threats[c];
          if (other.id !== t.id && Math.hypot(other.x - tX, other.y - tY) < 130) {
            other.hp -= 2;
            particles.push(...spawnExplosion(other.x, other.y, "#64FFDA", 3));
            break;
          }
        }
      }

      // Drops calculation: EMP is very rare (~2.5%), Coins are standard (~83%), Shields (~14.5%)
      const dropChance = 0.36 + (activeUpgrades.siphon_harvest ? 0.14 : 0);
      if (Math.random() < dropChance || t.kind === "boss") {
        const dropRoll = Math.random();
        const empRate = 0.025 + (activeUpgrades.emp_overcharge ? 0.025 : 0);
        const shieldRate = 0.14 + (activeUpgrades.siphon_harvest ? 0.12 : 0);

        let dropKind: DropKind = "coin";
        if (dropRoll < empRate) {
          dropKind = "emp";
        } else if (dropRoll < empRate + shieldRate) {
          dropKind = "shield";
        } else {
          dropKind = "coin";
        }

        drops.push({
          id: nextId++,
          kind: dropKind,
          x: tX,
          y: tY,
          vx: (Math.random() - 0.5) * 40,
          vy: 110,
          radius: 12,
          rotation: 0,
        });
      }
      continue;
    }

    // Player collision
    const distToPlayer = Math.hypot(tX - playerPxX, tY - playerPxY);
    if (distToPlayer < t.radius + 24 && invulnerableTime <= 0) {
      shields--;
      invulnerableTime = 1.6;
      shakeTime = 0.35;
      shakeMagnitude = 9;
      comboStreak = 0;
      particles.push(...spawnExplosion(playerPxX, playerPxY, "#FF5252", 10));
      floatingTexts.push({
        id: nextId++,
        text: "HULL IMPACT!",
        x: playerPxX,
        y: playerPxY - 30,
        vy: -60,
        color: "#FF1744",
        alpha: 1,
        scale: 1.3,
      });

      if (
        shields === 1 &&
        activeUpgrades.emergency_emp_matrix &&
        !emergencyEmpUsedThisWave
      ) {
        emergencyEmpUsedThisWave = true;
        const blastResult = executeEmpBlast(
          threats,
          width,
          height,
          1,
          0,
          true,
        );
        remainingThreats.length = 0;
        remainingThreats.push(...blastResult.survivingThreats);
        score += blastResult.scoreGained;
        threatsNeutralized += blastResult.neutralizedCount;
        particles.push(...blastResult.particles);
        floatingTexts.push(...blastResult.floatingTexts);
        shakeTime = 0.4;
        shakeMagnitude = 11;
        break;
      }
      continue;
    }

    // Vault Barrier bottom protection
    if (tY > height - 30) {
      if (vaultBarrier > 0) {
        vaultBarrier--;
        particles.push(...spawnExplosion(tX, height - 20, "#69F0AE", 6));
        floatingTexts.push({
          id: nextId++,
          text: `VAULT BARRIER DEFLECTED! (${vaultBarrier} left)`,
          x: tX,
          y: height - 45,
          vy: -45,
          color: "#69F0AE",
          alpha: 1,
          scale: 1.1,
        });
      } else {
        shields--;
        shakeTime = 0.3;
        shakeMagnitude = 7;
        comboStreak = 0;
        particles.push(...spawnExplosion(tX, height - 20, "#FF1744", 8));
        floatingTexts.push({
          id: nextId++,
          text: "PERIMETER BREACHED!",
          x: tX,
          y: height - 40,
          vy: -45,
          color: "#FF5252",
          alpha: 1,
          scale: 1.15,
        });

        if (
          shields === 1 &&
          activeUpgrades.emergency_emp_matrix &&
          !emergencyEmpUsedThisWave
        ) {
          emergencyEmpUsedThisWave = true;
          const blastResult = executeEmpBlast(
            threats,
            width,
            height,
            1,
            0,
            true,
          );
          remainingThreats.length = 0;
          remainingThreats.push(...blastResult.survivingThreats);
          score += blastResult.scoreGained;
          threatsNeutralized += blastResult.neutralizedCount;
          particles.push(...blastResult.particles);
          floatingTexts.push(...blastResult.floatingTexts);
          shakeTime = 0.4;
          shakeMagnitude = 11;
          break;
        }
      }
      continue;
    }

    remainingThreats.push({ ...t, x: tX, y: tY, hp: tHp });
  }

  threats = remainingThreats;
  lasers = lasers.filter((l) => !hitLaserIds.has(l.id));

  // 11. Zero-Allocation In-Place Particle Physics
  let pWrite = 0;
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    p.x += p.vx * boundedDt;
    p.y += p.vy * boundedDt;
    p.alpha -= p.decay * boundedDt;
    if (p.alpha > 0) {
      particles[pWrite++] = p;
    }
  }
  particles.length = pWrite;
  if (particles.length > 30) {
    particles = particles.slice(-30);
  }

  // 12. Zero-Allocation Floating Texts
  let ftWrite = 0;
  for (let i = 0; i < floatingTexts.length; i++) {
    const ft = floatingTexts[i];
    ft.y += ft.vy * boundedDt;
    ft.alpha -= 1.25 * boundedDt;
    if (ft.alpha > 0) {
      floatingTexts[ftWrite++] = ft;
    }
  }
  floatingTexts.length = ftWrite;
  if (floatingTexts.length > 6) {
    floatingTexts = floatingTexts.slice(-6);
  }

  // Check Game Over
  const status = shields <= 0 ? "gameover" : "playing";

  return {
    ...prev,
    status,
    score,
    best: Math.max(best, score),
    wave,
    waveProgress,
    waveTarget,
    waveState,
    waveBriefingTime,
    currentWaveConfig,
    playerX,
    shields: Math.max(0, shields),
    maxShields,
    vaultBarrier,
    maxVaultBarrier,
    invulnerableTime,
    comboStreak,
    multiplier: getComboMultiplier(comboStreak),
    threats,
    lasers,
    drops,
    particles,
    floatingTexts,
    mines,
    mineCooldown,
    orbitalAngle,
    shakeTime,
    shakeMagnitude,
    fireCooldown,
    threatsNeutralized,
    coinsCollected,
    activeUpgrades,
    upgradeOptions,
    droneAngle,
    droneFireCooldown,
    regenTimer,
    emergencyEmpUsedThisWave,
  };
}
