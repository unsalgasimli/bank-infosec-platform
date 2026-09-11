import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  X,
  Sparkles,
  Volume2,
  VolumeX,
  RotateCcw,
  Zap,
  Shield,
  Play,
  Pause,
  Trophy,
} from "lucide-react";
import { ExpressbankEmblem } from "../../common/ExpressbankLogo.js";
import { useAuth } from "../../../context/AuthContext.js";
import { useI18n } from "../../../context/I18nContext.js";
import {
  createInitialVaultBreakerState,
  updateVaultBreaker,
  launchBalls,
  firePaddleLasers,
  advanceToNextStage,
  STAGES,
  type VaultBreakerState,
} from "./vault-breaker-engine.js";
import { VaultBreakerScene } from "./VaultBreakerScene.js";
import { isArcadeMuted, toggleArcadeMuted } from "../retro-arcade-sound.js";
import {
  playAzerbaijanTrack,
  stopAzerbaijanMusic,
} from "../retro-azerbaijan-music.js";
import { RetroAzerbaijanPlayer } from "../RetroAzerbaijanPlayer.js";
import { GameLeaderboardModal } from "../common/GameLeaderboardModal.js";
import "./vault-breaker-arcade.css";

const LOCAL_BREAKER_BEST_KEY = "vault-breaker.best";

function loadLocalBest(): number {
  try {
    const raw = localStorage.getItem(LOCAL_BREAKER_BEST_KEY);
    const val = raw ? Number(raw) : 0;
    return Number.isFinite(val) && val >= 0 ? val : 0;
  } catch {
    return 0;
  }
}

function saveLocalBest(score: number): void {
  try {
    const current = loadLocalBest();
    if (score > current) {
      localStorage.setItem(LOCAL_BREAKER_BEST_KEY, String(score));
    }
  } catch {
    /* storage unavailable */
  }
}

interface VaultBreakerArcadeProps {
  onClose: () => void;
  onSwitchGame?: () => void;
}

