import { ApiError } from '../api/error';
import type { ApiServices, AvailabilitySlot, DayPeriod, Fee, OccupancyReport, SkillLevel, Usage } from '../api/types';
import { clubDate, fromClubLocal } from '../lib/club-time';
import { toBooking } from './bookings';
import type { MockContext, MockFee } from './context';

/**
 * Simulador das funções novas (US19-US30), com as mesmas regras do backend:
 * taxas e pagamentos, perfil de jogo e parceiros, agenda do clube e indicadores de ocupação.
 */

const LEVELS: SkillLevel[] = ['beginner', 'intermediate', 'advanced', 'competitive'];
const PERIODS: DayPeriod[] = ['morning', 'afternoon', 'evening'];
const FIRST_HOUR = 7;
const LAST_HOUR = 21;
const MAX_REPORT_DAYS = 92;

function invalid(field: string, message: string): never {
  throw new ApiError('Os dados informados são inválidos.', 422, { [field]: [message] });
}

const sortSlots = (slots: AvailabilitySlot[]) =>
  [...slots].sort((a, b) => a.weekday - b.weekday || PERIODS.indexOf(a.period) - PERIODS.indexOf(b.period));

function addDays(day: string, offset: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

type ExtraServices =
  | 'myFees' | 'payMyFee' | 'listFees' | 'createFee' | 'registerPayment' | 'deleteFee' | 'pendingMembers'
  | 'getPlayerProfile' | 'savePlayerProfile' | 'listPartners' | 'invitePlayer'
  | 'listClubBookings' | 'occupancyReport';

export function extraHandlers(ctx: MockContext): Pick<ApiServices, ExtraServices> {
  const today = () => clubDate(ctx.now());

  function toFee(item: MockFee): Fee {
    const member = ctx.db.members.find((entry) => entry.id === item.member_id);
    const { member_id: _memberId, ...rest } = item;
    return {
      ...rest,
      member: { id: item.member_id, name: member?.name ?? 'Membro', email: member?.email ?? '' },
      overdue: item.status === 'pending' && item.due_date < today(),
    };
  }

  function pendingFee(id: number) {
    const fee = ctx.db.fees.find((item) => item.id === id);
    if (!fee) throw new ApiError('Taxa não encontrada.', 404);
    if (fee.status === 'paid') throw new ApiError('Esta taxa já foi paga.', 409);
    return fee;
  }

  function profileOf(userId: number) {
    const found = ctx.db.profiles.find((item) => item.user_id === userId);
    return { skill_level: found?.skill_level ?? null, availability: sortSlots(found?.availability ?? []) };
  }

  return {
    // ---------- Taxas (US19-US22) ----------
    async myFees(token) {
      await ctx.wait();
      const user = ctx.authenticate(token).user;
      const member = ctx.db.members.find((item) => item.email === user.email);
      const fees = member ? ctx.db.fees.filter((item) => item.member_id === member.id).map(toFee) : [];
      fees.sort((a, b) =>
        (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) ||
        (a.status === 'pending' ? a.due_date.localeCompare(b.due_date) : (b.paid_at ?? '').localeCompare(a.paid_at ?? '')));
      const total = (status: Fee['status']) => fees.filter((item) => item.status === status).reduce((sum, item) => sum + item.amount, 0);
      return {
        member: member ? { id: member.id, name: member.name, email: member.email } : null,
        data: fees,
        summary: { pending_total: total('pending'), paid_total: total('paid'), overdue_count: fees.filter((item) => item.overdue).length },
      };
    },
    async payMyFee(token, id, method) {
      await ctx.wait();
      const user = ctx.authenticate(token).user;
      if (method !== 'pix' && method !== 'card') invalid('method', 'Escolha Pix ou cartão.');
      const member = ctx.db.members.find((item) => item.email === user.email);
      const found = ctx.db.fees.find((item) => item.id === id);
      if (!found || !member || found.member_id !== member.id) throw new ApiError('Taxa não encontrada.', 404);
      const fee = pendingFee(id);
      Object.assign(fee, { status: 'paid', paid_at: new Date(ctx.now()).toISOString(), payment_method: method, paid_via: 'online' });
      ctx.persist();
      return toFee(fee);
    },
    async listFees(token, query = {}) {
      await ctx.wait();
      ctx.authenticate(token, true);
      const { page = 1, page_size = 20 } = query;
      const items = ctx.db.fees.map(toFee).filter((item) =>
        (query.member_id === undefined || item.member.id === query.member_id) &&
        (query.status === undefined || item.status === query.status) &&
        (!query.overdue || item.overdue),
      ).sort((a, b) => a.due_date.localeCompare(b.due_date) || a.id - b.id);
      return {
        data: items.slice((page - 1) * page_size, page * page_size),
        meta: { page, page_size, total: items.length, total_pages: Math.ceil(items.length / page_size) },
      };
    },
    async createFee(token, input) {
      await ctx.wait();
      ctx.authenticate(token, true);
      const description = typeof input.description === 'string' ? input.description.trim() : '';
      const errors: Record<string, string[]> = {};
      if (!description || description.length > 120) errors.description = ['Informe a descrição (até 120 caracteres).'];
      if (!(typeof input.amount === 'number' && input.amount > 0 && Math.round(input.amount * 100) === input.amount * 100)) {
        errors.amount = ['Informe um valor maior que zero, com até 2 casas decimais.'];
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.due_date ?? '')) errors.due_date = ['Informe o vencimento.'];
      if (Object.keys(errors).length) throw new ApiError('Os dados informados são inválidos.', 422, errors);
      if (!ctx.db.members.some((item) => item.id === input.member_id)) throw new ApiError('Membro não encontrado.', 404);
      const fee: MockFee = {
        id: ctx.db.nextId++, member_id: input.member_id, description, amount: input.amount, due_date: input.due_date,
        status: 'pending', paid_at: null, payment_method: null, paid_via: null, created_at: new Date(ctx.now()).toISOString(),
      };
      ctx.db.fees.push(fee);
      ctx.persist();
      return toFee(fee);
    },
    async registerPayment(token, id, method) {
      await ctx.wait();
      ctx.authenticate(token, true);
      if (!['cash', 'pix', 'card', 'transfer'].includes(method)) invalid('method', 'Forma de pagamento inválida.');
      const fee = pendingFee(id);
      Object.assign(fee, { status: 'paid', paid_at: new Date(ctx.now()).toISOString(), payment_method: method, paid_via: 'admin' });
      ctx.persist();
      return toFee(fee);
    },
    async deleteFee(token, id) {
      await ctx.wait();
      ctx.authenticate(token, true);
      pendingFee(id);
      ctx.db.fees = ctx.db.fees.filter((item) => item.id !== id);
      ctx.persist();
    },
    async pendingMembers(token) {
      await ctx.wait();
      ctx.authenticate(token, true);
      const groups = new Map<number, Fee[]>();
      for (const fee of ctx.db.fees.map(toFee).filter((item) => item.status === 'pending')) {
        groups.set(fee.member.id, [...(groups.get(fee.member.id) ?? []), fee]);
      }
      return [...groups.values()].map((fees) => ({
        member: fees[0].member,
        pending_count: fees.length,
        pending_total: fees.reduce((sum, item) => sum + item.amount, 0),
        overdue_count: fees.filter((item) => item.overdue).length,
        oldest_due_date: fees.map((item) => item.due_date).sort()[0],
      })).sort((a, b) => a.oldest_due_date.localeCompare(b.oldest_due_date) || a.member.name.localeCompare(b.member.name));
    },

    // ---------- Perfil de jogo e parceiros (US23-US25) ----------
    async getPlayerProfile(token) {
      await ctx.wait();
      return profileOf(ctx.authenticate(token).user.id);
    },
    async savePlayerProfile(token, profile) {
      await ctx.wait();
      const user = ctx.authenticate(token).user;
      if (profile.skill_level !== null && !LEVELS.includes(profile.skill_level)) invalid('skill_level', 'Nível inválido.');
      const keys = new Set<string>();
      for (const slot of profile.availability) {
        if (!Number.isInteger(slot.weekday) || slot.weekday < 0 || slot.weekday > 6 || !PERIODS.includes(slot.period)) {
          invalid('availability', 'Dia ou período inválido.');
        }
        keys.add(`${slot.weekday}-${slot.period}`);
      }
      if (keys.size !== profile.availability.length) invalid('availability', 'Cada dia e período só pode aparecer uma vez.');
      const saved = { user_id: user.id, skill_level: profile.skill_level, availability: sortSlots(profile.availability) };
      ctx.db.profiles = [...ctx.db.profiles.filter((item) => item.user_id !== user.id), saved];
      ctx.persist();
      return profileOf(user.id);
    },
    async listPartners(token) {
      await ctx.wait();
      const user = ctx.authenticate(token).user;
      const me = profileOf(user.id);
      if (!me.skill_level) {
        const message = 'Informe seu nível de habilidade para encontrar parceiros.';
        throw new ApiError(message, 409, { skill_level: [message] });
      }
      const rank = LEVELS.indexOf(me.skill_level);
      const mine = new Set(me.availability.map((slot) => `${slot.weekday}-${slot.period}`));
      return ctx.db.profiles
        .filter((item) => item.user_id !== user.id && item.skill_level && Math.abs(LEVELS.indexOf(item.skill_level) - rank) <= 1)
        .map((item) => {
          const name = ctx.db.accounts.find((account) => account.user.id === item.user_id)?.user.name ?? 'Jogador';
          const shared = sortSlots(item.availability.filter((slot) => mine.has(`${slot.weekday}-${slot.period}`)));
          return { id: item.user_id, name, skill_level: item.skill_level as SkillLevel, shared_availability: shared };
        })
        .filter((item) => mine.size === 0 || item.shared_availability.length > 0)
        .sort((a, b) =>
          b.shared_availability.length - a.shared_availability.length ||
          Math.abs(LEVELS.indexOf(a.skill_level) - rank) - Math.abs(LEVELS.indexOf(b.skill_level) - rank) ||
          a.name.localeCompare(b.name));
    },
    async invitePlayer(token, bookingId, playerId) {
      await ctx.wait();
      const account = ctx.authenticate(token);
      const found = ctx.db.bookings.find((item) => item.id === bookingId);
      const involved = found && (found.organizer_id === account.user.id || found.participants.some((item) => item.user_id === account.user.id));
      if (!found || (!account.admin && !involved)) throw new ApiError('Reserva não encontrada.', 404);
      if (found.organizer_id !== account.user.id && !account.admin) {
        throw new ApiError('Somente quem fez a reserva ou um administrador pode alterá-la.', 403);
      }
      if (found.status !== 'active' || Date.parse(found.starts_at) <= ctx.now()) {
        throw new ApiError('Reservas que já começaram ou foram canceladas não podem ser alteradas.', 409);
      }
      if (!ctx.db.accounts.some((item) => item.user.id === playerId)) invalid('player_ids', 'Jogador não encontrado.');
      if (found.participants.some((item) => item.user_id === playerId)) throw new ApiError('Esse jogador já está nesta reserva.', 409);
      const court = ctx.db.courts.find((item) => item.id === found.court_id);
      if (found.participants.length + 1 > (court?.max_players ?? 4)) {
        invalid('player_ids', `Esta quadra comporta até ${court?.max_players ?? 4} jogadores, contando quem reservou.`);
      }
      found.participants.push({ user_id: playerId, attendance: 'pending' });
      ctx.persist();
      return toBooking(ctx, found, account.user.id);
    },

    // ---------- Administração da agenda (US26-US30) ----------
    async listClubBookings(token, query) {
      await ctx.wait();
      const viewer = ctx.authenticate(token, true).user;
      const now = ctx.now();
      const upcoming = (item: { status: string; ends_at: string }) => item.status === 'active' && Date.parse(item.ends_at) > now;
      return ctx.db.bookings
        .filter((item) => (query.scope === 'upcoming' ? upcoming(item) : !upcoming(item)))
        .filter((item) => !query.court_id || item.court_id === query.court_id)
        .filter((item) => (!query.from || clubDate(item.starts_at) >= query.from) && (!query.to || clubDate(item.starts_at) <= query.to))
        .sort((a, b) => (query.scope === 'upcoming' ? 1 : -1) * (Date.parse(a.starts_at) - Date.parse(b.starts_at)))
        .map((item) => {
          const booking = toBooking(ctx, item, viewer.id);
          if (item.status === 'active' && Date.parse(item.ends_at) <= now) booking.status = 'completed';
          return booking;
        });
    },
    async occupancyReport(token, from, to) {
      await ctx.wait();
      ctx.authenticate(token, true);
      if (from > to) invalid('from', 'A data inicial deve ser anterior à final.');
      const days: string[] = [];
      for (let day = from; day <= to; day = addDays(day, 1)) days.push(day);
      if (days.length > MAX_REPORT_DAYS) invalid('to', `Escolha um período de até ${MAX_REPORT_DAYS} dias.`);

      const empty = (): { booked: number; available: number } => ({ booked: 0, available: 0 });
      const usage = (cell: { booked: number; available: number }): Usage => ({
        booked_hours: Math.round((cell.booked / 60) * 100) / 100,
        available_hours: Math.round((cell.available / 60) * 100) / 100,
        occupancy_rate: cell.available ? Math.round((cell.booked / cell.available) * 10000) / 10000 : 0,
      });
      const overlap = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
        Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart)) / 60000;
      const weekdays = Array.from({ length: 7 }, empty);
      const hours = new Map<number, ReturnType<typeof empty>>();
      for (let hour = FIRST_HOUR; hour <= LAST_HOUR; hour += 1) hours.set(hour, empty());
      const total = empty();
      let bookingsCount = 0;
      let cancelled = 0;
      const inRange = (iso: string) => clubDate(iso) >= from && clubDate(iso) <= to;
      for (const item of ctx.db.bookings) {
        if (!inRange(item.starts_at)) continue;
        if (item.status === 'cancelled') cancelled += 1;
        else bookingsCount += 1;
      }
      const courts = ctx.db.courts.map((court) => {
        const cell = empty();
        let blocked = 0;
        const active = ctx.db.bookings.filter((item) => item.court_id === court.id && item.status === 'active' && inRange(item.starts_at));
        for (const day of days) {
          const weekday = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7; // 0 = segunda
          for (let hour = FIRST_HOUR; hour <= LAST_HOUR; hour += 1) {
            const start = Date.parse(fromClubLocal(`${day}T${String(hour).padStart(2, '0')}:00`));
            const end = start + 3600000;
            const lost = Math.min(60, court.maintenance.reduce((sum, item) => sum + overlap(start, end, Date.parse(item.starts_at), Date.parse(item.ends_at)), 0));
            const available = 60 - lost;
            const booked = Math.min(available, active.reduce((sum, item) => sum + overlap(start, end, Date.parse(item.starts_at), Date.parse(item.ends_at)), 0));
            blocked += lost;
            for (const target of [cell, weekdays[weekday], hours.get(hour)!, total]) {
              target.booked += booked;
              target.available += available;
            }
          }
        }
        return {
          ...usage(cell), court: { id: court.id, name: court.name },
          blocked_hours: Math.round((blocked / 60) * 100) / 100, bookings: active.length,
        };
      }).sort((a, b) => b.occupancy_rate - a.occupancy_rate || a.court.name.localeCompare(b.court.name));
      const report: OccupancyReport = {
        period: { from, to, days: days.length },
        totals: { ...usage(total), bookings: bookingsCount, cancelled },
        courts,
        by_weekday: weekdays.map((cell, weekday) => ({ ...usage(cell), weekday })),
        by_hour: [...hours.entries()].map(([hour, cell]) => ({ ...usage(cell), hour })),
      };
      return report;
    },
  };
}
