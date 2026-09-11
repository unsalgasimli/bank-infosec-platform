import { pgClient } from "../db/postgres/client.js";
import { config } from "../config/index.js";
import type { BankUser } from "../../shared/types/auth.js";
import type { GameLeaderboardEntry, GamePlayerStats } from "../../shared/types/game.js";

export type GameId = "flight" | "cyber" | "breaker" | "sweeper" | "sudoku";

interface ScorePayload {
  score?: number;
  seconds?: number;
  wave?: number;
  stage?: number;
  difficulty?: string;
}

// In-Memory Seed Records for Realistic Bank Colleague Standings
interface MemoryScoreEntry {
  userId: string;
  username: string;
  displayName: string;
  score: number;
  extra?: number; // wave or stage
  difficulty?: string; // for sweeper and sudoku
  createdAt: Date;
}

const SEED_SCORES: Record<GameId, MemoryScoreEntry[]> = {
  flight: [
    { userId: "u-leyla", username: "leyla.m", displayName: "Leyla Məmmədova (SOC Lead)", score: 142, createdAt: new Date(Date.now() - 3600000) },
    { userId: "u-elmir", username: "elmir.q", displayName: "Elmir Qasımov (CISO)", score: 98, createdAt: new Date(Date.now() - 7200000) },
    { userId: "u-tural", username: "tural.h", displayName: "Tural Həsənov (DevSecOps)", score: 74, createdAt: new Date(Date.now() - 14400000) },
    { userId: "u-nigar", username: "nigar.r", displayName: "Nigar Rəhimova (Kiber Analitik)", score: 51, createdAt: new Date(Date.now() - 28800000) },
    { userId: "u-rauf", username: "rauf.a", displayName: "Rauf Əliyev (IT Auditor)", score: 36, createdAt: new Date(Date.now() - 43200000) },
  ],
  cyber: [
    { userId: "u-elmir", username: "elmir.q", displayName: "Elmir Qasımov (CISO)", score: 38400, extra: 12, createdAt: new Date(Date.now() - 3600000) },
    { userId: "u-tural", username: "tural.h", displayName: "Tural Həsənov (DevSecOps)", score: 29850, extra: 9, createdAt: new Date(Date.now() - 7200000) },
    { userId: "u-leyla", username: "leyla.m", displayName: "Leyla Məmmədova (SOC Lead)", score: 24100, extra: 8, createdAt: new Date(Date.now() - 14400000) },
    { userId: "u-nigar", username: "nigar.r", displayName: "Nigar Rəhimova (Kiber Analitik)", score: 17200, extra: 6, createdAt: new Date(Date.now() - 28800000) },
    { userId: "u-rauf", username: "rauf.a", displayName: "Rauf Əliyev (IT Auditor)", score: 11500, extra: 4, createdAt: new Date(Date.now() - 43200000) },
  ],
  breaker: [
    { userId: "u-tural", username: "tural.h", displayName: "Tural Həsənov (DevSecOps)", score: 45200, extra: 3, createdAt: new Date(Date.now() - 3600000) },
    { userId: "u-leyla", username: "leyla.m", displayName: "Leyla Məmmədova (SOC Lead)", score: 32800, extra: 3, createdAt: new Date(Date.now() - 7200000) },
    { userId: "u-elmir", username: "elmir.q", displayName: "Elmir Qasımov (CISO)", score: 28500, extra: 2, createdAt: new Date(Date.now() - 14400000) },
    { userId: "u-nigar", username: "nigar.r", displayName: "Nigar Rəhimova (Kiber Analitik)", score: 19400, extra: 2, createdAt: new Date(Date.now() - 28800000) },
    { userId: "u-rauf", username: "rauf.a", displayName: "Rauf Əliyev (IT Auditor)", score: 12900, extra: 1, createdAt: new Date(Date.now() - 43200000) },
  ],
  sweeper: [
    { userId: "u-leyla", username: "leyla.m", displayName: "Leyla Məmmədova (SOC Lead)", score: 32, difficulty: "novice", createdAt: new Date(Date.now() - 3600000) },
    { userId: "u-elmir", username: "elmir.q", displayName: "Elmir Qasımov (CISO)", score: 41, difficulty: "novice", createdAt: new Date(Date.now() - 7200000) },
    { userId: "u-tural", username: "tural.h", displayName: "Tural Həsənov (DevSecOps)", score: 49, difficulty: "novice", createdAt: new Date(Date.now() - 14400000) },
    { userId: "u-leyla", username: "leyla.m", displayName: "Leyla Məmmədova (SOC Lead)", score: 135, difficulty: "soc", createdAt: new Date(Date.now() - 3600000) },
    { userId: "u-elmir", username: "elmir.q", displayName: "Elmir Qasımov (CISO)", score: 162, difficulty: "soc", createdAt: new Date(Date.now() - 7200000) },
    { userId: "u-tural", username: "tural.h", displayName: "Tural Həsənov (DevSecOps)", score: 188, difficulty: "soc", createdAt: new Date(Date.now() - 14400000) },
    { userId: "u-elmir", username: "elmir.q", displayName: "Elmir Qasımov (CISO)", score: 320, difficulty: "ciso", createdAt: new Date(Date.now() - 7200000) },
    { userId: "u-leyla", username: "leyla.m", displayName: "Leyla Məmmədova (SOC Lead)", score: 345, difficulty: "ciso", createdAt: new Date(Date.now() - 3600000) },
    { userId: "u-tural", username: "tural.h", displayName: "Tural Həsənov (DevSecOps)", score: 395, difficulty: "ciso", createdAt: new Date(Date.now() - 14400000) },
  ],
  sudoku: [
    { userId: "u-elmir", username: "elmir.q", displayName: "Elmir Qasımov (CISO)", score: 145, difficulty: "novice", createdAt: new Date(Date.now() - 3600000) },
    { userId: "u-leyla", username: "leyla.m", displayName: "Leyla Məmmədova (SOC Lead)", score: 182, difficulty: "novice", createdAt: new Date(Date.now() - 7200000) },
    { userId: "u-tural", username: "tural.h", displayName: "Tural Həsənov (DevSecOps)", score: 215, difficulty: "novice", createdAt: new Date(Date.now() - 14400000) },
    { userId: "u-leyla", username: "leyla.m", displayName: "Leyla Məmmədova (SOC Lead)", score: 285, difficulty: "soc", createdAt: new Date(Date.now() - 3600000) },
    { userId: "u-tural", username: "tural.h", displayName: "Tural Həsənov (DevSecOps)", score: 320, difficulty: "soc", createdAt: new Date(Date.now() - 7200000) },
    { userId: "u-elmir", username: "elmir.q", displayName: "Elmir Qasımov (CISO)", score: 365, difficulty: "soc", createdAt: new Date(Date.now() - 14400000) },
    { userId: "u-elmir", username: "elmir.q", displayName: "Elmir Qasımov (CISO)", score: 490, difficulty: "ciso", createdAt: new Date(Date.now() - 7200000) },
    { userId: "u-leyla", username: "leyla.m", displayName: "Leyla Məmmədova (SOC Lead)", score: 540, difficulty: "ciso", createdAt: new Date(Date.now() - 3600000) },
    { userId: "u-tural", username: "tural.h", displayName: "Tural Həsənov (DevSecOps)", score: 620, difficulty: "ciso", createdAt: new Date(Date.now() - 14400000) },
  ],
};

