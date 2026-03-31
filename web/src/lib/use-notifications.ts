'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { requestPushToken, onForegroundMessage } from './firebase';
import { api } from './api';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  imageUrl?: string | null;
  readAt: string | null;
  createdAt: string;
}

interface NotificationsState {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  hasMore: boolean;
}

export function useNotifications() {
  const [state, setState] = useState<NotificationsState>({
    notifications: [],
    unreadCount: 0,
    isLoading: true,
    hasMore: true,
  });
  const [pushPermission, setPushPermission] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'default',
  );
  const foregroundUnsub = useRef<(() => void) | null>(null);

  const fetchNotifications = useCallback(
    async (offset = 0, append = false) => {
      try {
        const data = await api<{
          data: Notification[];
          total: number;
          unreadCount: number;
          limit: number;
        }>(`/notifications?limit=20&offset=${offset}`);

        setState((prev) => ({
          notifications: append
            ? [...prev.notifications, ...data.data]
            : data.data,
          unreadCount: data.unreadCount,
          isLoading: false,
          hasMore: offset + data.data.length < data.total,
        }));
      } catch {
        setState((prev) => ({ ...prev, isLoading: false }));
      }
    },
    [],
  );

  const fetchUnreadCount = useCallback(async () => {
    try {
      const data = await api<{ count: number }>('/notifications/unread-count');
      setState((prev) => ({ ...prev, unreadCount: data.count }));
    } catch {
      // ignore
    }
  }, []);

  const markAsRead = useCallback(async (id: string) => {
    try {
      await api(`/notifications/${id}/read`, { method: 'PATCH' });
      setState((prev) => ({
        ...prev,
        notifications: prev.notifications.map((n) =>
          n.id === id ? { ...n, readAt: new Date().toISOString() } : n,
        ),
        unreadCount: Math.max(0, prev.unreadCount - 1),
      }));
    } catch {
      // ignore
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    try {
      await api('/notifications/read-all', { method: 'PATCH' });
      setState((prev) => ({
        ...prev,
        notifications: prev.notifications.map((n) => ({
          ...n,
          readAt: n.readAt || new Date().toISOString(),
        })),
        unreadCount: 0,
      }));
    } catch {
      // ignore
    }
  }, []);

  const loadMore = useCallback(() => {
    if (!state.hasMore || state.isLoading) return;
    fetchNotifications(state.notifications.length, true);
  }, [state.hasMore, state.isLoading, state.notifications.length, fetchNotifications]);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    const token = await requestPushToken();
    if (!token) {
      setPushPermission(Notification.permission);
      return false;
    }

    try {
      await api('/notifications/device-token', {
        method: 'POST',
        body: JSON.stringify({ token, platform: 'web' }),
      });
    } catch {
      // Token registered locally even if server fails
    }

    setPushPermission('granted');
    return true;
  }, []);

  useEffect(() => {
    fetchNotifications();

    const unsub = onForegroundMessage((payload: any) => {
      const notif: Notification = {
        id: payload.data?.notificationId || Date.now().toString(),
        type: payload.data?.type || 'system',
        title: payload.notification?.title || '',
        body: payload.notification?.body || '',
        data: payload.data,
        imageUrl: payload.notification?.image || null,
        readAt: null,
        createdAt: new Date().toISOString(),
      };

      setState((prev) => ({
        ...prev,
        notifications: [notif, ...prev.notifications],
        unreadCount: prev.unreadCount + 1,
      }));
    });

    foregroundUnsub.current = unsub;

    const interval = setInterval(fetchUnreadCount, 30000);

    return () => {
      if (foregroundUnsub.current) foregroundUnsub.current();
      clearInterval(interval);
    };
  }, [fetchNotifications, fetchUnreadCount]);

  return {
    ...state,
    pushPermission,
    requestPermission,
    markAsRead,
    markAllAsRead,
    loadMore,
    refresh: () => fetchNotifications(),
  };
}
