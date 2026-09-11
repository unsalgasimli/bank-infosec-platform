import type { Response } from "express";
import type { AuthenticatedRequest } from "../middleware/auth.middleware.js";
import { BattleChallengeService } from "../services/battle-challenge.service.js";
import { logger } from "../services/logger.service.js";

const paramId = (p: string | string[]): string => (Array.isArray(p) ? p[0] : p || "");

export class BattleChallengeController {
  /**
   * Create a new match challenge against a colleague or AI
   */
  static createChallenge(req: AuthenticatedRequest, res: Response): void {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ success: false, message: "Authentication required" });
        return;
      }

      const { targetUserId } = req.body || {};
      if (typeof targetUserId !== "string" || !targetUserId.trim() || targetUserId.length > 128) {
        res.status(400).json({ success: false, message: "targetUserId is required" });
        return;
      }

      const match = BattleChallengeService.createChallenge(user, {
        id: targetUserId.trim(),
        // Identity and display data for the accepting player are derived from
        // their session in acceptChallenge, never trusted from this request.
        username: targetUserId.trim(),
        fullName: "Colleague",
      });

      const state = BattleChallengeService.getSanitizedMatchState(match.id, user.id);
      res.json({ success: true, matchId: match.id, state });
    } catch (error: any) {
      logger.error({ err: error }, "Failed to create battle challenge");
      res.status(500).json({ success: false, message: error?.message || "Failed to create challenge" });
    }
  }

  /**
   * Get all pending challenges directed to current user
   */
  static getPending(req: AuthenticatedRequest, res: Response): void {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ success: false, message: "Authentication required" });
        return;
      }

      const pending = BattleChallengeService.getPendingChallengesForUser(user);
      res.json({ success: true, pending });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error?.message || "Error checking challenges" });
    }
  }

  /**
   * Accept an incoming challenge
   */
  static acceptChallenge(req: AuthenticatedRequest, res: Response): void {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ success: false, message: "Authentication required" });
        return;
      }

      const matchId = paramId(req.params.matchId);
      const match = BattleChallengeService.acceptChallenge(matchId, user);
      const state = BattleChallengeService.getSanitizedMatchState(match.id, user.id);
      res.json({ success: true, matchId: match.id, state });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error?.message || "Failed to accept challenge" });
    }
  }

  /**
   * Decline an incoming challenge
   */
  static declineChallenge(req: AuthenticatedRequest, res: Response): void {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ success: false, message: "Authentication required" });
        return;
      }

      const matchId = paramId(req.params.matchId);
      const reason = typeof req.body?.reason === "string" ? req.body.reason.slice(0, 240) : undefined;
      const match = BattleChallengeService.declineChallenge(matchId, user, reason);
      res.json({ success: true, matchId: match.id });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error?.message || "Failed to decline challenge" });
    }
  }

  /**
   * Get sanitized match state for caller
   */
  static getMatch(req: AuthenticatedRequest, res: Response): void {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ success: false, message: "Authentication required" });
        return;
      }

      const matchId = paramId(req.params.matchId);
      const state = BattleChallengeService.getSanitizedMatchState(matchId, user.id);
      if (!state) {
        res.status(404).json({ success: false, message: "Match not found or unauthorized" });
        return;
      }

      res.json({ success: true, state });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error?.message || "Error fetching match" });
    }
  }

  /**
   * Submit ship placement
   */
  static placeFleet(req: AuthenticatedRequest, res: Response): void {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ success: false, message: "Authentication required" });
        return;
      }

      const matchId = paramId(req.params.matchId);
      const { ships } = req.body || {};
      if (!Array.isArray(ships)) {
        res.status(400).json({ success: false, message: "ships array is required" });
        return;
      }

      const match = BattleChallengeService.submitFleetPlacement(matchId, user.id, ships);
      const state = BattleChallengeService.getSanitizedMatchState(match.id, user.id);
      res.json({ success: true, matchId: match.id, state });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error?.message || "Invalid fleet placement" });
    }
  }

  /**
   * Fire a shot at enemy radar
   */
  static fireShot(req: AuthenticatedRequest, res: Response): void {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ success: false, message: "Authentication required" });
        return;
      }

      const matchId = paramId(req.params.matchId);
      const { row, col } = req.body || {};
      if (typeof row !== "number" || typeof col !== "number") {
        res.status(400).json({ success: false, message: "row and col numbers are required" });
        return;
      }

      const shot = BattleChallengeService.fireShot(matchId, user.id, row, col);
      const state = BattleChallengeService.getSanitizedMatchState(matchId, user.id);
      res.json({ success: true, shot, state });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error?.message || "Invalid fire action" });
    }
  }

  /**
   * Leave / surrender match
   */
  static leaveMatch(req: AuthenticatedRequest, res: Response): void {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ success: false, message: "Authentication required" });
        return;
      }

      const matchId = paramId(req.params.matchId);
      const match = BattleChallengeService.leaveMatch(matchId, user.id);
      res.json({ success: true, matchId: match.id });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error?.message || "Failed to leave match" });
    }
  }

  /**
   * Real-time Server-Sent Events stream for instant match state updates
   */
  static streamEvents(req: AuthenticatedRequest, res: Response): void {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).end();
        return;
      }

      const matchId = paramId(req.params.matchId);

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");

      res.flushHeaders?.();

      BattleChallengeService.registerSubscriber(matchId, user.id, res);
    } catch (error: any) {
      res.status(500).end();
    }
  }
}
