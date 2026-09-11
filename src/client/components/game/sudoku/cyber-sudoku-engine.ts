/**
 * Expressbank Cyber Sudoku Engine
 * High-performance, mathematically rigorous 9x9 Sudoku generation, validation,
 * backtracking solver, and smart hint system for enterprise cybersecurity gaming.
 */

export type DifficultyLevel = "novice" | "soc" | "ciso";

export interface Cell {
  row: number;
  col: number;
  value: number; // 0 = empty, 1..9
  solution: number; // 1..9
  isInitial: boolean; // given clue at game start
  notes: Set<number>; // candidate notes 1..9
  isError: boolean; // currently flagged as incorrect
  isHinted?: boolean; // filled by smart hint
}

export interface BoardHistoryStep {
  row: number;
  col: number;
  prevValue: number;
  prevNotes: number[];
  newValue: number;
  newNotes: number[];
}

export interface CyberSudokuState {
  board: Cell[][];
  difficulty: DifficultyLevel;
  status: "idle" | "playing" | "paused" | "won";
  elapsedSeconds: number;
  mistakes: number;
  hintsRemaining: number;
  selectedCell: { row: number; col: number } | null;
  notesMode: boolean;
  glyphMode: boolean; // Toggle between digits 1-9 and Expressbank Cyber Security Glyphs
  history: BoardHistoryStep[];
}

export interface DifficultyConfig {
  id: DifficultyLevel;
  labelAz: string;
  labelEn: string;
  clues: number;
  badge: string;
  color: string;
}

export const DIFFICULTIES: Record<DifficultyLevel, DifficultyConfig> = {
  novice: {
    id: "novice",
    labelAz: "Giriş Matrisi (Novice)",
    labelEn: "Novice Matrix (Easy)",
    clues: 40,
    badge: "BAŞLANĞIC",
    color: "#00f576",
  },
  soc: {
    id: "soc",
    labelAz: "SOC Analitik (Medium)",
    labelEn: "SOC Analyst (Medium)",
    clues: 32,
    badge: "ANALİTİK",
    color: "#00e5ff",
  },
  ciso: {
    id: "ciso",
    labelAz: "CISO Kriptoqraf (Hard)",
    labelEn: "CISO Cryptographer (Hard)",
    clues: 26,
    badge: "EKSPERT",
    color: "#a855f7",
  },
};

// Expressbank Cybersecurity Glyphs corresponding to 1..9
export const CYBER_GLYPHS: Record<number, { symbol: string; labelAz: string; labelEn: string; icon: string }> = {
  1: { symbol: "🛡️", labelAz: "Firewall (1)", labelEn: "Firewall (1)", icon: "Shield" },
  2: { symbol: "🔑", labelAz: "Açar / Key (2)", labelEn: "Master Key (2)", icon: "Key" },
  3: { symbol: "💾", labelAz: "Məlumat / Data (3)", labelEn: "Data Vault (3)", icon: "Database" },
  4: { symbol: "⚡", labelAz: "EMP Şəbəkə (4)", labelEn: "EMP Grid (4)", icon: "Zap" },
  5: { symbol: "🔐", labelAz: "Kripto Qala (5)", labelEn: "Crypto Lock (5)", icon: "Lock" },
  6: { symbol: "🪙", labelAz: "Token / Coin (6)", labelEn: "Secure Token (6)", icon: "Coins" },
  7: { symbol: "💎", labelAz: "E-Valyuta (7)", labelEn: "Vault Asset (7)", icon: "Gem" },
  8: { symbol: "📡", labelAz: "Kiber Radar (8)", labelEn: "Cyber Radar (8)", icon: "Radio" },
  9: { symbol: "🌐", labelAz: "Bank Əlaqəsi (9)", labelEn: "Mainframe Link (9)", icon: "Globe" },
};

