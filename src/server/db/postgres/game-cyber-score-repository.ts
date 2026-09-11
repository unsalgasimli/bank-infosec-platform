import { pgClient } from "./client.js";
import type { BankUser } from "../../../shared/types/auth.js";
import type {
  GameLeaderboardEntry,
  GamePlayerStats,
} from "../../../shared/types/game.js";

interface CyberScoreRow {
  user_id: string;
  username: string;
  display_name: string;
  best: string | number;
  runs: string | number;
  last_played_at: Date;
}

export class GameCyberScoreRepository {
  static map(row: CyberScoreRow): GameLeaderboardEntry {
    return {
      userId: row.user_id,
      username: row.username,
      displayName: row.display_name,
      best: Number(row.best),
      runs: Number(row.runs),
      lastPlayedAt: new Date(row.last_played_at).toISOString(),
    };
  }

  static async recordScore(
    user: BankUser,
    score: number,
    wave = 1,
  ): Promise<GameLeaderboardEntry> {
    const result = await pgClient.query<CyberScoreRow>(
      `INSERT INTO game_cyber_scores (user_id, username, display_name, score, wave)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING user_id, username, display_name, score AS best,
                 1 AS runs, created_at AS last_played_at`,
      [user.id, user.username, user.fullName || user.username, score, wave],
    );
    return this.map(result.rows[0]);
  }

  static async topScores(limit = 10): Promise<GameLeaderboardEntry[]> {
    const result = await pgClient.query<CyberScoreRow>(
      `SELECT user_id, username, display_name,
              MAX(score) AS best,
              COUNT(*) AS runs,
              MAX(created_at) AS last_played_at
       FROM game_cyber_scores
       GROUP BY user_id, username, display_name
       ORDER BY best DESC, MAX(created_at) ASC
       LIMIT $1`,
      [limit],
    );
    return result.rows.map((row) => this.map(row));
  }

  static async playerStats(userId: string): Promise<GamePlayerStats> {
    const result = await pgClient.query<{
      best: string | number | null;
      runs: string | number;
      rank: string | number;
    }>(
      `WITH per_player AS (
         SELECT user_id, MAX(score) AS best
         FROM game_cyber_scores
         GROUP BY user_id
       )
       SELECT
         (SELECT best FROM per_player WHERE user_id = $1) AS best,
         (SELECT COUNT(*) FROM game_cyber_scores WHERE user_id = $1) AS runs,
         (SELECT CASE WHEN (SELECT best FROM per_player WHERE user_id = $1) IS NULL
                THEN 0
                ELSE COUNT(*) + 1 END
          FROM per_player
          WHERE best > (SELECT best FROM per_player WHERE user_id = $1)) AS rank`,
      [userId],
    );
    const row = result.rows[0];
    return {
      userId,
      best: row?.best == null ? 0 : Number(row.best),
      runs: Number(row?.runs ?? 0),
      rank: Number(row?.rank ?? 1),
    };
  }
}
