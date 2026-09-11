export type MemoryGameStatus = "preview" | "playing" | "won" | "lost";

export interface MemoryGame {
  round: number;
  sequence: number[];
  progress: number;
  status: MemoryGameStatus;
  best: number;
}

/** Deterministic per-round patterns keep replay fresh without storing visitor data. */
function sequenceFor(round: number, choices: number, length: number) {
  let seed = (round + 1) * 1103515245 + choices * 12345;
  return Array.from({ length }, (_, index) => {
    seed = (Math.imul(seed ^ (index + 17), 1664525) + 1013904223) >>> 0;
    return seed % choices;
  });
}

export function createMemoryGame(
  round: number,
  choices: number,
  baseLength: number,
  best = 0,
): MemoryGame {
  const length = baseLength + Math.min(5, Math.floor(round / 2));
  return {
    round,
    sequence: sequenceFor(round, choices, length),
    progress: 0,
    status: "preview",
    best,
  };
}

export function beginMemoryGame(game: MemoryGame): MemoryGame {
  return game.status === "preview" ? { ...game, status: "playing" } : game;
}

export function chooseMemoryGame(game: MemoryGame, choice: number): MemoryGame {
  if (game.status !== "playing") return game;
  if (choice !== game.sequence[game.progress])
    return { ...game, status: "lost" };
  const progress = game.progress + 1;
  return progress === game.sequence.length
    ? { ...game, progress, status: "won", best: Math.max(game.best, game.sequence.length) }
    : { ...game, progress };
}