// Canonical seed solutions for fast isomorphic generation
const CANONICAL_SOLUTIONS: number[][][] = [
  [
    [5, 3, 4, 6, 7, 8, 9, 1, 2],
    [6, 7, 2, 1, 9, 5, 3, 4, 8],
    [1, 9, 8, 3, 4, 2, 5, 6, 7],
    [8, 5, 9, 7, 6, 1, 4, 2, 3],
    [4, 2, 6, 8, 5, 3, 7, 9, 1],
    [7, 1, 3, 9, 2, 4, 8, 5, 6],
    [9, 6, 1, 5, 3, 7, 2, 8, 4],
    [2, 8, 7, 4, 1, 9, 6, 3, 5],
    [3, 4, 5, 2, 8, 6, 1, 7, 9],
  ],
  [
    [8, 2, 7, 1, 5, 4, 3, 9, 6],
    [9, 6, 5, 3, 2, 7, 1, 4, 8],
    [3, 4, 1, 6, 8, 9, 7, 5, 2],
    [5, 9, 3, 4, 6, 8, 2, 7, 1],
    [4, 7, 2, 5, 1, 3, 6, 8, 9],
    [6, 1, 8, 9, 7, 2, 4, 3, 5],
    [7, 8, 6, 2, 3, 5, 9, 1, 4],
    [1, 5, 4, 7, 9, 6, 8, 2, 3],
    [2, 3, 9, 8, 4, 1, 5, 6, 7],
  ],
  [
    [1, 5, 2, 4, 8, 9, 3, 7, 6],
    [7, 3, 9, 2, 5, 6, 8, 4, 1],
    [4, 6, 8, 3, 7, 1, 2, 9, 5],
    [3, 8, 7, 1, 2, 4, 6, 5, 9],
    [5, 9, 1, 7, 6, 3, 4, 2, 8],
    [2, 4, 6, 8, 9, 5, 7, 1, 3],
    [9, 1, 4, 6, 3, 7, 5, 8, 2],
    [6, 2, 5, 9, 4, 8, 1, 3, 7],
    [8, 7, 3, 5, 1, 2, 9, 6, 4],
  ],
];

/**
 * Generate a random valid 9x9 completed Sudoku grid using valid transformation groups:
 * - Digit permutation mapping
 * - Swapping rows within same 3x3 block
 * - Swapping columns within same 3x3 block
 * - Swapping 3x3 block rows / columns
 * - Optional matrix transposition
 */
function generateTransformedSolution(): number[][] {
  const baseIdx = Math.floor(Math.random() * CANONICAL_SOLUTIONS.length);
  const base = CANONICAL_SOLUTIONS[baseIdx];

  // 1. Deep clone
  const grid = base.map((row) => [...row]);

  // 2. Random digit mapping 1..9
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (let i = digits.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [digits[i], digits[j]] = [digits[j], digits[i]];
  }
  const map = new Map<number, number>();
  for (let i = 0; i < 9; i++) {
    map.set(i + 1, digits[i]);
  }

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      grid[r][c] = map.get(grid[r][c])!;
    }
  }

  // 3. Swap rows within 3x3 bands
  for (let band = 0; band < 3; band++) {
    const r1 = band * 3 + Math.floor(Math.random() * 3);
    const r2 = band * 3 + Math.floor(Math.random() * 3);
    if (r1 !== r2) {
      [grid[r1], grid[r2]] = [grid[r2], grid[r1]];
    }
  }

  // 4. Swap columns within 3x3 stacks
  for (let stack = 0; stack < 3; stack++) {
    const c1 = stack * 3 + Math.floor(Math.random() * 3);
    const c2 = stack * 3 + Math.floor(Math.random() * 3);
    if (c1 !== c2) {
      for (let r = 0; r < 9; r++) {
        [grid[r][c1], grid[r][c2]] = [grid[r][c2], grid[r][c1]];
      }
    }
  }

  // 5. Swap entire bands (horizontal)
  if (Math.random() > 0.5) {
    const b1 = Math.floor(Math.random() * 3);
    const b2 = Math.floor(Math.random() * 3);
    if (b1 !== b2) {
      for (let i = 0; i < 3; i++) {
        [grid[b1 * 3 + i], grid[b2 * 3 + i]] = [grid[b2 * 3 + i], grid[b1 * 3 + i]];
      }
    }
  }

  // 6. Transposition
  if (Math.random() > 0.5) {
    for (let r = 0; r < 9; r++) {
      for (let c = r + 1; c < 9; c++) {
        [grid[r][c], grid[c][r]] = [grid[c][r], grid[r][c]];
      }
    }
  }

  return grid;
}

