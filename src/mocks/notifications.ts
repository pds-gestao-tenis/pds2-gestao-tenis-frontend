import { ApiError } from '../api/error';
import type { ApiServices, ClubNotification, NotificationKind } from '../api/types';
import { formatClubDateTime } from '../lib/club-time';
import type { MockBooking, MockContext, MockNotification } from './context';

export const REMINDER_MINUTES = 30;
const titles: Record<NotificationKind, string> = {
  booking_confirmed: 'Reserva confirmada',
  booking_cancelled: 'Reserva cancelada',
  booking_changed: 'Reserva remarcada',
  booking_reminder: 'Sua reserva está chegando',
  booking_invitation: 'Convite para jogar',
};

function publicNotification(item: MockNotification): ClubNotification {
  return {
    id: item.id, kind: item.kind, title: item.title, message: item.message,
    booking_id: item.booking_id, created_at: item.created_at, read_at: item.read_at,
  };
}

/** Os eventos são gerados pelo serviço simulado, nunca pelos componentes de tela. */
export function notifyBooking(ctx: MockContext, booking: MockBooking, kind: NotificationKind, onlyUserId?: number) {
  const court = ctx.db.courts.find((item) => item.id === booking.court_id)?.name ?? 'Quadra';
  const detail = `${court} · ${formatClubDateTime(booking.starts_at)}`;
  const messages: Record<NotificationKind, string> = {
    booking_confirmed: `Sua reserva foi confirmada: ${detail}.`,
    booking_cancelled: `A reserva foi cancelada: ${detail}.`,
    booking_changed: `Confira o novo horário da reserva: ${detail}. Os convidados precisam confirmar presença novamente.`,
    booking_reminder: `Sua reserva começa em até ${REMINDER_MINUTES} minutos: ${detail}.`,
    booking_invitation: `Você recebeu um convite: ${detail}. Abra a reserva para confirmar ou recusar presença.`,
  };
  const recipients = new Set([
    booking.organizer_id,
    ...booking.participants.filter((item) => kind !== 'booking_reminder' || item.attendance !== 'declined').map((item) => item.user_id),
  ]);
  let changed = false;
  for (const userId of recipients) {
    if (onlyUserId !== undefined && userId !== onlyUserId) continue;
    const key = `${booking.id}:${booking.notification_version ?? 0}:${booking.starts_at}:${userId}`;
    if (kind === 'booking_reminder' && ctx.db.notifications.some((item) => item.reminder_key === key)) continue;
    ctx.db.notifications.push({
      id: ctx.db.nextNotificationId++, user_id: userId, kind, title: titles[kind],
      message: messages[kind], booking_id: booking.id,
      created_at: new Date(ctx.now()).toISOString(), read_at: null,
      ...(kind === 'booking_reminder' ? { reminder_key: key } : {}),
    });
    changed = true;
  }
  if (changed) ctx.persist();
}

export function generateReminders(ctx: MockContext) {
  const now = ctx.now();
  for (const booking of ctx.db.bookings) {
    const remaining = Date.parse(booking.starts_at) - now;
    if (booking.status === 'active' && remaining > 0 && remaining <= REMINDER_MINUTES * 60000) {
      notifyBooking(ctx, booking, 'booking_reminder');
    }
  }
}

export function notificationHandlers(ctx: MockContext): Pick<ApiServices, 'listNotifications' | 'markNotificationRead' | 'markAllNotificationsRead'> {
  return {
    async listNotifications(token) {
      await ctx.wait();
      const user = ctx.authenticate(token).user;
      generateReminders(ctx);
      return ctx.db.notifications.filter((item) => item.user_id === user.id)
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id)
        .map(publicNotification);
    },
    async markNotificationRead(token, id) {
      await ctx.wait();
      const user = ctx.authenticate(token).user;
      const item = ctx.db.notifications.find((entry) => entry.id === id && entry.user_id === user.id);
      if (!Number.isSafeInteger(id) || !item) throw new ApiError('Notificação não encontrada.', 404);
      if (!item.read_at) { item.read_at = new Date(ctx.now()).toISOString(); ctx.persist(); }
      return publicNotification(item);
    },
    async markAllNotificationsRead(token) {
      await ctx.wait();
      const user = ctx.authenticate(token).user;
      for (const item of ctx.db.notifications) {
        if (item.user_id === user.id && !item.read_at) item.read_at = new Date(ctx.now()).toISOString();
      }
      ctx.persist();
    },
  };
}
