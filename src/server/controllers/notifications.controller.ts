import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { NotificationService } from '../services/notification.service.js';

export class NotificationsController {
  public static list(req: AuthenticatedRequest, res: Response): void {
    const user = req.user!;
    const result = NotificationService.getUserNotifications(user.id);

    res.json({
      success: true,
      unreadCount: result.unreadCount,
      notifications: result.notifications,
    });
  }

  public static markAsRead(req: AuthenticatedRequest, res: Response): void {
    const user = req.user!;
    const notifId = String(req.params.id);
    const success = NotificationService.markAsRead(user.id, notifId);

    res.json({
      success,
      notificationId: notifId,
    });
  }

  public static markAllAsRead(req: AuthenticatedRequest, res: Response): void {
    const user = req.user!;
    const updatedCount = NotificationService.markAllAsRead(user.id);

    res.json({
      success: true,
      updatedCount,
    });
  }

  public static delete(req: AuthenticatedRequest, res: Response): void {
    const user = req.user!;
    const notifId = String(req.params.id);
    const success = NotificationService.delete(user.id, notifId);

    res.json({
      success,
      notificationId: notifId,
    });
  }
}
