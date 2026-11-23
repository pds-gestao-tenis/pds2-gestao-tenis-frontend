import { describe, expect, it } from 'vitest';
import { listCourts } from '../api/courts';
import { listMembers } from '../api/members';
import { acceptOffer } from '../api/waitlist';
import { setupTestApi } from '../test/api';
import { createMockApi } from './api';
import { DEMO_PASSWORD, initialClubData } from './fixtures';

function memoryStorage(entries: Record<string, string> = {}) {
  const items = new Map(Object.entries(entries));
  return { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => void items.set(key, value) };
}

// Formato salvo pela versão anterior do simulador: sem quadras, reservas nem fila.
const v1Data = JSON.stringify({
  accounts: [{ user: { id: 1, name: 'Ana Administradora', email: 'admin@clube.example', created_at: '2026-01-01T12:00:00.000Z' }, admin: true }],
  members: [{ id: 1, name: 'Membro Antigo', email: 'antigo@clube.example', phone: null, status: 'active', created_at: '2026-01-01T12:00:00.000Z', updated_at: '2026-01-01T12:00:00.000Z' }],
  sessions: [],
  nextUserId: 3,
  nextMemberId: 2,
});

describe('createMockApi v3', () => {
  it('ignora dados v1 salvos e usa as fixtures v2', async () => {
    const storage = memoryStorage({ 'clube-tenis.mock-data.v1': v1Data, 'clube-tenis.mock-data.v2': v1Data, 'clube-tenis.mock-data.v3': v1Data });
    const api = createMockApi({ delayMs: 0, storage });
    const admin = await api.login('admin@clube.example', DEMO_PASSWORD);
    expect(await api.listCourts(admin.token)).not.toHaveLength(0);
    const { data: members } = await api.listMembers(admin.token);
    expect(members).not.toHaveLength(0);
    expect(members.some((member) => member.email === 'antigo@clube.example')).toBe(false);
  });

  it('recarrega os dados v3 salvos na aba', async () => {
    const storage = memoryStorage();
    const api = createMockApi({ delayMs: 0, storage });
    const session = await api.login('usuario@clube.example', DEMO_PASSWORD);

    expect(storage.getItem('clube-tenis.mock-data.v3')).not.toBeNull();
    const reloaded = createMockApi({ delayMs: 0, storage });
    await expect(reloaded.fetchCurrentUser(session.token)).resolves.toEqual(session.user);
  });

  it('aceita as contas de Mariana, Pedro e Camila com a senha demo, sem acesso de administrador', async () => {
    const api = createMockApi({ delayMs: 0 });
    for (const email of ['mariana@clube.example', 'pedro@clube.example', 'camila@clube.example']) {
      const session = await api.login(email, DEMO_PASSWORD);
      expect(session.user.email).toBe(email);
      await expect(api.listMembers(session.token)).rejects.toMatchObject({ status: 403 });
    }
  });

  it('cenário members-error só afeta membros', async () => {
    const api = createMockApi({ delayMs: 0, scenario: 'members-error' });
    const admin = await api.login('admin@clube.example', DEMO_PASSWORD);
    await expect(api.fetchCurrentUser(admin.token)).resolves.toMatchObject({ id: 1 });
    await expect(api.listMembers(admin.token)).rejects.toMatchObject({ status: 500 });
  });

  it('toda chamada autenticada passa adiante a oferta vencida antes de responder', async () => {
    let clock = Date.parse('2026-11-09T12:00:00-03:00');
    const api = createMockApi({ delayMs: 0, now: () => clock });
    const pedro = await api.login('pedro@clube.example', DEMO_PASSWORD);
    const ana = await api.login('admin@clube.example', DEMO_PASSWORD);
    const bruno = await api.login('usuario@clube.example', DEMO_PASSWORD);
    const slot = { court_id: 1, starts_at: '2026-11-10T22:00:00.000Z' };
    const pedroEntry = await api.joinWaitlist(pedro.token, slot);
    await api.joinWaitlist(ana.token, slot);
    await api.cancelBooking(bruno.token, (await api.listBookings(bruno.token, 'upcoming'))[0].id);
    clock += 31 * 60000;
    await api.fetchCurrentUser(bruno.token);
    await expect(api.acceptOffer(pedro.token, pedroEntry.id)).rejects.toMatchObject({ status: 404 });
    expect((await api.listWaitlist(ana.token))[0].offer).toEqual({ expires_at: '2026-11-09T16:01:00.000Z' });
  });
});

describe('initialClubData', () => {
  // 22:30 de 09/11 no clube, mas já 10/11 em UTC: as datas seguem o dia do clube.
  const now = Date.parse('2026-11-10T01:30:00Z');
  const data = initialClubData(now);

  it('marca manutenção na Quadra 3 hoje das 17:00 às 19:00 do clube', () => {
    expect(data.courts[0].maintenance).toEqual([]);
    expect(data.courts[1].maintenance).toEqual([]);
    expect(data.courts[2].maintenance).toEqual([
      { id: expect.any(Number), starts_at: '2026-11-09T20:00:00.000Z', ends_at: '2026-11-09T22:00:00.000Z', reason: 'Troca da rede' },
    ]);
  });

  it('cria as reservas relativas ao hoje do clube', () => {
    expect(data.bookings.map(({ id: _id, ...booking }) => booking)).toEqual([
      { court_id: 1, starts_at: '2026-11-10T22:00:00.000Z', ends_at: '2026-11-10T23:00:00.000Z', status: 'active', organizer_id: 2,
        participants: [{ user_id: 2, attendance: 'confirmed' }, { user_id: 3, attendance: 'pending' }] },
      { court_id: 2, starts_at: '2026-11-11T11:00:00.000Z', ends_at: '2026-11-11T12:00:00.000Z', status: 'active', organizer_id: 5,
        participants: [{ user_id: 5, attendance: 'confirmed' }, { user_id: 2, attendance: 'pending' }] },
      { court_id: 2, starts_at: '2026-11-07T13:00:00.000Z', ends_at: '2026-11-07T14:00:00.000Z', status: 'active', organizer_id: 2,
        participants: [{ user_id: 2, attendance: 'confirmed' }] },
    ]);
  });

  it('usa ids únicos e deixa nextId além deles', () => {
    const ids = [...data.courts.map((court) => court.id), ...data.courts.flatMap((court) => court.maintenance.map((item) => item.id)),
      ...data.bookings.map((booking) => booking.id)];
    expect(new Set(ids).size).toBe(ids.length);
    expect(data.nextId).toBeGreaterThan(Math.max(...ids));
    expect(data.waitlist).toEqual([]);
  });
});

describe('API de teste', () => {
  it('os wrappers de src/api chegam à api de teste', async () => {
    const { admin, player } = await setupTestApi();
    // Pela API HTTP real isto falharia (sem servidor); o simulador devolve as fixtures.
    await expect(listMembers(admin.token)).resolves.toMatchObject({ meta: { total: 3 } });
    await expect(listCourts(player.token)).resolves.toHaveLength(3);
    await expect(acceptOffer(player.token, 1)).rejects.toMatchObject({ status: 404, message: 'Entrada não encontrada.' });
  });

  it('o cenário vale depois do login', async () => {
    const { admin } = await setupTestApi({ scenario: 'error' });
    await expect(listMembers(admin.token)).rejects.toMatchObject({ status: 500 });
  });
});
