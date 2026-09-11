/**
 * Expressbank Cyber Shooter: IT Warfare Controller
 * Handles REST actions and real-time SSE stream connections for the multiplayer arena.
 */

import type { Response } from "express";
import type { AuthenticatedRequest } from "../middleware/auth.middleware.js";
import { CyberShooterService } from "../services/cyber-shooter.service.js";
import { ShooterRole } from "../../shared/types/shooter.js";
import { logger } from "../services/logger.service.js";

export class CyberShooterController {
  /**
   * Get current lobby state, active players, and leaderboard
   */
  static getLobby(req: AuthenticatedRequest, res: Response): void {
    try {
      const state = CyberShooterService.getLobbyState();
      res.json({ success: true, state });
    } catch (error: any) {
      logger.error({ err: error }, "Failed to get shooter lobby state");
      res.status(500).json({ success: false, message: error?.message || "Failed to load lobby" });
    }
  }

  /**
   * Join or change role in the active central lobby
   */
  static joinLobby(req: AuthenticatedRequest, res: Response): void {
    try {
      const user = req.user;
      const { role } = req.body || {};
      const chosenRole: ShooterRole = role === "helpdesk" || role === "it_admin" ? role : "infosec";
      if (!user) {
        res.status(401).json({ success: false, message: "Authentication required" });
        return;
      }
      const userId = user.id;
      const displayName = user.fullName || user.username;

      const { player, lobbyState } = CyberShooterService.joinPlayer(userId, displayName, chosenRole);
      res.json({ success: true, player, lobbyState });
    } catch (error: any) {
      logger.error({ err: error }, "Failed to join shooter lobby");
      res.status(500).json({ success: false, message: error?.message || "Failed to join lobby" });
    }
  }

  /**
   * Sync player position, orientation, and movement status
   */
  static syncPlayer(req: AuthenticatedRequest, res: Response): void {
    try {
      const user = req.user;
      const { packet } = req.body || {};
      const id = user?.id;

      if (!id || !packet) {
        res.status(400).json({ success: false, message: "Missing authenticated player or packet" });
        return;
      }

      const state = CyberShooterService.syncPlayer(id, packet);
      res.json({ success: true, state });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error?.message || "Sync failed" });
    }
  }

  /**
   * Process a player shot action
   */
  static fireShot(req: AuthenticatedRequest, res: Response): void {
    try {
      const user = req.user;
      const { action } = req.body || {};
      const id = user?.id;

      if (!id || !action) {
        res.status(400).json({ success: false, message: "Missing authenticated player or action" });
        return;
      }

      const result = CyberShooterService.fireShot(id, action);
      res.json({ success: true, result });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error?.message || "Fire action failed" });
    }
  }

  /**
   * Activate role-specific ability
   */
  static useAbility(req: AuthenticatedRequest, res: Response): void {
    try {
      const user = req.user;
      const { action } = req.body || {};
      const id = user?.id;

      if (!id || !action) {
        res.status(400).json({ success: false, message: "Missing authenticated player or action" });
        return;
      }

      const result = CyberShooterService.useAbility(id, action);
      res.json({ success: true, result });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error?.message || "Ability failed" });
    }
  }

  /**
   * Request respawn
   */
  static respawn(req: AuthenticatedRequest, res: Response): void {
    try {
      const user = req.user;
      const id = user?.id;

      if (!id) {
        res.status(400).json({ success: false, message: "Missing playerId" });
        return;
      }

      const player = CyberShooterService.respawnPlayer(id);
      res.json({ success: true, player });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error?.message || "Respawn failed" });
    }
  }

  /**
   * Leave lobby cleanly
   */
  static leaveLobby(req: AuthenticatedRequest, res: Response): void {
    try {
      const user = req.user;
      const id = user?.id;

      if (id) {
        CyberShooterService.leavePlayer(id);
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error?.message || "Leave failed" });
    }
  }

  /**
   * Real-time Server-Sent Events (SSE) Stream
   */
  static streamEvents(req: AuthenticatedRequest, res: Response): void {
    try {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders?.();

      CyberShooterService.registerSubscriber(res);
    } catch (error: any) {
      res.status(500).end();
    }
  }
}
