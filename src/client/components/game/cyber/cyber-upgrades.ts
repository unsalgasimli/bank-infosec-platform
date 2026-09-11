export type UpgradeBranch = "offense" | "defense" | "utility";
export type UpgradeRarity = "common" | "rare" | "epic" | "legendary";

export interface CyberUpgrade {
  id: string;
  branch: UpgradeBranch;
  rarity: UpgradeRarity;
  name: { en: string; az: string };
  description: { en: string; az: string };
  badge: { en: string; az: string };
  icon: string;
  maxLevel: number;
  tier: number;
  color: string;
}

export const CYBER_UPGRADES: CyberUpgrade[] = [
  // ===================== OFFENSE BRANCH =====================
  {
    id: "twin_cannons",
    branch: "offense",
    rarity: "common",
    name: { en: "Twin Blasters", az: "Cüt Lazer Lülələri" },
    description: {
      en: "Fires dual parallel high-energy laser beams with expanded coverage.",
      az: "Daha geniş əhatə ilə paralel cüt yüksək enerjili lazer şüaları atır.",
    },
    badge: { en: "Dual Shot", az: "Cüt Atəş" },
    icon: "Crosshair",
    maxLevel: 2,
    tier: 1,
    color: "#FAA61A",
  },
  {
    id: "triple_spread",
    branch: "offense",
    rarity: "rare",
    name: { en: "Triple Spread Cannons", az: "Üçtərəfli Qanad Atəşi" },
    description: {
      en: "Adds angled side-cannons (18°) to sweep incoming swarm clusters.",
      az: "Daxil olan dəstələri məhv etmək üçün 18° bucaqlı yan lülələr əlavə edir.",
    },
    badge: { en: "Spread Shot", az: "Geniş Atəş" },
    icon: "Zap",
    maxLevel: 2,
    tier: 2,
    color: "#FF9100",
  },
  {
    id: "pentashot",
    branch: "offense",
    rarity: "epic",
    name: { en: "Pentashot Annihilator", az: "5-İstiqamətli Qasırğa" },
    description: {
      en: "Deploys 5 synchronized laser barrels creating an impenetrable storm.",
      az: "Keçilməz atəş qasırğası yaradan 5 sinxron lazer lüləsi quraşdırır.",
    },
    badge: { en: "Ultimate Barrage", az: "Maksimal Qasırğa" },
    icon: "Sparkles",
    maxLevel: 1,
    tier: 3,
    color: "#FF3D00",
  },
  {
    id: "plasma_railgun",
    branch: "offense",
    rarity: "rare",
    name: { en: "Plasma Piercing Railgun", az: "Deşici Plazma Topu" },
    description: {
      en: "Heavy lasers penetrate through multiple threats without dissipating.",
      az: "Ağır lazer şüaları bir neçə təhdidin içindən zəifləmədən keçərək deşir.",
    },
    badge: { en: "Piercing", az: "Zireh Deşən" },
    icon: "ArrowUpRight",
    maxLevel: 2,
    tier: 2,
    color: "#00E5FF",
  },
  {
    id: "rapid_vulcan",
    branch: "offense",
    rarity: "common",
    name: { en: "Overclocked Fire Rate", az: "Sürətləndirilmiş Atəş Mexanizmi" },
    description: {
      en: "Increases weapon cycling speed by +25% per level.",
      az: "Atəş tezliyini hər səviyyədə +%25 artırır.",
    },
    badge: { en: "+25% Fire Rate", az: "+%25 Sürət" },
    icon: "Flame",
    maxLevel: 5,
    tier: 1,
    color: "#FFD54F",
  },
  {
    id: "accelerator_cooling",
    branch: "offense",
    rarity: "rare",
    name: { en: "Cryo-Heatsink Overclock", az: "Krio-Soyutma Akseleratoru" },
    description: {
      en: "Reduces laser cycling delay by -30%, enabling rapid stream fire.",
      az: "Lazer qızma fasiləsini -%30 qısaldaraq axıcı fasiləsiz atəş imkanı verir.",
    },
    badge: { en: "-30% Delay", az: "-%30 Fasilə" },
    icon: "Cpu",
    maxLevel: 3,
    tier: 2,
    color: "#80D8FF",
  },
  {
    id: "crypto_drones",
    branch: "offense",
    rarity: "rare",
    name: { en: "Crypto Escort Drone", az: "Müstəqil Kripto Dron" },
    description: {
      en: "Deploys an autonomous companion drone that orbits your ship and shoots nearest threats.",
      az: "Gəminizin ətrafında fırlanan və yaxınlaşan təhdidlərə avtomatik atəş açan köməkçi dron.",
    },
    badge: { en: "Autonomous Escort", az: "Köməkçi Dron" },
    icon: "Bot",
    maxLevel: 2,
    tier: 2,
    color: "#FFB300",
  },
  {
    id: "bouncing_lasers",
    branch: "offense",
    rarity: "rare",
    name: { en: "Reflective Ricochet Code", az: "Divardan Qayıdan Şüalar" },
    description: {
      en: "Lasers ricochet off perimeter walls, sweeping threats multiple times.",
      az: "Lazer şüaları yan divarlardan əks olunaraq təkrar hədəflərə yönəlir.",
    },
    badge: { en: "Ricochet", az: "Rikoşet" },
    icon: "Repeat",
    maxLevel: 2,
    tier: 2,
    color: "#76FF03",
  },
  {
    id: "homing_seekers",
    branch: "offense",
    rarity: "epic",
    name: { en: "Algorithmic Target Lock", az: "Ağıllı Hədəfləmə Proqramı" },
    description: {
      en: "Lasers dynamically curve trajectory towards the closest incoming threat.",
      az: "Lazerlər ən yaxın kiber təhdidə doğru trayektoriyasını avtomatik əyir.",
    },
    badge: { en: "Homing", az: "Özütuşlanan" },
    icon: "LocateFixed",
    maxLevel: 2,
    tier: 2,
    color: "#00E676",
  },
  {
    id: "chain_lightning",
    branch: "offense",
    rarity: "epic",
    name: { en: "Zero-Day Chain Arc", az: "Zəncirvari Şimşək Zərbəsi" },
    description: {
      en: "Neutralizing an enemy discharges an electric arc jumping to 2 neighboring threats.",
      az: "Hər təhdid məhv edildikdə qonşu 2 hədəfə elektrik qığılcımı sıçrayır.",
    },
    badge: { en: "Chain Shock", az: "Zəncirvari Şok" },
    icon: "Zap",
    maxLevel: 2,
    tier: 3,
    color: "#64FFDA",
  },
  {
    id: "cluster_bomblets",
    branch: "offense",
    rarity: "rare",
    name: { en: "Fragmentation Warhead", az: "Qəlpəli Lazer Başlığı" },
    description: {
      en: "Laser impacts trigger miniature cluster shrapnel damaging adjacent packets.",
      az: "Lazer zərbəsi ətrafdakı paketləri də zədələyən mikro-qəlpələr saçır.",
    },
    badge: { en: "Area Damage", az: "Sahə Zərəri" },
    icon: "Bomb",
    maxLevel: 2,
    tier: 2,
    color: "#FF6E40",
  },

  // ===================== DEFENSE BRANCH =====================
  {
    id: "hardened_firewall",
    branch: "defense",
    rarity: "common",
    name: { en: "Hardened Firewall Core", az: "Möhkəmləndirilmiş Firewall" },
    description: {
      en: "+1 Maximum Shield capacity and immediately restores 2 damaged shields.",
      az: "+1 Maksimum Zireh tutumu və zədələnmiş 2 zirehin dərhal təmiri.",
    },
    badge: { en: "+1 Max Shield", az: "+1 Maks Zireh" },
    icon: "Shield",
    maxLevel: 3,
    tier: 1,
    color: "#4CAF50",
  },
  {
    id: "nanite_regeneration",
    branch: "defense",
    rarity: "rare",
    name: { en: "Active Nanite Auto-Heal", az: "Nanit Avto-Bərpa Sistemi" },
    description: {
      en: "Automatically restores 1 shield every 18 seconds during battle.",
      az: "Döyüş zamanı hər 18 saniyədən bir avtomatik 1 zirehi bərpa edir.",
    },
    badge: { en: "Regeneration", az: "Avto-Bərpa" },
    icon: "Activity",
    maxLevel: 2,
    tier: 2,
    color: "#00E676",
  },
  {
    id: "emergency_emp_matrix",
    branch: "defense",
    rarity: "rare",
    name: { en: "Emergency EMP Fail-Safe", az: "Qəza EMP Avtomatik Təhlükəsizliyi" },
    description: {
      en: "Automatically detonates a full-screen EMP blast when your shields drop to 1.",
      az: "Zirehiniz 1-ə düşdükdə avtomatik olaraq bütün ekranı təmizləyən EMP partlayışı başladır.",
    },
    badge: { en: "Fail-Safe", az: "Qəza Qoruyucu" },
    icon: "Radio",
    maxLevel: 1,
    tier: 2,
    color: "#1DE9B6",
  },
  {
    id: "perimeter_barrier",
    branch: "defense",
    rarity: "common",
    name: { en: "Vault Perimeter Reinforcement", az: "Perimetr Zireh Gücləndirməsi" },
    description: {
      en: "+2 breach absorptions per wave, preventing bottom-crossing packets from damaging shields.",
      az: "Hər dalğada +2 keçid zirehi; aşağı çatan paketlərin gəmiyə zərər vurmasının qarşısını alır.",
    },
    badge: { en: "Breach Shield", az: "Keçid Qoruyucu" },
    icon: "Lock",
    maxLevel: 3,
    tier: 1,
    color: "#69F0AE",
  },
  {
    id: "orbital_shield",
    branch: "defense",
    rarity: "epic",
    name: { en: "Aegis Data Barrier Orb", az: "Fırlanan Mühafizə Sferası" },
    description: {
      en: "Generates an energy barrier orb orbiting the ship that disintegrates contacting enemies.",
      az: "Gəminin ətrafında dönən və toxunan düşmənləri buxarlandıran enerji sferası.",
    },
    badge: { en: "Orbital Block", az: "Fırlanan Qalxan" },
    icon: "ShieldAlert",
    maxLevel: 2,
    tier: 2,
    color: "#00B0FF",
  },
  {
    id: "glitch_dilation",
    branch: "defense",
    rarity: "rare",
    name: { en: "Clock Dilation Patch", az: "Zaman Ləngitmə Protokolu" },
    description: {
      en: "Slows all incoming threats by 20%, granting superior reaction time.",
      az: "Bütün kiber təhdidlərin eniş sürətini 20% azaldaraq reaksiya vaxtı qazandırır.",
    },
    badge: { en: "Slow Threats", az: "20% Yavaşlama" },
    icon: "Clock",
    maxLevel: 2,
    tier: 2,
    color: "#80D8FF",
  },
  {
    id: "cyber_mines",
    branch: "defense",
    rarity: "rare",
    name: { en: "Proximity Firewall Mines", az: "Minaatan Təhlükəsizlik Sistemi" },
    description: {
      en: "Automatically drops floating proximity mines every 6 seconds that detonate on contact.",
      az: "Hər 6 saniyədən bir arxasında toxunanda partlayan təhlükəsizlik minaları yerləşdirir.",
    },
    badge: { en: "Deployable Mines", az: "Minalar" },
    icon: "Disc",
    maxLevel: 2,
    tier: 2,
    color: "#FF5252",
  },

  // ===================== UTILITY & BANKING BRANCH =====================
  {
    id: "token_magnetron",
    branch: "utility",
    rarity: "common",
    name: { en: "Token Magnetron Ingest", az: "Qızıl Token Maqniti" },
    description: {
      en: "Gravitational field that pulls falling Expressbank coins and powerups directly to your ship.",
      az: "Düşən bütün qızıl Expressbank sikkələrini və gücləndiriciləri birbaşa gəmiyə çəkir.",
    },
    badge: { en: "Item Magnet", az: "Maqnit" },
    icon: "Magnet",
    maxLevel: 2,
    tier: 1,
    color: "#FFD700",
  },
  {
    id: "overdrive_thrusters",
    branch: "utility",
    rarity: "common",
    name: { en: "Overdrive Quantum Thrusters", az: "Kvant Sürətləndirici Mühərrik" },
    description: {
      en: "Increases drone lateral movement speed by +25% per level.",
      az: "Dronun yan hərəkət sürətini hər səviyyədə +%25 artırır.",
    },
    badge: { en: "+25% Agility", az: "+%25 Manevr" },
    icon: "Gauge",
    maxLevel: 4,
    tier: 1,
    color: "#FFAB00",
  },
  {
    id: "vector_afterburners",
    branch: "utility",
    rarity: "rare",
    name: { en: "Vector Afterburners", az: "Vektorlu Forsaj Mühərriki" },
    description: {
      en: "High-yield ion booster increasing lateral acceleration and dodge agility by +40%.",
      az: "Yüksək güclü ion forsajı təcillənməni və manevr çevikliyini +%40 artırır.",
    },
    badge: { en: "+40% Boost", az: "+%40 Təcil" },
    icon: "Rocket",
    maxLevel: 3,
    tier: 2,
    color: "#FF9100",
  },
  {
    id: "golden_critical_protocol",
    branch: "utility",
    rarity: "rare",
    name: { en: "Golden Critical Protocol", az: "Qızıl Tənqidi Zərbə Protokolu" },
    description: {
      en: "25% chance for lasers to trigger a golden critical strike dealing 300% damage.",
      az: "%25 şansla lazerlərin 300% (x3) zərər vuran qızıl kritik zərbə vurması.",
    },
    badge: { en: "3x Crit Damage", az: "3x Tənqidi Zərər" },
    icon: "Trophy",
    maxLevel: 2,
    tier: 2,
    color: "#FFC107",
  },
  {
    id: "crypto_dividend_boost",
    branch: "utility",
    rarity: "common",
    name: { en: "High-Frequency Dividend", az: "Yüksək Tezlikli Dividendlər" },
    description: {
      en: "Multiplies all earned score and token values by an extra +50%.",
      az: "Qazanılan bütün xal və token dəyərlərini əlavə +%50 artırır.",
    },
    badge: { en: "+50% Score Yield", az: "+%50 Xal Artımı" },
    icon: "TrendingUp",
    maxLevel: 2,
    tier: 1,
    color: "#FFEA00",
  },
  {
    id: "siphon_harvest",
    branch: "utility",
    rarity: "rare",
    name: { en: "Malware Siphon Protocol", az: "Zərərverici Sifonlama Təmiri" },
    description: {
      en: "Destroyed threats have a +15% chance to drop a healing Firewall Patch.",
      az: "Məhv edilən hər təhdidin +%15 şansla zireh bərpa paketi buraxması.",
    },
    badge: { en: "+Drop Health", az: "+Zireh Şansı" },
    icon: "PlusCircle",
    maxLevel: 2,
    tier: 2,
    color: "#00E5FF",
  },
  {
    id: "emp_overcharge",
    branch: "utility",
    rarity: "rare",
    name: { en: "Resonance EMP Capacitors", az: "Gücləndirilmiş EMP Kondansatoru" },
    description: {
      en: "EMP drops appear 50% more often and award +1,200 bonus vault points.",
      az: "EMP gücləndiriciləri 50% daha tez-tez çıxır və +1200 bonus xal qazandırır.",
    },
    badge: { en: "EMP Surge", az: "EMP Axını" },
    icon: "BatteryCharging",
    maxLevel: 2,
    tier: 2,
    color: "#40C4FF",
  },
  {
    id: "quantum_overdrive",
    branch: "utility",
    rarity: "legendary",
    name: { en: "Core Quantum Singularity", az: "Kvant Sinqulyarlığı Qovşağı" },
    description: {
      en: "+50% fire rate, +30% agility, and instantly grants +1 Max Shield.",
      az: "+%50 atəş sürəti, +%30 manevr və dərhal +1 Maksimum Zireh bəxş edir.",
    },
    badge: { en: "★ LEGENDARY ★", az: "★ ƏFSANƏVİ ★" },
    icon: "Crown",
    maxLevel: 1,
    tier: 3,
    color: "#FFD700",
  },
];

