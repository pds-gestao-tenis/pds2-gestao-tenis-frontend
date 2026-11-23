import { ApiError } from '../api/error';
import type { ApiServices, ClubBookingQuery } from '../api/types';
import { clubDate, fromClubLocal } from '../lib/club-time';
import type { MockContext } from './context';
import { bookingHandlers, withStatus } from './bookings';

const DAY = 86400000;
function range(query: Pick<ClubBookingQuery, 'from' | 'to'>) {
  const valid = (value: string) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
  if (!valid(query.from) || !valid(query.to) || query.to < query.from || Date.parse(query.to) - Date.parse(query.from) > 365 * DAY) throw new ApiError('Escolha um período válido de até 366 dias.', 422);
  return Array.from({ length: Math.round((Date.parse(query.to) - Date.parse(query.from)) / DAY) + 1 }, (_, i) => new Date(Date.parse(`${query.from}T12:00:00Z`) + i * DAY).toISOString().slice(0, 10));
}
export function administrationHandlers(ctx: MockContext): Pick<ApiServices, 'listClubBookings' | 'cancelClubBooking' | 'rescheduleClubBooking' | 'getOccupancy'> {
  const mutations = bookingHandlers(ctx, true);
  return {
    cancelClubBooking: mutations.cancelBooking,
    rescheduleClubBooking: mutations.rescheduleBooking,
    async listClubBookings(token, query) {
      await ctx.wait();
      const viewer = ctx.authenticate(token, true).user;
      range(query);
      if (Object.keys(query).some((key) => !['from', 'to', 'court_id', 'status'].includes(key)) || (query.status !== undefined && !['active', 'cancelled', 'completed'].includes(query.status)) || (query.court_id !== undefined && (!Number.isSafeInteger(query.court_id) || query.court_id < 1))) throw new ApiError('Filtro inválido.', 422);
      return ctx.db.bookings.filter((item) => clubDate(item.starts_at) >= query.from && clubDate(item.starts_at) <= query.to && (!query.court_id || item.court_id === query.court_id))
        .map((item) => withStatus(ctx, item, viewer.id)).filter((item) => !query.status || item.status === query.status)
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.court.id - b.court.id);
    },
    async getOccupancy(token, query) {
      await ctx.wait();
      ctx.authenticate(token, true);
      if (Object.keys(query).some((key) => !['from', 'to'].includes(key))) throw new ApiError('Filtro inválido.', 422);
      const days = range(query);
      return ctx.db.courts.map((court) => {
        let available_hours = 0, booked_hours = 0, blocked_hours = 0;
        // Mesma unidade da agenda: cada faixa de uma hora tocada pelo bloqueio fica indisponível.
        for (const day of days) for (let hour = 7; hour <= 21; hour++) {
          const start = Date.parse(fromClubLocal(`${day}T${String(hour).padStart(2, '0')}:00`));
          const blocked = court.maintenance.some((item) => start < Date.parse(item.ends_at) && Date.parse(item.starts_at) < start + 3600000);
          if (blocked) { blocked_hours++; continue; }
          available_hours++;
          if (ctx.db.bookings.some((item) => item.court_id === court.id && item.status === 'active' && Date.parse(item.starts_at) === start)) booked_hours++;
        }
        return { court: { id: court.id, name: court.name }, available_hours, booked_hours, blocked_hours,
          cancelled_bookings: ctx.db.bookings.filter((item) => item.court_id === court.id && item.status === 'cancelled' && clubDate(item.starts_at) >= query.from && clubDate(item.starts_at) <= query.to).length,
          occupancy_percent: available_hours ? Math.round(booked_hours / available_hours * 1000) / 10 : 0 };
      });
    },
  };
}
