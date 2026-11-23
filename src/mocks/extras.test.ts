import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/error';
import { setupTestApi } from '../test/api';

const NOW = Date.parse('2026-11-09T12:00:00-03:00');

async function rejects(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
  throw new Error('esperava erro');
}

describe('simulador: taxas', () => {
  it('jogador não paga taxa de outro membro nem paga duas vezes', async () => {
    const { api, mariana, pedro } = await setupTestApi({ now: () => NOW });
    const own = (await api.myFees(mariana.token)).data.find((fee) => fee.status === 'pending')!;
    expect((await rejects(api.payMyFee(pedro.token, own.id, 'pix'))).status).toBe(404);
    await api.payMyFee(mariana.token, own.id, 'pix');
    expect((await rejects(api.payMyFee(mariana.token, own.id, 'pix'))).status).toBe(409);
  });

  it('só administradores gerenciam taxas e a validação aponta os campos', async () => {
    const { api, admin, player } = await setupTestApi({ now: () => NOW });
    expect((await rejects(api.listFees(player.token))).status).toBe(403);
    const invalid = await rejects(api.createFee(admin.token, { member_id: 1, description: ' ', amount: 0, due_date: '' }));
    expect(Object.keys(invalid.fieldErrors).sort()).toEqual(['amount', 'description', 'due_date']);
    expect((await rejects(api.createFee(admin.token, { member_id: 99, description: 'x', amount: 1, due_date: '2026-12-01' }))).status).toBe(404);
  });

  it('pendências somam por membro e contam as atrasadas', async () => {
    const { api, admin } = await setupTestApi({ now: () => NOW });
    const [first, second] = await api.pendingMembers(admin.token);
    expect(first).toMatchObject({ member: { name: 'Mariana Silva' }, pending_count: 2, pending_total: 300, overdue_count: 1 });
    expect(second).toMatchObject({ member: { name: 'Camila Oliveira' }, pending_count: 1, overdue_count: 0 });
  });
});

describe('simulador: parceiros', () => {
  it('exige nível e respeita nível vizinho e horários em comum', async () => {
    const { api, player } = await setupTestApi({ now: () => NOW });
    const missing = await rejects(api.listPartners(player.token));
    expect(missing.status).toBe(409);
    expect(missing.fieldErrors.skill_level).toBeDefined();

    await api.savePlayerProfile(player.token, { skill_level: 'competitive', availability: [] });
    expect((await api.listPartners(player.token)).map((item) => item.name)).toEqual(['Pedro Santos']);
  });

  it('recusa disponibilidade repetida', async () => {
    const { api, player } = await setupTestApi({ now: () => NOW });
    const slot = { weekday: 1, period: 'evening' as const };
    const error = await rejects(api.savePlayerProfile(player.token, { skill_level: 'beginner', availability: [slot, slot] }));
    expect(error.fieldErrors.availability).toEqual(['Cada dia e período só pode aparecer uma vez.']);
  });

  it('convite: só quem organiza, sem repetir jogador', async () => {
    const { api, player, mariana } = await setupTestApi({ now: () => NOW });
    expect((await rejects(api.invitePlayer(mariana.token, 5, 4))).status).toBe(403);
    expect((await rejects(api.invitePlayer(player.token, 5, 3))).status).toBe(409);
    const booking = await api.invitePlayer(player.token, 5, 4);
    expect(booking.participants.map((item) => item.id)).toEqual([2, 3, 4]);
  });
});

describe('simulador: administração da agenda', () => {
  it('reservas do clube e indicadores são só para administradores', async () => {
    const { api, player, admin } = await setupTestApi({ now: () => NOW });
    expect((await rejects(api.listClubBookings(player.token, { scope: 'upcoming' }))).status).toBe(403);
    expect((await rejects(api.occupancyReport(player.token, '2026-11-01', '2026-11-09'))).status).toBe(403);
    expect((await rejects(api.occupancyReport(admin.token, '2026-11-09', '2026-11-01'))).fieldErrors.from).toBeDefined();
    expect((await rejects(api.occupancyReport(admin.token, '2026-01-01', '2026-11-09'))).fieldErrors.to).toBeDefined();
  });

  it('administração cancela reserva de outra pessoa, como no backend', async () => {
    const { api, admin } = await setupTestApi({ now: () => NOW });
    const cancelled = await api.cancelBooking(admin.token, 6);
    expect(cancelled.status).toBe('cancelled');
    const upcoming = await api.listClubBookings(admin.token, { scope: 'upcoming' });
    expect(upcoming.map((item) => item.id)).toEqual([5]);
  });

  it('ocupação desconta os bloqueios e conta as horas reservadas', async () => {
    const { api, admin } = await setupTestApi({ now: () => NOW });
    const report = await api.occupancyReport(admin.token, '2026-11-09', '2026-11-10');
    const byName = Object.fromEntries(report.courts.map((item) => [item.court.name, item]));
    expect(byName['Quadra 1']).toMatchObject({ booked_hours: 1, available_hours: 30, bookings: 1 });
    expect(byName['Quadra 3']).toMatchObject({ blocked_hours: 2, available_hours: 28 });
    expect(report.totals).toMatchObject({ booked_hours: 1, available_hours: 88, bookings: 1 });
    expect(report.by_hour.find((item) => item.hour === 19)?.booked_hours).toBe(1);
  });
});
