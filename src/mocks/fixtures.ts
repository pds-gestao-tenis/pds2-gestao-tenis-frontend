import type { Court, Member, User } from '../api/types';
import { clubDate, fromClubLocal } from '../lib/club-time';
import type { MockBooking, MockFee, MockProfile, MockWaitlistEntry } from './context';

export const DEMO_PASSWORD = 'SenhaSegura123';
export const DEMO_ADMIN_EMAIL = 'admin@clube.example';
export const DEMO_USER_EMAIL = 'usuario@clube.example';
// v4: taxas dos membros e perfis de jogo. Dados salvos de versões antigas são descartados.
export const MOCK_DATA_KEY = 'clube-tenis.mock-data.v4';
const created_at = '2026-01-01T12:00:00.000Z';

// As permissões pertencem ao simulador; não fazem parte de UserResponse da API atual.
export type MockAccount = { user: User; admin: boolean; passwordHash?: string };
export function initialAccounts(): MockAccount[] {
  return [
    { user: { id: 1, name: 'Ana Administradora', email: DEMO_ADMIN_EMAIL, created_at }, admin: true },
    { user: { id: 2, name: 'Bruno Usuário', email: DEMO_USER_EMAIL, created_at }, admin: false },
    { user: { id: 3, name: 'Mariana Silva', email: 'mariana@clube.example', created_at }, admin: false },
    { user: { id: 4, name: 'Pedro Santos', email: 'pedro@clube.example', created_at }, admin: false },
    { user: { id: 5, name: 'Camila Oliveira', email: 'camila@clube.example', created_at }, admin: false },
  ];
}

export function initialMembers(): Member[] {
  return [
    { name: 'Mariana Silva', email: 'mariana@clube.example', phone: '+55 (31) 99999-1234', status: 'active' },
    { name: 'Pedro Santos', email: 'pedro@clube.example', phone: null, status: 'inactive' },
    { name: 'Camila Oliveira', email: 'camila@clube.example', phone: '(11) 98888-4321', status: 'active' },
  ].map((member, index) => ({ ...member, status: member.status as Member['status'], id: index + 1, created_at, updated_at: created_at }));
}

export type ClubData = { courts: Court[]; bookings: MockBooking[]; waitlist: MockWaitlistEntry[]; nextId: number };

// Datas relativas ao "hoje" do clube, e não ao fuso da máquina.
function clubDay(now: number, offset: number): string {
  const [year, month, day] = clubDate(now).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10);
}
const clubInstant = (now: number, offset: number, time: string) =>
  new Date(fromClubLocal(`${clubDay(now, offset)}T${time}`)).getTime();

export function initialClubData(now: number): ClubData {
  const iso = (time: number) => new Date(time).toISOString();
  const booking = (id: number, court_id: number, start: number, organizer_id: number, invited: number[]): MockBooking => ({
    id, court_id, starts_at: iso(start), ends_at: iso(start + 3600000), status: 'active', organizer_id,
    participants: [{ user_id: organizer_id, attendance: 'confirmed' }, ...invited.map((user_id) => ({ user_id, attendance: 'pending' as const }))],
  });
  const details = (address: string, hourly_price: number) => ({ address, size_m2: 260.76, max_players: 4, hourly_price });
  return {
    courts: [
      { id: 1, name: 'Quadra 1', surface: 'hard', covered: false, ...details('Setor A, ao lado da sede', 90), maintenance: [] },
      { id: 2, name: 'Quadra 2', surface: 'clay', covered: false, ...details('Setor A, fundos', 110), maintenance: [] },
      { id: 3, name: 'Quadra 3', surface: 'hard', covered: true, ...details('Ginásio coberto', 150), maintenance: [{
        id: 4, starts_at: iso(clubInstant(now, 0, '17:00')), ends_at: iso(clubInstant(now, 0, '19:00')), reason: 'Troca da rede',
      }] },
    ],
    bookings: [
      booking(5, 1, clubInstant(now, 1, '19:00'), 2, [3]),
      booking(6, 2, clubInstant(now, 2, '08:00'), 5, [2]),
      booking(7, 2, clubInstant(now, -2, '10:00'), 2, []),
    ],
    waitlist: [],
    nextId: 8,
  };
}

/** Taxas de exemplo: Mariana tem uma atrasada e uma paga; Camila, uma pendente. */
export function initialFees(now: number): MockFee[] {
  const fee = (id: number, member_id: number, description: string, amount: number, dueOffset: number, paid = false): MockFee => ({
    id, member_id, description, amount, due_date: clubDay(now, dueOffset), status: paid ? 'paid' : 'pending',
    paid_at: paid ? new Date(now - 5 * 86400000).toISOString() : null,
    payment_method: paid ? 'pix' : null, paid_via: paid ? 'admin' : null, created_at,
  });
  return [
    fee(1, 1, 'Mensalidade do mês passado', 150, -10),
    fee(2, 1, 'Inscrição no torneio interno', 80, -15, true),
    fee(3, 1, 'Mensalidade', 150, 20),
    fee(4, 3, 'Mensalidade', 150, 5),
  ];
}

/** Perfis de jogo de exemplo (US23): Mariana, Pedro e Camila já informaram nível e horários. */
export function initialProfiles(): MockProfile[] {
  return [
    { user_id: 3, skill_level: 'intermediate', availability: [{ weekday: 1, period: 'evening' }, { weekday: 3, period: 'evening' }] },
    { user_id: 4, skill_level: 'advanced', availability: [{ weekday: 1, period: 'evening' }, { weekday: 5, period: 'morning' }] },
    { user_id: 5, skill_level: 'beginner', availability: [{ weekday: 5, period: 'morning' }] },
  ];
}