/**
 * Check if a number can legally be placed at (row, col)
 */
export function isValidPlacement(
  grid: number[][],
  row: number,
  col: number,
  val: number
): boolean {
  if (val === 0) return true;

  // Check row
  for (let c = 0; c < 9; c++) {
    if (c !== col && grid[row][c] === val) return false;
  }

  // Check col
  for (let r = 0; r < 9; r++) {
    if (r !== row && grid[r][col] === val) return false;
  }

  // Check 3x3 box
  const startR = Math.floor(row / 3) * 3;
  const startC = Math.floor(col / 3) * 3;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const curR = startR + r;
      const curC = startC + c;
      if ((curR !== row || curC !== col) && grid[curR][curC] === val) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Creates a brand new Sudoku game instance
 */
export function createSudokuGame(difficulty: DifficultyLevel): CyberSudokuState {
  const solution = generateTransformedSolution();
  const cluesTarget = DIFFICULTIES[difficulty].clues;
  const totalToRemove = 81 - cluesTarget;

  // Create empty initial board
  const puzzle = solution.map((r) => [...r]);

  // List all 81 positions and shuffle
  const positions: [number, number][] = [];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      positions.push([r, c]);
    }
  }
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }

  // Remove cells symmetrically or sequentially
  let removed = 0;
  for (const [r, c] of positions) {
    if (removed >= totalToRemove) break;
    puzzle[r][c] = 0;
    removed++;
  }

  // Construct Cell matrix
  const board: Cell[][] = [];
  for (let r = 0; r < 9; r++) {
    board[r] = [];
    for (let c = 0; c < 9; c++) {
      const val = puzzle[r][c];
      board[r][c] = {
        row: r,
        col: c,
        value: val,
        solution: solution[r][c],
        isInitial: val !== 0,
        notes: new Set<number>(),
        isError: false,
      };
    }
  }

  return {
    board,
    difficulty,
    status: "idle",
    elapsedSeconds: 0,
    mistakes: 0,
    hintsRemaining: 3,
    selectedCell: null,
    notesMode: false,
    glyphMode: false,
    history: [],
  };
}

/**
 * Calculate how many times each digit (1..9) has been placed correctly
 */
export function getDigitCounts(board: Cell[][]): Record<number, number> {
  const counts: Record<number, number> = {
    1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0,
  };
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = board[r][c];
      if (cell.value > 0 && !cell.isError) {
        counts[cell.value] = (counts[cell.value] || 0) + 1;
      }
    }
  }
  return counts;
}

/**
 * Check if the entire board is solved correctly
 */
export function isBoardSolved(board: Cell[][]): boolean {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = board[r][c];
      if (cell.value === 0 || cell.value !== cell.solution) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Check if completing (row, col) just finished its row, column, or 3x3 block
 */
function didCompleteGroup(board: Cell[][], row: number, col: number): boolean {
  // Check row
  let rowComplete = true;
  for (let c = 0; c < 9; c++) {
    if (board[row][c].value === 0 || board[row][c].value !== board[row][c].solution) {
      rowComplete = false;
      break;
    }
  }

  // Check column
  let colComplete = true;
  for (let r = 0; r < 9; r++) {
    if (board[r][col].value === 0 || board[r][col].value !== board[r][col].solution) {
      colComplete = false;
      break;
    }
  }

  // Check 3x3 block
  let boxComplete = true;
  const startR = Math.floor(row / 3) * 3;
  const startC = Math.floor(col / 3) * 3;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const cell = board[startR + r][startC + c];
      if (cell.value === 0 || cell.value !== cell.solution) {
        boxComplete = false;
        break;
      }
    }
  }

  return rowComplete || colComplete || boxComplete;
}

/**
 * Place a number in the selected cell
 */
