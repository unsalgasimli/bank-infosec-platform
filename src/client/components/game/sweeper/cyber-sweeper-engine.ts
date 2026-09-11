/**
 * Expressbank Cyber Sweeper - Game Engine
 * Professional Minesweeper with first-click safety, chording, sonar pulse, 3BV calculation, and local records.
 */

import {
  playDigSound,
  playFlagSetSound,
  playFlagRemoveSound,
  playChordSound,
  playSonarPingSound,
  playMineExplodeSound,
  playSweeperVictorySound,
} from "./cyber-sweeper-sounds.js";

export type DifficultyLevel = "novice" | "soc" | "ciso" | "custom";

export interface Cell {
  r: number;
  c: number;
  isMine: boolean;
  isRevealed: boolean;
  isFlagged: boolean;
  isQuestion: boolean;
  isExploded: boolean;
  neighborMines: number;
  isSonarHighlighted: boolean;
}

export interface DifficultyConfig {
  id: DifficultyLevel;
  rows: number;
  cols: number;
  mines: number;
  name: {
    az: string;
    en: string;
  };
  subtitle: {
    az: string;
    en: string;
  };
}

export const DIFFICULTIES: Record<DifficultyLevel, DifficultyConfig> = {
  novice: {
    id: "novice",
    rows: 9,
    cols: 9,
    mines: 10,
    name: {
      az: "Junior Analitik",
      en: "Junior Analyst",
    },
    subtitle: {
      az: "9x9 şəbəkə • 10 Kiber Təhlükə",
      en: "9x9 grid • 10 Cyber Threats",
    },
  },
  soc: {
    id: "soc",
    rows: 16,
    cols: 16,
    mines: 40,
    name: {
      az: "SOC Mütəxəssisi",
      en: "SOC Specialist",
    },
    subtitle: {
      az: "16x16 şəbəkə • 40 Kiber Təhlükə",
      en: "16x16 grid • 40 Cyber Threats",
    },
  },
  ciso: {
    id: "ciso",
    rows: 16,
    cols: 30,
    mines: 99,
    name: {
      az: "CISO Ekspert",
      en: "CISO Expert",
    },
    subtitle: {
      az: "30x16 şəbəkə • 99 Kiber Təhlükə",
      en: "30x16 grid • 99 Cyber Threats",
    },
  },
  custom: {
    id: "custom",
    rows: 12,
    cols: 20,
    mines: 30,
    name: {
      az: "Xüsusi Sektor",
      en: "Custom Sector",
    },
    subtitle: {
      az: "Fərdiləşdirilmiş Kassa Zonası",
      en: "Custom Security Zone",
    },
  },
};

export interface CyberSweeperState {
  difficulty: DifficultyLevel;
  rows: number;
  cols: number;
  totalMines: number;
  cells: Cell[][];
  status: "idle" | "playing" | "won" | "lost";
  flagsCount: number;
  revealedCount: number;
  firstClickDone: boolean;
  startTime: number | null;
  elapsedSeconds: number;
  clicksCount: number;
  threeBV: number;
  sonarUsed: boolean;
  isSonarActive: boolean;
  sentinelFace: "normal" | "surprised" | "won" | "lost";
}

// -------------------------------------------------------------
// Board Initialization
// -------------------------------------------------------------
export function createEmptyBoard(
  difficulty: DifficultyLevel,
  customConfig?: { rows: number; cols: number; mines: number }
): CyberSweeperState {
  const config =
    difficulty === "custom" && customConfig
      ? {
          rows: Math.max(8, Math.min(24, customConfig.rows)),
          cols: Math.max(8, Math.min(32, customConfig.cols)),
          mines: Math.max(
            1,
            Math.min(customConfig.rows * customConfig.cols - 9, customConfig.mines)
          ),
        }
      : {
          rows: DIFFICULTIES[difficulty].rows,
          cols: DIFFICULTIES[difficulty].cols,
          mines: DIFFICULTIES[difficulty].mines,
        };

  const cells: Cell[][] = [];
  for (let r = 0; r < config.rows; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < config.cols; c++) {
      row.push({
        r,
        c,
        isMine: false,
        isRevealed: false,
        isFlagged: false,
        isQuestion: false,
        isExploded: false,
        neighborMines: 0,
        isSonarHighlighted: false,
      });
    }
    cells.push(row);
  }

  return {
    difficulty,
    rows: config.rows,
    cols: config.cols,
    totalMines: config.mines,
    cells,
    status: "idle",
    flagsCount: 0,
    revealedCount: 0,
    firstClickDone: false,
    startTime: null,
    elapsedSeconds: 0,
    clicksCount: 0,
    threeBV: 0,
    sonarUsed: false,
    isSonarActive: false,
    sentinelFace: "normal",
  };
}