const memoryStore: Record<GameId, MemoryScoreEntry[]> = {
  flight: [...SEED_SCORES.flight],
  cyber: [...SEED_SCORES.cyber],
  breaker: [...SEED_SCORES.breaker],
  sweeper: [...SEED_SCORES.sweeper],
  sudoku: [...SEED_SCORES.sudoku],
};

export class GameLeaderboardService {
  /**
   * Fetch leaderboard rankings and caller's standing for any game
   */
  static async getLeaderboard(
    game: GameId,
    userId?: string,
    difficulty = "novice",
    limit = 10
  ): Promise<{ leaderboard: GameLeaderboardEntry[]; me: GamePlayerStats }> {
    if (config.DB_TYPE === "memory") {
      return this.queryMemoryLeaderboard(game, userId, difficulty, limit);
    }
    if (!pgClient.getPool()) {
      throw new Error("Game leaderboard storage is unavailable");
    }
    return this.queryPostgresLeaderboard(game, userId, difficulty, limit);
  }

  /**
   * Record a score for any game and return updated standings
   */
  static async recordScore(
    game: GameId,
    user: BankUser,
    payload: ScorePayload
  ): Promise<{ entry: GameLeaderboardEntry; leaderboard: GameLeaderboardEntry[]; me: GamePlayerStats }> {
    const isTimeBased = game === "sweeper" || game === "sudoku";
    if (isTimeBased && payload.seconds === undefined) {
      throw new Error("seconds is required for timed games");
    }
    if (!isTimeBased && payload.score === undefined) {
      throw new Error("score is required for score-based games");
    }
    const scoreVal =
      isTimeBased
        ? payload.seconds!
        : payload.score!;
    if (scoreVal < (isTimeBased ? 1 : 0) || scoreVal > (isTimeBased ? 86_400 : 10_000_000)) {
      throw new Error("Game result is outside the accepted range");
    }
    const extraVal = payload.wave ?? payload.stage ?? 1;
    if (!Number.isSafeInteger(extraVal) || extraVal < 1 || extraVal > 100_000) {
      throw new Error("Game progression is outside the accepted range");
    }
    const diffVal = payload.difficulty || "novice";

    if (config.DB_TYPE !== "memory") {
      if (!pgClient.getPool()) throw new Error("Game leaderboard storage is unavailable");
      await this.recordPostgresScore(game, user, scoreVal, extraVal, diffVal);
    }

    // Memory storage is an explicit fixture. A production database failure must
    // remain visible instead of creating a divergent, process-local scoreboard.
    const memEntry: MemoryScoreEntry = {
      userId: user.id,
      username: user.username,
      displayName: user.fullName || user.username,
      score: scoreVal,
      extra: extraVal,
      difficulty: diffVal,
      createdAt: new Date(),
    };
    if (config.DB_TYPE === "memory") {
      memoryStore[game].push(memEntry);
    }

    const { leaderboard, me } = await this.getLeaderboard(game, user.id, diffVal, 10);
    const entry: GameLeaderboardEntry = {
      userId: user.id,
      username: user.username,
      displayName: user.fullName || user.username,
      best: scoreVal,
      runs: me.runs,
      lastPlayedAt: new Date().toISOString(),
    };

    return { entry, leaderboard, me };
  }

