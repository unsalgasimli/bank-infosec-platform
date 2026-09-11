import test from "node:test";
import assert from "node:assert/strict";
import {
  createSudokuGame,
  setCellValue,
  toggleNote,
  eraseCell,
  undoLastMove,
  provideSmartHint,
  getDigitCounts,
  isBoardSolved,
  isValidPlacement,
} from "../client/components/game/sudoku/cyber-sudoku-engine.js";
import { GameLeaderboardService } from "../server/services/game-leaderboard.service.js";

test("Cyber Sudoku Engine - creates a valid puzzle for all difficulty tiers", () => {
  for (const diff of ["novice", "soc", "ciso"] as const) {
    const game = createSudokuGame(diff);
    assert.equal(game.board.length, 9);
    assert.equal(game.board[0].length, 9);
    assert.equal(game.difficulty, diff);
    assert.equal(game.status, "idle");
    assert.equal(game.mistakes, 0);

    let clues = 0;
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const cell = game.board[r][c];
        assert.ok(cell.solution >= 1 && cell.solution <= 9);
        if (cell.isInitial) {
          clues++;
          assert.equal(cell.value, cell.solution);
        } else {
          assert.equal(cell.value, 0);
        }
      }
    }
    assert.ok(clues >= 24 && clues <= 45, `Unexpected clue count: ${clues} for ${diff}`);
  }
});

test("Cyber Sudoku Engine - cell manipulation: input, errors, notes, undo, erase", () => {
  const game = createSudokuGame("novice");

  // Find an empty cell
  let emptyR = -1;
  let emptyC = -1;
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (!game.board[r][c].isInitial) {
        emptyR = r;
        emptyC = c;
        break;
      }
    }
    if (emptyR !== -1) break;
  }

  assert.ok(emptyR !== -1 && emptyC !== -1);
  const correctVal = game.board[emptyR][emptyC].solution;
  const wrongVal = correctVal === 9 ? 1 : correctVal + 1;

  // 1. Placing a wrong number triggers error and mistake increment
  const wrongResult = setCellValue(game, emptyR, emptyC, wrongVal);
  assert.equal(wrongResult.soundType, "error");
  assert.equal(wrongResult.nextState.mistakes, 1);
  assert.equal(wrongResult.nextState.board[emptyR][emptyC].isError, true);

  // 2. Erasing clears the cell
  const erasedState = eraseCell(wrongResult.nextState, emptyR, emptyC);
  assert.equal(erasedState.board[emptyR][emptyC].value, 0);
  assert.equal(erasedState.board[emptyR][emptyC].isError, false);

  // 3. Toggling notes
  const noteState = toggleNote(erasedState, emptyR, emptyC, 3);
  assert.ok(noteState.board[emptyR][emptyC].notes.has(3));
  const noteState2 = toggleNote(noteState, emptyR, emptyC, 3);
  assert.ok(!noteState2.board[emptyR][emptyC].notes.has(3));

  // 4. Placing correct number
  const correctResult = setCellValue(noteState2, emptyR, emptyC, correctVal);
  assert.equal(correctResult.nextState.board[emptyR][emptyC].isError, false);
  assert.equal(correctResult.nextState.board[emptyR][emptyC].value, correctVal);

  // 5. Undo restores previous state
  const undoneState = undoLastMove(correctResult.nextState);
  assert.equal(undoneState.board[emptyR][emptyC].value, 0);
});

test("Cyber Sudoku Engine - smart hints provide solution and decrease remaining hints", () => {
  const game = createSudokuGame("novice");
  assert.equal(game.hintsRemaining, 3);

  const { nextState, hintCell } = provideSmartHint(game);
  assert.ok(hintCell);
  assert.equal(nextState.hintsRemaining, 2);
  assert.equal(nextState.board[hintCell.row][hintCell.col].value, hintCell.value);
  assert.equal(nextState.board[hintCell.row][hintCell.col].isHinted, true);
});

test("Cyber Sudoku Engine - digit counts and board solved check", () => {
  const game = createSudokuGame("novice");
  const counts = getDigitCounts(game.board);
  assert.equal(Object.keys(counts).length, 9);

  // Fill remaining board with solution to simulate winning
  const wonBoard = game.board.map((row) =>
    row.map((cell) => ({
      ...cell,
      value: cell.solution,
      isError: false,
    }))
  );
  assert.ok(isBoardSolved(wonBoard));
});

test("GameLeaderboardService - handles sudoku scores and retrieval in memory", async () => {
  const mockUser = {
    id: "u-test-sudoku",
    username: "sudoku.player",
    fullName: "Sudoku Champion",
    email: "sudoku@expressbank.az",
    roles: ["USER"],
  };

  const recordResult = await GameLeaderboardService.recordScore("sudoku", mockUser as any, {
    seconds: 95,
    difficulty: "novice",
  });

  assert.ok(recordResult.entry);
  assert.equal(recordResult.entry.best, 95);

  const lbData = await GameLeaderboardService.getLeaderboard("sudoku", mockUser.id, "novice", 10);
  assert.ok(lbData.leaderboard.length > 0);
  assert.equal(lbData.me.userId, mockUser.id);
  assert.equal(lbData.me.best, 95);
});