// -------------------------------------------------------------
// First-Click Safety Mine Generation
// -------------------------------------------------------------
export function populateMines(
  state: CyberSweeperState,
  safeR: number,
  safeC: number
): void {
  const { rows, cols, totalMines, cells } = state;

  // Safe zone: clicked cell and all its immediate 8 neighbors
  const safeCoords = new Set<string>();
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const nr = safeR + dr;
      const nc = safeC + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
        safeCoords.add(`${nr},${nc}`);
      }
    }
  }

  // Place mines randomly outside safe zone
  let placed = 0;
  const availableSlots: [number, number][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!safeCoords.has(`${r},${c}`)) {
        availableSlots.push([r, c]);
      }
    }
  }

  // Shuffle available slots
  for (let i = availableSlots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [availableSlots[i], availableSlots[j]] = [availableSlots[j], availableSlots[i]];
  }

  while (placed < totalMines && availableSlots.length > 0) {
    const [mr, mc] = availableSlots.pop()!;
    cells[mr][mc].isMine = true;
    placed++;
  }

  // Calculate neighbor mine numbers
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (cells[r][c].isMine) continue;
      let count = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && cells[nr][nc].isMine) {
            count++;
          }
        }
      }
      cells[r][c].neighborMines = count;
    }
  }

  state.firstClickDone = true;
  state.status = "playing";
  state.startTime = Date.now();
  state.threeBV = calculate3BV(state);
}

// -------------------------------------------------------------
// Reveal Cell (Dig)
// -------------------------------------------------------------
export function revealCell(
  state: CyberSweeperState,
  r: number,
  c: number
): void {
  if (state.status === "won" || state.status === "lost") return;

  const cell = state.cells[r][c];
  if (cell.isRevealed || cell.isFlagged) return;

  state.clicksCount++;

  // First click guarantees safe zone
  if (!state.firstClickDone) {
    populateMines(state, r, c);
  }

  // Hit a mine -> Game Over
  if (cell.isMine) {
    cell.isExploded = true;
    state.status = "lost";
    state.sentinelFace = "lost";
    playMineExplodeSound();

    // Reveal all remaining mines and wrong flags
    state.cells.forEach((row) =>
      row.forEach((other) => {
        if (other.isMine) {
          other.isRevealed = true;
        }
      })
    );
    return;
  }

  playDigSound();

  // Cascade Flood-Fill
  cascadeReveal(state, r, c);

  // Check Victory condition
  checkVictory(state);
}

function cascadeReveal(state: CyberSweeperState, startR: number, startC: number): void {
  const queue: [number, number][] = [[startR, startC]];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const [cr, cc] = queue.shift()!;
    const key = `${cr},${cc}`;
    if (visited.has(key)) continue;
    visited.add(key);

    const cell = state.cells[cr][cc];
    if (cell.isFlagged || cell.isRevealed || cell.isMine) continue;

    cell.isRevealed = true;
    state.revealedCount++;

    // If zero neighbor mines, expand flood fill
    if (cell.neighborMines === 0) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = cr + dr;
          const nc = cc + dc;
          if (
            nr >= 0 &&
            nr < state.rows &&
            nc >= 0 &&
            nc < state.cols &&
            !state.cells[nr][nc].isRevealed &&
            !state.cells[nr][nc].isFlagged
          ) {
            queue.push([nr, nc]);
          }
        }
      }
    }
  }
}

// -------------------------------------------------------------
// Professional Chording (Double click / Middle click on numbered cell)
// -------------------------------------------------------------
export function chordCell(
  state: CyberSweeperState,
  r: number,
  c: number
): void {
  if (state.status !== "playing") return;

  const cell = state.cells[r][c];
  if (!cell.isRevealed || cell.neighborMines === 0) return;

  state.clicksCount++;

  // Count surrounding flags
  let flagCount = 0;
  const neighbors: [number, number][] = [];

  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < state.rows && nc >= 0 && nc < state.cols) {
        if (state.cells[nr][nc].isFlagged) {
          flagCount++;
        } else if (!state.cells[nr][nc].isRevealed) {
          neighbors.push([nr, nc]);
        }
      }
    }
  }

  // Chord triggers if flags match neighbor mine count
  if (flagCount === cell.neighborMines) {
    playChordSound();
    for (const [nr, nc] of neighbors) {
      revealCell(state, nr, nc);
      if ((state.status as string) === "lost") break;
    }
  }
}

