export type GardenPhase = "idle" | "pending" | "error" | "entering";
export interface GardenState {
  turns: number[];
  targets: number[];
  moves: number;
  round: number;
  chapter: 1 | 2;
}
export function createGarden(round = 0): GardenState {
  return {
    turns: [0, 0, 0],
    targets: [2 + (round % 3), 5 - (round % 3), 7 - (round % 2)],
    moves: 0,
    round,
    chapter: 1,
  };
}
export function turnInstrument(state: GardenState, index: number): GardenState {
  if (!Number.isInteger(index) || index < 0 || index > 2 || gardenSolved(state))
    return state;
  return {
    ...state,
    turns: state.turns.map((turn, i) =>
      i === index || (state.chapter === 2 && i === (index + 1) % 3)
        ? turn + 1
        : turn,
    ),
    moves: state.moves + 1,
  };
}
/** The second puzzle is generated from reachable moves, never arbitrary targets. */
export function advanceGarden(state: GardenState): GardenState {
  if (state.chapter !== 1 || !gardenSolved(state)) return state;
  const offsets = [4, 3, 5]; // Reachable by turning the three linked dials 1, 2, 3 times.
  return {
    ...state,
    chapter: 2,
    moves: 0,
    targets: state.turns.map((turn, i) => (turn + offsets[i]) % 8),
  };
}
export function gardenSolved(state: GardenState): boolean {
  return state.turns.every((turn, i) => turn % 8 === state.targets[i]);
}
export interface GardenPresentation {
  state: GardenState;
  phase: GardenPhase;
  paused: boolean;
  reducedMotion: boolean;
  gust: number;
  resetView: number;
}
