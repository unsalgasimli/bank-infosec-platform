import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  X,
  Sparkles,
  Volume2,
  VolumeX,
  Shield,
  Radio,
  RotateCcw,
  Trophy,
  Award,
  AlertTriangle,
  HelpCircle,
  Clock,
  Crosshair,
  Flame,
} from "lucide-react";
import { ExpressbankEmblem } from "../../common/ExpressbankLogo.js";
import { useAuth } from "../../../context/AuthContext.js";
import { useI18n } from "../../../context/I18nContext.js";
import {
  createEmptyBoard,
  revealCell,
  chordCell,
  toggleFlag,
  useSonarPulse,
  getBestTime,
  DIFFICULTIES,
  type DifficultyLevel,
  type CyberSweeperState,
  type Cell,
} from "./cyber-sweeper-engine.js";
import { isArcadeMuted, toggleArcadeMuted } from "../retro-arcade-sound.js";
import {
  playAzerbaijanTrack,
  stopAzerbaijanMusic,
} from "../retro-azerbaijan-music.js";
import { RetroAzerbaijanPlayer } from "../RetroAzerbaijanPlayer.js";
import { GameLeaderboardModal } from "../common/GameLeaderboardModal.js";
import "./cyber-sweeper-arcade.css";

interface CyberSweeperArcadeProps {
  onClose: () => void;
  onSwitchGame?: () => void;
}

const getCellMetrics = (difficulty: DifficultyLevel) => {
  switch (difficulty) {
    case "novice":
      return { size: 36, fontSize: 13, iconSize: 15, gap: 3 };
    case "soc":
      return { size: 26, fontSize: 10.5, iconSize: 13, gap: 2 };
    case "ciso":
      return { size: 21, fontSize: 9, iconSize: 11, gap: 2 };
    default:
      return { size: 36, fontSize: 13, iconSize: 15, gap: 3 };
  }
};

