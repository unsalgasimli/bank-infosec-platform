import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Volume2,
  VolumeX,
  Tv,
  X,
  Trophy,
  Shield,
  Zap,
  Lock,
  Flame,
  Coins,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Terminal,
  Swords,
} from "lucide-react";
import { ExpressbankEmblem } from "../common/ExpressbankLogo.js";
import { useAuth } from "../../context/AuthContext.js";
import { useI18n } from "../../context/I18nContext.js";
import {
  playCoinSound,
  playNavSound,
  playSelectSound,
  playLaunchSound,
  playBuzzSound,
  isArcadeMuted,
  toggleArcadeMuted,
} from "./retro-arcade-sound.js";
import {
  playAzerbaijanTrack,
  stopAzerbaijanMusic,
} from "./retro-azerbaijan-music.js";
import { RetroAzerbaijanPlayer } from "./RetroAzerbaijanPlayer.js";
import type { GameLeaderboardEntry } from "../../../shared/types/game.js";
import { getBestTime } from "./sweeper/cyber-sweeper-engine.js";
import { getBestTime as getSudokuBestTime } from "./sudoku/cyber-sudoku-engine.js";
import { GameLeaderboardModal } from "./common/GameLeaderboardModal.js";
import { ChallengeModal } from "./battle/ChallengeModal.js";
import { useArcadeAccess } from "./arcade-access-policy.js";
import "./retro-arcade-cabinet.css";

export type ArcadeGameType = "cyber" | "flight" | "breaker" | "sweeper" | "sudoku" | "battle" | "shooter";

interface RetroArcadeCabinetProps {
  onSelectGame: (game: ArcadeGameType, matchId?: string) => void;
  onClose: () => void;
}


interface GameCardMeta {
  id: ArcadeGameType;
  genre: string;
  title: string;
  badge: string;
  badgeType: "hot" | "classic" | "secret";
  description: {
    az: string;
    en: string;
  };
  accentColor: string;
  glowColor: string;
  difficulty: string;
  controls: string[];
  isLocked?: boolean;
}

const GAMES_DATA: GameCardMeta[] = [
  {
    id: "shooter",
    genre: "Krunker 3D FPS • IT Warfare Arena",
    title: "EXPRESSBANK CYBER SHOOTER",
    badge: "3D FPS / MULTIPLAYER / HOT",
    badgeType: "hot",
    description: {
      az: "Krunker.io üslubunda sürətli 3D multiplayer atıcı oyunu! Infosec (Zero-Day Railgun & Ghost Dash), Help Desk (RJ-45 Gatling & Double Jump) və IT Admin (Server Flak Shotgun & Ground Slam) rolları ilə ortaq server mərkəzində həmkar və botlarla döyüşün!",
      en: "Fast-paced 3D multiplayer arena shooter inspired by Krunker.io! Battle colleagues and smart bots in a central datacenter arena with custom classes: Infosec (Railgun & Ghost Dash), Help Desk (RJ-45 Gatling & Double Jump), and IT Admin (Flak Shotgun & Ground Slam)!",
    },
    accentColor: "#00f576",
    glowColor: "rgba(0, 245, 118, 0.4)",
    difficulty: "PRO ARENA (★★★★★)",
    controls: ["WASD Move", "Mouse Aim / Shoot", "Space Slide-Hop", "Shift Slide", "E Dash/Slam", "Q Ultimate"],
  },
  {
    id: "cyber",
    genre: "Kiber Döyüş Gəmisi • Space Bullet Hell",
    title: "EXPRESSBANK KİBER GƏMİ",
    badge: "HOT / POPULAR",
    badgeType: "hot",
    description: {
      az: "Expressbank kiber kosmik döyüş gəmisini (Starship Interceptor) idarə edin! Bank şəbəkəsini fişinq, trojan və ransomware axınlarından qoruyun. 4 pilləli gəmi təkamülü, lazer topları, qoruyucu dronlar və boss döyüşləri!",
      en: "Command the Expressbank cyber interceptor starship! Defend bank mainframes from malware waves with 4-tier ship evolutions, laser cannons, companion drones, and boss battles!",
    },
    accentColor: "#00f576",
    glowColor: "rgba(0, 245, 118, 0.4)",
    difficulty: "HARD (★★★★☆)",
    controls: ["Mouse Aim / Fire", "WASD / Arrows Move", "1-3 Upgrade"],
  },
  {
    id: "breaker",
    genre: "Retro Arkanoid / Brick Breaker",
    title: "EXPRESSBANK VAULT BREAKER",
    badge: "NEW / HIT",
    badgeType: "hot",
    description: {
      az: "Expressbank brend 'E' loqosu və bank divarlarını top və panel ilə deşin! Lazer güllələri, multi-ball və partlayıcı EMP zəncirvari partlayışları!",
      en: "Smash through the Expressbank 'E' monogram and bank security vaults with paddle & ball! Features twin lasers, multi-ball, and chain EMP blasts!",
    },
    accentColor: "#00e5ff",
    glowColor: "rgba(0, 229, 255, 0.4)",
    difficulty: "BALANCED (★★★☆☆)",
    controls: ["Mouse / Arrows Move", "Space Launch", "P Pause"],
  },
  {
    id: "flight",
    genre: "Precision Songbird Flight",
    title: "EXPRESSBANK GARDEN FLIGHT",
    badge: "CLASSIC",
    badgeType: "classic",
    description: {
      az: "Zərif qızıl çini quşunu bankın bağ tağları və hava küləkləri arasından uçurdun. Hər uçuş şirkətdaxili canlı liderlər cədvəlinə yazılır!",
      en: "Pilot the golden Expressbank songbird through bank garden columns and breeze obstacles. Live score submissions feed the company leaderboard!",
    },
    accentColor: "#ffb800",
    glowColor: "rgba(255, 184, 0, 0.4)",
    difficulty: "MEDIUM (★★★☆☆)",
    controls: ["Space Flap", "Click Flight", "P / Esc Pause"],
  },
  {
    id: "sweeper",
    genre: "Retro Professional Minesweeper",
    title: "EXPRESSBANK CYBER SWEEPER",
    badge: "PRO DEFUSER",
    badgeType: "classic",
    description: {
      az: "İlk klik təhlükəsizliyi, chording və kiber sonar kəşfiyyatı ilə zero-day minalarını izolyasiya edin! 3BV analitikası və 3 rəsmi çətinlik səviyyəsi.",
      en: "Defuse zero-day vulnerabilities with first-click safety, chording, and sonar radar pulses! Features 3BV diagnostics and 3 competitive tiers.",
    },
    accentColor: "#ec4899",
    glowColor: "rgba(236, 72, 153, 0.4)",
    difficulty: "TACTICAL (★★★★☆)",
    controls: ["Left Dig", "Right Flag", "Space Chord", "Sonar Pulse"],
  },
  {
    id: "sudoku",
    genre: "Kriptoqrafik Matris • Cyber Sudoku",
    title: "EXPRESSBANK CYBER SUDOKU",
    badge: "NEW / LOGIC",
    badgeType: "hot",
    description: {
      az: "Bankın şifrələnmiş 9x9 kiber mühafizə matrisini deşifrə edin! Qeydlər (pencil marks), real-vaxt xəta aşkarlaması, kiber köməkçi və bank qlifləri rejimi!",
      en: "Decrypt the bank's encrypted 9x9 cyber defense matrix! Features candidate pencil notes, real-time diagnostics, smart hints, and bank cybersecurity glyphs!",
    },
    accentColor: "#a855f7",
    glowColor: "rgba(168, 85, 247, 0.4)",
    difficulty: "MƏNTİQ (★★★☆☆ - ★★★★★)",
    controls: ["Mouse / Numpad 1-9", "N Notes (Qeyd)", "H Hint (Kömək)", "E Erase (Sil)"],
  },
  {
    id: "battle",
    genre: "Kiber Dəniz Döyüşü • 1v1 PvP / AI Blind Battle",
    title: "EXPRESSBANK KİBER DƏNİZ DÖYÜŞÜ",
    badge: "1V1 PVP / HIT",
    badgeType: "hot",
    description: {
      az: "Həmkarına meydan oxu və ya Expressbank SOC AI Bot ilə qarşılaş! 10x10 radar şəbəkəsində gizli donanmanı (Flotilya) yerləşdir və rəqibin gəmilərini kor-koranə kəşfiyyat zərbələri ilə məhv et!",
      en: "Challenge a bank colleague or face the Expressbank SOC AI Bot! Deploy your cyber fleet secretly on a 10x10 naval grid and sink enemy battlecruisers with blind tactical strikes!",
    },
    accentColor: "#00e5ff",
    glowColor: "rgba(0, 229, 255, 0.4)",
    difficulty: "STRATEGİYA (★★★★☆)",
    controls: ["Mouse Fire", "R Rotate Ship", "Auto Deploy", "Radar Sonar"],
  },
];