export const VaultBreakerArcade: React.FC<VaultBreakerArcadeProps> = ({
  onClose,
  onSwitchGame,
}) => {
  const { language } = useI18n();
  const { currentUser, fetchWithAuth } = useAuth();
  const isAz = language === "az";

  const [gameState, setGameState] = useState<VaultBreakerState>(() =>
    createInitialVaultBreakerState(loadLocalBest())
  );
  const [muted, setMuted] = useState(() => isArcadeMuted());
  const [isPaused, setIsPaused] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  const stateRef = useRef(gameState);
  stateRef.current = gameState;

  const scoreSubmittedRef = useRef(false);

  const inputRef = useRef({
    targetPaddleX: null as number | null,
    moveLeft: false,
    moveRight: false,
    shootLasers: false,
  });

  const lastFrameTime = useRef<number | null>(null);

  // Play "Qaytağı" Azerbaijani Chiptune on mount
  useEffect(() => {
    playAzerbaijanTrack("qaytagi");
    return () => {
      stopAzerbaijanMusic();
    };
  }, []);

  // Save best score whenever it changes
  useEffect(() => {
    if (gameState.score > gameState.highScore) {
      saveLocalBest(gameState.score);
    }
  }, [gameState.score, gameState.highScore]);

  // Submit score to backend when game over or victory
  useEffect(() => {
    if (gameState.status === "ready" || gameState.status === "playing") {
      scoreSubmittedRef.current = false;
      return;
    }

    if (
      (gameState.status === "game_over" || gameState.status === "victory") &&
      !scoreSubmittedRef.current &&
      gameState.score > 0
    ) {
      scoreSubmittedRef.current = true;
      saveLocalBest(gameState.score);

      const submit = async () => {
        try {
          await fetchWithAuth("/api/game/breaker/score", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              score: gameState.score,
              stage: gameState.currentStage + 1,
            }),
          });
        } catch {
          /* resilient fallback */
        }
      };
      void submit();
    }
  }, [gameState.status, gameState.score, gameState.currentStage, fetchWithAuth]);

  // Main 60 FPS Engine Tick
  useEffect(() => {
    let animId: number;

    const loop = (time: number) => {
      if (lastFrameTime.current === null) {
        lastFrameTime.current = time;
      }
      const dt = Math.min(0.05, (time - lastFrameTime.current) / 1000);
      lastFrameTime.current = time;

      if (!isPaused) {
        updateVaultBreaker(stateRef.current, dt, inputRef.current);
        setGameState({ ...stateRef.current });
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [isPaused]);

  // Handle Keyboard Inputs
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        inputRef.current.moveLeft = true;
        inputRef.current.targetPaddleX = null;
      } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        inputRef.current.moveRight = true;
        inputRef.current.targetPaddleX = null;
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (stateRef.current.status === "ready") {
          launchBalls(stateRef.current);
          setGameState({ ...stateRef.current });
        } else if (stateRef.current.status === "playing") {
          firePaddleLasers(stateRef.current);
        }
      } else if (e.key === "p" || e.key === "P") {
        setIsPaused((prev) => !prev);
      } else if (e.key === "Escape") {
        onClose();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        inputRef.current.moveLeft = false;
      } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        inputRef.current.moveRight = false;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [onClose]);

  // Pointer Move & Click Handlers
  const handlePointerMove = useCallback((virtualX: number) => {
    inputRef.current.targetPaddleX = virtualX;
  }, []);

  const handleClick = useCallback(() => {
    if (stateRef.current.status === "ready") {
      launchBalls(stateRef.current);
      setGameState({ ...stateRef.current });
    } else if (stateRef.current.status === "playing") {
      firePaddleLasers(stateRef.current);
    }
  }, []);

  const handleRestart = () => {
    const fresh = createInitialVaultBreakerState(loadLocalBest());
    setGameState(fresh);
    stateRef.current = fresh;
    setIsPaused(false);
  };

  const handleNextStage = () => {
    advanceToNextStage(stateRef.current);
    setGameState({ ...stateRef.current });
  };

  const stageInfo = STAGES[gameState.currentStage % STAGES.length];

  return (
    <div
      className="vb-arcade"
      role="dialog"
      aria-label="Expressbank Vault Breaker"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="vb-arcade__panel">
        {/* Top Header */}
        <header className="vb-arcade__header">
          <div className="vb-arcade__brand">
            <ExpressbankEmblem size={24} glow />
            <div className="vb-arcade__title-group">
              <h2>EXPRESSBANK VAULT BREAKER</h2>
              <span>{stageInfo.title} • {isAz ? stageInfo.subtitle : "Breach the security vault"}</span>
            </div>
          </div>

          <div className="vb-arcade__header-actions">
            {/* Retro Azerbaijan BGM Player */}
            <RetroAzerbaijanPlayer compact />

            {/* Leaderboard Button */}
            <button
              type="button"
              className="vb-btn vb-btn--leaderboard"
              onClick={() => setShowLeaderboard(true)}
              title={isAz ? "Liderlər Cədvəli" : "Leaderboard"}
            >
              <Trophy size={13} color="#ffb800" />
              <span>{isAz ? "LİDERLƏR" : "LEADERBOARD"}</span>
            </button>

            {/* Back to Arcade Menu */}
            {onSwitchGame && (
              <button
                type="button"
                className="vb-btn vb-btn--accent"
                onClick={onSwitchGame}
                title={isAz ? "Retro Arcade Menyununa qayıt" : "Return to Retro Arcade Cabinet"}
              >
                <Sparkles size={13} />
                <span>{isAz ? "Arcade Menyu" : "Arcade Menu"}</span>
              </button>
            )}

            {/* Pause / Resume */}
            <button
              type="button"
              className="vb-btn"
              onClick={() => setIsPaused((prev) => !prev)}
              title={isPaused ? "Resume (P)" : "Pause (P)"}
            >
              {isPaused ? <Play size={13} /> : <Pause size={13} />}
              <span>{isPaused ? "RESUME" : "PAUSE"}</span>
            </button>

            {/* Audio Toggle */}
            <button
              type="button"
              className="vb-btn"
              onClick={() => {
                const next = toggleArcadeMuted();
                setMuted(next);
              }}
              title="Toggle Audio"
            >
              {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
            </button>

            {/* Close Button */}
            <button
              type="button"
              className="vb-btn vb-btn--close"
              onClick={onClose}
              title="Close (Esc)"
            >
              <X size={16} />
            </button>
          </div>
        </header>

        {/* HUD Bar */}
        <div className="vb-arcade__hud">
          <div className="vb-hud__score">
            {isAz ? "XAL:" : "SCORE:"} <span>{gameState.score.toLocaleString()}</span>
          </div>
          <div className="vb-hud__best">
            {isAz ? "REKORD:" : "BEST:"} <span>{gameState.highScore.toLocaleString()}</span>
          </div>
          <div className="vb-hud__stage">
            {isAz ? "MƏRHƏLƏ:" : "STAGE:"} {gameState.currentStage + 1} / {gameState.totalStages}
          </div>
          {gameState.combo > 1 && (
            <div className="vb-hud__combo">
              COMBO: {gameState.combo}x
            </div>
          )}
          <div className="vb-hud__lives">
            <span>{isAz ? "CANLAR:" : "LIVES:"}</span>
            {Array.from({ length: gameState.lives }).map((_, i) => (
              <span key={i} className="vb-heart">
                ❤️
              </span>
            ))}
          </div>
        </div>

        {/* Playfield Arena */}
        <div className="vb-arcade__arena">
          <VaultBreakerScene
            state={gameState}
            onPointerMove={handlePointerMove}
            onClick={handleClick}
          />

          {/* Overlay: Ready to Launch */}
          {gameState.status === "ready" && (
            <div className="vb-overlay" onClick={handleClick}>
              <div className="vb-overlay__title">
                {isAz ? "TOPU ATMAĞA HAZIR OLUN" : "READY FOR LAUNCH"}
              </div>
              <div className="vb-overlay__subtitle">
                {isAz
                  ? "Topu atmaq üçün SPACE və ya KLİKLƏYİN (Paneli mausun və ya oxlarla idarə edin)"
                  : "Press SPACE or CLICK to launch ball (Control paddle with mouse or arrow keys)"}
              </div>
              <button type="button" className="vb-overlay-btn" onClick={handleClick}>
                {isAz ? "BAŞLA (SPACE)" : "LAUNCH (SPACE)"}
              </button>
            </div>
          )}

          {/* Overlay: Stage Clear */}
          {gameState.status === "stage_clear" && (
            <div className="vb-overlay">
              <div className="vb-overlay__title vb-overlay__title--clear">
                ★ {isAz ? "MƏRHƏLƏ TAMAMLANDI!" : "STAGE CLEARED!"} ★
              </div>
              <div className="vb-overlay__subtitle">
                {isAz
                  ? `Əla iş! Bütün bank təhlükəsizlik blokları deşildi. Cari xal: ${gameState.score.toLocaleString()}`
                  : `Great job! All security blocks breached. Score: ${gameState.score.toLocaleString()}`}
              </div>
              <button type="button" className="vb-overlay-btn" onClick={handleNextStage}>
                {isAz ? "NÖVBƏTİ MƏRHƏLƏYƏ KEÇ" : "NEXT STAGE"}
              </button>
            </div>
          )}

          {/* Overlay: Game Over */}
          {gameState.status === "game_over" && (
            <div className="vb-overlay">
              <div className="vb-overlay__title vb-overlay__title--over">
                {isAz ? "KASSA MÜDAFİƏSİ DAYANDIRILDI" : "VAULT BREACH FAILED"}
              </div>
              <div className="vb-overlay__subtitle">
                {isAz
                  ? `Bütün canlarınız tükəndi. Topladığınız xal: ${gameState.score.toLocaleString()}`
                  : `All lives lost. Final score: ${gameState.score.toLocaleString()}`}
              </div>
              <div className="vb-overlay__btn-group">
                <button type="button" className="vb-overlay-btn" onClick={handleRestart}>
                  <RotateCcw size={14} style={{ display: "inline", marginRight: 6 }} />
                  {isAz ? "YENİDƏN OYNA" : "PLAY AGAIN"}
                </button>
                <button
                  type="button"
                  className="vb-overlay-btn vb-overlay-btn--secondary"
                  onClick={() => setShowLeaderboard(true)}
                >
                  <Trophy size={14} style={{ display: "inline", marginRight: 6 }} color="#ffb800" />
                  {isAz ? "LİDERLƏR CƏDVƏLİ" : "LEADERBOARD"}
                </button>
                {onSwitchGame && (
                  <button
                    type="button"
                    className="vb-overlay-btn vb-overlay-btn--secondary"
                    onClick={onSwitchGame}
                  >
                    {isAz ? "ARCADE MENYU" : "ARCADE MENU"}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Overlay: Victory */}
          {gameState.status === "victory" && (
            <div className="vb-overlay">
              <div className="vb-overlay__title vb-overlay__title--clear">
                👑 {isAz ? "BÜTÜN KASSALAR FƏTH EDİLDİ!" : "ALL VAULTS MASTERED!"} 👑
              </div>
              <div className="vb-overlay__subtitle">
                {isAz
                  ? `Təbriklər! Siz Expressbank-ın 5 möhtəşəm kiber təhlükəsizlik mərhələsini uğurla keçdiniz! Yekun xal: ${gameState.score.toLocaleString()}`
                  : `Congratulations! You conquered all 5 security stages! Final score: ${gameState.score.toLocaleString()}`}
              </div>
              <div className="vb-overlay__btn-group">
                <button type="button" className="vb-overlay-btn" onClick={handleRestart}>
                  <RotateCcw size={14} style={{ display: "inline", marginRight: 6 }} />
                  {isAz ? "YENİDƏN OYNA" : "PLAY AGAIN"}
                </button>
                <button
                  type="button"
                  className="vb-overlay-btn vb-overlay-btn--secondary"
                  onClick={() => setShowLeaderboard(true)}
                >
                  <Trophy size={14} style={{ display: "inline", marginRight: 6 }} color="#ffb800" />
                  {isAz ? "LİDERLƏR CƏDVƏLİ" : "LEADERBOARD"}
                </button>
                {onSwitchGame && (
                  <button
                    type="button"
                    className="vb-overlay-btn vb-overlay-btn--secondary"
                    onClick={onSwitchGame}
                  >
                    {isAz ? "ARCADE MENYU" : "ARCADE MENU"}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Overlay: Paused */}
          {isPaused && (
            <div className="vb-overlay">
              <div className="vb-overlay__title">PAUSED</div>
              <div className="vb-overlay__subtitle">
                {isAz ? "Oyun dayandırılıb" : "Game is paused"}
              </div>
              <div className="vb-overlay__btn-group">
                <button
                  type="button"
                  className="vb-overlay-btn"
                  onClick={() => setIsPaused(false)}
                >
                  {isAz ? "DAVAM ET" : "RESUME"}
                </button>
                <button
                  type="button"
                  className="vb-overlay-btn vb-overlay-btn--secondary"
                  onClick={onClose}
                >
                  {isAz ? "ÇIXIŞ" : "QUIT"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Active Powerups Bar */}
        <div className="vb-active-powerups">
          <span style={{ color: "#64748b" }}>{isAz ? "AKTİV MODLAR:" : "ACTIVE MODS:"}</span>
          {gameState.paddle.laserTimer > 0 && (
            <span className="vb-active-badge vb-active-badge--laser">
              ⚡ LASER ({Math.ceil(gameState.paddle.laserTimer)}s)
            </span>
          )}
          {gameState.paddle.fireballTimer > 0 && (
            <span className="vb-active-badge vb-active-badge--fire">
              🔥 FIREBALL ({Math.ceil(gameState.paddle.fireballTimer)}s)
            </span>
          )}
          {gameState.paddle.wideTimer > 0 && (
            <span className="vb-active-badge">
              ↔ WIDE PADDLE ({Math.ceil(gameState.paddle.wideTimer)}s)
            </span>
          )}
          {gameState.paddle.laserTimer <= 0 &&
            gameState.paddle.fireballTimer <= 0 &&
            gameState.paddle.wideTimer <= 0 && (
              <span style={{ color: "#475569" }}>{isAz ? "Standart Rejim" : "Standard Mode"}</span>
            )}
        </div>
      </div>

      {/* Leaderboard Modal */}
      {showLeaderboard && (
        <GameLeaderboardModal
          initialGame="breaker"
          allowedGames={["breaker", "cyber", "flight", "sweeper"]}
          onClose={() => setShowLeaderboard(false)}
        />
      )}
    </div>
  );
};

export default VaultBreakerArcade;
