import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  Sparkles,
  Volume2,
  VolumeX,
  RotateCcw,
  Trophy,
  Award,
  Clock,
  HelpCircle,
  Lightbulb,
  Pencil,
  Eraser,
  Shield,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Play,
  Pause,
} from "lucide-react";
import { ExpressbankEmblem } from "../../common/ExpressbankLogo.js";
import { useAuth } from "../../../context/AuthContext.js";
import { useI18n } from "../../../context/I18nContext.js";
import {
  createSudokuGame,
  setCellValue,
  toggleNote,
  eraseCell,
  undoLastMove,
  provideSmartHint,
  getDigitCounts,
  getBestTime,
  saveBestTime,
  DIFFICULTIES,
  CYBER_GLYPHS,
  type DifficultyLevel,
  type CyberSudokuState,
  type Cell,
} from "./cyber-sudoku-engine.js";
import {
  playSelectCellSound,
  playPlaceNumberSound,
  playToggleNoteSound,
  playEraseSound,
  playErrorSound,
  playBlockCompleteSound,
  playVictorySound,
} from "./cyber-sudoku-sounds.js";
import { isArcadeMuted, toggleArcadeMuted } from "../retro-arcade-sound.js";
import {
  playAzerbaijanTrack,
  stopAzerbaijanMusic,
} from "../retro-azerbaijan-music.js";
import { RetroAzerbaijanPlayer } from "../RetroAzerbaijanPlayer.js";
import { GameLeaderboardModal } from "../common/GameLeaderboardModal.js";
import "./cyber-sudoku-arcade.css";

interface CyberSudokuArcadeProps {
  onClose: () => void;
  onSwitchGame?: () => void;
}

