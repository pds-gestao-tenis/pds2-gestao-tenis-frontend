import { getApi } from './client';

export const NOTIFICATIONS_CHANGED = 'club:notifications-changed';
export function refreshNotifications() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
}
export async function listNotifications(token: string) {
  return (await getApi()).listNotifications(token);
}
export async function markNotificationRead(token: string, id: number) {
  return (await getApi()).markNotificationRead(token, id);
}
export async function markAllNotificationsRead(token: string) {
  return (await getApi()).markAllNotificationsRead(token);
}