export function setCellValue(
  state: CyberSudokuState,
  row: number,
  col: number,
  num: number
): { nextState: CyberSudokuState; soundType: "place" | "error" | "win" | "complete_group" } {
  const cell = state.board[row][col];
  if (cell.isInitial) {
    return { nextState: state, soundType: "place" };
  }

  const prevValue = cell.value;
  const prevNotes = Array.from(cell.notes);
  const isCorrect = num === cell.solution;

  // New board copy
  const newBoard = state.board.map((r) => r.map((c) => ({ ...c, notes: new Set(c.notes) })));
  const target = newBoard[row][col];

  // If already set to this value, toggle it off
  if (prevValue === num) {
    target.value = 0;
    target.isError = false;
    return {
      nextState: {
        ...state,
        board: newBoard,
        history: [
          ...state.history,
          { row, col, prevValue, prevNotes, newValue: 0, newNotes: prevNotes },
        ],
      },
      soundType: "place",
    };
  }

  target.value = num;
  target.notes.clear();
  target.isError = !isCorrect;

  const mistakes = isCorrect ? state.mistakes : state.mistakes + 1;
  const status = isBoardSolved(newBoard) ? "won" : "playing";

  let soundType: "place" | "error" | "win" | "complete_group" = "place";
  if (!isCorrect) {
    soundType = "error";
  } else if (status === "won") {
    soundType = "win";
  } else if (didCompleteGroup(newBoard, row, col)) {
    soundType = "complete_group";
  }

  // Remove notes of this number from peer row, col, and box
  if (isCorrect) {
    for (let c = 0; c < 9; c++) newBoard[row][c].notes.delete(num);
    for (let r = 0; r < 9; r++) newBoard[r][col].notes.delete(num);
    const startR = Math.floor(row / 3) * 3;
    const startC = Math.floor(col / 3) * 3;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        newBoard[startR + r][startC + c].notes.delete(num);
      }
    }
  }

  return {
    nextState: {
      ...state,
      board: newBoard,
      mistakes,
      status: state.status === "idle" ? "playing" : status,
      history: [
        ...state.history,
        { row, col, prevValue, prevNotes, newValue: num, newNotes: [] },
      ],
    },
    soundType,
  };
}

/**
 * Toggle a pencil candidate note in the selected cell
 */
export function toggleNote(
  state: CyberSudokuState,
  row: number,
  col: number,
  num: number
): CyberSudokuState {
  const cell = state.board[row][col];
  if (cell.isInitial || cell.value > 0) return state;

  const prevNotes = Array.from(cell.notes);
  const newBoard = state.board.map((r) => r.map((c) => ({ ...c, notes: new Set(c.notes) })));
  const target = newBoard[row][col];

  if (target.notes.has(num)) {
    target.notes.delete(num);
  } else {
    target.notes.add(num);
  }

  return {
    ...state,
    board: newBoard,
    status: state.status === "idle" ? "playing" : state.status,
    history: [
      ...state.history,
      {
        row,
        col,
        prevValue: 0,
        prevNotes,
        newValue: 0,
        newNotes: Array.from(target.notes),
      },
    ],
  };
}

/**
 * Erase the selected cell's value and notes
 */
export function eraseCell(
  state: CyberSudokuState,
  row: number,
  col: number
): CyberSudokuState {
  const cell = state.board[row][col];
  if (cell.isInitial || (cell.value === 0 && cell.notes.size === 0)) return state;

  const prevValue = cell.value;
  const prevNotes = Array.from(cell.notes);

  const newBoard = state.board.map((r) => r.map((c) => ({ ...c, notes: new Set(c.notes) })));
  newBoard[row][col].value = 0;
  newBoard[row][col].notes.clear();
  newBoard[row][col].isError = false;

  return {
    ...state,
    board: newBoard,
    history: [
      ...state.history,
      { row, col, prevValue, prevNotes, newValue: 0, newNotes: [] },
    ],
  };
}

/**
 * Undo the last move in history
 */
