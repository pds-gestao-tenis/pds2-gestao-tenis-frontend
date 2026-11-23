import { BOOKING_MINUTES, toBooking, toWaitlistEntry, type ApiBooking } from './booking-adapter';
import { ApiError } from './error';
import { pathId, request } from './http';
import { CLUB_UTC_OFFSET } from '../lib/club-time';
import type {
  ApiServices, Court, CourtInput, Fee, FeeList, Member, MyFees, OccupancyReport, Partner, PendingMember, Player,
  PlayerProfile, Schedule, User,
} from './types';

const NO_OFFERS = 'A fila de espera confirma a reserva automaticamente quando o horário libera.';

const authorization = (token: string) => ({ Authorization: `Bearer ${token}` });
const json = (method: string, input: unknown, token?: string): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json', ...(token ? authorization(token) : {}) },
  body: JSON.stringify(input),
});
const send = (method: string, token: string): RequestInit => ({ method, headers: authorization(token) });
const COURT_FIELDS = ['name', 'address', 'size_m2', 'max_players', 'hourly_price', 'surface', 'covered'] as const;
// Copia só os campos do contrato: nada além dele chega ao servidor.
function courtBody(input: Partial<CourtInput>) {
  const body: Record<string, unknown> = {};
  for (const key of COURT_FIELDS) {
    if (input[key] !== undefined) body[key] = input[key];
  }
  return body;
}
async function unwrap<T>(path: string, init: RequestInit): Promise<T> {
  return (await request<{ data: T }>(path, init)).data;
}
/** Todas as páginas de /bookings com os filtros dados (até 100 por página). */
async function allBookings(token: string, filters: Record<string, string>): Promise<ApiBooking[]> {
  const items: ApiBooking[] = [];
  for (let page = 1; ; page += 1) {
    const params = new URLSearchParams({ ...filters, page: String(page), page_size: '100' });
    const result = await request<{ data: ApiBooking[]; meta?: { total_pages: number } }>(`/bookings?${params}`, send('GET', token));
    if (Array.isArray(result.data)) items.push(...result.data);
    if (page >= (result.meta?.total_pages ?? 1)) return items;
  }
}

