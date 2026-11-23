import { beforeEach, expect, it, vi } from 'vitest';
import { realApi } from './real';
import type { ApiServices } from './types';

// Reserva no formato do backend; status waitlisted serve tanto para reservas quanto para a fila.
const API_BOOKING = {
  id: 5, court: { id: 2, name: 'Quadra 2' }, organizer: { id: 1, name: 'Ana' },
  players: [{ id: 3, name: 'Bruno', attendance: 'pending' }, { id: 1, name: 'Ana', attendance: 'confirmed' }],
  starts_at: '2030-01-10T22:00:00Z', ends_at: '2030-01-10T23:00:00Z', status: 'waitlisted',
  requested_at: '2030-01-01T12:00:00Z', cancelled_at: null, waitlist_position: 2, duration_minutes: 60, my_role: 'organizer',
};

// fetch é a fronteira externa, então o stub é legítimo aqui.
// Listas de reservas respondem com página vazia; o resto, com uma reserva.
const okResponse = async (input?: unknown) => new Response(JSON.stringify(
  /\/bookings\?/.test(String(input)) ? { data: [], meta: { total_pages: 1 } } : { data: API_BOOKING },
), { status: 200 });
let fetchMock = vi.fn(okResponse);
beforeEach(() => {
  fetchMock = vi.fn(okResponse);
  vi.stubGlobal('fetch', fetchMock);
});

type Call = (api: ApiServices) => Promise<unknown>;
it.each<[Call, string, string, unknown]>([
  [(a) => a.listCourts('t'), 'GET', '/api/v1/courts?page=1&page_size=100', undefined],
  [(a) => a.getCourt('t', 4), 'GET', '/api/v1/courts/4', undefined],
  [(a) => a.deleteCourt('t', 4), 'DELETE', '/api/v1/courts/4', undefined],
  [(a) => a.createCourt('t', { name: 'Q1', address: 'Setor A', size_m2: 260.5, max_players: 4, hourly_price: 90, surface: 'clay', covered: true, id: 9, admin: true } as never), 'POST', '/api/v1/courts', { name: 'Q1', address: 'Setor A', size_m2: 260.5, max_players: 4, hourly_price: 90, surface: 'clay', covered: true }],
  [(a) => a.updateCourt('t', 4, { hourly_price: 120.5, max_players: 2, maintenance: [] } as never), 'PATCH', '/api/v1/courts/4', { hourly_price: 120.5, max_players: 2 }],
  [(a) => a.updateCourt('t', 4, { covered: false, id: 9 } as never), 'PATCH', '/api/v1/courts/4', { covered: false }],
  [(a) => a.updateCourt('t', 4, { name: 'Central', surface: 'hard' }), 'PATCH', '/api/v1/courts/4', { name: 'Central', surface: 'hard' }],
  [(a) => a.addMaintenance('t', 2, { starts_at: 'A', ends_at: 'B', reason: 'Rede', cancel_bookings: true, court_id: 7 } as never), 'POST', '/api/v1/courts/2/maintenance', { starts_at: 'A', ends_at: 'B', reason: 'Rede', cancel_bookings: true }],
  [(a) => a.addMaintenance('t', 2, { starts_at: 'A', ends_at: 'B', reason: 'Rede' }), 'POST', '/api/v1/courts/2/maintenance', { starts_at: 'A', ends_at: 'B', reason: 'Rede' }],
  [(a) => a.removeMaintenance('t', 2, 8), 'DELETE', '/api/v1/courts/2/maintenance/8', undefined],
  [(a) => a.getSchedule('t', '2026-11-10'), 'GET', '/api/v1/schedule?date=2026-11-10', undefined],
  [(a) => a.searchPlayers('t', 'ana&x=1'), 'GET', '/api/v1/players?q=ana%26x%3D1', undefined],
  [(a) => a.createBooking('t', { court_id: 2, starts_at: 'S', participant_ids: [3], organizer_id: 1 } as never), 'POST', '/api/v1/bookings', { court_id: 2, starts_at: 'S', duration_minutes: 60, player_ids: [3] }],
  [(a) => a.listBookings('t', 'past'), 'GET', '/api/v1/bookings?scope=past&only_mine=true&page=1&page_size=100', undefined],
  [(a) => a.getBooking('t', 5), 'GET', '/api/v1/bookings/5', undefined],
  [(a) => a.cancelBooking('t', 5), 'POST', '/api/v1/bookings/5/cancel', undefined],
  [(a) => a.rescheduleBooking('t', 5, { court_id: 1, starts_at: 'S', status: 'active' } as never), 'PATCH', '/api/v1/bookings/5', { court_id: 1, starts_at: 'S' }],
  [(a) => a.respondAttendance('t', 5, 'confirmed'), 'PUT', '/api/v1/bookings/5/attendance', { response: 'confirmed' }],
  [(a) => a.joinWaitlist('t', { court_id: 3, starts_at: 'S', user_id: 1 } as never), 'POST', '/api/v1/bookings', { court_id: 3, starts_at: 'S', duration_minutes: 60, player_ids: [], join_waitlist: true }],
  [(a) => a.leaveWaitlist('t', 6), 'POST', '/api/v1/bookings/6/cancel', undefined],
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

it('realApi resolve void em leaveWaitlist', async () => {
  await expect(realApi.leaveWaitlist('t', 6)).resolves.toBeUndefined();
});

it('realApi resolve void ao marcar todas as notificações', async () => {
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
  await expect(realApi.markAllNotificationsRead('t')).resolves.toBeUndefined();
});

it('reserva do backend vira o contrato das telas', async () => {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: { ...API_BOOKING, status: 'confirmed' } }), { status: 200 }));
  await expect(realApi.getBooking('t', 5)).resolves.toEqual({
    id: 5, court: { id: 2, name: 'Quadra 2' }, starts_at: '2030-01-10T22:00:00Z', ends_at: '2030-01-10T23:00:00Z',
    status: 'active', organizer: { id: 1, name: 'Ana' },
    // Quem organiza vem primeiro.
    participants: [{ id: 1, name: 'Ana', attendance: 'confirmed' }, { id: 3, name: 'Bruno', attendance: 'pending' }],
    my_role: 'organizer',
  });
});