  // -------------------------------------------------------------
  // PostgreSQL Helpers
  // -------------------------------------------------------------
  private static async queryPostgresLeaderboard(
    game: GameId,
    userId?: string,
    difficulty = "novice",
    limit = 10
  ): Promise<{ leaderboard: GameLeaderboardEntry[]; me: GamePlayerStats }> {
    const tableName =
      game === "flight"
        ? "game_flight_scores"
        : game === "cyber"
        ? "game_cyber_scores"
        : game === "breaker"
        ? "game_breaker_scores"
        : game === "sudoku"
        ? "game_sudoku_scores"
        : "game_sweeper_scores";

    const isTimeBased = game === "sweeper" || game === "sudoku";
    const scoreCol = isTimeBased ? "seconds" : "score";
    const orderDir = isTimeBased ? "ASC" : "DESC";
    const diffClause = isTimeBased ? `WHERE difficulty = $2` : "";
    const params: any[] = isTimeBased ? [limit, difficulty] : [limit];

    const topSql = `
      SELECT user_id, MAX(username) AS username, MAX(display_name) AS display_name,
             ${isTimeBased ? "MIN" : "MAX"}(${scoreCol}) AS best,
             COUNT(*) AS runs,
             MAX(created_at) AS last_played_at
      FROM ${tableName}
      ${diffClause}
      GROUP BY user_id
      ORDER BY best ${orderDir}, MAX(created_at) ASC
      LIMIT $1
    `;

    const topResult = await pgClient.query(topSql, params);
    const leaderboard: GameLeaderboardEntry[] = topResult.rows.map((row) => ({
      userId: row.user_id,
      username: row.username,
      displayName: row.display_name,
      best: Number(row.best),
      runs: Number(row.runs),
      lastPlayedAt: new Date(row.last_played_at).toISOString(),
    }));

    // Player stats
    let me: GamePlayerStats = {
      userId: userId || "guest",
      best: 0,
      runs: 0,
      rank: 1,
    };

    if (userId) {
      const meSql = `
        WITH per_player AS (
          SELECT user_id, ${isTimeBased ? "MIN" : "MAX"}(${scoreCol}) AS best
          FROM ${tableName}
          ${diffClause}
          GROUP BY user_id
        )
        SELECT
          (SELECT best FROM per_player WHERE user_id = $1) AS best,
          (SELECT COUNT(*) FROM ${tableName} WHERE user_id = $1 ${isTimeBased ? "AND difficulty = $2" : ""}) AS runs,
          (SELECT CASE WHEN (SELECT best FROM per_player WHERE user_id = $1) IS NULL THEN 0 ELSE COUNT(*) + 1 END
           FROM per_player
           WHERE ${isTimeBased ? "best < (SELECT best FROM per_player WHERE user_id = $1)" : "best > (SELECT best FROM per_player WHERE user_id = $1)"}) AS rank
      `;
      const meParams = isTimeBased ? [userId, difficulty] : [userId];
      const meResult = await pgClient.query(meSql, meParams);
      const row = meResult.rows[0];
      if (row && row.best != null) {
        me = {
          userId,
          best: Number(row.best),
          runs: Number(row.runs ?? 0),
          rank: Number(row.rank ?? 1),
        };
      }
    }

    return { leaderboard, me };
  }

