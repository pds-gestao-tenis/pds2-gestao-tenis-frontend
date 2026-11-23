import { describe, expect, it } from 'vitest';
import type { PlayerProfile } from '../api/types';
import { setupTestApi } from '../test/api';

const NOW = Date.parse('2026-11-09T10:00:00-03:00');
const profile: PlayerProfile = { level: 3, availability: [{ weekday: 1, start_time: '18:00', end_time: '21:00' }] };

describe('US23–US25: perfil, compatibilidade e convites', () => {
  it('salva o perfil apenas da própria conta e retorna cópias', async () => {
    const { api, player, mariana } = await setupTestApi({ now: () => NOW });
    expect(await api.getPlayerProfile(player.token)).toEqual({ level: null, availability: [] });
    const saved = await api.updatePlayerProfile(player.token, profile);
    saved.availability[0].start_time = '07:00';
    expect(await api.getPlayerProfile(player.token)).toEqual(profile);
    expect((await api.getPlayerProfile(mariana.token)).level).toBeNull();
    await expect(api.updatePlayerProfile(player.token, { ...profile, user_id: 3 } as never)).rejects.toMatchObject({ status: 422 });
  });
  it.each([
    { ...profile, level: 6 }, { ...profile, level: 0 },
    { ...profile, availability: [{ weekday: 7, start_time: '18:00', end_time: '21:00' }] },
    { ...profile, availability: [{ weekday: 1, start_time: '21:00', end_time: '18:00' }] },
    { ...profile, availability: [{ weekday: 1, start_time: '18:30', end_time: '21:00' }] },
    { ...profile, availability: [profile.availability[0], profile.availability[0]] },
  ])('valida nível e intervalos semanais (%#)', async (input) => {
    const { api, player } = await setupTestApi({ now: () => NOW });
    await expect(api.updatePlayerProfile(player.token, input as PlayerProfile)).rejects.toMatchObject({ status: 422 });
  });
  it('seleciona nível próximo e interseção real dos horários sem divulgar e-mail', async () => {
    const { api, player, mariana, pedro, admin } = await setupTestApi({ now: () => NOW });
    await api.updatePlayerProfile(player.token, profile);
    await api.updatePlayerProfile(mariana.token, { level: 4, availability: [{ weekday: 1, start_time: '20:00', end_time: '22:00' }] });
    await api.updatePlayerProfile(pedro.token, { ...profile, level: 1 });
    await api.updatePlayerProfile(admin.token, profile);
    expect(await api.listCompatiblePlayers(player.token)).toEqual([{ id: 3, name: 'Mariana Silva', level: 4, common_availability: [{ weekday: 1, start_time: '20:00', end_time: '21:00' }] }]);
    await api.updatePlayerProfile(mariana.token, { ...profile, availability: [{ weekday: 1, start_time: '07:00', end_time: '18:00' }] });
    expect(await api.listCompatiblePlayers(player.token)).toEqual([]);
    await api.updatePlayerProfile(player.token, { level: 3, availability: [] });
    expect(await api.listCompatiblePlayers(player.token)).toEqual([]);
  });
  it('convite entra pendente, notifica só convidado e ele pode confirmar presença', async () => {
    const { api, player, pedro, mariana } = await setupTestApi({ now: () => NOW });
    const booking = await api.invitePlayer(player.token, 5, pedro.user.id);
    expect(booking.participants.find((item) => item.id === 4)?.attendance).toBe('pending');
    expect((await api.listNotifications(pedro.token))[0]).toMatchObject({ kind: 'booking_invitation', booking_id: 5 });
    expect(await api.listNotifications(mariana.token)).toEqual([]);
    await api.respondAttendance(pedro.token, 5, 'confirmed');
    expect((await api.getBooking(player.token, 5)).participants.find((item) => item.id === 4)?.attendance).toBe('confirmed');
    await expect(api.invitePlayer(player.token, 5, 4)).rejects.toMatchObject({ status: 409 });
  });
  it('só o organizador convida, não convida a si mesmo e respeita capacidade e cancelamento', async () => {
    const { api, player, mariana } = await setupTestApi({ now: () => NOW });
    await expect(api.invitePlayer(mariana.token, 5, 4)).rejects.toMatchObject({ status: 404 });
    await expect(api.invitePlayer(player.token, 5, 2)).rejects.toMatchObject({ status: 422 });
    await expect(api.invitePlayer(player.token, 5, 1)).rejects.toMatchObject({ status: 422 });
    await api.invitePlayer(player.token, 5, 4); await api.invitePlayer(player.token, 5, 5);
    const user = await api.register({ name: 'Novo Jogador', email: 'novo@example.com', password: 'SenhaSegura123', password_confirmation: 'SenhaSegura123' });
    await expect(api.invitePlayer(player.token, 5, user.id)).rejects.toMatchObject({ status: 409 });
    await api.cancelBooking(player.token, 5);
    await expect(api.invitePlayer(player.token, 5, user.id)).rejects.toMatchObject({ status: 422 });
  });
});