it.each([
  ['confirmed', '2020-01-10T23:00:00Z', 'completed'],
  ['confirmed', '2030-01-10T23:00:00Z', 'active'],
  ['cancelled', '2020-01-10T23:00:00Z', 'cancelled'],
])('status %s terminando em %s → %s', async (status, ends_at, expected) => {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: { ...API_BOOKING, status, ends_at } }), { status: 200 }));
  await expect(realApi.getBooking('t', 5)).resolves.toMatchObject({ status: expected });
});

it('fila: lista os pedidos próprios ainda por vir, de todas as páginas', async () => {
  vi.useFakeTimers({ now: Date.parse('2030-01-01T12:00:00Z'), toFake: ['Date'] });
  try {
    const page = (data: unknown[], total_pages: number) => new Response(JSON.stringify({ data, meta: { total_pages } }), { status: 200 });
    fetchMock
      .mockResolvedValueOnce(page([API_BOOKING], 2))
      // Pedido em que a conta só joga não é "seu" na fila.
      .mockResolvedValueOnce(page([{ ...API_BOOKING, id: 8, my_role: 'participant' }], 2));
    await expect(realApi.listWaitlist('t')).resolves.toEqual([{
      id: 5, court: { id: 2, name: 'Quadra 2' }, starts_at: '2030-01-10T22:00:00Z', ends_at: '2030-01-10T23:00:00Z',
      position: 2, offer: null,
    }]);
    expect(fetchMock.mock.calls.map((call) => (call as unknown[])[0])).toEqual([
      '/api/v1/bookings?status=waitlisted&only_mine=true&starts_from=2030-01-01T12%3A00%3A00.000Z&page=1&page_size=100',
      '/api/v1/bookings?status=waitlisted&only_mine=true&starts_from=2030-01-01T12%3A00%3A00.000Z&page=2&page_size=100',
    ]);
  } finally {
    vi.useRealTimers();
  }
});

it('entrar na fila de um horário que acabou de liberar avisa que a reserva foi confirmada', async () => {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: { ...API_BOOKING, status: 'confirmed' } }), { status: 201 }));
  await expect(realApi.joinWaitlist('t', { court_id: 2, starts_at: 'S' })).rejects.toMatchObject({
    status: 409, message: 'O horário ficou livre e a reserva foi confirmada para você.',
  });
});

it('ofertas não existem no backend: aceitar ou recusar responde 409 sem chamar a API', async () => {
  await expect(realApi.acceptOffer('t', 6)).rejects.toMatchObject({ status: 409 });
  await expect(realApi.declineOffer('t', 6)).rejects.toMatchObject({ status: 409 });
  expect(fetchMock).not.toHaveBeenCalled();
});

it('realApi recusa id inválido antes de chamar fetch', async () => {
  await expect(realApi.getBooking('t', '1/../../admin' as never)).rejects.toMatchObject({ status: 422 });
  await expect(realApi.removeMaintenance('t', 1, 0)).rejects.toMatchObject({ status: 422 });
  await expect(realApi.cancelBooking('t', -3)).rejects.toMatchObject({ status: 422 });
  await expect(realApi.payFee('t', 0, { idempotency_key: 'checkout-key' })).rejects.toMatchObject({ status: 422 });
  await expect(realApi.invitePlayer('t', -1, 4)).rejects.toMatchObject({ status: 422 });
  await expect(realApi.cancelClubBooking('t', 0)).rejects.toMatchObject({ status: 422 });
  expect(fetch).not.toHaveBeenCalled();
});

it('realApi lista as quadras de todas as páginas', async () => {
  const page = (data: unknown[], total_pages: number) =>
    new Response(JSON.stringify({ data, meta: { page: 1, page_size: 100, total: 0, total_pages } }), { status: 200 });
  fetchMock.mockResolvedValueOnce(page([{ id: 1 }], 2)).mockResolvedValueOnce(page([{ id: 2 }], 2));
  await expect(realApi.listCourts('t')).resolves.toEqual([{ id: 1 }, { id: 2 }]);
  expect(fetchMock.mock.calls.map((call) => (call as unknown[])[0])).toEqual([
    '/api/v1/courts?page=1&page_size=100',
    '/api/v1/courts?page=2&page_size=100',
  ]);
});
