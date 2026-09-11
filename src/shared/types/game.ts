/** Garden Flight arcade — leaderboard contracts shared by client and server. */

export interface GameLeaderboardEntry {
  userId: string;
  username: string;
  displayName: string;
  best: number;
  runs: number;
  lastPlayedAt: string;
}

export interface GamePlayerStats {
  userId: string;
  best: number;
  runs: number;
  rank: number;
}

export interface GameLeaderboardResponse {
  success: boolean;
  leaderboard: GameLeaderboardEntry[];
  me: GamePlayerStats;
}

export interface GameScoreSubmissionResponse {
  success: boolean;
  entry: GameLeaderboardEntry;
  leaderboard: GameLeaderboardEntry[];
  me: GamePlayerStats;
}
