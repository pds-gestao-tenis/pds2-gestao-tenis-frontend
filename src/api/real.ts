import { pathId, request } from './http';
import type { ApiServices, Booking, ClubNotification, CompatiblePlayer, Court, CourtInput, Fee, Member, Occupancy, Player, PlayerProfile, Schedule, User, WaitlistEntry } from './types';

const authorization = (token: string) => ({ Authorization: `Bearer ${token}` });
const json = (method: string, input: unknown, token?: string): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json', ...(token ? authorization(token) : {}) },
  body: JSON.stringify(input),
});
const send = (method: string, token: string): RequestInit => ({ method, headers: authorization(token) });
async function unwrap<T>(path: string, init: RequestInit): Promise<T> {
  return (await request<{ data: T }>(path, init)).data;
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
  listCourts: async (token) => unwrap<Court[]>('/courts', send('GET', token)),
  createCourt: async (token, input) =>
    unwrap<Court>('/courts', json('POST', { name: input.name, surface: input.surface, covered: input.covered }, token)),
  async updateCourt(token, id, input) {
    const body: Partial<CourtInput> = {};
    if (input.name !== undefined) body.name = input.name;
    if (input.surface !== undefined) body.surface = input.surface;
    if (input.covered !== undefined) body.covered = input.covered;
    return unwrap<Court>(`/courts/${pathId(id)}`, json('PATCH', body, token));
  },
  async addMaintenance(token, courtId, input) {
    const body = { starts_at: input.starts_at, ends_at: input.ends_at, reason: input.reason,
      ...(input.cancel_bookings !== undefined ? { cancel_bookings: input.cancel_bookings } : {}) };
    return unwrap<Court>(`/courts/${pathId(courtId)}/maintenance`, json('POST', body, token));
  },
  removeMaintenance: async (token, courtId, maintenanceId) =>
    unwrap<Court>(`/courts/${pathId(courtId)}/maintenance/${pathId(maintenanceId)}`, send('DELETE', token)),
  getSchedule: async (token, date) => unwrap<Schedule>(`/schedule?${new URLSearchParams({ date })}`, send('GET', token)),
  searchPlayers: async (token, q) => unwrap<Player[]>(`/players?${new URLSearchParams({ q })}`, send('GET', token)),
  createBooking: async (token, input) => unwrap<Booking>('/bookings', json('POST', {
    court_id: input.court_id, starts_at: input.starts_at, participant_ids: input.participant_ids,
  }, token)),
  listBookings: async (token, scope) => unwrap<Booking[]>(`/bookings?${new URLSearchParams({ scope })}`, send('GET', token)),
  getBooking: async (token, id) => unwrap<Booking>(`/bookings/${pathId(id)}`, send('GET', token)),
  cancelBooking: async (token, id) => unwrap<Booking>(`/bookings/${pathId(id)}/cancel`, send('POST', token)),
  rescheduleBooking: async (token, id, input) =>
    unwrap<Booking>(`/bookings/${pathId(id)}`, json('PATCH', { court_id: input.court_id, starts_at: input.starts_at }, token)),
  respondAttendance: async (token, id, response) =>
    unwrap<Booking>(`/bookings/${pathId(id)}/attendance`, json('PUT', { response }, token)),
  listWaitlist: async (token) => unwrap<WaitlistEntry[]>('/waitlist', send('GET', token)),
  joinWaitlist: async (token, input) =>
    unwrap<WaitlistEntry>('/waitlist', json('POST', { court_id: input.court_id, starts_at: input.starts_at }, token)),
  leaveWaitlist: async (token, id) => request<void>(`/waitlist/${pathId(id)}`, send('DELETE', token)),
  acceptOffer: async (token, id) => unwrap<Booking>(`/waitlist/${pathId(id)}/accept`, send('POST', token)),
  declineOffer: async (token, id) => request<void>(`/waitlist/${pathId(id)}/decline`, send('POST', token)),
  listNotifications: (token) => unwrap<ClubNotification[]>('/notifications', send('GET', token)),
  markNotificationRead: async (token, id) => unwrap<ClubNotification>(`/notifications/${pathId(id)}/read`, send('PUT', token)),
  markAllNotificationsRead: (token) => request<void>('/notifications/read-all', send('PUT', token)),
  listFees(token, query = {}) {
    const params = new URLSearchParams();
    if (query.scope !== undefined) params.set('scope', query.scope);
    if (query.status !== undefined) params.set('status', query.status);
    if (query.member_id !== undefined) params.set('member_id', String(query.member_id));
    return unwrap<Fee[]>(`/fees${params.size ? `?${params}` : ''}`, send('GET', token));
  },
  createFee: (token, input) => unwrap<Fee>('/fees', json('POST', {
    member_id: input.member_id, description: input.description, amount_cents: input.amount_cents, due_date: input.due_date,
  }, token)),
  recordPayment: async (token, id, input) => unwrap<Fee>(`/fees/${pathId(id)}/payments`, json('POST', {
    amount_cents: input.amount_cents, paid_on: input.paid_on,
  }, token)),
  payFee: async (token, id, input) => unwrap<Fee>(`/fees/${pathId(id)}/checkout`, json('POST', { idempotency_key: input.idempotency_key }, token)),
  getPlayerProfile: (token) => unwrap<PlayerProfile>('/players/me/profile', send('GET', token)),
  updatePlayerProfile: (token, input) => unwrap<PlayerProfile>('/players/me/profile', json('PUT', {
    level: input.level, availability: input.availability.map((item) => ({ weekday: item.weekday, start_time: item.start_time, end_time: item.end_time })),
  }, token)),
  listCompatiblePlayers: (token) => unwrap<CompatiblePlayer[]>('/players/compatible', send('GET', token)),
  invitePlayer: async (token, id, playerId) => unwrap<Booking>(`/bookings/${pathId(id)}/invitations`, json('POST', { player_id: playerId }, token)),
  listClubBookings(token, query) {
    const params = new URLSearchParams({ from: query.from, to: query.to });
    if (query.court_id !== undefined) params.set('court_id', String(query.court_id));
    if (query.status !== undefined) params.set('status', query.status);
    return unwrap<Booking[]>(`/admin/bookings?${params}`, send('GET', token));
  },
  cancelClubBooking: async (token, id) => unwrap<Booking>(`/admin/bookings/${pathId(id)}/cancel`, send('POST', token)),
  rescheduleClubBooking: async (token, id, input) => unwrap<Booking>(`/admin/bookings/${pathId(id)}`, json('PATCH', { court_id: input.court_id, starts_at: input.starts_at }, token)),
  getOccupancy: (token, query) => unwrap<Occupancy[]>(`/admin/occupancy?${new URLSearchParams({ from: query.from, to: query.to })}`, send('GET', token)),
};
