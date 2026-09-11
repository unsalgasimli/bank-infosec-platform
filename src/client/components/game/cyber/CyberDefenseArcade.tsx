import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  RotateCcw,
  Sparkles,
  Trophy,
  X,
  Shield,
  Zap,
  Crosshair,
  ArrowUpRight,
  Flame,
  Bot,
  Activity,
  Radio,
  Lock,
  Magnet,
  Gauge,
  TrendingUp,
  Award,
  Repeat,
  LocateFixed,
  Bomb,
  ShieldAlert,
  Clock,
  Disc,
  PlusCircle,
  BatteryCharging,
  Crown,
  Cpu,
  Rocket,
} from "lucide-react";
import { ExpressbankEmblem } from "../../common/ExpressbankLogo.js";
import { useAuth } from "../../../context/AuthContext.js";
import { useI18n } from "../../../context/I18nContext.js";
import {
  advanceCyberDefense,
  applyUpgradeChoice,
  createCyberDefenseState,
  fireLasers,
  startCyberGame,
  type CyberDefenseState,
} from "./cyber-defense-engine.js";
import { type CyberUpgrade } from "./cyber-upgrades.js";
import { CyberDefenseScene } from "./CyberDefenseScene.js";
import {
  playAzerbaijanTrack,
  stopAzerbaijanMusic,
} from "../retro-azerbaijan-music.js";
import { RetroAzerbaijanPlayer } from "../RetroAzerbaijanPlayer.js";
import type {
  GameLeaderboardEntry,
  GamePlayerStats,
} from "../../../../shared/types/game.js";
import "./cyber-defense-arcade.css";

const LOCAL_CYBER_BEST_KEY = "cyber-defense.best";

function loadLocalBest(): number {
  try {
    const raw = window.localStorage.getItem(LOCAL_CYBER_BEST_KEY);
    const val = raw ? Number(raw) : 0;
    return Number.isFinite(val) && val >= 0 ? val : 0;
  } catch {
    return 0;
  }
}

function saveLocalBest(best: number): void {
  try {
    window.localStorage.setItem(LOCAL_CYBER_BEST_KEY, String(best));
  } catch {
    /* storage unavailable */
  }
}

interface CyberDefenseArcadeProps {
  onClose: () => void;
  onSwitchGame?: () => void;
}