export const CyberSweeperArcade: React.FC<CyberSweeperArcadeProps> = ({
  onClose,
  onSwitchGame,
}) => {
  const { language } = useI18n();
  const { currentUser, fetchWithAuth } = useAuth();
  const isAz = language === "az";

  const [selectedDifficulty, setSelectedDifficulty] = useState<DifficultyLevel>("novice");
  const [gameState, setGameState] = useState<CyberSweeperState>(() =>
    createEmptyBoard("novice")
  );
  const [muted, setMuted] = useState(() => isArcadeMuted());
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [hoveredCoord, setHoveredCoord] = useState<{ r: number; c: number } | null>(null);
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  const scoreSubmittedRef = useRef(false);

  // Play "Lalələr" Azerbaijani chiptune on mount
  useEffect(() => {
    playAzerbaijanTrack("laleler");
    return () => {
      stopAzerbaijanMusic();
    };
  }, []);

  // Timer Tick
  useEffect(() => {
    let interval: number;
    if (gameState.status === "playing") {
      interval = window.setInterval(() => {
        setGameState((prev) => {
          if (prev.status !== "playing") return prev;
          return {
            ...prev,
            elapsedSeconds: Math.min(999, prev.elapsedSeconds + 1),
          };
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [gameState.status]);

  // Submit score to backend when game won
  useEffect(() => {
    if (gameState.status === "idle" || gameState.status === "playing") {
      scoreSubmittedRef.current = false;
      return;
    }

    if (gameState.status === "won" && !scoreSubmittedRef.current) {
      scoreSubmittedRef.current = true;

      const submit = async () => {
        try {
          await fetchWithAuth("/api/game/sweeper/score", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              seconds: Math.max(1, gameState.elapsedSeconds),
              difficulty: selectedDifficulty,
            }),
          });
        } catch {
          /* resilient fallback */
        }
      };
      void submit();
    }
  }, [gameState.status, gameState.elapsedSeconds, selectedDifficulty, fetchWithAuth]);

  // Keyboard listener for Escape to return to arcade menu
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);


  // Restart with chosen difficulty
  const handleReset = useCallback(
    (diff: DifficultyLevel = selectedDifficulty) => {
      setSelectedDifficulty(diff);
      const fresh = createEmptyBoard(diff);
      setGameState(fresh);
      setHoveredCoord(null);
    },
    [selectedDifficulty]
  );

  // Cell Click (Left Click)
  const handleCellClick = (r: number, c: number) => {
    if (gameState.isSonarActive) {
      // Execute Sonar Pulse on selected target
      const clone = { ...gameState };
      clone.isSonarActive = false;
      useSonarPulse(clone, r, c);
      setGameState({ ...clone });
      return;
    }

    const clone = { ...gameState };
    revealCell(clone, r, c);
    setGameState({ ...clone });
  };

  // Cell Right Click (Flagging)
  const handleCellContextMenu = (e: React.MouseEvent, r: number, c: number) => {
    e.preventDefault();
    if (gameState.isSonarActive) return;

    const clone = { ...gameState };
    toggleFlag(clone, r, c);
    setGameState({ ...clone });
  };

  // Cell Double Click (Chording)
  const handleCellDoubleClick = (r: number, c: number) => {
    if (gameState.isSonarActive) return;
    const clone = { ...gameState };
    chordCell(clone, r, c);
    setGameState({ ...clone });
  };

  // Space key chording on hovered cell
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === " " && hoveredCoord) {
        e.preventDefault();
        const clone = { ...gameState };
        chordCell(clone, hoveredCoord.r, hoveredCoord.c);
        setGameState({ ...clone });
      } else if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hoveredCoord, gameState, onClose]);

  // Activate Sonar Pulse Mode
  const handleToggleSonar = () => {
    if (gameState.sonarUsed) return;
    setGameState((prev) => ({
      ...prev,
      isSonarActive: !prev.isSonarActive,
    }));
  };

  const remainingMines = Math.max(0, gameState.totalMines - gameState.flagsCount);
  const bestTime = getBestTime(selectedDifficulty);
  const metrics = getCellMetrics(selectedDifficulty);

  // Determine Sentinel Face Emoji / Status
  const getSentinelFace = () => {
    if (gameState.status === "lost") return "😵";
    if (gameState.status === "won") return "😎";
    if (isMouseDown) return "😮";
    return "🙂";
  };

  // 3BV / s speed rate
  const threeBvSpeed =
    gameState.elapsedSeconds > 0
      ? (gameState.threeBV / gameState.elapsedSeconds).toFixed(2)
      : "0.00";

  // Efficiency percentage (3BV / Clicks)
  const efficiency =
    gameState.clicksCount > 0
      ? Math.min(100, Math.round((gameState.threeBV / gameState.clicksCount) * 100))
      : 100;

  return (
    <div
      className="cs-arcade"
      role="dialog"
      aria-label="Expressbank Cyber Sweeper"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="cs-arcade__panel">
        {/* Top Header */}
        <header className="cs-arcade__header">
          <div className="cs-arcade__brand">
            <ExpressbankEmblem size={24} glow />
            <div className="cs-arcade__title-group">
              <h2>EXPRESSBANK CYBER SWEEPER</h2>
              <span>{isAz ? "ZERO-DAY TƏHLÜKƏLƏRİNİN İZOLYASİYASI" : "ZERO-DAY DEFUSER PROTOCOL"}</span>
            </div>
          </div>

          <div className="cs-arcade__header-actions">
            {/* Retro Azerbaijan BGM Player */}
            <RetroAzerbaijanPlayer compact />

            {/* Leaderboard Button */}
            <button
              type="button"
              className="cs-btn cs-btn--leaderboard"
              onClick={() => setShowLeaderboard(true)}
              title={isAz ? "Liderlər Cədvəli" : "Leaderboard"}
            >
              <Trophy size={13} color="#ffb800" />
              <span>{isAz ? "LİDERLƏR" : "LEADERBOARD"}</span>
            </button>

            {/* Back to Arcade Cabinet Menu */}
            {onSwitchGame && (
              <button
                type="button"
                className="cs-btn cs-btn--accent"
                onClick={onSwitchGame}
                title={isAz ? "Retro Arcade Kabinetinə qayıt" : "Return to Retro Arcade Cabinet"}
              >
                <Sparkles size={13} />
                <span>{isAz ? "Arcade Menyu" : "Arcade Menu"}</span>
              </button>
            )}

            {/* Audio Toggle */}
            <button
              type="button"
              className="cs-btn"
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
              className="cs-btn cs-btn--close"
              onClick={onClose}
              title="Close (Esc)"
            >
              <X size={16} />
            </button>
          </div>
        </header>

        {/* Difficulty Bar */}
        <div className="cs-diff-bar">
          <div className="cs-diff-tabs" role="tablist">
            {(["novice", "soc", "ciso"] as DifficultyLevel[]).map((diff) => {
              const cfg = DIFFICULTIES[diff];
              const isSelected = selectedDifficulty === diff;
              return (
                <button
                  key={diff}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  className={`cs-diff-tab ${isSelected ? "cs-diff-tab--active" : ""}`}
                  onClick={() => handleReset(diff)}
                >
                  <Shield size={12} />
                  <span>{isAz ? cfg.name.az : cfg.name.en}</span>
                </button>
              );
            })}
          </div>

          <div className="cs-best-standing">
            ★ {isAz ? "REKORD:" : "BEST:"}{" "}
            {bestTime !== null ? `${bestTime}s` : isAz ? "Yoxdur" : "None"}
          </div>
        </div>

        {/* Control Dashboard (7-Segment LED Displays & Sentinel Face) */}
        <div className="cs-dashboard">
          {/* Threats Remaining LED */}
          <div className="cs-led-display">
            <span className="cs-led-label">{isAz ? "KİBER TƏHLÜKƏ" : "THREATS"}</span>
            <div className="cs-led-screen">
              <span className="cs-led-value">
                {String(remainingMines).padStart(3, "0")}
              </span>
            </div>
          </div>

          {/* Sentinel Face & Sonar Pulse */}
          <div className="cs-sentinel-center">
            <button
              type="button"
              className="cs-face-button"
              onClick={() => handleReset()}
              title={isAz ? "Yenidən Başla" : "Restart Game"}
            >
              {getSentinelFace()}
            </button>

            {/* Sonar Pulse Button */}
            <button
              type="button"
              className={`cs-sonar-btn ${
                gameState.isSonarActive ? "cs-sonar-btn--active" : ""
              }`}
              onClick={handleToggleSonar}
              disabled={gameState.sonarUsed || gameState.status !== "playing"}
              title={
                gameState.sonarUsed
                  ? isAz
                    ? "Sonar istifadə edilib"
                    : "Sonar already used"
                  : isAz
                  ? "3x3 sahəni təhlükəsiz skan etmək üçün klikləyin"
                  : "Click to safely scan 3x3 region"
              }
            >
              <Radio size={13} />
              <span>{isAz ? "SONAR KƏŞFİYYAT" : "SONAR PULSE"}</span>
            </button>
          </div>

          {/* Stopwatch Timer LED */}
          <div className="cs-led-display">
            <span className="cs-led-label">{isAz ? "SANİYƏ" : "TIME"}</span>
            <div className="cs-led-screen">
              <span className="cs-led-value cs-led-value--timer">
                {String(gameState.elapsedSeconds).padStart(3, "0")}
              </span>
            </div>
          </div>
        </div>

        {/* Minesweeper Grid - STRICTLY ZERO SCROLL */}
        <div
          className="cs-grid-wrapper"
          onMouseDown={() => setIsMouseDown(true)}
          onMouseUp={() => setIsMouseDown(false)}
        >
          <div
            className="cs-grid"
            style={
              {
                gridTemplateColumns: `repeat(${gameState.cols}, var(--cs-cell-size))`,
                gridTemplateRows: `repeat(${gameState.rows}, var(--cs-cell-size))`,
                "--cs-cell-size": `${metrics.size}px`,
                "--cs-cell-font": `${metrics.fontSize}px`,
                "--cs-gap": `${metrics.gap}px`,
              } as React.CSSProperties
            }
          >
            {gameState.cells.map((row, r) =>
              row.map((cell, c) => {
                let content: React.ReactNode = null;
                let cellClass = "cs-cell cs-cell--unrevealed";

                if (cell.isSonarHighlighted) {
                  cellClass += " cs-cell--sonar";
                }

                if (cell.isRevealed) {
                  cellClass = "cs-cell cs-cell--revealed";
                  if (cell.isMine) {
                    if (cell.isExploded) {
                      cellClass += " cs-cell--exploded";
                      content = "💥";
                    } else {
                      content = <Crosshair size={metrics.iconSize} color="#ff3344" />;
                    }
                  } else if (cell.neighborMines > 0) {
                    content = (
                      <span className={`cs-num--${cell.neighborMines}`}>
                        {cell.neighborMines}
                      </span>
                    );
                  }
                } else if (cell.isFlagged) {
                  cellClass += " cs-cell--flagged";
                  content = <ExpressbankEmblem size={metrics.iconSize} glow />;
                } else if (cell.isQuestion) {
                  content = <HelpCircle size={metrics.iconSize} color="#00e5ff" />;
                }

                return (
                  <button
                    key={`${r}_${c}`}
                    type="button"
                    className={cellClass}
                    onClick={() => handleCellClick(r, c)}
                    onContextMenu={(e) => handleCellContextMenu(e, r, c)}
                    onDoubleClick={() => handleCellDoubleClick(r, c)}
                    onMouseEnter={() => setHoveredCoord({ r, c })}
                    onMouseLeave={() => setHoveredCoord(null)}
                    aria-label={`Cell row ${r + 1}, col ${c + 1}`}
                  >
                    {content}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Quick Guide Footer */}
        <footer className="cs-footer">
          <div className="cs-guide-item">
            <kbd>{isAz ? "Sol Klik" : "Left Click"}</kbd> <span>{isAz ? "Aç" : "Dig"}</span>
          </div>
          <div className="cs-guide-item">
            <kbd>{isAz ? "Sağ Klik" : "Right Click"}</kbd> <span>{isAz ? "Qalxan Bayrağı" : "Flag"}</span>
          </div>
          <div className="cs-guide-item">
            <kbd>{isAz ? "Cüt Klik / Space" : "Dbl Click / Space"}</kbd>{" "}
            <span>{isAz ? "Chording (Tez Aç)" : "Chord Reveal"}</span>
          </div>
          <div className="cs-guide-item">
            <kbd>ESC</kbd> <span>{isAz ? "Bağla" : "Exit"}</span>
          </div>
        </footer>

        {/* Victory Analytics Modal */}
        {gameState.status === "won" && (
          <div className="cs-modal">
            <div className="cs-modal__card">
              <Trophy size={42} color="#00f576" style={{ margin: "0 auto 12px" }} />
              <h3 className="cs-modal__title">
                {isAz ? "BÜTÜN TƏHLÜKƏLƏR İZOLYASİYA EDİLDİ!" : "ALL THREATS DEFUSED!"}
              </h3>
              <p className="cs-modal__subtitle">
                {isAz
                  ? "Expressbank kassa infrastrukturu 100% təmizləndi."
                  : "Expressbank core infrastructure 100% secured."}
              </p>

              {/* Tournament Diagnostics Table */}
              <div className="cs-stats-table">
                <div className="cs-stat-box">
                  <span className="cs-stat-box__label">{isAz ? "VAXT" : "TIME"}</span>
                  <span className="cs-stat-box__val">{gameState.elapsedSeconds}s</span>
                </div>
                <div className="cs-stat-box">
                  <span className="cs-stat-box__label">3BV DƏRƏCƏSİ</span>
                  <span className="cs-stat-box__val">{gameState.threeBV}</span>
                </div>
                <div className="cs-stat-box">
                  <span className="cs-stat-box__label">SÜRƏT (3BV/S)</span>
                  <span className="cs-stat-box__val">{threeBvSpeed}</span>
                </div>
                <div className="cs-stat-box">
                  <span className="cs-stat-box__label">{isAz ? "SƏMƏRƏLİLİK" : "EFFICIENCY"}</span>
                  <span className="cs-stat-box__val">{efficiency}%</span>
                </div>
              </div>

              <div className="cs-modal__btn-group">
                <button
                  type="button"
                  className="cs-modal-btn"
                  onClick={() => handleReset()}
                >
                  <RotateCcw size={14} style={{ display: "inline", marginRight: 6 }} />
                  {isAz ? "YENİDƏN OYNA" : "PLAY AGAIN"}
                </button>
                <button
                  type="button"
                  className="cs-modal-btn cs-modal-btn--secondary"
                  onClick={() => setShowLeaderboard(true)}
                >
                  <Trophy size={14} color="#ffb800" style={{ display: "inline", marginRight: 6 }} />
                  {isAz ? "LİDERLƏR CƏDVƏLİ" : "LEADERBOARD"}
                </button>
                {onSwitchGame && (
                  <button
                    type="button"
                    className="cs-modal-btn cs-modal-btn--secondary"
                    onClick={onSwitchGame}
                  >
                    {isAz ? "ARCADE MENYU" : "ARCADE MENU"}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Defeat / Mine Detonated Modal */}
        {gameState.status === "lost" && (
          <div className="cs-modal">
            <div className="cs-modal__card" style={{ borderColor: "#ff3344", boxShadow: "0 20px 60px rgba(255, 51, 68, 0.25)" }}>
              <div style={{ fontSize: "40px", marginBottom: "12px" }}>💥</div>
              <h3 className="cs-modal__title" style={{ color: "#ff4b5c" }}>
                {isAz ? "ZERO-DAY MİNASI PARTLADI!" : "ZERO-DAY MINE DETONATED!"}
              </h3>
              <p className="cs-modal__subtitle">
                {isAz
                  ? "Təhlükəsizlik perimetri yarıldı. Taktikanızı yeniləyin və yenidən cəhd edin."
                  : "Perimeter security breached by an active mine. Adapt tactics and retry."}
              </p>

              <div className="cs-stats-table">
                <div className="cs-stat-box">
                  <span className="cs-stat-box__label">{isAz ? "KEÇƏN VAXT" : "TIME"}</span>
                  <span className="cs-stat-box__val">{gameState.elapsedSeconds}s</span>
                </div>
                <div className="cs-stat-box">
                  <span className="cs-stat-box__label">{isAz ? "AŞKARLANDI" : "CLEARED"}</span>
                  <span className="cs-stat-box__val">
                    {gameState.cells.flat().filter((c) => c.isRevealed && !c.isMine).length}
                  </span>
                </div>
                <div className="cs-stat-box">
                  <span className="cs-stat-box__label">{isAz ? "QALAN MİNA" : "MINES"}</span>
                  <span className="cs-stat-box__val">{gameState.remainingMines}</span>
                </div>
                <div className="cs-stat-box">
                  <span className="cs-stat-box__label">{isAz ? "SƏVİYYƏ" : "LEVEL"}</span>
                  <span className="cs-stat-box__val" style={{ textTransform: "uppercase" }}>
                    {selectedDifficulty}
                  </span>
                </div>
              </div>

              <div className="cs-modal__btn-group">
                <button
                  type="button"
                  className="cs-modal-btn"
                  onClick={() => handleReset()}
                >
                  <RotateCcw size={14} style={{ display: "inline", marginRight: 6 }} />
                  {isAz ? "YENİDƏN BAŞLA" : "RETRY"}
                </button>
                <button
                  type="button"
                  className="cs-modal-btn cs-modal-btn--secondary"
                  onClick={() => setShowLeaderboard(true)}
                >
                  <Trophy size={14} color="#ffb800" style={{ display: "inline", marginRight: 6 }} />
                  {isAz ? "LİDERLƏR" : "LEADERBOARD"}
                </button>
                {onSwitchGame && (
                  <button
                    type="button"
                    className="cs-modal-btn cs-modal-btn--secondary"
                    onClick={onSwitchGame}
                  >
                    {isAz ? "ARCADE MENYU" : "ARCADE MENU"}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Leaderboard Modal */}
      {showLeaderboard && (
        <GameLeaderboardModal
          initialGame="sweeper"
          allowedGames={["sweeper", "cyber", "breaker", "flight"]}
          onClose={() => setShowLeaderboard(false)}
        />
      )}
    </div>
  );
};

export default CyberSweeperArcade;