export const RetroArcadeCabinet: React.FC<RetroArcadeCabinetProps> = ({
  onSelectGame,
  onClose,
}) => {
  const { currentUser, fetchWithAuth } = useAuth();
  const { language } = useI18n();
  const isAz = language === "az";
  const access = useArcadeAccess(currentUser, 15000);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [crtFilterActive, setCrtFilterActive] = useState(true);
  const [muted, setMuted] = useState(() => isArcadeMuted());
  const [credits, setCredits] = useState(2);
  const [joystickTilt, setJoystickTilt] = useState<"none" | "left" | "right">("none");
  const [pressedBtn, setPressedBtn] = useState<string | null>(null);

  // Live Records
  const [cyberTopScore, setCyberTopScore] = useState<number | null>(null);
  const [cyberTopPlayer, setCyberTopPlayer] = useState<string | null>(null);
  const [cyberMyBest, setCyberMyBest] = useState<number>(() => {
    try {
      const val = localStorage.getItem("cyber-defense.best");
      return val ? Number(val) || 0 : 0;
    } catch {
      return 0;
    }
  });

  const [flightTopScore, setFlightTopScore] = useState<number | null>(null);
  const [flightTopPlayer, setFlightTopPlayer] = useState<string | null>(null);
  const [flightMyBest, setFlightMyBest] = useState<number>(() => {
    try {
      const val = localStorage.getItem("garden-flight.best");
      return val ? Number(val) || 0 : 0;
    } catch {
      return 0;
    }
  });

  const [breakerTopScore, setBreakerTopScore] = useState<number | null>(null);
  const [breakerTopPlayer, setBreakerTopPlayer] = useState<string | null>(null);
  const [breakerMyBest, setBreakerMyBest] = useState<number>(() => {
    try {
      const val = localStorage.getItem("vault-breaker.best");
      return val ? Number(val) || 0 : 0;
    } catch {
      return 0;
    }
  });

  const [sweeperTopScore, setSweeperTopScore] = useState<number | null>(null);
  const [sweeperTopPlayer, setSweeperTopPlayer] = useState<string | null>(null);
  const [sweeperMyBest, setSweeperMyBest] = useState<number | null>(() => getBestTime("novice"));

  const [sudokuTopScore, setSudokuTopScore] = useState<number | null>(null);
  const [sudokuTopPlayer, setSudokuTopPlayer] = useState<string | null>(null);
  const [sudokuMyBest, setSudokuMyBest] = useState<number | null>(() => getSudokuBestTime("novice"));

  const [showLeaderboardModal, setShowLeaderboardModal] = useState(false);
  const [showChallengeModal, setShowChallengeModal] = useState(false);

  // Canvas refs for dynamic preview cards
  const cyberCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const flightCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const breakerCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sweeperCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sudokuCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const battleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const shooterCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Play Azerbaijan Retro Chiptune Mix on Cabinet Open
  useEffect(() => {
    playAzerbaijanTrack("qaytagi");
    return () => {
      stopAzerbaijanMusic();
    };
  }, []);

  // Fetch Live Leaderboard Highlights for all 4 games
  useEffect(() => {
    let cancelled = false;
    const fetchScores = async () => {
      try {
        const [resCyber, resFlight, resBreaker, resSweeper, resSudoku] = await Promise.allSettled([
          fetchWithAuth("/api/game/cyber/leaderboard").then((r) => r.json()),
          fetchWithAuth("/api/game/flight/leaderboard").then((r) => r.json()),
          fetchWithAuth("/api/game/breaker/leaderboard").then((r) => r.json()),
          fetchWithAuth("/api/game/sweeper/leaderboard?difficulty=novice").then((r) => r.json()),
          fetchWithAuth("/api/game/sudoku/leaderboard?difficulty=novice").then((r) => r.json()),
        ]);

        if (cancelled) return;

        if (resCyber.status === "fulfilled" && resCyber.value?.success) {
          const cyberList: GameLeaderboardEntry[] = resCyber.value.leaderboard ?? [];
          if (cyberList.length > 0) {
            setCyberTopScore(cyberList[0].best);
            setCyberTopPlayer(cyberList[0].displayName || cyberList[0].username);
          }
          if (resCyber.value.me?.best) {
            setCyberMyBest(resCyber.value.me.best);
          }
        }

        if (resFlight.status === "fulfilled" && resFlight.value?.success) {
          const flightList: GameLeaderboardEntry[] = resFlight.value.leaderboard ?? [];
          if (flightList.length > 0) {
            setFlightTopScore(flightList[0].best);
            setFlightTopPlayer(flightList[0].displayName || flightList[0].username);
          }
          if (resFlight.value.me?.best) {
            setFlightMyBest(resFlight.value.me.best);
          }
        }

        if (resBreaker.status === "fulfilled" && resBreaker.value?.success) {
          const breakerList: GameLeaderboardEntry[] = resBreaker.value.leaderboard ?? [];
          if (breakerList.length > 0) {
            setBreakerTopScore(breakerList[0].best);
            setBreakerTopPlayer(breakerList[0].displayName || breakerList[0].username);
          }
          if (resBreaker.value.me?.best) {
            setBreakerMyBest(resBreaker.value.me.best);
          }
        }

        if (resSweeper.status === "fulfilled" && resSweeper.value?.success) {
          const sweeperList: GameLeaderboardEntry[] = resSweeper.value.leaderboard ?? [];
          if (sweeperList.length > 0) {
            setSweeperTopScore(sweeperList[0].best);
            setSweeperTopPlayer(sweeperList[0].displayName || sweeperList[0].username);
          }
          if (resSweeper.value.me?.best) {
            setSweeperMyBest(resSweeper.value.me.best);
          }
        }

        if (resSudoku.status === "fulfilled" && resSudoku.value?.success) {
          const sudokuList: GameLeaderboardEntry[] = resSudoku.value.leaderboard ?? [];
          if (sudokuList.length > 0) {
            setSudokuTopScore(sudokuList[0].best);
            setSudokuTopPlayer(sudokuList[0].displayName || sudokuList[0].username);
          }
          if (resSudoku.value.me?.best) {
            setSudokuMyBest(resSudoku.value.me.best);
          }
        }
      } catch {
        /* offline fallback works gracefully */
      }
    };

    void fetchScores();
    return () => {
      cancelled = true;
    };
  }, [fetchWithAuth]);

  // Handle Game Selection
  const selectGameAt = useCallback(
    (index: number) => {
      const validIndex = (index + GAMES_DATA.length) % GAMES_DATA.length;
      setSelectedIndex(validIndex);
      playNavSound();
      setJoystickTilt(validIndex > selectedIndex ? "right" : "left");
      setTimeout(() => setJoystickTilt("none"), 160);
    },
    [selectedIndex]
  );

  // Launch currently selected game
  const handleLaunchGame = useCallback(() => {
    const chosen = GAMES_DATA[selectedIndex];
    if (chosen.isLocked) {
      playBuzzSound();
      return;
    }
    if (chosen.id === "battle") {
      playSelectSound();
      setShowChallengeModal(true);
      return;
    }
    playLaunchSound();
    onSelectGame(chosen.id as ArcadeGameType);
  }, [selectedIndex, onSelectGame]);

  // Insert Coin button
  const handleInsertCoin = useCallback(() => {
    playCoinSound();
    setCredits((prev) => prev + 1);
    setPressedBtn("coin");
    setTimeout(() => setPressedBtn(null), 180);
  }, []);

  // Keyboard Shortcuts Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        e.preventDefault();
        selectGameAt(selectedIndex + 1);
      } else if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        e.preventDefault();
        selectGameAt(selectedIndex - 1);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setPressedBtn("start");
        setTimeout(() => setPressedBtn(null), 180);
        handleLaunchGame();
      } else if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        handleInsertCoin();
      } else if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        const nextMuted = toggleArcadeMuted();
        setMuted(nextMuted);
      } else if (e.key === "Escape") {
        e.preventDefault();
        if (showLeaderboardModal) {
          setShowLeaderboardModal(false);
        } else if (showChallengeModal) {
          setShowChallengeModal(false);
        } else {
          onClose();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedIndex, selectGameAt, handleLaunchGame, handleInsertCoin, onClose, showLeaderboardModal, showChallengeModal]);

  // -------------------------------------------------------------
  // Animated Live Canvas Demos for Game Cards
  // -------------------------------------------------------------
  useEffect(() => {
    let animId: number;
    let t = 0;

    const renderCanvases = () => {
      t += 0.035;

      // 1. Cyber Defense Radar & Lasers
      const cyberCanvas = cyberCanvasRef.current;
      if (cyberCanvas) {
        const ctx = cyberCanvas.getContext("2d");
        if (ctx) {
          const w = (cyberCanvas.width = cyberCanvas.offsetWidth || 300);
          const h = (cyberCanvas.height = cyberCanvas.offsetHeight || 140);
          ctx.clearRect(0, 0, w, h);

          // Grid background
          ctx.strokeStyle = "rgba(0, 245, 118, 0.1)";
          ctx.lineWidth = 1;
          for (let x = 0; x < w; x += 22) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
          }
          for (let y = 0; y < h; y += 22) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
          }

          // Rotating radar sweep
          const cx = w / 2;
          const cy = h / 2 + 10;
          const sweepAngle = t * 1.5;
          const gradient = ctx.createRadialGradient(cx, cy, 10, cx, cy, 70);
          gradient.addColorStop(0, "rgba(0, 245, 118, 0.3)");
          gradient.addColorStop(1, "rgba(0, 245, 118, 0)");
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(cx, cy, 65, sweepAngle - 0.5, sweepAngle);
          ctx.lineTo(cx, cy);
          ctx.fill();

          // Radar circle
          ctx.strokeStyle = "rgba(0, 245, 118, 0.25)";
          ctx.beginPath();
          ctx.arc(cx, cy, 60, 0, Math.PI * 2);
          ctx.stroke();

          // Animated Lasers fired from starship
          const laserY = cy - 20 - ((t * 140) % (h * 0.6));
          ctx.fillStyle = "#00e5ff";
          ctx.shadowColor = "#00e5ff";
          ctx.shadowBlur = 8;
          ctx.fillRect(cx - 8, laserY, 3, 10);
          ctx.fillRect(cx + 5, laserY, 3, 10);
          ctx.shadowBlur = 0;

          // Orbiting Crypto Companions
          for (let d = 0; d < 2; d++) {
            const dAngle = t * 2.5 + d * Math.PI;
            const dX = cx + Math.cos(dAngle) * 26;
            const dY = cy + Math.sin(dAngle) * 16;
            ctx.fillStyle = "#ffb800";
            ctx.shadowColor = "#ffb800";
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.arc(dX, dY, 3.5, 0, Math.PI * 2);
            ctx.fill();
          }

          // Interceptor Starship (Gəmi)
          ctx.save();
          ctx.translate(cx, cy);

          // Animated plasma thruster flame
          const flameLen = 8 + Math.sin(t * 16) * 5;
          ctx.fillStyle = "#00e5ff";
          ctx.shadowColor = "#00e5ff";
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.moveTo(-4, 10);
          ctx.lineTo(0, 10 + flameLen);
          ctx.lineTo(4, 10);
          ctx.closePath();
          ctx.fill();

          // Starship Hull & Wings
          ctx.fillStyle = "#091c16";
          ctx.strokeStyle = "#00f576";
          ctx.lineWidth = 1.5;
          ctx.shadowColor = "#00f576";
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.moveTo(0, -14);   // Nose
          ctx.lineTo(14, 10);   // Right wingtip
          ctx.lineTo(6, 7);     // Right inner
          ctx.lineTo(0, 10);    // Tail center
          ctx.lineTo(-6, 7);    // Left inner
          ctx.lineTo(-14, 10);  // Left wingtip
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Cockpit core
          ctx.fillStyle = "#00f576";
          ctx.beginPath();
          ctx.arc(0, -2, 2.5, 0, Math.PI * 2);
          ctx.fill();

          ctx.restore();
          ctx.shadowBlur = 0;

          // Enemy malware blips
          for (let i = 0; i < 4; i++) {
            const angle = (i * Math.PI) / 2 + Math.sin(t + i) * 0.4;
            const dist = 36 + Math.cos(t * 1.2 + i) * 16;
            const ex = cx + Math.cos(angle) * dist;
            const ey = cy - 20 + Math.sin(angle) * dist * 0.7;
            ctx.fillStyle = i % 2 === 0 ? "#ff3344" : "#ff9900";
            ctx.shadowColor = ctx.fillStyle;
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.arc(ex, ey, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
          }
        }
      }

      // 2. Garden Flight Songbird & Breezes
      const flightCanvas = flightCanvasRef.current;
      if (flightCanvas) {
        const ctx = flightCanvas.getContext("2d");
        if (ctx) {
          const w = (flightCanvas.width = flightCanvas.offsetWidth || 300);
          const h = (flightCanvas.height = flightCanvas.offsetHeight || 140);
          ctx.clearRect(0, 0, w, h);

          // Soft sky gradient
          const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
          skyGrad.addColorStop(0, "#081b24");
          skyGrad.addColorStop(1, "#122a28");
          ctx.fillStyle = skyGrad;
          ctx.fillRect(0, 0, w, h);

          // Drifting wind particles
          ctx.fillStyle = "rgba(255, 202, 40, 0.4)";
          for (let i = 0; i < 12; i++) {
            const px = (w + (i * 28 - t * 45)) % w;
            const py = (h * 0.2 + (i * 17) % (h * 0.6) + Math.sin(t + i) * 10) % h;
            ctx.beginPath();
            ctx.arc(px, py, 1.8, 0, Math.PI * 2);
            ctx.fill();
          }

          // Arches / columns in background
          ctx.fillStyle = "rgba(240, 235, 220, 0.12)";
          const columnX = (w - ((t * 30) % (w + 40))) % w;
          ctx.fillRect(columnX, 0, 24, h * 0.35);
          ctx.fillRect(columnX, h * 0.65, 24, h * 0.35);

          // Golden Songbird flapping
          const birdY = h / 2 + Math.sin(t * 3) * 16;
          ctx.fillStyle = "#ffb800";
          ctx.shadowColor = "#ffb800";
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.ellipse(w * 0.35, birdY, 10, 7, 0, 0, Math.PI * 2);
          ctx.fill();

          // Wing flap
          const wingOffset = Math.sin(t * 10) * 8;
          ctx.beginPath();
          ctx.moveTo(w * 0.35 - 3, birdY);
          ctx.lineTo(w * 0.35 - 10, birdY - wingOffset);
          ctx.lineTo(w * 0.35 + 2, birdY - 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      // 3. Vault Breaker (Breakout / Arkanoid live demo)
      const breakerCanvas = breakerCanvasRef.current;
      if (breakerCanvas) {
        const ctx = breakerCanvas.getContext("2d");
        if (ctx) {
          const w = (breakerCanvas.width = breakerCanvas.offsetWidth || 300);
          const h = (breakerCanvas.height = breakerCanvas.offsetHeight || 140);
          ctx.fillStyle = "#070b12";
          ctx.fillRect(0, 0, w, h);

          // Grid
          ctx.strokeStyle = "rgba(0, 229, 255, 0.08)";
          ctx.lineWidth = 1;
          for (let x = 0; x < w; x += 20) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
          }

          // Mini Bricks (3 rows)
          const cols = 7;
          const rows = 3;
          const bW = (w - 30 - (cols - 1) * 4) / cols;
          const bH = 10;
          const colors = ["#00f576", "#00e5ff", "#ffb800"];
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              const cycle = Math.floor(t * 0.9) % 10;
              if ((r * cols + c) % 10 === cycle) continue; // simulate destroyed brick

              ctx.fillStyle = colors[r % colors.length];
              ctx.shadowColor = ctx.fillStyle;
              ctx.shadowBlur = 4;
              ctx.fillRect(15 + c * (bW + 4), 14 + r * (bH + 4), bW, bH);
            }
          }
          ctx.shadowBlur = 0;

          // Mini Moving Paddle
          const padW = 46;
          const padH = 6;
          const padX = w / 2 - padW / 2 + Math.sin(t * 2.2) * (w * 0.32);
          const padY = h - 14;

          ctx.fillStyle = "#00e5ff";
          ctx.shadowColor = "#00e5ff";
          ctx.shadowBlur = 8;
          ctx.fillRect(padX, padY, padW, padH);

          // Mini Bouncing Ball
          const ballCycle = (t * 2.6) % Math.PI;
          const ballX = padX + padW / 2 + Math.cos(t * 3) * 18;
          const ballY = h - 22 - Math.abs(Math.sin(ballCycle)) * (h - 60);

          ctx.fillStyle = "#ffffff";
          ctx.shadowColor = "#00e5ff";
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.arc(ballX, ballY, 3.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      // 4. Cyber Sweeper (Minesweeper live radar scan demo)
      const sweeperCanvas = sweeperCanvasRef.current;
      if (sweeperCanvas) {
        const ctx = sweeperCanvas.getContext("2d");
        if (ctx) {
          const w = (sweeperCanvas.width = sweeperCanvas.offsetWidth || 300);
          const h = (sweeperCanvas.height = sweeperCanvas.offsetHeight || 140);
          ctx.fillStyle = "#070b12";
          ctx.fillRect(0, 0, w, h);

          // Draw 7x4 mini cells
          const cols = 7;
          const rows = 4;
          const cW = (w - 24 - (cols - 1) * 3) / cols;
          const cH = (h - 20 - (rows - 1) * 3) / rows;
          const scanCol = Math.floor((t * 2.2) % (cols + 2));

          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              const cx = 12 + c * (cW + 3);
              const cy = 10 + r * (cH + 3);

              if (c < scanCol) {
                // Revealed cell
                ctx.fillStyle = "#0c1322";
                ctx.fillRect(cx, cy, cW, cH);
                ctx.strokeStyle = "rgba(0, 245, 118, 0.2)";
                ctx.strokeRect(cx, cy, cW, cH);

                // Numbers or flag
                if ((r + c) % 5 === 2) {
                  // Golden flag
                  ctx.fillStyle = "#ffb800";
                  ctx.font = "bold 9px monospace";
                  ctx.fillText("⚑", cx + cW / 2 - 3, cy + cH / 2 + 3);
                } else if ((r + c) % 3 === 1) {
                  ctx.fillStyle = "#38bdf8";
                  ctx.font = "bold 8px monospace";
                  ctx.fillText("1", cx + cW / 2 - 2, cy + cH / 2 + 3);
                } else if ((r + c) % 4 === 0) {
                  ctx.fillStyle = "#4ade80";
                  ctx.font = "bold 8px monospace";
                  ctx.fillText("2", cx + cW / 2 - 2, cy + cH / 2 + 3);
                }
              } else {
                // Unrevealed cell
                ctx.fillStyle = "#1e293b";
                ctx.fillRect(cx, cy, cW, cH);
                ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
                ctx.strokeRect(cx, cy, cW, cH);
              }
            }
          }

          // Scanner radar line sweep
          if (scanCol < cols) {
            const lx = 12 + scanCol * (cW + 3);
            ctx.fillStyle = "rgba(236, 72, 153, 0.35)";
            ctx.fillRect(lx - 2, 10, 4, rows * (cH + 3));
          }
        }
      }

      // 5. Cyber Sudoku (Cryptographic 9x9 Matrix scan demo)
      const sudokuCanvas = sudokuCanvasRef.current;
      if (sudokuCanvas) {
        const ctx = sudokuCanvas.getContext("2d");
        if (ctx) {
          const w = (sudokuCanvas.width = sudokuCanvas.offsetWidth || 300);
          const h = (sudokuCanvas.height = sudokuCanvas.offsetHeight || 140);
          ctx.fillStyle = "#090d18";
          ctx.fillRect(0, 0, w, h);

          // Center 9x9 mini matrix inside canvas
          const size = Math.min(h - 16, 120);
          const startX = (w - size) / 2;
          const startY = (h - size) / 2;
          const cellSize = size / 9;

          // Background matrix grid lines
          for (let i = 0; i <= 9; i++) {
            const isBox = i % 3 === 0;
            ctx.strokeStyle = isBox ? "rgba(168, 85, 247, 0.7)" : "rgba(168, 85, 247, 0.2)";
            ctx.lineWidth = isBox ? 1.5 : 0.8;

            // Horizontal
            ctx.beginPath();
            ctx.moveTo(startX, startY + i * cellSize);
            ctx.lineTo(startX + size, startY + i * cellSize);
            ctx.stroke();

            // Vertical
            ctx.beginPath();
            ctx.moveTo(startX + i * cellSize, startY);
            ctx.lineTo(startX + i * cellSize, startY + size);
            ctx.stroke();
          }

          // Sample digits in matrix
          const sample = [
            [5, 3, 0, 0, 7, 0, 0, 0, 0],
            [6, 0, 0, 1, 9, 5, 0, 0, 0],
            [0, 9, 8, 0, 0, 0, 0, 6, 0],
            [8, 0, 0, 0, 6, 0, 0, 0, 3],
            [4, 0, 0, 8, 0, 3, 0, 0, 1],
            [7, 0, 0, 0, 2, 0, 0, 0, 6],
            [0, 6, 0, 0, 0, 0, 2, 8, 0],
            [0, 0, 0, 4, 1, 9, 0, 0, 5],
            [0, 0, 0, 0, 8, 0, 0, 7, 9],
          ];

          ctx.font = `bold ${Math.floor(cellSize * 0.75)}px monospace`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
              const val = sample[r][c];
              if (val > 0) {
                const cx = startX + c * cellSize + cellSize / 2;
                const cy = startY + r * cellSize + cellSize / 2;
                ctx.fillStyle = (r + c) % 2 === 0 ? "#93c5fd" : "#c084fc";
                ctx.fillText(String(val), cx, cy);
              }
            }
          }

          // Scanning cryptographic sweep laser
          const scanY = startY + ((t * 40) % size);
          const scanGrad = ctx.createLinearGradient(startX, scanY, startX + size, scanY);
          scanGrad.addColorStop(0, "rgba(168, 85, 247, 0)");
          scanGrad.addColorStop(0.5, "rgba(0, 229, 255, 0.6)");
          scanGrad.addColorStop(1, "rgba(168, 85, 247, 0)");
          ctx.fillStyle = scanGrad;
          ctx.fillRect(startX, scanY - 1, size, 2);

          // Subtle glowing orb tracking cell
          const orbCol = Math.floor((t * 2) % 9);
          const orbRow = Math.floor((t * 1.5) % 9);
          ctx.strokeStyle = "#a855f7";
          ctx.shadowColor = "#a855f7";
          ctx.shadowBlur = 8;
          ctx.strokeRect(startX + orbCol * cellSize, startY + orbRow * cellSize, cellSize, cellSize);
          ctx.shadowBlur = 0;
        }
      }

      // 6. Cyber Sea Battleship (Dəniz Döyüşü) Radar & Target Canvas
      const battleCanvas = battleCanvasRef.current;
      if (battleCanvas) {
        const ctx = battleCanvas.getContext("2d");
        if (ctx) {
          const w = (battleCanvas.width = battleCanvas.offsetWidth || 300);
          const h = (battleCanvas.height = battleCanvas.offsetHeight || 140);
          ctx.clearRect(0, 0, w, h);

          // Grid coordinates
          ctx.strokeStyle = "rgba(0, 229, 255, 0.15)";
          ctx.lineWidth = 1;
          const gridSize = 16;
          for (let x = 0; x < w; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
          }
          for (let y = 0; y < h; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
          }

          // Sonar sweep circle
          const cx = w / 2;
          const cy = h / 2;
          const sweepAngle = t * 1.8;
          const radGrad = ctx.createRadialGradient(cx, cy, 5, cx, cy, 60);
          radGrad.addColorStop(0, "rgba(0, 229, 255, 0.35)");
          radGrad.addColorStop(1, "rgba(0, 229, 255, 0)");
          ctx.fillStyle = radGrad;
          ctx.beginPath();
          ctx.arc(cx, cy, 55, sweepAngle - 0.6, sweepAngle);
          ctx.lineTo(cx, cy);
          ctx.fill();

          // Radar concentric rings
          ctx.strokeStyle = "rgba(0, 229, 255, 0.3)";
          ctx.beginPath();
          ctx.arc(cx, cy, 25, 0, Math.PI * 2);
          ctx.arc(cx, cy, 50, 0, Math.PI * 2);
          ctx.stroke();

          // Battleship Warship Hull on Left
          ctx.fillStyle = "#092430";
          ctx.strokeStyle = "#00e5ff";
          ctx.lineWidth = 1.5;
          ctx.shadowColor = "#00e5ff";
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.moveTo(35, 60);
          ctx.lineTo(75, 60);
          ctx.lineTo(85, 70);
          ctx.lineTo(25, 70);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Gun turrets
          ctx.fillStyle = "#00e5ff";
          ctx.fillRect(45, 54, 8, 6);
          ctx.fillRect(60, 54, 8, 6);
          ctx.shadowBlur = 0;

          // Crosshair Target on Right
          const targetX = w - 60 + Math.sin(t * 2) * 8;
          const targetY = cy + Math.cos(t * 1.5) * 6;
          ctx.strokeStyle = "#ff4d4f";
          ctx.shadowColor = "#ff4d4f";
          ctx.shadowBlur = 10;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(targetX, targetY, 14, 0, Math.PI * 2);
          ctx.moveTo(targetX - 20, targetY);
          ctx.lineTo(targetX + 20, targetY);
          ctx.moveTo(targetX, targetY - 20);
          ctx.lineTo(targetX, targetY + 20);
          ctx.stroke();
          ctx.shadowBlur = 0;

          // Explosive hit sparks
          if (Math.floor(t * 3) % 2 === 0) {
            ctx.fillStyle = "#ffb800";
            ctx.beginPath();
            ctx.arc(targetX + Math.sin(t * 10) * 8, targetY + Math.cos(t * 10) * 8, 3, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // 7. Cyber Shooter (Krunker 3D FPS) Preview Canvas
      const shooterCanvas = shooterCanvasRef.current;
      if (shooterCanvas) {
        const ctx = shooterCanvas.getContext("2d");
        if (ctx) {
          const w = (shooterCanvas.width = shooterCanvas.offsetWidth || 300);
          const h = (shooterCanvas.height = shooterCanvas.offsetHeight || 140);
          ctx.clearRect(0, 0, w, h);

          // 3D Perspective Grid Floor
          ctx.strokeStyle = "rgba(0, 245, 118, 0.25)";
          ctx.lineWidth = 1;
          const vanishingY = h * 0.45;
          for (let x = -w; x <= w * 2; x += 28) {
            ctx.beginPath();
            ctx.moveTo(w / 2, vanishingY);
            ctx.lineTo(x, h);
            ctx.stroke();
          }
          for (let y = vanishingY; y < h; y += (h - vanishingY) / 5) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
          }

          // Animated Crosshair with recoil pulse
          const cx = w / 2;
          const cy = vanishingY;
          const pulse = Math.sin(t * 8) * 3;
          ctx.strokeStyle = "#00f576";
          ctx.lineWidth = 2;
          ctx.shadowColor = "#00f576";
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.arc(cx, cy, 10 + pulse, 0, Math.PI * 2);
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(cx, cy, 2, 0, Math.PI * 2);
          ctx.fillStyle = "#00f576";
          ctx.fill();

          // Laser tracer beams
          ctx.strokeStyle = "#00e5ff";
          ctx.shadowColor = "#00e5ff";
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.moveTo(w * 0.75, h);
          ctx.lineTo(cx + Math.sin(t * 4) * 15, cy);
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
      }

      animId = requestAnimationFrame(renderCanvases);
    };

    animId = requestAnimationFrame(renderCanvases);
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <div
      className="rac-overlay"
      role="dialog"
      aria-label="Expressbank Retro Arcade Cabinet"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="rac-cabinet">
        {/* Top Marquee Lightbox */}
        <header className="rac-marquee">
          <div className="rac-marquee__brand">
            <div className="rac-marquee__logo-wrapper">
              <ExpressbankEmblem size={28} glow />
            </div>
            <div className="rac-marquee__titles">
              <h1 className="rac-marquee__title">
                EXPRESSBANK <span>RETRO ARCADE</span>
              </h1>
              <span className="rac-marquee__subtitle">
                {isAz
                  ? "SİSTEM 2088 • ÇOXFUNKSİYALI OYUN KABİNETİ"
                  : "SYSTEM 2088 • MULTI-GAME ARCADE CABINET"}
              </span>
            </div>
          </div>

          <div className="rac-marquee__actions">
            {/* Retro Azerbaijan BGM Player */}
            <RetroAzerbaijanPlayer />

            {/* 1v1 Battle Challenge (Meydan Oxu) Trigger */}
            <button
              type="button"
              className="rac-pill-btn rac-pill-btn--challenge"
              onClick={() => {
                playSelectSound();
                setShowChallengeModal(true);
              }}
              title={isAz ? "1v1 Dəniz Döyüşü Meydan Oxu" : "1v1 Naval Battle Challenge"}
            >
              <Swords size={14} color="#00e5ff" />
              <span>{isAz ? "⚔️ MEYDAN OXU" : "⚔️ CHALLENGE"}</span>
            </button>

            {/* Tournament Leaderboard Modal Trigger */}
            <button
              type="button"
              className="rac-pill-btn rac-pill-btn--gold"
              onClick={() => {
                playSelectSound();
                setShowLeaderboardModal(true);
              }}
              title={isAz ? "Turnir Liderlər Cədvəli" : "Tournament Leaderboard"}
            >
              <Trophy size={14} color="#ffb800" />
              <span>{isAz ? "LİDERLƏR CƏDVƏLİ" : "LEADERBOARD"}</span>
            </button>

            {/* CRT Filter Toggle */}
            <button
              type="button"
              className={`rac-pill-btn ${crtFilterActive ? "rac-pill-btn--active" : ""}`}
              onClick={() => setCrtFilterActive((prev) => !prev)}
              title="Toggle CRT Scanline Effect"
            >
              <Tv size={14} />
              <span>CRT: {crtFilterActive ? "ON" : "OFF"}</span>
            </button>

            {/* Mute / Audio Toggle */}
            <button
              type="button"
              className={`rac-pill-btn ${!muted ? "rac-pill-btn--active" : ""}`}
              onClick={() => {
                const nextMuted = toggleArcadeMuted();
                setMuted(nextMuted);
              }}
              title="Toggle 8-bit Audio (M)"
            >
              {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              <span>{muted ? "MUTED" : "SOUND ON"}</span>
            </button>

            {/* Close Button */}
            <button
              type="button"
              className="rac-close-btn"
              onClick={onClose}
              aria-label="Close Arcade (Esc)"
              title="Esc"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {/* High Scores & Status Ticker Deck */}
        <div className="rac-ticker-bar">
          <div className="rac-ticker-bar__credit">
            <span className="rac-credit-badge">
              CREDIT: {String(credits).padStart(2, "0")}
            </span>
            <span className="rac-freeplay-badge">● FREE PLAY</span>
          </div>

          <div className="rac-ticker-bar__schedule">
            <span className="rac-schedule-pill">
              <span className="rac-schedule-dot" />
              <span>BAKU {access.bakuTimeStr}</span>
              <span className="rac-schedule-tag">
                {access.isWeekend
                  ? (isAz ? "HƏFTƏSONU 7/24" : "WEEKEND 7/24")
                  : access.isInfosecExempt
                  ? (isAz ? "INFOSEC İSTİSNA 7/24" : "INFOSEC EXEMPT 7/24")
                  : access.isLunchBreak
                  ? (isAz ? "NAHAR (13-14)" : "LUNCH (13-14)")
                  : access.isBypassActive
                  ? (isAz ? "TEST REJİMİ" : "TEST MODE")
                  : (isAz ? "İŞDƏN SONRA" : "AFTER HOURS")}
              </span>
            </span>
          </div>

          <div className="rac-ticker-bar__news">
            ★ {isAz ? "LİDERLƏR CƏDVƏLİ:" : "HIGH SCORES:"}{" "}
            <span>CYBER DEFENSE:</span>{" "}
            {cyberTopScore != null
              ? `${cyberTopScore.toLocaleString()} PTS (${cyberTopPlayer || "TOP"})`
              : "READY"}
            {"  "}•{"  "}
            <span>GARDEN FLIGHT:</span>{" "}
            {flightTopScore != null
              ? `${flightTopScore} FLIGHTS (${flightTopPlayer || "TOP"})`
              : "READY"}
            {"  "}•{"  "}
            <span>VAULT BREAKER:</span>{" "}
            {breakerTopScore != null
              ? `${breakerTopScore.toLocaleString()} PTS (${breakerTopPlayer || "TOP"})`
              : breakerMyBest > 0
              ? `${breakerMyBest.toLocaleString()} PTS`
              : "READY"}
            {"  "}•{"  "}
            <span>CYBER SWEEPER:</span>{" "}
            {sweeperTopScore != null
              ? `${sweeperTopScore}s (${sweeperTopPlayer || "PRO"})`
              : sweeperMyBest !== null
              ? `${sweeperMyBest}s`
              : "READY"}
            {"  "}•{"  "}
            <span>CYBER SUDOKU:</span>{" "}
            {sudokuTopScore != null
              ? `${sudokuTopScore}s (${sudokuTopPlayer || "EXPERT"})`
              : sudokuMyBest !== null
              ? `${sudokuMyBest}s`
              : "READY"}
          </div>

          <div className="rac-ticker-bar__agent">
            {currentUser?.fullName || currentUser?.username || "PLAYER 1"}
          </div>
        </div>

        {/* CRT Screen Display */}
        <div className={`rac-crt-screen ${crtFilterActive ? "rac-crt--active" : ""}`}>
          <div className="rac-crt-header">
            <div className="rac-crt-header__eyebrow">
              {isAz ? "◄ OYUNU SEÇİN VƏ DÖYÜŞƏ BAŞLAYIN ►" : "◄ SELECT GAME & PRESS START ►"}
            </div>
            <h2 className="rac-crt-header__title">
              {isAz ? "OYUN KABİNETİ SEÇİMİ" : "CHOOSE YOUR CHALLENGE"}
            </h2>
            <p className="rac-crt-header__hint">
              {isAz
                ? "Klaviaturanın oxları (← / →) ilə oyunu seçin və Enter və ya Space ilə daxil olun"
                : "Use Arrow keys (← / →) to browse, Enter or Space to play"}
            </p>
          </div>

          {/* 5 Game Selection Cards */}
          <div className="rac-cards-grid" role="radiogroup" aria-label="Arcade Games">
            {GAMES_DATA.map((game, idx) => {
              const isSelected = selectedIndex === idx;
              const isCyber = game.id === "cyber";
              const isFlight = game.id === "flight";
              const isBreaker = game.id === "breaker";
              const isSweeper = game.id === "sweeper";
              const isSudoku = game.id === "sudoku";

              const myScore = isCyber
                ? cyberMyBest > 0
                  ? `${cyberMyBest.toLocaleString()} PTS`
                  : null
                : isFlight
                ? flightMyBest > 0
                  ? `${flightMyBest} FLIGHTS`
                  : null
                : isBreaker
                ? breakerMyBest > 0
                  ? `${breakerMyBest.toLocaleString()} PTS`
                  : null
                : isSweeper && sweeperMyBest !== null
                ? `${sweeperMyBest}s`
                : isSudoku && sudokuMyBest !== null
                ? `${sudokuMyBest}s`
                : null;
              const topScore = isCyber
                ? cyberTopScore != null
                  ? `${cyberTopScore.toLocaleString()} PTS`
                  : null
                : isFlight
                ? flightTopScore != null
                  ? `${flightTopScore} FLIGHTS`
                  : null
                : isBreaker
                ? breakerTopScore != null
                  ? `${breakerTopScore.toLocaleString()} PTS`
                  : null
                : isSweeper
                ? sweeperTopScore != null
                  ? `${sweeperTopScore}s`
                  : null
                : isSudoku
                ? sudokuTopScore != null
                  ? `${sudokuTopScore}s`
                  : null
                : null;

              return (
                <div
                  key={game.id}
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={0}
                  className={`rac-game-card ${
                    isSelected ? "rac-game-card--selected" : ""
                  } ${game.isLocked ? "rac-game-card--locked" : ""}`}
                  style={
                    {
                      "--card-accent": game.accentColor,
                      "--card-glow": game.glowColor,
                    } as React.CSSProperties
                  }
                  onClick={() => {
                    if (selectedIndex !== idx) {
                      selectGameAt(idx);
                    } else {
                      handleLaunchGame();
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleLaunchGame();
                    }
                  }}
                >
                  {/* Dynamic Canvas Banner */}
                  <div className="rac-card-banner">
                    {game.id === "cyber" && (
                      <canvas ref={cyberCanvasRef} className="rac-card-canvas" />
                    )}
                    {game.id === "flight" && (
                      <canvas ref={flightCanvasRef} className="rac-card-canvas" />
                    )}
                    {game.id === "breaker" && (
                      <canvas ref={breakerCanvasRef} className="rac-card-canvas" />
                    )}
                    {game.id === "sweeper" && (
                      <canvas ref={sweeperCanvasRef} className="rac-card-canvas" />
                    )}
                    {game.id === "sudoku" && (
                      <canvas ref={sudokuCanvasRef} className="rac-card-canvas" />
                    )}
                    {game.id === "battle" && (
                      <canvas ref={battleCanvasRef} className="rac-card-canvas" />
                    )}
                    {game.id === "shooter" && (
                      <canvas ref={shooterCanvasRef} className="rac-card-canvas" />
                    )}

                    <span
                      className={`rac-card-banner__badge rac-card-banner__badge--${game.badgeType}`}
                    >
                      {game.badge}
                    </span>
                  </div>

                  {/* Card Body */}
                  <div className="rac-card-body">
                    <span className="rac-card-genre">{game.genre}</span>
                    <h3 className="rac-card-title">{game.title}</h3>
                    <p className="rac-card-desc">
                      {isAz ? game.description.az : game.description.en}
                    </p>

                    {/* Stats & Personal Record */}
                    {!game.isLocked ? (
                      <div className="rac-card-stats">
                        <div className="rac-stat-item">
                          <span className="rac-stat-label">
                            {isAz ? "SƏNİN REKORDUN" : "YOUR BEST"}
                          </span>
                          <span className="rac-stat-value rac-stat-value--highlight">
                            {myScore != null ? myScore : (isAz ? "HƏLƏ YOXDUR" : "NO RUN YET")}
                          </span>
                        </div>
                        <div className="rac-stat-item">
                          <span className="rac-stat-label">
                            {isAz ? "TOP ŞİRKƏT" : "TOP LEADER"}
                          </span>
                          <span className="rac-stat-value">
                            {topScore != null ? topScore : "---"}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="rac-card-stats">
                        <div className="rac-stat-item" style={{ gridColumn: "span 2" }}>
                          <span className="rac-stat-label">STATUS</span>
                          <span className="rac-stat-value" style={{ color: "#ff4b5c" }}>
                            CLASSIFIED • TEZLİKLƏ
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Controls overview */}
                    <div className="rac-card-controls">
                      <span>{isAz ? "İdarəetmə:" : "Controls:"}</span>
                      {game.controls.map((ctrl, i) => (
                        <kbd key={i}>{ctrl}</kbd>
                      ))}
                    </div>

                    {/* Launch CTA */}
                    <button
                      type="button"
                      className="rac-card-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (selectedIndex !== idx) {
                          selectGameAt(idx);
                        } else {
                          handleLaunchGame();
                        }
                      }}
                      tabIndex={-1}
                    >
                      {game.isLocked ? (
                        <>
                          <Lock size={15} />
                          <span>{isAz ? "ŞİFRƏLƏNİB" : "LOCKED"}</span>
                        </>
                      ) : isSelected ? (
                        <>
                          <Zap size={15} />
                          <span>
                            {isAz ? "BAŞLA (ENTER / SPACE)" : "PLAY (ENTER / SPACE)"}
                          </span>
                        </>
                      ) : (
                        <>
                          <ChevronRight size={15} />
                          <span>{isAz ? "SEÇ VƏ BAX" : "SELECT GAME"}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom Cabinet Control Deck */}
        <footer className="rac-control-deck">
          <div className="rac-deck-controls">
            {/* Visual Interactive Ball-Top Joystick */}
            <div className="rac-joystick-wrap">
              <div
                className={`rac-joystick ${
                  joystickTilt === "left"
                    ? "rac-joystick--left"
                    : joystickTilt === "right"
                    ? "rac-joystick--right"
                    : ""
                }`}
                onClick={() => selectGameAt(selectedIndex + 1)}
                title="Click or use Arrow Keys to move joystick"
              >
                <div className="rac-joystick__stick" />
              </div>
            </div>

            {/* Illuminated Arcade Buttons */}
            <div className="rac-deck-buttons">
              {/* Button A: Start */}
              <button
                type="button"
                className={`rac-arcade-button rac-arcade-button--green ${
                  pressedBtn === "start" ? "rac-arcade-button--pressed" : ""
                }`}
                onClick={handleLaunchGame}
                title="Start Game (Enter / Space)"
              >
                <div className="rac-arcade-button__cap" />
                <span className="rac-arcade-button__label">1P START</span>
              </button>

              {/* Button C: Coin */}
              <button
                type="button"
                className={`rac-arcade-button rac-arcade-button--gold ${
                  pressedBtn === "coin" ? "rac-arcade-button--pressed" : ""
                }`}
                onClick={handleInsertCoin}
                title="Insert Coin (C)"
              >
                <div className="rac-arcade-button__cap" />
                <span className="rac-arcade-button__label">COIN (C)</span>
              </button>

              {/* Button B: Cancel / Exit */}
              <button
                type="button"
                className="rac-arcade-button rac-arcade-button--red"
                onClick={onClose}
                title="Exit (Esc)"
              >
                <div className="rac-arcade-button__cap" />
                <span className="rac-arcade-button__label">EXIT (ESC)</span>
              </button>
            </div>
          </div>

          {/* Keyboard shortcuts reminder */}
          <div className="rac-deck-shortcuts">
            <div className="rac-shortcut-item">
              <kbd>←</kbd> <kbd>→</kbd> <span>{isAz ? "Seç" : "Select"}</span>
            </div>
            <div className="rac-shortcut-item">
              <kbd>ENTER</kbd> / <kbd>SPACE</kbd> <span>{isAz ? "Başla" : "Play"}</span>
            </div>
            <div className="rac-shortcut-item">
              <kbd>C</kbd> <span>{isAz ? "Jeton" : "Coin"}</span>
            </div>
            <div className="rac-shortcut-item">
              <kbd>M</kbd> <span>{isAz ? "Səs" : "Mute"}</span>
            </div>
            <div className="rac-shortcut-item">
              <kbd>ESC</kbd> <span>{isAz ? "Bağla" : "Close"}</span>
            </div>
          </div>
        </footer>
      </div>

      {/* Tournament Leaderboard Modal */}
      {showLeaderboardModal && (
        <GameLeaderboardModal
          initialGame={GAMES_DATA[selectedIndex]?.id || "cyber"}
          onClose={() => setShowLeaderboardModal(false)}
          onLaunchGame={(gameKey) => {
            setShowLeaderboardModal(false);
            onSelectGame(gameKey);
          }}
        />
      )}

      {/* 1v1 Battle Challenge Selection Modal */}
      {showChallengeModal && (
        <ChallengeModal
          onClose={() => setShowChallengeModal(false)}
          onChallengeCreated={(matchId) => {
            setShowChallengeModal(false);
            onSelectGame("battle", matchId);
          }}
        />
      )}
    </div>
  );
};

export default RetroArcadeCabinet;
