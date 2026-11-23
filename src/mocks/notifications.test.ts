import { describe, expect, it } from 'vitest';
import { setupTestApi } from '../test/api';
import { createMockApi } from './api';
import { REMINDER_MINUTES } from './notifications';

const NOW = Date.parse('2026-11-09T10:00:00-03:00');
const slot = { court_id: 2, starts_at: '2026-11-09T18:00:00.000Z', participant_ids: [3] };

describe('US16–US18: notificações de reservas', () => {
  it('confirmação avisa organizador e convidados, sem vazar notificações para outras contas', async () => {
    const { api, player, mariana, pedro } = await setupTestApi({ now: () => NOW });
    const booking = await api.createBooking(player.token, slot);
    expect(await api.listNotifications(player.token)).toEqual([expect.objectContaining({ kind: 'booking_confirmed', booking_id: booking.id, read_at: null })]);
    expect(await api.listNotifications(mariana.token)).toHaveLength(1);
    expect(await api.listNotifications(pedro.token)).toEqual([]);
    expect(Object.keys((await api.listNotifications(player.token))[0])).not.toContain('user_id');
  });

  it('cancelamento e remarcação avisam todos os envolvidos', async () => {
    const { api, player, mariana } = await setupTestApi({ now: () => NOW });
    await api.rescheduleBooking(player.token, 5, { court_id: 2, starts_at: '2026-11-10T23:00:00.000Z' });
    expect((await api.listNotifications(mariana.token))[0]).toMatchObject({ kind: 'booking_changed', booking_id: 5 });
    expect((await api.listNotifications(player.token))[0].message).toContain('20:00');
    await api.cancelBooking(player.token, 5);
    expect((await api.listNotifications(mariana.token)).map((item) => item.kind)).toEqual(['booking_cancelled', 'booking_changed']);
  });

  it('operação rejeitada não cria notificação e cancelar duas vezes não duplica o aviso', async () => {
    const { api, player, pedro } = await setupTestApi({ now: () => NOW });
    await expect(api.cancelBooking(pedro.token, 5)).rejects.toMatchObject({ status: 404 });
    expect(await api.listNotifications(player.token)).toEqual([]);
    await api.cancelBooking(player.token, 5);
    await expect(api.cancelBooking(player.token, 5)).rejects.toMatchObject({ status: 422 });
    expect(await api.listNotifications(player.token)).toHaveLength(1);
  });

  it('cancelamento por manutenção também notifica os participantes', async () => {
    const { api, admin, player, mariana } = await setupTestApi({ now: () => NOW });
    await api.addMaintenance(admin.token, 1, { starts_at: '2026-11-10T21:00:00Z', ends_at: '2026-11-10T23:00:00Z', reason: 'Manutenção', cancel_bookings: true });
    expect((await api.listNotifications(player.token))[0].kind).toBe('booking_cancelled');
    expect((await api.listNotifications(mariana.token))[0].kind).toBe('booking_cancelled');
  });

  it('aceitar a vaga da fila gera confirmação para o novo organizador', async () => {
    const { api, player, pedro } = await setupTestApi({ now: () => NOW });
    const entry = await api.joinWaitlist(pedro.token, { court_id: 1, starts_at: '2026-11-10T22:00:00Z' });
    await api.cancelBooking(player.token, 5);
    const booking = await api.acceptOffer(pedro.token, entry.id);
    expect((await api.listNotifications(pedro.token))[0]).toMatchObject({ kind: 'booking_confirmed', booking_id: booking.id });
  });

  it('lembrete aparece na janela de 30 minutos e não se repete nem após a leitura', async () => {
    let clock = NOW;
    const { api, player, mariana, ctx } = await setupTestApi({ now: () => clock });
    const booking = await api.createBooking(player.token, { ...slot, starts_at: '2026-11-09T14:00:00.000Z' });
    clock += 29 * 60000;
    expect((await api.listNotifications(player.token)).filter((item) => item.kind === 'booking_reminder')).toHaveLength(0);
    clock += 60000;
    const reminder = (await api.listNotifications(player.token)).find((item) => item.kind === 'booking_reminder')!;
    expect(REMINDER_MINUTES).toBe(30);
    expect(reminder.booking_id).toBe(booking.id);
    await api.markNotificationRead(player.token, reminder.id);
    await api.listNotifications(player.token);
    expect(ctx.db.notifications.filter((item) => item.kind === 'booking_reminder' && item.user_id === player.user.id)).toHaveLength(1);
    expect((await api.listNotifications(mariana.token)).filter((item) => item.kind === 'booking_reminder')).toHaveLength(1);
  });

  it('não lembra reserva cancelada, iniciada ou convite recusado', async () => {
    let clock = NOW;
    const { api, player, mariana, ctx } = await setupTestApi({ now: () => clock });
    ctx.db.sessions.forEach((item) => { item.expiresAt = '2026-11-12T00:00:00Z'; });
    const booking = await api.createBooking(player.token, { ...slot, starts_at: '2026-11-09T14:00:00.000Z' });
    await api.respondAttendance(mariana.token, booking.id, 'declined');
    clock += 30 * 60000;
    expect((await api.listNotifications(mariana.token)).some((item) => item.kind === 'booking_reminder')).toBe(false);
    const cancelled = await api.createBooking(player.token, { ...slot, starts_at: '2026-11-09T15:00:00.000Z' });
    await api.cancelBooking(player.token, cancelled.id);
    clock += 30 * 60000;
    expect((await api.listNotifications(player.token)).some((item) => item.kind === 'booking_reminder' && item.booking_id === cancelled.id)).toBe(false);
    clock += 60000;
    const past = await api.createBooking(player.token, { ...slot, starts_at: '2026-11-09T16:00:00.000Z' });
    clock = Date.parse(past.starts_at);
    expect((await api.listNotifications(player.token)).some((item) => item.kind === 'booking_reminder' && item.booking_id === past.id)).toBe(false);
  });

  it('remarcação permite um lembrete para o novo horário sem repetir o anterior', async () => {
    let clock = NOW;
    const { api, player, ctx } = await setupTestApi({ now: () => clock });
    ctx.db.sessions.forEach((item) => { item.expiresAt = '2026-11-12T00:00:00Z'; });
    const booking = await api.createBooking(player.token, { ...slot, starts_at: '2026-11-09T14:00:00.000Z' });
    clock += 30 * 60000;
    await api.listNotifications(player.token);
    await api.rescheduleBooking(player.token, booking.id, { court_id: 2, starts_at: '2026-11-09T15:00:00.000Z' });
    clock += 60 * 60000;
    const reminders = (await api.listNotifications(player.token)).filter((item) => item.kind === 'booking_reminder');
    expect(reminders).toHaveLength(2);
    await api.listNotifications(player.token);
    expect((await api.listNotifications(player.token)).filter((item) => item.kind === 'booking_reminder')).toHaveLength(2);
  });

  it('leitura é restrita ao dono e marcar todas não altera notificações de outras contas', async () => {
    const { api, player, mariana } = await setupTestApi({ now: () => NOW });
    await api.createBooking(player.token, slot);
    const own = (await api.listNotifications(player.token))[0];
    await expect(api.markNotificationRead(mariana.token, own.id)).rejects.toMatchObject({ status: 404 });
    await expect(api.listNotifications('invalid')).rejects.toMatchObject({ status: 401 });
    await api.markAllNotificationsRead(player.token);
    expect((await api.listNotifications(player.token))[0].read_at).not.toBeNull();
    expect((await api.listNotifications(mariana.token))[0].read_at).toBeNull();
  });

  it('migra dados anteriores sem perder reservas e preserva notificações após recarregar', async () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value) };
    const api = createMockApi({ delayMs: 0, storage, now: () => NOW });
    const player = await api.login('usuario@clube.example', 'SenhaSegura123');
    const booking = await api.createBooking(player.token, slot);
    const next = createMockApi({ delayMs: 0, storage, now: () => NOW });
    expect((await next.listNotifications(player.token))[0].booking_id).toBe(booking.id);
    expect((await next.listBookings(player.token, 'upcoming')).some((item) => item.id === booking.id)).toBe(true);
    for (const [key, raw] of [...values]) {
      const legacy = JSON.parse(raw);
      for (const name of ['notifications', 'fees', 'nextNotificationId', 'nextFeeId', 'nextPaymentId']) delete legacy[name];
      for (const court of legacy.courts) {
        for (const name of ['address', 'size_m2', 'max_players', 'hourly_price']) delete court[name];
      }
      values.delete(key);
      storage.setItem('clube-tenis.mock-data.v2', JSON.stringify(legacy));
    }
    const migrated = createMockApi({ delayMs: 0, storage, now: () => NOW });
    expect(await migrated.listNotifications(player.token)).toEqual([]);
    expect(await migrated.getCourt(player.token, 2)).toMatchObject({ address: 'Setor A, fundos', max_players: 4 });
    expect((await migrated.listBookings(player.token, 'upcoming')).some((item) => item.id === booking.id)).toBe(true);
  });
});
