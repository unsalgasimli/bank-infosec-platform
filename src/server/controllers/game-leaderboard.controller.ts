import type { Response } from "express";
import type { AuthenticatedRequest } from "../middleware/auth.middleware.js";
import { GameLeaderboardService, type GameId } from "../services/game-leaderboard.service.js";
import { logger } from "../services/logger.service.js";

function extractGameId(req: AuthenticatedRequest): GameId {
  const rawParam = req.params.gameId;
  const param = (typeof rawParam === "string" ? rawParam : "").toLowerCase();
  if (param === "cyber" || req.path.includes("/cyber")) return "cyber";
  if (param === "breaker" || req.path.includes("/breaker")) return "breaker";
  if (param === "sweeper" || req.path.includes("/sweeper")) return "sweeper";
  if (param === "sudoku" || req.path.includes("/sudoku")) return "sudoku";
  if (param === "flight" || req.path.includes("/flight")) return "flight";

  const queryGame = ((req.query.game as string) || "").toLowerCase();
  if (queryGame === "cyber") return "cyber";
  if (queryGame === "breaker") return "breaker";
  if (queryGame === "sweeper") return "sweeper";
  if (queryGame === "sudoku") return "sudoku";
  return "flight";
}

const DIFFICULTIES = new Set(["novice", "soc", "ciso"]);

function parseLimit(value: unknown): number {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return 10;
  return Math.max(1, Math.min(50, Number(value)));
}

function parseDifficulty(value: unknown): string {
  const difficulty = typeof value === "string" ? value.toLowerCase() : "novice";
  if (!DIFFICULTIES.has(difficulty)) throw new Error("Unsupported game difficulty");
  return difficulty;
}

function optionalFiniteInteger(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`${field} must be a finite integer`);
  }
  return value;
}

export class GameLeaderboardController {
  /**
   * Universal leaderboard getter across flight, cyber, breaker, sweeper
   */
  static async leaderboard(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const gameId = extractGameId(req);
      const difficulty = parseDifficulty(req.query.difficulty);
      const limit = parseLimit(req.query.limit);
      const userId = req.user?.id;

      const data = await GameLeaderboardService.getLeaderboard(gameId, userId, difficulty, limit);
      res.json({ success: true, leaderboard: data.leaderboard, me: data.me });
    } catch (error) {
      logger.warn({ err: error }, "Failed to load game leaderboard");
      res.status(400).json({ success: false, message: "Unable to load game leaderboard" });
    }
  }

  /**
   * Universal score submission across flight, cyber, breaker, sweeper
   */
  static async submitScore(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const gameId = extractGameId(req);
      const user = req.user ?? {
        id: "guest",
        username: "guest",
        fullName: "Qonaq Oyunçu",
        email: "guest@expressbank.az",
        roles: [],
        department: "Təhlükəsizlik",
        permissions: [],
        isActive: true,
      };

      const payload = {
        score: optionalFiniteInteger(req.body?.score, "score"),
        seconds: optionalFiniteInteger(req.body?.seconds, "seconds"),
        wave: optionalFiniteInteger(req.body?.wave, "wave"),
        stage: optionalFiniteInteger(req.body?.stage, "stage"),
        difficulty: parseDifficulty(req.body?.difficulty),
      };

      const result = await GameLeaderboardService.recordScore(gameId, user as any, payload);
      res.json({ success: true, ...result });
    } catch (error) {
      logger.warn({ err: error }, "Failed to submit game score");
      res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Unable to submit game score" });
    }
  }
}
