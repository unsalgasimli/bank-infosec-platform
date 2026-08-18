import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database.js';
import { AppNotification, NotificationType, NotificationSeverity } from '../../shared/types/notification.js';

export interface CreateNotificationParams {
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  severity?: NotificationSeverity;
  ticketId?: string;
  ticketKey?: string;
  actionUrl?: string;
}

export class NotificationService {
  public static getUserNotifications(userId: string): { notifications: AppNotification[]; unreadCount: number } {
    if (!db.data.notifications) {
      db.data.notifications = [];
    }

    const userNotifs = db.data.notifications
      .filter((n) => n.userId === userId || n.userId === 'ALL')
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const unreadCount = userNotifs.filter((n) => !n.isRead).length;

    return { notifications: userNotifs, unreadCount };
  }

  public static create(params: CreateNotificationParams): AppNotification {
    if (!db.data.notifications) {
      db.data.notifications = [];
    }

    const newNotif: AppNotification = {
      id: `notif-${uuidv4().substring(0, 8)}`,
      userId: params.userId,
      title: params.title,
      message: params.message,
      type: params.type,
      severity: params.severity || 'INFO',
      timestamp: new Date().toISOString(),
      isRead: false,
      ticketId: params.ticketId,
      ticketKey: params.ticketKey,
      actionUrl: params.actionUrl,
    };

    db.data.notifications.unshift(newNotif);
    db.persist();
    return newNotif;
  }

  public static markAsRead(userId: string, notificationId: string): boolean {
    if (!db.data.notifications) return false;

    const notif = db.data.notifications.find(
      (n) => n.id === notificationId && (n.userId === userId || n.userId === 'ALL')
    );

    if (notif) {
      notif.isRead = true;
      db.persist();
      return true;
    }
    return false;
  }

  public static markAllAsRead(userId: string): number {
    if (!db.data.notifications) return 0;

    let updatedCount = 0;
    for (const notif of db.data.notifications) {
      if ((notif.userId === userId || notif.userId === 'ALL') && !notif.isRead) {
        notif.isRead = true;
        updatedCount++;
      }
    }

    if (updatedCount > 0) {
      db.persist();
    }
    return updatedCount;
  }

  public static delete(userId: string, notificationId: string): boolean {
    if (!db.data.notifications) return false;

    const initialLength = db.data.notifications.length;
    db.data.notifications = db.data.notifications.filter(
      (n) => !(n.id === notificationId && (n.userId === userId || n.userId === 'ALL'))
    );

    if (db.data.notifications.length !== initialLength) {
      db.persist();
      return true;
    }
    return false;
  }
}
