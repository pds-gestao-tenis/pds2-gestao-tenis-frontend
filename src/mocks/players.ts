import { ApiError } from '../api/error';
import type { ApiServices, Availability, PlayerProfile } from '../api/types';
import type { MockContext } from './context';
import { toBooking } from './bookings';
import { notifyBooking } from './notifications';

const emptyProfile = (): PlayerProfile => ({ level: null, availability: [] });
const copyProfile = (profile: PlayerProfile): PlayerProfile => ({ level: profile.level, availability: profile.availability.map((item) => ({ ...item })) });
function invalid(message: string): never { throw new ApiError(message, 422); }
function validate(profile: PlayerProfile) {
  if (Object.keys(profile).some((key) => !['level', 'availability'].includes(key))) invalid('Campo de perfil inválido.');
  if (profile.level !== null && (!Number.isInteger(profile.level) || profile.level < 1 || profile.level > 5)) invalid('Escolha um nível entre 1 e 5.');
  if (!Array.isArray(profile.availability) || profile.availability.length > 7) invalid('Informe até um intervalo por dia da semana.');
  const days = new Set<number>();
  for (const slot of profile.availability) {
    if (!slot || Object.keys(slot).some((key) => !['weekday', 'start_time', 'end_time'].includes(key)) || !Number.isInteger(slot.weekday) || slot.weekday < 0 || slot.weekday > 6 || days.has(slot.weekday)) invalid('Dia da semana inválido ou repetido.');
    if (typeof slot.start_time !== 'string' || typeof slot.end_time !== 'string' || !/^(0[7-9]|1\d|2[01]):00$/.test(slot.start_time) || !/^(0[8-9]|1\d|2[0-2]):00$/.test(slot.end_time) || slot.start_time >= slot.end_time) invalid('Escolha horários inteiros entre 07:00 e 22:00, com fim após o início.');
    days.add(slot.weekday);
  }
}
function commonAvailability(a: Availability[], b: Availability[]): Availability[] {
  return a.flatMap((first) => b.flatMap((second) => {
    const start_time = first.start_time > second.start_time ? first.start_time : second.start_time;
    const end_time = first.end_time < second.end_time ? first.end_time : second.end_time;
    return first.weekday === second.weekday && start_time < end_time ? [{ weekday: first.weekday, start_time, end_time }] : [];
  }));
}
export function playerHandlers(ctx: MockContext): Pick<ApiServices, 'getPlayerProfile' | 'updatePlayerProfile' | 'listCompatiblePlayers' | 'invitePlayer'> {
  return {
    async getPlayerProfile(token) {
      await ctx.wait();
      return copyProfile(ctx.authenticate(token).player_profile ?? emptyProfile());
    },
    async updatePlayerProfile(token, input) {
      await ctx.wait();
      const viewer = ctx.authenticate(token);
      validate(input);
      viewer.player_profile = copyProfile(input);
      ctx.persist();
      return copyProfile(viewer.player_profile);
    },
    async listCompatiblePlayers(token) {
      await ctx.wait();
      const viewer = ctx.authenticate(token);
      const mine = viewer.player_profile;
      if (!mine?.level || mine.availability.length === 0) return [];
      return ctx.db.accounts.flatMap((account) => {
        const profile = account.player_profile;
        if (account.admin || account.user.id === viewer.user.id || !profile?.level || Math.abs(profile.level - mine.level!) > 1) return [];
        const common_availability = commonAvailability(mine.availability, profile.availability);
        return common_availability.length ? [{ id: account.user.id, name: account.user.name, level: profile.level, common_availability }] : [];
      }).sort((a, b) => Math.abs(a.level - mine.level!) - Math.abs(b.level - mine.level!) || a.name.localeCompare(b.name));
    },
    async invitePlayer(token, bookingId, playerId) {
      await ctx.wait();
      const viewer = ctx.authenticate(token).user;
      const booking = Number.isSafeInteger(bookingId) && ctx.db.bookings.find((item) => item.id === bookingId && item.organizer_id === viewer.id);
      if (!booking) throw new ApiError('Reserva não encontrada.', 404);
      if (booking.status !== 'active' || Date.parse(booking.starts_at) <= ctx.now()) invalid('Escolha uma reserva futura e ativa.');
      const player = Number.isSafeInteger(playerId) && ctx.db.accounts.find((item) => item.user.id === playerId && !item.admin);
      if (!player || playerId === viewer.id) invalid('Escolha outro jogador.');
      if (booking.participants.some((item) => item.user_id === playerId)) throw new ApiError('Este jogador já foi convidado para a reserva.', 409);
      if (booking.participants.filter((item) => item.user_id !== viewer.id).length >= 3) throw new ApiError('A reserva já tem três convidados.', 409);
      booking.participants.push({ user_id: playerId, attendance: 'pending' });
      ctx.persist();
      notifyBooking(ctx, booking, 'booking_invitation', playerId);
      return toBooking(ctx, booking, viewer.id);
    },
  };
}
