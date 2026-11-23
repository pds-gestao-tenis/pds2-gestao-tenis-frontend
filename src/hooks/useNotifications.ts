import { useEffect } from 'react';
import { listNotifications, markAllNotificationsRead, markNotificationRead, NOTIFICATIONS_CHANGED } from '../api/notifications';
import { useLoad } from './useLoad';

export function useNotifications(token: string, onExpired: () => void) {
  const { state, reload, setData } = useLoad(`notifications:${token}`, () => listNotifications(token), onExpired);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') reload(); };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener(NOTIFICATIONS_CHANGED, refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(NOTIFICATIONS_CHANGED, refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [reload]);

  const entries = state.status === 'ready' ? state.data : state.status === 'loading' ? state.previous ?? [] : [];
  async function markRead(id: number) {
    const updated = await markNotificationRead(token, id);
    setData((latest) => latest.map((item) => item.id === id ? updated : item));
    reload();
  }
  async function markAll() {
    await markAllNotificationsRead(token);
    reload();
  }
  return { state, entries, unreadCount: entries.filter((item) => !item.read_at).length, reload, markRead, markAll };
}

export type NotificationController = ReturnType<typeof useNotifications>;
