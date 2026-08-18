export type NotificationType = 'ALERT' | 'APPROVAL' | 'ASSIGNMENT' | 'SLA_WARNING' | 'SYSTEM';
export type NotificationSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'INFO';

export interface AppNotification {
  id: string;
  userId: string; // Target recipient user ID (e.g. usr-ciso-001 or 'ALL')
  title: string;
  message: string;
  type: NotificationType;
  severity: NotificationSeverity;
  timestamp: string;
  isRead: boolean;
  ticketId?: string;
  ticketKey?: string;
  actionUrl?: string;
}

export interface NotificationListResponse {
  success: boolean;
  unreadCount: number;
  notifications: AppNotification[];
}