export const CyberSudokuArcade: React.FC<CyberSudokuArcadeProps> = ({
  onClose,
  onSwitchGame,
}) => {
  const { language } = useI18n();
  const { currentUser, fetchWithAuth } = useAuth();
  const isAz = language === "az";

  const [selectedDifficulty, setSelectedDifficulty] = useState<DifficultyLevel>("novice");
  const [gameState, setGameState] = useState<CyberSudokuState>(() =>
    createSudokuGame("novice")
  );
  const [muted, setMuted] = useState(() => isArcadeMuted());
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [bestTime, setBestTime] = useState<number | null>(() => getBestTime("novice"));

  const scoreSubmittedRef = useRef(false);

  // Play "Sarı Gəlin" authentic acoustic Azerbaijani chiptune on mount
  useEffect(() => {
    playAzerbaijanTrack("sarigelin");
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
            elapsedSeconds: prev.elapsedSeconds + 1,
          };
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [gameState.status]);

  // Submit score to backend when game won
  useEffect(() => {
    if (gameState.status === "won" && !scoreSubmittedRef.current) {
      scoreSubmittedRef.current = true;
      playVictorySound();
      saveBestTime(selectedDifficulty, gameState.elapsedSeconds);
      setBestTime(getBestTime(selectedDifficulty));

      const submit = async () => {
        try {
          await fetchWithAuth("/api/game/sudoku/score", {
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

  // Restart / Switch Difficulty
  const handleReset = useCallback(
    (diff: DifficultyLevel = selectedDifficulty) => {
      setSelectedDifficulty(diff);
      const fresh = createSudokuGame(diff);
      setGameState(fresh);
      scoreSubmittedRef.current = false;
      setBestTime(getBestTime(diff));
    },
    [selectedDifficulty]
  );

  // Cell selection
  const handleSelectCell = useCallback((r: number, c: number) => {
    playSelectCellSound();
    setGameState((prev) => ({
      ...prev,
      selectedCell: { row: r, col: c },
    }));
  }, []);

  // Number input
  const handleInputNumber = useCallback(
    (num: number) => {
      if (!gameState.selectedCell || gameState.status === "won") return;
      const { row, col } = gameState.selectedCell;

      if (gameState.notesMode) {
        playToggleNoteSound();
        setGameState((prev) => toggleNote(prev, row, col, num));
      } else {
        const { nextState, soundType } = setCellValue(gameState, row, col, num);
        setGameState(nextState);

        if (soundType === "error") {
          playErrorSound();
        } else if (soundType === "win") {
          // Handled by win effect
        } else if (soundType === "complete_group") {
          playBlockCompleteSound();
        } else {
          playPlaceNumberSound(num);
        }
      }
    },
    [gameState]
  );

  // Erase
  const handleErase = useCallback(() => {
    if (!gameState.selectedCell || gameState.status === "won") return;
    playEraseSound();
    setGameState((prev) =>
      eraseCell(prev, prev.selectedCell!.row, prev.selectedCell!.col)
    );
  }, [gameState.selectedCell, gameState.status]);

  // Undo
  const handleUndo = useCallback(() => {
    if (gameState.history.length === 0 || gameState.status === "won") return;
    playEraseSound();
    setGameState((prev) => undoLastMove(prev));
  }, [gameState.history.length, gameState.status]);

  // Smart Hint
  const handleHint = useCallback(() => {
    if (gameState.hintsRemaining <= 0 || gameState.status === "won") return;
    playBlockCompleteSound();
    const { nextState } = provideSmartHint(gameState);
    setGameState(nextState);
  }, [gameState]);

  // Toggle Notes Mode
  const handleToggleNotesMode = useCallback(() => {
    playSelectCellSound();
    setGameState((prev) => ({
      ...prev,
      notesMode: !prev.notesMode,
    }));
  }, []);

  // Toggle Glyph Mode
  const handleToggleGlyphMode = useCallback(() => {
    playSelectCellSound();
    setGameState((prev) => ({
      ...prev,
      glyphMode: !prev.glyphMode,
    }));
  }, []);

  // Keyboard navigation & inputs
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (gameState.status === "won") return;

      // Digits 1..9
      if (/^[1-9]$/.test(e.key)) {
        e.preventDefault();
        handleInputNumber(Number(e.key));
        return;
      }

      // Backspace / Delete
      if (e.key === "Backspace" || e.key === "Delete" || e.key === "e" || e.key === "E") {
        e.preventDefault();
        handleErase();
        return;
      }

      // Note toggle shortcut: N
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        handleToggleNotesMode();
        return;
      }

      // Hint shortcut: H
      if (e.key === "h" || e.key === "H") {
        e.preventDefault();
        handleHint();
        return;
      }

      // Undo shortcut: Z
      if ((e.key === "z" || e.key === "Z") && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleUndo();
        return;
      }

      // Mute shortcut: M
      if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        const nextMuted = toggleArcadeMuted();
        setMuted(nextMuted);
        return;
      }

      // Arrow Keys navigation
      if (
        e.key === "ArrowUp" ||
        e.key === "ArrowDown" ||
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight" ||
        e.key === "w" ||
        e.key === "s" ||
        e.key === "a" ||
        e.key === "d"
      ) {
        e.preventDefault();
        setGameState((prev) => {
          const cur = prev.selectedCell || { row: 4, col: 4 };
          let nextR = cur.row;
          let nextC = cur.col;

          if (e.key === "ArrowUp" || e.key === "w") nextR = Math.max(0, cur.row - 1);
          if (e.key === "ArrowDown" || e.key === "s") nextR = Math.min(8, cur.row + 1);
          if (e.key === "ArrowLeft" || e.key === "a") nextC = Math.max(0, cur.col - 1);
          if (e.key === "ArrowRight" || e.key === "d") nextC = Math.min(8, cur.col + 1);

          playSelectCellSound();
          return {
            ...prev,
            selectedCell: { row: nextR, col: nextC },
          };
        });
        return;
      }

      // Escape to close
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    gameState.status,
    handleInputNumber,
    handleErase,
    handleToggleNotesMode,
    handleHint,
    handleUndo,
    onClose,
  ]);

  // Derived Values
  const digitCounts = useMemo(() => getDigitCounts(gameState.board), [gameState.board]);

  const selectedValue = useMemo(() => {
    if (!gameState.selectedCell) return null;
    const cell = gameState.board[gameState.selectedCell.row][gameState.selectedCell.col];
    return cell.value > 0 ? cell.value : null;
  }, [gameState.selectedCell, gameState.board]);

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  return (
    <div
      className="csu-overlay"
      role="dialog"
      aria-label="Expressbank Cyber Sudoku"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="csu-cabinet">
        {/* Top Header Marquee */}
        <header className="csu-header">
          <div className="csu-header__brand">
            <div className="csu-header__emblem">
              <ExpressbankEmblem size={26} glow />
            </div>
            <div className="csu-header__titles">
              <h1 className="csu-header__title">
                EXPRESSBANK <span>CYBER SUDOKU</span>
              </h1>
              <span className="csu-header__subtitle">
                {isAz
                  ? "KRİPTOQRAFİK MATRİS QORUYUCUSU • SİSTEM 2088"
                  : "CRYPTOGRAPHIC MATRIX DEFENDER • SYSTEM 2088"}
              </span>
            </div>
          </div>

          <div className="csu-header__actions">
            {/* Retro Azerbaijan BGM Player */}
            <RetroAzerbaijanPlayer />

            {/* Tournament Leaderboard Modal Trigger */}
            <button
              type="button"
              className="csu-pill-btn csu-pill-btn--gold"
              onClick={() => {
                setShowLeaderboard(true);
              }}
              title={isAz ? "Turnir Liderlər Cədvəli" : "Tournament Leaderboard"}
            >
              <Trophy size={14} color="#ffb800" />
              <span>{isAz ? "LİDERLƏR" : "LEADERBOARD"}</span>
            </button>

            {/* Audio Toggle */}
            <button
              type="button"
              className={`csu-pill-btn ${!muted ? "csu-pill-btn--active" : ""}`}
              onClick={() => {
                const nextMuted = toggleArcadeMuted();
                setMuted(nextMuted);
              }}
              title="Toggle 8-bit Audio (M)"
            >
              {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              <span>{muted ? "MUTED" : "SOUND ON"}</span>
            </button>

            {/* Switch Game to Cabinet Selector */}
            {onSwitchGame && (
              <button
                type="button"
                className="csu-pill-btn"
                onClick={onSwitchGame}
                title={isAz ? "Arcade Kabinetinə Qayıt" : "Return to Arcade"}
              >
                <Layers size={14} />
                <span>{isAz ? "KABİNET" : "ARCADE"}</span>
              </button>
            )}

            {/* Close Button */}
            <button
              type="button"
              className="csu-close-btn"
              onClick={onClose}
              aria-label="Close Sudoku (Esc)"
              title="Esc"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {/* Status / Difficulty Sub-Bar */}
        <div className="csu-status-bar">
          <div className="csu-diff-group">
            {(Object.keys(DIFFICULTIES) as DifficultyLevel[]).map((d) => (
              <button
                key={d}
                type="button"
                className={`csu-diff-btn ${
                  selectedDifficulty === d ? "csu-diff-btn--active" : ""
                }`}
                onClick={() => handleReset(d)}
              >
                {isAz ? DIFFICULTIES[d].labelAz : DIFFICULTIES[d].labelEn}
              </button>
            ))}
          </div>

          <div className="csu-metrics">
            {/* Live Timer */}
            <div className="csu-metric csu-metric--timer">
              <Clock size={14} color="#00e5ff" />
              <span>{isAz ? "VAXT:" : "TIME:"}</span>
              <strong>{formatTimer(gameState.elapsedSeconds)}</strong>
            </div>

            {/* Mistakes */}
            <div className="csu-metric csu-metric--mistakes">
              <AlertTriangle size={14} color="#ef4444" />
              <span>{isAz ? "XƏTALAR:" : "MISTAKES:"}</span>
              <strong>{gameState.mistakes}</strong>
            </div>

            {/* Best Record */}
            {bestTime !== null && (
              <div className="csu-metric">
                <Award size={14} color="#ffb800" />
                <span>{isAz ? "REKORD:" : "BEST:"}</span>
                <strong>{formatTimer(bestTime)}</strong>
              </div>
            )}
          </div>
        </div>

        {/* Main Body: 9x9 Sudoku Board & Controls */}
        <div className="csu-body">
          {/* Board */}
          <div className="csu-board-container">
            <div
              className="csu-grid"
              role="grid"
              aria-label="Sudoku Matrix 9x9"
            >
              {gameState.board.map((row, r) =>
                row.map((cell, c) => {
                  const isSelected =
                    gameState.selectedCell?.row === r &&
                    gameState.selectedCell?.col === c;

                  const isPeer =
                    gameState.selectedCell !== null &&
                    (gameState.selectedCell.row === r ||
                      gameState.selectedCell.col === c ||
                      (Math.floor(gameState.selectedCell.row / 3) === Math.floor(r / 3) &&
                        Math.floor(gameState.selectedCell.col / 3) === Math.floor(c / 3)));

                  const isSameNumber =
                    selectedValue !== null &&
                    cell.value > 0 &&
                    cell.value === selectedValue;

                  const isBoxRight = c % 3 === 2 && c !== 8;
                  const isBoxBottom = r % 3 === 2 && r !== 8;

                  return (
                    <div
                      key={`${r}-${c}`}
                      role="gridcell"
                      tabIndex={0}
                      className={`csu-cell ${
                        cell.isInitial
                          ? "csu-cell--initial"
                          : cell.isHinted
                          ? "csu-cell--hinted"
                          : cell.value > 0
                          ? "csu-cell--user"
                          : ""
                      } ${cell.isError ? "csu-cell--error" : ""} ${
                        isSelected ? "csu-cell--selected" : ""
                      } ${isSameNumber && !isSelected ? "csu-cell--same-num" : ""} ${
                        isPeer && !isSelected && !isSameNumber ? "csu-cell--peer" : ""
                      } ${isBoxRight ? "csu-cell--box-right" : ""} ${
                        isBoxBottom ? "csu-cell--box-bottom" : ""
                      }`}
                      onClick={() => handleSelectCell(r, c)}
                    >
                      {cell.value > 0 ? (
                        gameState.glyphMode ? (
                          <span title={CYBER_GLYPHS[cell.value]?.labelAz}>
                            {CYBER_GLYPHS[cell.value]?.symbol}
                          </span>
                        ) : (
                          cell.value
                        )
                      ) : cell.notes.size > 0 ? (
                        <div className="csu-notes-grid">
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                            <span key={n} className="csu-note-slot">
                              {cell.notes.has(n) ? n : ""}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Controls Deck */}
          <div className="csu-controls">
            {/* Quick Actions (Undo, Erase, Notes, Hint) */}
            <div className="csu-actions-row">
              {/* Undo */}
              <button
                type="button"
                className="csu-action-btn"
                onClick={handleUndo}
                disabled={gameState.history.length === 0}
                title={isAz ? "Geri Al (Ctrl+Z)" : "Undo (Ctrl+Z)"}
              >
                <RotateCcw size={18} />
                <span>{isAz ? "Geri Al" : "Undo"}</span>
              </button>

              {/* Erase */}
              <button
                type="button"
                className="csu-action-btn"
                onClick={handleErase}
                title={isAz ? "Sil (Delete / Backspace)" : "Erase (Backspace)"}
              >
                <Eraser size={18} />
                <span>{isAz ? "Sil" : "Erase"}</span>
              </button>

              {/* Notes Mode */}
              <button
                type="button"
                className={`csu-action-btn ${
                  gameState.notesMode ? "csu-action-btn--active" : ""
                }`}
                onClick={handleToggleNotesMode}
                title={isAz ? "Qeydlər Rejimi (N)" : "Notes Mode (N)"}
              >
                <Pencil size={18} />
                <span>{isAz ? "Qeyd" : "Notes"}</span>
                {gameState.notesMode && <span className="csu-badge-tag">ON</span>}
              </button>

              {/* Smart Hint */}
              <button
                type="button"
                className="csu-action-btn"
                onClick={handleHint}
                disabled={gameState.hintsRemaining <= 0}
                title={isAz ? "Köməkçi Açar (H)" : "Smart Hint (H)"}
              >
                <Lightbulb size={18} color="#ffb800" />
                <span>{isAz ? "Kömək" : "Hint"}</span>
                <span className="csu-badge-tag">{gameState.hintsRemaining}</span>
              </button>
            </div>

            {/* Virtual Numpad 1..9 */}
            <div className="csu-numpad">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => {
                const count = digitCounts[num] || 0;
                const isCompleted = count >= 9;

                return (
                  <button
                    key={num}
                    type="button"
                    className={`csu-num-btn ${
                      isCompleted ? "csu-num-btn--completed" : ""
                    }`}
                    onClick={() => handleInputNumber(num)}
                    disabled={isCompleted}
                    title={
                      gameState.glyphMode
                        ? CYBER_GLYPHS[num]?.labelAz
                        : `${num} (${9 - count} qalıb)`
                    }
                  >
                    <span>
                      {gameState.glyphMode ? CYBER_GLYPHS[num]?.symbol : num}
                    </span>
                    <span className="csu-num-btn__sub">
                      {isCompleted ? "✓" : `${count}/9`}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Secondary Controls (Glyph Mode & Restart) */}
            <div className="csu-secondary-deck">
              <button
                type="button"
                className={`csu-mode-btn ${
                  gameState.glyphMode ? "csu-mode-btn--active" : ""
                }`}
                onClick={handleToggleGlyphMode}
                title={isAz ? "Bank Kiber Qlifləri Rejimi" : "Cyber Glyph Mode"}
              >
                <Shield size={14} />
                <span>{isAz ? "Kiber Qliflər" : "Cyber Glyphs"}</span>
              </button>

              <button
                type="button"
                className="csu-mode-btn"
                onClick={() => handleReset(selectedDifficulty)}
                title={isAz ? "Yeni Matris Yarat" : "New Matrix Puzzle"}
              >
                <RotateCcw size={14} />
                <span>{isAz ? "Yenidən Başla" : "New Puzzle"}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Bottom Keyboard Hints Footer */}
        <footer className="csu-footer-hints">
          <div>
            <kbd>1-9</kbd> <span>{isAz ? "Rəqəm yaz" : "Place number"}</span>
          </div>
          <div>
            <kbd>Oxlar / WASD</kbd> <span>{isAz ? "Xana seç" : "Navigate"}</span>
          </div>
          <div>
            <kbd>N</kbd> <span>{isAz ? "Qeyd rejimi" : "Notes"}</span>
          </div>
          <div>
            <kbd>H</kbd> <span>{isAz ? "Kömək" : "Hint"}</span>
          </div>
          <div>
            <kbd>Sil / Backspace</kbd> <span>{isAz ? "Sil" : "Erase"}</span>
          </div>
          <div>
            <kbd>Esc</kbd> <span>{isAz ? "Bağla" : "Close"}</span>
          </div>
        </footer>

        {/* Victory Decrypted Overlay Modal */}
        {gameState.status === "won" && (
          <div className="csu-victory-modal" role="dialog" aria-modal="true">
            <div className="csu-victory-card">
              <div className="csu-victory-card__emblem">
                <CheckCircle2 size={40} color="#a855f7" />
              </div>
              <h2 className="csu-victory-card__title">
                {isAz
                  ? "MATRİS UĞURLA DEŞİFRƏ EDİLDİ!"
                  : "MATRIX SUCCESSFULLY DECRYPTED!"}
              </h2>
              <p className="csu-victory-card__sub">
                {isAz
                  ? "Expressbank kiber mühafizə şəbəkəsinin tamlığı bərpa olundu və nəticə liderlər cədvəlinə yazıldı!"
                  : "Expressbank security matrix integrity restored and score recorded on the leaderboard!"}
              </p>

              <div className="csu-victory-stats">
                <div className="csu-vstat-item">
                  <span className="csu-vstat-label">
                    {isAz ? "HƏLL VAXTI" : "SOLVE TIME"}
                  </span>
                  <span className="csu-vstat-val csu-vstat-val--highlight">
                    {formatTimer(gameState.elapsedSeconds)}
                  </span>
                </div>
                <div className="csu-vstat-item">
                  <span className="csu-vstat-label">
                    {isAz ? "ÇƏTİNLİK" : "DIFFICULTY"}
                  </span>
                  <span className="csu-vstat-val">
                    {DIFFICULTIES[selectedDifficulty].badge}
                  </span>
                </div>
                <div className="csu-vstat-item">
                  <span className="csu-vstat-label">
                    {isAz ? "XƏTALAR" : "MISTAKES"}
                  </span>
                  <span className="csu-vstat-val">{gameState.mistakes}</span>
                </div>
              </div>

              <div className="csu-victory-actions">
                <button
                  type="button"
                  className="csu-vbtn csu-vbtn--primary"
                  onClick={() => handleReset(selectedDifficulty)}
                >
                  <Sparkles size={16} />
                  <span>{isAz ? "YENİ MATRİS" : "NEXT MATRIX"}</span>
                </button>
                <button
                  type="button"
                  className="csu-vbtn csu-vbtn--secondary"
                  onClick={() => setShowLeaderboard(true)}
                >
                  <Trophy size={16} />
                  <span>{isAz ? "LİDERLƏR" : "LEADERBOARD"}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Global Leaderboard Modal */}
        {showLeaderboard && (
          <GameLeaderboardModal
            initialGame="sudoku"
            onClose={() => setShowLeaderboard(false)}
            onLaunchGame={() => {
              setShowLeaderboard(false);
            }}
          />
        )}
      </div>
    </div>
  );
};

export default CyberSudokuArcade;