// -------------------------------------------------------------
// Toggle Flag (Right click)
// -------------------------------------------------------------
export function toggleFlag(
  state: CyberSweeperState,
  r: number,
  c: number
): void {
  if (state.status === "won" || state.status === "lost") return;

  const cell = state.cells[r][c];
  if (cell.isRevealed) return;

  state.clicksCount++;

  if (!cell.isFlagged && !cell.isQuestion) {
    // Set flag
    cell.isFlagged = true;
    state.flagsCount++;
    playFlagSetSound();
  } else if (cell.isFlagged) {
    // Flag -> Question
    cell.isFlagged = false;
    cell.isQuestion = true;
    state.flagsCount--;
    playFlagRemoveSound();
  } else {
    // Question -> Unmarked
    cell.isQuestion = false;
    playFlagRemoveSound();
  }
}

// -------------------------------------------------------------
// Infosec Sonar Pulse Ability (Scans 3x3 region safely)
// -------------------------------------------------------------
export function useSonarPulse(
  state: CyberSweeperState,
  centerR: number,
  centerC: number
): void {
  if (state.sonarUsed || state.status === "won" || state.status === "lost") return;

  state.sonarUsed = true;
  playSonarPingSound();

  // Clear previous sonar highlights
  state.cells.forEach((row) =>
    row.forEach((cell) => {
      cell.isSonarHighlighted = false;
    })
  );

  // Highlight 3x3 region and safely reveal safe unflagged cells or highlight threats
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const nr = centerR + dr;
      const nc = centerC + dc;
      if (nr >= 0 && nr < state.rows && nc >= 0 && nc < state.cols) {
        const cell = state.cells[nr][nc];
        cell.isSonarHighlighted = true;
        if (!cell.isMine && !cell.isRevealed && !cell.isFlagged) {
          revealCell(state, nr, nc);
        }
      }
    }
  }

  setTimeout(() => {
    state.cells.forEach((row) =>
      row.forEach((cell) => {
        cell.isSonarHighlighted = false;
      })
    );
  }, 2200);
}

// -------------------------------------------------------------
// Check Victory
// -------------------------------------------------------------
function checkVictory(state: CyberSweeperState): void {
  const safeCellsCount = state.rows * state.cols - state.totalMines;
  if (state.revealedCount >= safeCellsCount) {
    state.status = "won";
    state.sentinelFace = "won";
    playSweeperVictorySound();

    // Auto-flag all mines
    state.cells.forEach((row) =>
      row.forEach((c) => {
        if (c.isMine) {
          c.isFlagged = true;
        }
      })
    );
    state.flagsCount = state.totalMines;

    // Save best time
    saveBestTime(state.difficulty, state.elapsedSeconds);
  }
}

// -------------------------------------------------------------
// Professional 3BV Metric Calculation
// -------------------------------------------------------------
export function calculate3BV(state: CyberSweeperState): number {
  const { rows, cols, cells } = state;
  const visited = new Set<string>();
  let count = 0;

  // 1. Count openings (clusters of zeros)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!cells[r][c].isMine && cells[r][c].neighborMines === 0 && !visited.has(`${r},${c}`)) {
        count++;
        // Flood fill cluster
        const q: [number, number][] = [[r, c]];
        while (q.length > 0) {
          const [qr, qc] = q.shift()!;
          const key = `${qr},${qc}`;
          if (visited.has(key)) continue;
          visited.add(key);

          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              const nr = qr + dr;
              const nc = qc + dc;
              if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !cells[nr][nc].isMine) {
                if (cells[nr][nc].neighborMines === 0 && !visited.has(`${nr},${nc}`)) {
                  q.push([nr, nc]);
                } else {
                  visited.add(`${nr},${nc}`);
                }
              }
            }
          }
        }
      }
    }
  }

  // 2. Count remaining numbered cells not opened by openings
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!cells[r][c].isMine && !visited.has(`${r},${c}`)) {
        count++;
      }
    }
  }

  return Math.max(1, count);
}

// -------------------------------------------------------------
// Best Records Storage
// -------------------------------------------------------------
export function getBestTime(difficulty: DifficultyLevel): number | null {
  try {
    const raw = localStorage.getItem(`cyber-sweeper.best.${difficulty}`);
    if (!raw) return null;
    const val = Number(raw);
    return Number.isFinite(val) && val > 0 ? val : null;
  } catch {
    return null;
  }
}

export function saveBestTime(difficulty: DifficultyLevel, time: number): void {
  try {
    const current = getBestTime(difficulty);
    if (current === null || time < current) {
      localStorage.setItem(`cyber-sweeper.best.${difficulty}`, String(time));
    }
  } catch {
    /* storage unavailable */
  }
}
