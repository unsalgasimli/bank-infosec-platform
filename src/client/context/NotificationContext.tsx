import React, { createContext, useContext, useState } from 'react';

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'ALERT' | 'APPROVAL' | 'ASSIGNMENT' | 'SLA_WARNING' | 'SYSTEM';
  timestamp: string;
  read: boolean;
  ticketKey?: string;
}

interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  addNotification: (n: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<AppNotification[]>([
    {
      id: 'notif-1',
      title: 'SLA Warning: 2 Hours Remaining',
      message: 'APPSEC-2026-0001 (SQL Injection) is approaching critical remediation deadline.',
      type: 'SLA_WARNING',
      timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
      read: false,
      ticketKey: 'APPSEC-2026-0001',
    },
    {
      id: 'notif-2',
      title: 'Pending Executive Approval',
      message: 'GRC-2026-0078 requires CISO sign-off on TLS 1.3 exception.',
      type: 'APPROVAL',
      timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
      read: false,
      ticketKey: 'GRC-2026-0078',
    },
    {
      id: 'notif-3',
      title: 'SOC Incident Containment Triggered',
      message: 'SOC-2026-0012: Palo Alto Edge WAF rate limiting activated for credential stuffing alert.',
      type: 'ALERT',
      timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
      read: true,
      ticketKey: 'SOC-2026-0012',
    },
  ]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAsRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const addNotification = (n: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => {
    const newNotif: AppNotification = {
      ...n,
      id: `notif-${Date.now()}`,
      timestamp: new Date().toISOString(),
      read: false,
    };
    setNotifications((prev) => [newNotif, ...prev]);
  };

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markAsRead, markAllAsRead, addNotification }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotifications must be used within a NotificationProvider');
  return context;
};