export const realApi: ApiServices = {
  async login(email, password) {
    const data = await request<{ access_token: string; expires_at: string; user: User }>(
      '/auth/login', json('POST', { email, password }),
    );
    return { token: data.access_token, expiresAt: data.expires_at, user: data.user };
  },
  async fetchCurrentUser(token) {
    return (await request<{ data: User }>('/auth/me', { headers: authorization(token) })).data;
  },
  logout: (token) => request('/auth/logout', { method: 'POST', headers: authorization(token) }),
  async register(input) {
    return (await request<{ data: User }>('/auth/register', json('POST', input))).data;
  },
  listMembers(token, query = {}) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) params.set(key, String(value));
    }
    return request(`/members${params.size ? `?${params}` : ''}`, { headers: authorization(token) });
  },
  async getMember(token, id) {
    return (await request<{ data: Member }>(`/members/${id}`, { headers: authorization(token) })).data;
  },
  async createMember(token, input) {
    return (await request<{ data: Member }>('/members', json('POST', input, token))).data;
  },
  async updateMember(token, id, input) {
    return (await request<{ data: Member }>(`/members/${id}`, json('PATCH', input, token))).data;
  },
  deleteMember: (token, id) => request(`/members/${id}`, { method: 'DELETE', headers: authorization(token) }),

  // Corpos montados campo a campo: nada além do contrato chega ao servidor.
  // A API pagina (até 100 por página); a tela precisa de todas as quadras.
  async listCourts(token) {
    const courts: Court[] = [];
    for (let page = 1; ; page += 1) {
      const result = await request<{ data: Court[]; meta?: { total_pages: number } }>(
        `/courts?${new URLSearchParams({ page: String(page), page_size: '100' })}`, send('GET', token),
      );
      if (Array.isArray(result.data)) courts.push(...result.data);
      if (page >= (result.meta?.total_pages ?? 1)) return courts;
    }
  },
  getCourt: async (token, id) => unwrap<Court>(`/courts/${pathId(id)}`, send('GET', token)),
  createCourt: async (token, input) => unwrap<Court>('/courts', json('POST', courtBody(input), token)),
  updateCourt: async (token, id, input) => unwrap<Court>(`/courts/${pathId(id)}`, json('PATCH', courtBody(input), token)),
  deleteCourt: (token, id) => request<void>(`/courts/${pathId(id)}`, send('DELETE', token)),
  async addMaintenance(token, courtId, input) {
    const body = { starts_at: input.starts_at, ends_at: input.ends_at, reason: input.reason,
      ...(input.kind !== undefined ? { kind: input.kind } : {}),
      ...(input.cancel_bookings !== undefined ? { cancel_bookings: input.cancel_bookings } : {}) };
    return unwrap<Court>(`/courts/${pathId(courtId)}/maintenance`, json('POST', body, token));
  },
  removeMaintenance: async (token, courtId, maintenanceId) =>
    unwrap<Court>(`/courts/${pathId(courtId)}/maintenance/${pathId(maintenanceId)}`, send('DELETE', token)),
  getSchedule: async (token, date) => unwrap<Schedule>(`/schedule?${new URLSearchParams({ date })}`, send('GET', token)),
  searchPlayers: async (token, q) => unwrap<Player[]>(`/players?${new URLSearchParams({ q })}`, send('GET', token)),
  // A agenda do backend tem outro formato; booking-adapter.ts traduz para o contrato das telas.
  createBooking: async (token, input) => toBooking(await unwrap<ApiBooking>('/bookings', json('POST', {
    court_id: input.court_id, starts_at: input.starts_at, duration_minutes: BOOKING_MINUTES, player_ids: input.participant_ids,
  }, token)), Date.now()),
  async listBookings(token, scope) {
    const items = await allBookings(token, { scope, only_mine: 'true' });
    return items.map((item) => toBooking(item, Date.now()));
  },
  getBooking: async (token, id) => toBooking(await unwrap<ApiBooking>(`/bookings/${pathId(id)}`, send('GET', token)), Date.now()),
  cancelBooking: async (token, id) =>
    toBooking(await unwrap<ApiBooking>(`/bookings/${pathId(id)}/cancel`, send('POST', token)), Date.now()),
  rescheduleBooking: async (token, id, input) => toBooking(await unwrap<ApiBooking>(
    `/bookings/${pathId(id)}`, json('PATCH', { court_id: input.court_id, starts_at: input.starts_at }, token),
  ), Date.now()),
  respondAttendance: async (token, id, response) =>
    toBooking(await unwrap<ApiBooking>(`/bookings/${pathId(id)}/attendance`, json('PUT', { response }, token)), Date.now()),
  // A fila são as reservas "waitlisted" que a própria conta pediu e que ainda não começaram.
  async listWaitlist(token) {
    const items = await allBookings(token, { status: 'waitlisted', only_mine: 'true', starts_from: new Date().toISOString() });
    return items.filter((item) => item.my_role === 'organizer').map(toWaitlistEntry);
  },
  async joinWaitlist(token, input) {
    const item = await unwrap<ApiBooking>('/bookings', json('POST', {
      court_id: input.court_id, starts_at: input.starts_at, duration_minutes: BOOKING_MINUTES, player_ids: [], join_waitlist: true,
    }, token));
    // O horário liberou entre a agenda e o clique: o backend já confirmou a reserva.
    if (item.status === 'confirmed') {
      throw new ApiError('O horário ficou livre e a reserva foi confirmada para você.', 409);
    }
    return toWaitlistEntry(item);
  },
  // Sair da fila é cancelar o pedido; o histórico fica no backend.
  async leaveWaitlist(token, id) {
    await request<unknown>(`/bookings/${pathId(id)}/cancel`, send('POST', token));
  },
  // Sem ofertas no backend: a fila confirma sozinha. Respondem como oferta encerrada (409).
  acceptOffer: async () => { throw new ApiError(NO_OFFERS, 409); },
  declineOffer: async () => { throw new ApiError(NO_OFFERS, 409); },

  // ---------- Taxas (US19-US22) ----------
  myFees: (token) => request<MyFees>('/fees/mine', send('GET', token)),
  payMyFee: (token, id, method) => unwrap<Fee>(`/fees/mine/${pathId(id)}/pay`, json('POST', { method }, token)),
  listFees(token, query = {}) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== false) params.set(key, String(value));
    }
    return request<FeeList>(`/fees${params.size ? `?${params}` : ''}`, send('GET', token));
  },
  createFee: (token, input) => unwrap<Fee>('/fees', json('POST', {
    member_id: input.member_id, description: input.description, amount: input.amount, due_date: input.due_date,
  }, token)),
  registerPayment: (token, id, method) => unwrap<Fee>(`/fees/${pathId(id)}/payment`, json('POST', { method }, token)),
  deleteFee: (token, id) => request(`/fees/${pathId(id)}`, send('DELETE', token)),
  pendingMembers: (token) => unwrap<PendingMember[]>('/fees/pending-members', send('GET', token)),

  // ---------- Perfil de jogo e parceiros (US23-US25) ----------
  getPlayerProfile: (token) => unwrap<PlayerProfile>('/players/me/profile', send('GET', token)),
  savePlayerProfile: (token, profile) => unwrap<PlayerProfile>('/players/me/profile', json('PUT', {
    skill_level: profile.skill_level,
    availability: profile.availability.map(({ weekday, period }) => ({ weekday, period })),
  }, token)),
  listPartners: (token) => unwrap<Partner[]>('/players/partners', send('GET', token)),
  // Convidar = incluir o jogador na lista da reserva; o backend manda o convite por e-mail.
  async invitePlayer(token, bookingId, playerId) {
    const current = await unwrap<ApiBooking>(`/bookings/${pathId(bookingId)}`, send('GET', token));
    if (current.players.some((player) => player.id === playerId)) {
      throw new ApiError('Esse jogador já está nesta reserva.', 409);
    }
    const player_ids = [...current.players.map((player) => player.id), playerId];
    return toBooking(await unwrap<ApiBooking>(`/bookings/${pathId(bookingId)}`, json('PATCH', { player_ids }, token)), Date.now());
  },

  // ---------- Administração da agenda (US26-US30) ----------
  async listClubBookings(token, query) {
    const filters: Record<string, string> = { scope: query.scope };
    if (query.court_id) filters.court_id = String(query.court_id);
    // Datas do clube (AAAA-MM-DD) viram o intervalo [início do dia, início do dia seguinte).
    if (query.from) filters.starts_from = `${query.from}T00:00:00${CLUB_UTC_OFFSET}`;
    if (query.to) {
      const next = new Date(`${query.to}T00:00:00${CLUB_UTC_OFFSET}`);
      next.setUTCDate(next.getUTCDate() + 1);
      filters.starts_to = next.toISOString();
    }
    const items = await allBookings(token, filters);
    return items.map((item) => toBooking(item, Date.now()));
  },
  occupancyReport: (token, from, to) =>
    unwrap<OccupancyReport>(`/reports/occupancy?${new URLSearchParams({ from, to })}`, send('GET', token)),
};