export const CyberDefenseArcade: React.FC<CyberDefenseArcadeProps> = ({
  onClose,
  onSwitchGame,
}) => {
  const { currentUser, fetchWithAuth } = useAuth();
  const { t, language } = useI18n();
  const isAz = language === "az";

  const [gameState, setGameState] = useState<CyberDefenseState>(() =>
    createCyberDefenseState(loadLocalBest()),
  );
  const [leaderboard, setLeaderboard] = useState<GameLeaderboardEntry[] | null>(null);
  const [me, setMe] = useState<GamePlayerStats | null>(null);
  const [syncNote, setSyncNote] = useState<"idle" | "recording" | "saved" | "offline">("idle");
  const [personalBest, setPersonalBest] = useState(loadLocalBest());

  const stateRef = useRef(gameState);
  stateRef.current = gameState;
  const mounted = useRef(true);
  const lastFrameTime = useRef<number | null>(null);

  // Play "Cəngi / Koroğlu" Azerbaijani Chiptune Battle Theme on mount
  useEffect(() => {
    playAzerbaijanTrack("cangi");
    return () => {
      stopAzerbaijanMusic();
    };
  }, []);

  // Load Leaderboard on mount
  useEffect(() => {
    mounted.current = true;
    if (!currentUser) return;

    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetchWithAuth("/api/game/cyber/leaderboard");
        const data = await res.json();
        if (cancelled || !mounted.current) return;
        if (data.success && Array.isArray(data.leaderboard)) {
          setLeaderboard(data.leaderboard);
          setMe(data.me ?? null);
          if (data.me?.best) {
            setPersonalBest((prev) => Math.max(prev, data.me.best));
            setGameState((prev) => ({ ...prev, best: Math.max(prev.best, data.me.best) }));
          }
        } else {
          setLeaderboard([]);
        }
      } catch {
        if (!cancelled && mounted.current) {
          setLeaderboard([]);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
      mounted.current = false;
    };
  }, [currentUser, fetchWithAuth]);

  // Record score when game over
  useEffect(() => {
    if (gameState.status !== "gameover" || gameState.score <= 0) return;

    saveLocalBest(gameState.best);
    setPersonalBest((prev) => Math.max(prev, gameState.best));
    setSyncNote("recording");

    if (!currentUser) {
      setSyncNote("offline");
      return;
    }

    const record = async () => {
      try {
        const res = await fetchWithAuth("/api/game/cyber/score", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ score: gameState.score, wave: gameState.wave }),
        });
        const data = await res.json();
        if (!mounted.current || !data.success) return;
        setLeaderboard(data.leaderboard ?? []);
        setMe(data.me ?? null);
        setSyncNote("saved");
      } catch {
        if (mounted.current) setSyncNote("offline");
      }
    };
    void record();
  }, [gameState.status, gameState.score, gameState.best, gameState.wave, currentUser, fetchWithAuth]);

  // Game Animation Loop
  useEffect(() => {
    let animId: number;

    const tick = (now: number) => {
      const prevTime = lastFrameTime.current ?? now;
      lastFrameTime.current = now;
      const dt = Math.min(0.05, (now - prevTime) / 1000);

      if (stateRef.current.status === "playing") {
        setGameState((prev) => advanceCyberDefense(prev, dt, 800, 600));
      }

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, []);

  // Controls
  const handleStart = useCallback(() => {
    setGameState((prev) => startCyberGame(prev));
  }, []);

  const handleShoot = useCallback(() => {
    if (stateRef.current.status === "ready") {
      handleStart();
    } else if (
      stateRef.current.status === "playing" &&
      stateRef.current.waveState !== "upgrading"
    ) {
      setGameState((prev) => fireLasers(prev, 800, 600));
    }
  }, [handleStart]);

  const handlePointerMove = useCallback((normalizedX: number) => {
    setGameState((prev) => ({ ...prev, playerTargetX: normalizedX }));
  }, []);

  const handleSelectUpgrade = useCallback((upgrade: CyberUpgrade) => {
    setGameState((prev) => applyUpgradeChoice(prev, upgrade));
  }, []);

  // Keyboard navigation & controls
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const cur = stateRef.current;

      if (e.key === "Escape") {
        onClose();
      } else if (cur.waveState === "upgrading" && cur.upgradeOptions.length > 0) {
        // Upgrade Card Shortcuts
        if (e.key === "1" && cur.upgradeOptions[0]) {
          handleSelectUpgrade(cur.upgradeOptions[0]);
        } else if (e.key === "2" && cur.upgradeOptions[1]) {
          handleSelectUpgrade(cur.upgradeOptions[1]);
        } else if (e.key === "3" && cur.upgradeOptions[2]) {
          handleSelectUpgrade(cur.upgradeOptions[2]);
        }
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (cur.status === "ready" || cur.status === "gameover") {
          handleStart();
        } else if (cur.waveState !== "upgrading") {
          handleShoot();
        }
      } else if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        setGameState((prev) => ({
          ...prev,
          playerTargetX: Math.max(0.06, prev.playerTargetX - 0.08),
        }));
      } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        setGameState((prev) => ({
          ...prev,
          playerTargetX: Math.min(0.94, prev.playerTargetX + 0.08),
        }));
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, handleStart, handleShoot, handleSelectUpgrade]);

  const isNewRecord = gameState.score > 0 && gameState.score >= gameState.best;

  const renderUpgradeIcon = (iconName: string) => {
    switch (iconName) {
      case "Crosshair":
        return <Crosshair size={24} />;
      case "Zap":
        return <Zap size={24} />;
      case "Sparkles":
        return <Sparkles size={24} />;
      case "ArrowUpRight":
        return <ArrowUpRight size={24} />;
      case "Flame":
        return <Flame size={24} />;
      case "Bot":
        return <Bot size={24} />;
      case "Shield":
        return <Shield size={24} />;
      case "HeartPulse":
        return <Activity size={24} />;
      case "Radio":
        return <Radio size={24} />;
      case "Lock":
        return <Lock size={24} />;
      case "Magnet":
        return <Magnet size={24} />;
      case "Gauge":
        return <Gauge size={24} />;
      case "Trophy":
        return <Trophy size={24} />;
      case "TrendingUp":
        return <TrendingUp size={24} />;
      case "Repeat":
        return <Repeat size={24} />;
      case "LocateFixed":
        return <LocateFixed size={24} />;
      case "Bomb":
        return <Bomb size={24} />;
      case "ShieldAlert":
        return <ShieldAlert size={24} />;
      case "Clock":
        return <Clock size={24} />;
      case "Disc":
        return <Disc size={24} />;
      case "PlusCircle":
        return <PlusCircle size={24} />;
      case "BatteryCharging":
        return <BatteryCharging size={24} />;
      case "Crown":
        return <Crown size={24} />;
      case "Cpu":
        return <Cpu size={24} />;
      case "Rocket":
        return <Rocket size={24} />;
      default:
        return <Sparkles size={24} />;
    }
  };

  return (
    <div
      className="cyber-arcade"
      role="dialog"
      aria-modal="true"
      aria-label={t("Expressbank Cyber Defense")}
    >
      <div className="cyber-arcade__backdrop" onClick={onClose} />
      <div className="cyber-arcade__panel">
        <div className="cyber-arcade__game">
          {/* Header */}
          <div className="cyber-arcade__header">
            <div className="cyber-arcade__badge">
              <ExpressbankEmblem size={18} glow />
              <span>{isAz ? "EXPRESSBANK KİBER GƏMİ" : "EXPRESSBANK CYBER DEFENSE"}</span>
            </div>
            <p className="cyber-arcade__subtitle">
              {isAz
                ? "Expressbank kiber müdafiə gəmisi ilə 15+ dalğa boyunca bank anbarını qoruyun."
                : "Command the Expressbank starship interceptor through 15+ evolving waves."}
            </p>
            {/* Retro Azerbaijan BGM Player */}
            <RetroAzerbaijanPlayer compact style={{ marginRight: "4px" }} />

            {onSwitchGame && (
              <button
                type="button"
                className="cyber-btn cyber-btn--secondary"
                style={{ padding: "4px 12px", fontSize: "11px", gap: "6px" }}
                onClick={onSwitchGame}
                title={t("Retro Arcade Kabinetinə qayıt")}
              >
                <Sparkles size={13} />
                {t("Retro Arcade Menyu")}
              </button>
            )}
            <button
              type="button"
              className="cyber-arcade__close"
              onClick={onClose}
              aria-label={t("Close")}
              title="Esc"
            >
              <X size={16} />
            </button>
          </div>

          {/* Canvas Scene */}
          <CyberDefenseScene
            state={gameState}
            onPointerMove={handlePointerMove}
            onClick={handleShoot}
          />

          {/* In-Game HUD */}
          <div className="cyber-hud">
            <div className="cyber-hud__left">
              <div className="cyber-hud__score-pill">
                <span className="cyber-hud__score-label">{t("SCORE")}</span>
                <span className="cyber-hud__score">{gameState.score}</span>
              </div>
              {gameState.multiplier > 1 && (
                <div className="cyber-hud__mult">
                  <Sparkles size={13} />
                  <span>x{gameState.multiplier}</span>
                </div>
              )}
            </div>

            <div className="cyber-hud__right">
              <div className="cyber-hud__wave">
                <Shield size={13} />
                <span>
                  {t("WAVE")} {gameState.wave} / 15+
                </span>
              </div>
              <div
                className="cyber-hud__barrier"
                title={t("Vault Perimeter Barrier (Breach Absorber)")}
              >
                <Lock size={12} />
                <span>
                  {gameState.vaultBarrier}/{gameState.maxVaultBarrier}
                </span>
              </div>
              <div className="cyber-hud__shields" title={t("Hull Shields")}>
                {Array.from({ length: gameState.maxShields }).map((_, i) => (
                  <span
                    key={i}
                    className={`cyber-shield-pip ${i >= gameState.shields ? "cyber-shield-pip--lost" : ""}`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Wave Announcement Banner */}
          {gameState.status === "playing" && gameState.waveState === "briefing" && (
            <div className="cyber-wave-announcement">
              <span className="cyber-wave-announcement__badge">
                {gameState.currentWaveConfig.isBossWave
                  ? isAz
                    ? "⚠️ TƏHLÜKƏLİ BOSS TƏHDİDİ"
                    : "⚠️ BOSS THREAT INCOMING"
                  : isAz
                    ? `DALĞA ${gameState.wave}`
                    : `WAVE ${gameState.wave}`}
              </span>
              <h3>
                {isAz
                  ? gameState.currentWaveConfig.name.az
                  : gameState.currentWaveConfig.name.en}
              </h3>
              <p>
                {isAz
                  ? gameState.currentWaveConfig.subtitle.az
                  : gameState.currentWaveConfig.subtitle.en}
              </p>
            </div>
          )}

          {/* Diep.io-Style Post-Wave Upgrade Selection Modal */}
          {gameState.status === "playing" && gameState.waveState === "upgrading" && (
            <div className="cyber-overlay cyber-overlay--upgrade">
              <div className="cyber-upgrade-modal">
                <div className="cyber-upgrade-modal__head">
                  <div className="cyber-upgrade-badge">
                    <Sparkles size={14} />
                    <span>
                      {isAz
                        ? `DALĞA ${gameState.wave} DƏF EDİLDİ`
                        : `WAVE ${gameState.wave} DEFENDED`}
                    </span>
                  </div>
                  <h2>
                    {isAz
                      ? "SİSTEM ARXİTEKTURASI TƏKMİLLƏŞDİRMƏSİ"
                      : "SELECT ARCHITECTURE EVOLUTION"}
                  </h2>
                  <p>
                    {isAz
                      ? "Daha güclü kiber hücumlara qarşı Expressbank Dronunu təkmilləşdirmək üçün 1 seçim edin."
                      : "Choose 1 system evolution to adapt your Expressbank Security Interceptor for the next wave."}
                  </p>
                </div>

                <div className="cyber-upgrade-grid">
                  {gameState.upgradeOptions.map((upgrade, idx) => {
                    const currentLvl = gameState.activeUpgrades[upgrade.id] || 0;
                    return (
                      <div
                        key={upgrade.id}
                        className={`cyber-upgrade-card cyber-upgrade-card--${upgrade.branch}`}
                        onClick={() => handleSelectUpgrade(upgrade)}
                        tabIndex={0}
                        role="button"
                      >
                        <div className="cyber-upgrade-card__top">
                          <span className="cyber-upgrade-key">[{idx + 1}]</span>
                          <span className={`cyber-upgrade-rarity cyber-upgrade-rarity--${upgrade.rarity}`}>
                            {upgrade.rarity.toUpperCase()}
                          </span>
                          <span className="cyber-upgrade-branch">
                            {upgrade.branch.toUpperCase()}
                          </span>
                          <span className="cyber-upgrade-lvl">
                            LVL {currentLvl + 1}/{upgrade.maxLevel}
                          </span>
                        </div>
                        <div
                          className="cyber-upgrade-card__icon"
                          style={{ color: upgrade.color }}
                        >
                          {renderUpgradeIcon(upgrade.icon)}
                        </div>
                        <h4 className="cyber-upgrade-card__title">
                          {isAz ? upgrade.name.az : upgrade.name.en}
                        </h4>
                        <p className="cyber-upgrade-card__desc">
                          {isAz ? upgrade.description.az : upgrade.description.en}
                        </p>
                        <div
                          className="cyber-upgrade-card__badge"
                          style={{
                            borderColor: upgrade.color,
                            color: upgrade.color,
                          }}
                        >
                          {isAz ? upgrade.badge.az : upgrade.badge.en}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="cyber-upgrade-footer">
                  <span>
                    {isAz
                      ? "Klaviaturadan [1], [2] və ya [3] düyməsinə basın, yaxud kartın üzərinə klikləyin."
                      : "Press [1], [2], or [3] on your keyboard, or click a card to equip."}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Ready Overlay */}
          {gameState.status === "ready" && (
            <div className="cyber-overlay">
              <div className="cyber-card">
                <div className="cyber-card-icon cyber-card-icon--pulse">
                  <ExpressbankEmblem size={42} glow />
                </div>
                <h3>{isAz ? "Expressbank Kiber Döyüş Gəmisi" : "Expressbank Cyber Defense"}</h3>
                <p>
                  {isAz
                    ? "Expressbank kiber kosmik döyüş gəmisini (Starship Interceptor) idarə edin! Bank şəbəkəsini fişinq, trojan və ransomware hücumlarından qoruyun. Hər dalğadan sonra gəminizi yeni silahlar və dronlarla təkmilləşdirin."
                    : "Command the Expressbank Security Interceptor starship to defend the bank's core vault through 15+ escalating waves with upgrades."}
                </p>
                <div className="cyber-keys">
                  <span className="cyber-key">A / D / {t("ARROWS")}</span>
                  <span style={{ color: "#78909c" }}>•</span>
                  <span className="cyber-key">{t("MOUSE")}</span>
                  <span style={{ color: "#78909c" }}>•</span>
                  <span className="cyber-key">SPACE ({t("FIRE")})</span>
                </div>
                <button
                  type="button"
                  className="cyber-btn cyber-btn--primary"
                  onClick={handleStart}
                >
                  <Sparkles size={14} />
                  {isAz ? "Müdafiəyə Başla (Space)" : "Start Mission (Space)"}
                </button>
              </div>
            </div>
          )}

          {/* Game Over Overlay */}
          {gameState.status === "gameover" && (
            <div className="cyber-overlay">
              <div className="cyber-card">
                <div className="cyber-card-icon">
                  <ExpressbankEmblem size={38} glow />
                </div>
                <h3>{t("Mission Completed")}</h3>
                <p>
                  {isAz
                    ? "Perimetr yarıldı, lakin müdafiə qeydləriniz şirkət liderlər cədvəlinə daxil edildi."
                    : "The firewall was breached, but your score and wave record are saved to the company leaderboard."}
                </p>

                {isNewRecord && (
                  <div
                    className="cyber-hud__mult"
                    style={{ marginBottom: "14px", padding: "6px 16px" }}
                  >
                    <Sparkles size={14} />
                    <span>{t("NEW PERSONAL RECORD!")}</span>
                  </div>
                )}

                <div className="cyber-stats-row">
                  <div className="cyber-stat">
                    <span className="cyber-stat-label">{t("Score")}</span>
                    <span className="cyber-stat-value">{gameState.score}</span>
                  </div>
                  <div className="cyber-stat">
                    <span className="cyber-stat-label">{t("Wave")}</span>
                    <span className="cyber-stat-value">{gameState.wave} / 15+</span>
                  </div>
                  <div className="cyber-stat">
                    <span className="cyber-stat-label">{t("Threats")}</span>
                    <span className="cyber-stat-value">{gameState.threatsNeutralized}</span>
                  </div>
                  <div className="cyber-stat">
                    <span className="cyber-stat-label">{t("Tokens")}</span>
                    <span className="cyber-stat-value">{gameState.coinsCollected}</span>
                  </div>
                </div>

                <div className="cyber-card-actions">
                  <button
                    type="button"
                    className="cyber-btn cyber-btn--primary"
                    onClick={handleStart}
                  >
                    <RotateCcw size={14} />
                    {isAz ? "Yenidən Başla (Space)" : "Defend Again (Space)"}
                  </button>
                  {onSwitchGame && (
                    <button
                      type="button"
                      className="cyber-btn cyber-btn--secondary"
                      onClick={onSwitchGame}
                      title={isAz ? "Retro Arcade Menyusuna qayıt" : "Return to Retro Arcade Cabinet"}
                    >
                      <Sparkles size={14} />
                      {isAz ? "Arcade Menyu" : "Arcade Menu"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="cyber-btn cyber-btn--secondary"
                    onClick={onClose}
                  >
                    {t("Close")}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Live Company Leaderboard */}
        <aside
          className="cyber-arcade__board"
          aria-label={t("Cyber Defense Leaderboard")}
        >
          <div className="cyber-arcade__board-head">
            <div className="cyber-arcade__board-title">
              <Trophy size={16} />
              <span>{t("Leaderboard")}</span>
            </div>
            {syncNote === "saved" && (
              <span className="cyber-sync-tag">{t("Saved")}</span>
            )}
          </div>
          <p className="cyber-arcade__board-sub">
            {t("Colleagues with the best cybersecurity scores.")}
          </p>

          <div className="cyber-arcade__board-list">
            {leaderboard === null && (
              <p className="cyber-arcade__board-empty">
                {t("Loading leaderboard…")}
              </p>
            )}
            {leaderboard !== null && leaderboard.length === 0 && (
              <p className="cyber-arcade__board-empty">
                {t("No recorded missions yet.")}
                <br />
                {t("Be the first to defend the vault.")}
              </p>
            )}
            {leaderboard?.map((entry, index) => {
              const isMe = currentUser && entry.userId === currentUser.id;
              const rank = index + 1;
              return (
                <div
                  key={entry.userId}
                  className={`cyber-board-row ${isMe ? "is-me" : ""}`}
                >
                  <span
                    className={`cyber-board-rank ${rank <= 3 ? `is-top is-top-${rank}` : ""}`}
                  >
                    {rank}
                  </span>
                  <span
                    className="cyber-board-name"
                    title={`${entry.displayName} (${entry.username})`}
                  >
                    {entry.displayName}
                    {isMe && <em> — {t("you")}</em>}
                  </span>
                  <span className="cyber-board-score">{entry.best}</span>
                </div>
              );
            })}
          </div>

          <div className="cyber-arcade__personal">
            <div className="cyber-personal__row">
              <span className="cyber-personal__label">{t("Personal Best")}</span>
              <span className="cyber-personal__val">{personalBest}</span>
            </div>
            <div className="cyber-personal__row">
              <span className="cyber-personal__label">{t("Rank")}</span>
              <span className="cyber-personal__val">
                {me && me.runs > 0 ? `#${me.rank}` : "—"}
              </span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default CyberDefenseArcade;
