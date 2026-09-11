import type { Response } from "express";
import type { AuthenticatedRequest } from "../middleware/auth.middleware.js";
import { GameLeaderboardController } from "./game-leaderboard.controller.js";

export class GameCyberLeaderboardController {
  static async leaderboard(req: AuthenticatedRequest, res: Response): Promise<void> {
    return GameLeaderboardController.leaderboard(req, res);
  }

  static async submitScore(req: AuthenticatedRequest, res: Response): Promise<void> {
    return GameLeaderboardController.submitScore(req, res);
  }
}
