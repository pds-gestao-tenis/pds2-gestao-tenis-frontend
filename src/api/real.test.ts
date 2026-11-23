import { beforeEach, expect, it, vi } from 'vitest';
import { realApi } from './real';
import type { ApiServices } from './types';

// fetch é a fronteira externa, então o stub é legítimo aqui.
const okResponse = async () => new Response(JSON.stringify({ data: {} }), { status: 200 });
let fetchMock = vi.fn(okResponse);
beforeEach(() => {
  fetchMock = vi.fn(okResponse);
  vi.stubGlobal('fetch', fetchMock);
});

type Call = (api: ApiServices) => Promise<unknown>;
it.each<[Call, string, string, unknown]>([
  [(a) => a.listCourts('t'), 'GET', '/api/v1/courts', undefined],
  [(a) => a.createCourt('t', { name: 'Q1', surface: 'clay', covered: true, id: 9, admin: true } as never), 'POST', '/api/v1/courts', { name: 'Q1', surface: 'clay', covered: true }],
  [(a) => a.updateCourt('t', 4, { covered: false, id: 9 } as never), 'PATCH', '/api/v1/courts/4', { covered: false }],
  [(a) => a.updateCourt('t', 4, { name: 'Central', surface: 'hard' }), 'PATCH', '/api/v1/courts/4', { name: 'Central', surface: 'hard' }],
  [(a) => a.addMaintenance('t', 2, { starts_at: 'A', ends_at: 'B', reason: 'Rede', cancel_bookings: true, court_id: 7 } as never), 'POST', '/api/v1/courts/2/maintenance', { starts_at: 'A', ends_at: 'B', reason: 'Rede', cancel_bookings: true }],
  [(a) => a.addMaintenance('t', 2, { starts_at: 'A', ends_at: 'B', reason: 'Rede' }), 'POST', '/api/v1/courts/2/maintenance', { starts_at: 'A', ends_at: 'B', reason: 'Rede' }],
  [(a) => a.removeMaintenance('t', 2, 8), 'DELETE', '/api/v1/courts/2/maintenance/8', undefined],
  [(a) => a.getSchedule('t', '2026-11-10'), 'GET', '/api/v1/schedule?date=2026-11-10', undefined],
  [(a) => a.searchPlayers('t', 'ana&x=1'), 'GET', '/api/v1/players?q=ana%26x%3D1', undefined],
  [(a) => a.createBooking('t', { court_id: 2, starts_at: 'S', participant_ids: [3], organizer_id: 1 } as never), 'POST', '/api/v1/bookings', { court_id: 2, starts_at: 'S', participant_ids: [3] }],
  [(a) => a.listBookings('t', 'past'), 'GET', '/api/v1/bookings?scope=past', undefined],
  [(a) => a.getBooking('t', 5), 'GET', '/api/v1/bookings/5', undefined],
  [(a) => a.cancelBooking('t', 5), 'POST', '/api/v1/bookings/5/cancel', undefined],
  [(a) => a.rescheduleBooking('t', 5, { court_id: 1, starts_at: 'S', status: 'active' } as never), 'PATCH', '/api/v1/bookings/5', { court_id: 1, starts_at: 'S' }],
  [(a) => a.respondAttendance('t', 5, 'confirmed'), 'PUT', '/api/v1/bookings/5/attendance', { response: 'confirmed' }],
  [(a) => a.listWaitlist('t'), 'GET', '/api/v1/waitlist', undefined],
  [(a) => a.joinWaitlist('t', { court_id: 3, starts_at: 'S', user_id: 1 } as never), 'POST', '/api/v1/waitlist', { court_id: 3, starts_at: 'S' }],
  [(a) => a.leaveWaitlist('t', 6), 'DELETE', '/api/v1/waitlist/6', undefined],
  [(a) => a.acceptOffer('t', 6), 'POST', '/api/v1/waitlist/6/accept', undefined],
  [(a) => a.declineOffer('t', 6), 'POST', '/api/v1/waitlist/6/decline', undefined],
  [(a) => a.listNotifications('t'), 'GET', '/api/v1/notifications', undefined],
  [(a) => a.markNotificationRead('t', 7), 'PUT', '/api/v1/notifications/7/read', undefined],
  [(a) => a.markAllNotificationsRead('t'), 'PUT', '/api/v1/notifications/read-all', undefined],
  [(a) => a.listFees('t', { scope: 'all', status: 'pending', member_id: 3, user_id: 1 } as never), 'GET', '/api/v1/fees?scope=all&status=pending&member_id=3', undefined],
  [(a) => a.createFee('t', { member_id: 3, description: 'Taxa', amount_cents: 12345, due_date: '2026-11-15', paid_cents: 12345 } as never), 'POST', '/api/v1/fees', { member_id: 3, description: 'Taxa', amount_cents: 12345, due_date: '2026-11-15' }],
  [(a) => a.recordPayment('t', 2, { amount_cents: 100, paid_on: '2026-11-09', member_id: 4 } as never), 'POST', '/api/v1/fees/2/payments', { amount_cents: 100, paid_on: '2026-11-09' }],
  [(a) => a.payFee('t', 2, { idempotency_key: 'checkout-key', amount_cents: 1 } as never), 'POST', '/api/v1/fees/2/checkout', { idempotency_key: 'checkout-key' }],
  [(a) => a.getPlayerProfile('t'), 'GET', '/api/v1/players/me/profile', undefined],
  [(a) => a.updatePlayerProfile('t', { level: 3, availability: [{ weekday: 1, start_time: '18:00', end_time: '21:00', user_id: 4 }], user_id: 4 } as never), 'PUT', '/api/v1/players/me/profile', { level: 3, availability: [{ weekday: 1, start_time: '18:00', end_time: '21:00' }] }],
  [(a) => a.listCompatiblePlayers('t'), 'GET', '/api/v1/players/compatible', undefined],
  [(a) => a.invitePlayer('t', 5, 4), 'POST', '/api/v1/bookings/5/invitations', { player_id: 4 }],
  [(a) => a.listClubBookings('t', { from: '2026-11-01', to: '2026-11-09', court_id: 2, status: 'completed', admin: true } as never), 'GET', '/api/v1/admin/bookings?from=2026-11-01&to=2026-11-09&court_id=2&status=completed', undefined],
  [(a) => a.cancelClubBooking('t', 5), 'POST', '/api/v1/admin/bookings/5/cancel', undefined],
  [(a) => a.rescheduleClubBooking('t', 5, { court_id: 2, starts_at: 'S', organizer_id: 1 } as never), 'PATCH', '/api/v1/admin/bookings/5', { court_id: 2, starts_at: 'S' }],
  [(a) => a.getOccupancy('t', { from: '2026-11-01', to: '2026-11-09', user_id: 2 } as never), 'GET', '/api/v1/admin/occupancy?from=2026-11-01&to=2026-11-09', undefined],
])('%#: realApi envia só campos permitidos', async (call, method, url, body) => {
  await call(realApi);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [path, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(path).toBe(url);
  expect(init.method ?? 'GET').toBe(method);
  expect(new Headers(init.headers).get('Authorization')).toBe('Bearer t');
  expect(init.body === undefined ? undefined : JSON.parse(String(init.body))).toEqual(body);
});

it('realApi desembrulha o envelope { data }', async () => {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: 1, name: 'Bruno Usuário' }] }), { status: 200 }));
  await expect(realApi.searchPlayers('t', 'br')).resolves.toEqual([{ id: 1, name: 'Bruno Usuário' }]);
});

it('realApi resolve void em leaveWaitlist e declineOffer', async () => {
  fetchMock.mockImplementation(async () => new Response(null, { status: 204 }));
  await expect(realApi.leaveWaitlist('t', 6)).resolves.toBeUndefined();
  await expect(realApi.declineOffer('t', 6)).resolves.toBeUndefined();
  await expect(realApi.markAllNotificationsRead('t')).resolves.toBeUndefined();
});

it('realApi recusa id inválido antes de chamar fetch', async () => {
  await expect(realApi.getBooking('t', '1/../../admin' as never)).rejects.toMatchObject({ status: 422 });
  await expect(realApi.removeMaintenance('t', 1, 0)).rejects.toMatchObject({ status: 422 });
  await expect(realApi.acceptOffer('t', -3)).rejects.toMatchObject({ status: 422 });
  await expect(realApi.payFee('t', 0, { idempotency_key: 'checkout-key' })).rejects.toMatchObject({ status: 422 });
  await expect(realApi.invitePlayer('t', -1, 4)).rejects.toMatchObject({ status: 422 });
  await expect(realApi.cancelClubBooking('t', 0)).rejects.toMatchObject({ status: 422 });
  expect(fetch).not.toHaveBeenCalled();
});