  private static async recordPostgresScore(
    game: GameId,
    user: BankUser,
    score: number,
    extra: number,
    difficulty: string
  ): Promise<void> {
    if (game === "flight") {
      await pgClient.query(
        `INSERT INTO game_flight_scores (user_id, username, display_name, score) VALUES ($1, $2, $3, $4)`,
        [user.id, user.username, user.fullName || user.username, score]
      );
    } else if (game === "cyber") {
      await pgClient.query(
        `INSERT INTO game_cyber_scores (user_id, username, display_name, score, wave) VALUES ($1, $2, $3, $4, $5)`,
        [user.id, user.username, user.fullName || user.username, score, extra]
      );
    } else if (game === "breaker") {
      await pgClient.query(
        `INSERT INTO game_breaker_scores (user_id, username, display_name, score, stage) VALUES ($1, $2, $3, $4, $5)`,
        [user.id, user.username, user.fullName || user.username, score, extra]
      );
    } else if (game === "sweeper") {
      await pgClient.query(
        `INSERT INTO game_sweeper_scores (user_id, username, display_name, seconds, difficulty) VALUES ($1, $2, $3, $4, $5)`,
        [user.id, user.username, user.fullName || user.username, score, difficulty]
      );
    } else if (game === "sudoku") {
      await pgClient.query(
        `INSERT INTO game_sudoku_scores (user_id, username, display_name, seconds, difficulty) VALUES ($1, $2, $3, $4, $5)`,
        [user.id, user.username, user.fullName || user.username, score, difficulty]
      );
    }
  }

  // -------------------------------------------------------------
  // In-Memory Fallback Helpers
  // -------------------------------------------------------------
  private static queryMemoryLeaderboard(
    game: GameId,
    userId?: string,
    difficulty = "novice",
    limit = 10
  ): { leaderboard: GameLeaderboardEntry[]; me: GamePlayerStats } {
    const isTimeBased = game === "sweeper" || game === "sudoku";
    const all = memoryStore[game].filter((entry) => {
      if (isTimeBased && entry.difficulty && entry.difficulty !== difficulty) {
        return false;
      }
      return true;
    });

    // Group by user_id
    const userGroups = new Map<string, {
      userId: string;
      username: string;
      displayName: string;
      best: number;
      runs: number;
      lastPlayedAt: string;
    }>();

    for (const item of all) {
      const existing = userGroups.get(item.userId);
      if (!existing) {
        userGroups.set(item.userId, {
          userId: item.userId,
          username: item.username,
          displayName: item.displayName,
          best: item.score,
          runs: 1,
          lastPlayedAt: item.createdAt.toISOString(),
        });
      } else {
        existing.runs += 1;
        if (item.createdAt.toISOString() > existing.lastPlayedAt) {
          existing.lastPlayedAt = item.createdAt.toISOString();
        }
        if (isTimeBased) {
          if (item.score < existing.best) existing.best = item.score;
        } else {
          if (item.score > existing.best) existing.best = item.score;
        }
      }
    }

    const sorted = Array.from(userGroups.values()).sort((a, b) => {
      if (isTimeBased) return a.best - b.best;
      return b.best - a.best;
    });

    const leaderboard = sorted.slice(0, limit);

    // Player stats
    let me: GamePlayerStats = {
      userId: userId || "guest",
      best: 0,
      runs: 0,
      rank: 1,
    };

    if (userId) {
      const foundIdx = sorted.findIndex((p) => p.userId === userId);
      if (foundIdx !== -1) {
        me = {
          userId,
          best: sorted[foundIdx].best,
          runs: sorted[foundIdx].runs,
          rank: foundIdx + 1,
        };
      }
    }

    return { leaderboard, me };
  }
}