export const UPGRADE_MAP = new Map<string, CyberUpgrade>(
  CYBER_UPGRADES.map((u) => [u.id, u]),
);

/**
 * Fisher-Yates array shuffle for true random distribution
 */
function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Returns 3 diverse and randomized upgrades suitable for current progression.
 * Ensures variety across branches and unlocks progressive tiers.
 */
export function generateUpgradeOptions(
  activeUpgrades: Record<string, number>,
  currentWave: number,
): CyberUpgrade[] {
  // Filter eligible upgrades that haven't reached maxLevel
  const eligible = CYBER_UPGRADES.filter((u) => {
    const currentLevel = activeUpgrades[u.id] || 0;
    if (currentLevel >= u.maxLevel) return false;

    // Pentashot requires at least twin or triple
    if (u.id === "pentashot" && !(activeUpgrades.twin_cannons || activeUpgrades.triple_spread)) {
      return false;
    }
    // Legendary/Tier 3 unlocks starting wave 3
    if (u.tier === 3 && currentWave < 3) return false;

    return true;
  });

  if (eligible.length <= 3) return eligible;

  // Shuffle thoroughly
  const shuffled = shuffleArray(eligible);

  // Attempt to select from different branches for balanced variety
  const offense = shuffled.filter((u) => u.branch === "offense");
  const defense = shuffled.filter((u) => u.branch === "defense");
  const utility = shuffled.filter((u) => u.branch === "utility");

  const picked: CyberUpgrade[] = [];

  // 60% chance to offer 1 offense, 1 defense, 1 utility; 40% chance for pure wild randomness
  const structured = Math.random() < 0.65;

  if (structured) {
    if (offense.length > 0) picked.push(offense[0]);
    if (defense.length > 0 && !picked.some((p) => p.id === defense[0].id)) picked.push(defense[0]);
    if (utility.length > 0 && !picked.some((p) => p.id === utility[0].id)) picked.push(utility[0]);
  }

  // Fill up to 3 cards randomly from remaining pool
  for (const item of shuffled) {
    if (picked.length >= 3) break;
    if (!picked.some((p) => p.id === item.id)) {
      picked.push(item);
    }
  }

  return shuffleArray(picked);
}