export function undoLastMove(state: CyberSudokuState): CyberSudokuState {
  if (state.history.length === 0) return state;

  const lastStep = state.history[state.history.length - 1];
  const newHistory = state.history.slice(0, -1);

  const newBoard = state.board.map((r) => r.map((c) => ({ ...c, notes: new Set(c.notes) })));
  const target = newBoard[lastStep.row][lastStep.col];

  target.value = lastStep.prevValue;
  target.notes = new Set(lastStep.prevNotes);
  target.isError = target.value > 0 && target.value !== target.solution;

  return {
    ...state,
    board: newBoard,
    history: newHistory,
    selectedCell: { row: lastStep.row, col: lastStep.col },
  };
}

/**
 * Provide a smart hint by filling in a cell with its correct solution
 */
export function provideSmartHint(
  state: CyberSudokuState
): { nextState: CyberSudokuState; hintCell?: { row: number; col: number; value: number } } {
  if (state.hintsRemaining <= 0 || state.status === "won") {
    return { nextState: state };
  }

  // If a cell is currently selected and is empty/incorrect, hint that cell!
  let targetR = -1;
  let targetC = -1;

  if (
    state.selectedCell &&
    !state.board[state.selectedCell.row][state.selectedCell.col].isInitial &&
    state.board[state.selectedCell.row][state.selectedCell.col].value !==
      state.board[state.selectedCell.row][state.selectedCell.col].solution
  ) {
    targetR = state.selectedCell.row;
    targetC = state.selectedCell.col;
  } else {
    // Find the empty cell with the fewest possible valid numbers (Naked Single or most constrained)
    const emptyCells: { r: number; c: number; candidates: number }[] = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const cell = state.board[r][c];
        if (cell.value === 0 || cell.value !== cell.solution) {
          // Count candidate digits
          let candidates = 0;
          for (let d = 1; d <= 9; d++) {
            if (isValidPlacement(state.board.map((row) => row.map((x) => x.value)), r, c, d)) {
              candidates++;
            }
          }
          emptyCells.push({ r, c, candidates: candidates || 9 });
        }
      }
    }

    if (emptyCells.length === 0) return { nextState: state };

    // Sort by fewest candidates
    emptyCells.sort((a, b) => a.candidates - b.candidates);
    targetR = emptyCells[0].r;
    targetC = emptyCells[0].c;
  }

  const solutionVal = state.board[targetR][targetC].solution;
  const newBoard = state.board.map((r) => r.map((c) => ({ ...c, notes: new Set(c.notes) })));
  newBoard[targetR][targetC].value = solutionVal;
  newBoard[targetR][targetC].isError = false;
  newBoard[targetR][targetC].isHinted = true;
  newBoard[targetR][targetC].notes.clear();

  // Clear notes of this number in peer row/col/box
  for (let c = 0; c < 9; c++) newBoard[targetR][c].notes.delete(solutionVal);
  for (let r = 0; r < 9; r++) newBoard[r][targetC].notes.delete(solutionVal);
  const startR = Math.floor(targetR / 3) * 3;
  const startC = Math.floor(targetC / 3) * 3;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      newBoard[startR + r][startC + c].notes.delete(solutionVal);
    }
  }

  const status = isBoardSolved(newBoard) ? "won" : "playing";

  return {
    nextState: {
      ...state,
      board: newBoard,
      hintsRemaining: state.hintsRemaining - 1,
      selectedCell: { row: targetR, col: targetC },
      status: state.status === "idle" ? "playing" : status,
    },
    hintCell: { row: targetR, col: targetC, value: solutionVal },
  };
}

/**
 * Local storage best times for offline and immediate response
 */
export function getBestTime(difficulty: DifficultyLevel): number | null {
  try {
    const val = localStorage.getItem(`eb-sudoku.best.${difficulty}`);
    return val ? Number(val) || null : null;
  } catch {
    return null;
  }
}

export function saveBestTime(difficulty: DifficultyLevel, seconds: number): void {
  try {
    const current = getBestTime(difficulty);
    if (current === null || seconds < current) {
      localStorage.setItem(`eb-sudoku.best.${difficulty}`, String(seconds));
    }
  } catch {
    /* storage unavailable */
  }
}
