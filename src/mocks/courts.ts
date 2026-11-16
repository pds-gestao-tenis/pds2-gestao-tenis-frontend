import { ApiError } from '../api/error';
import type { ApiServices, Court, CourtInput, MaintenanceInput } from '../api/types';
import { courtErrors } from '../lib/court-rules';
import type { MockContext } from './context';

const KEYS = ['name', 'address', 'size_m2', 'max_players', 'hourly_price', 'surface', 'covered'];
const MAINTENANCE_KEYS = ['starts_at', 'ends_at', 'reason', 'cancel_bookings'];
const HOUR = 3600000;

function invalid(field: string, message: string): never {
  throw new ApiError('Os dados informados são inválidos.', 422, { [field]: [message] });
}

const copy = (court: Court): Court => ({ ...court, maintenance: court.maintenance.map((item) => ({ ...item })) });

type CourtServices = 'listCourts' | 'getCourt' | 'createCourt' | 'updateCourt' | 'deleteCourt' | 'addMaintenance' | 'removeMaintenance';

export function courtHandlers(ctx: MockContext): Pick<ApiServices, CourtServices> {
  // Mesmas regras do backend: o modo mock responde como a API real.
  function validate(input: Partial<CourtInput>, partial: boolean): Partial<CourtInput> {
    for (const key of Object.keys(input)) {
      if (!KEYS.includes(key)) invalid(key, 'Este campo não pode ser informado.');
    }
    if (partial && Object.keys(input).length === 0) invalid('body', 'Informe ao menos um campo para atualizar.');
    const errors = courtErrors(input, partial);
    const fields = Object.entries(errors).map(([field, message]) => [field, [message]]);
    if (fields.length > 0) throw new ApiError('Os dados informados são inválidos.', 422, Object.fromEntries(fields));
    const values: Partial<CourtInput> = { ...input };
    if (values.name !== undefined) values.name = values.name.trim();
    if (values.address !== undefined) values.address = values.address.trim();
    return values;
  }

  function uniqueName(name: string | undefined, id?: number) {
    if (name && ctx.db.courts.some((court) => court.id !== id && court.name.toLowerCase() === name.toLowerCase())) {
      const message = 'Já existe uma quadra com este nome.';
      throw new ApiError(message, 409, { name: [message] });
    }
  }

  function findCourt(id: number) {
    const court = Number.isSafeInteger(id) ? ctx.db.courts.find((item) => item.id === id) : undefined;
    if (!court) throw new ApiError('Quadra não encontrada.', 404);
    return court;
  }

  return {
    async listCourts(token) {
      await ctx.wait();
      ctx.authenticate(token);
      return ctx.db.courts.map(copy);
    },
    async getCourt(token, id) {
      await ctx.wait();
      ctx.authenticate(token);
      return copy(findCourt(id));
    },
    async deleteCourt(token, id) {
      await ctx.wait();
      ctx.authenticate(token, true);
      const court = findCourt(id);
      const now = ctx.now();
      const pending = ctx.db.bookings.some((item) => item.court_id === court.id && item.status === 'active' && Date.parse(item.ends_at) > now)
        || ctx.db.waitlist.some((entry) => entry.court_id === court.id && Date.parse(entry.starts_at) + HOUR > now);
      if (pending) {
        throw new ApiError('A quadra tem reservas ou pedidos na fila que ainda não terminaram. Cancele-os antes de excluir.', 409);
      }
      // Como no backend, o histórico de reservas da quadra vai junto.
      ctx.db.courts = ctx.db.courts.filter((item) => item.id !== court.id);
      ctx.db.bookings = ctx.db.bookings.filter((item) => item.court_id !== court.id);
      ctx.db.waitlist = ctx.db.waitlist.filter((entry) => entry.court_id !== court.id);
      ctx.persist();
    },
    async createCourt(token, input) {
      await ctx.wait();
      ctx.authenticate(token, true);
      const values = validate(input, false);
      uniqueName(values.name);
      const court: Court = { id: ctx.db.nextId++, ...(values as CourtInput), maintenance: [] };
      ctx.db.courts.push(court);
      ctx.persist();
      return copy(court);
    },
    async updateCourt(token, id, input) {
      await ctx.wait();
      ctx.authenticate(token, true);
      const values = validate(input, true);
      const court = Number.isSafeInteger(id) ? ctx.db.courts.find((item) => item.id === id) : undefined;
      if (!court) throw new ApiError('Quadra não encontrada.', 404);
      uniqueName(values.name, id);
      Object.assign(court, values);
      ctx.persist();
      return copy(court);
    },
    async addMaintenance(token, id, input: MaintenanceInput) {
      await ctx.wait();
      ctx.authenticate(token, true);
      for (const key of Object.keys(input)) {
        if (!MAINTENANCE_KEYS.includes(key)) invalid(key, 'Este campo não pode ser informado.');
      }
      const start = typeof input.starts_at === 'string' ? Date.parse(input.starts_at) : NaN;
      const end = typeof input.ends_at === 'string' ? Date.parse(input.ends_at) : NaN;
      if (Number.isNaN(start)) invalid('starts_at', 'Informe o início da manutenção.');
      if (Number.isNaN(end)) invalid('ends_at', 'Informe o fim da manutenção.');
      if (end <= start) invalid('ends_at', 'O fim precisa ser depois do início.');
      const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
      const size = Array.from(reason).length;
      if (size < 1 || size > 200) invalid('reason', 'Informe um motivo de 1 a 200 caracteres.');
      if (input.cancel_bookings !== undefined && typeof input.cancel_bookings !== 'boolean') {
        invalid('cancel_bookings', 'Valor inválido.');
      }
      const court = findCourt(id);
      // Sobreposição: início < fim do outro e início do outro < fim. Só reservas que ainda não começaram.
      const now = ctx.now();
      const affected = ctx.db.bookings.filter((item) => item.court_id === court.id && item.status === 'active'
        && Date.parse(item.starts_at) > now && start < Date.parse(item.ends_at) && Date.parse(item.starts_at) < end);
      if (affected.length > 0 && input.cancel_bookings !== true) {
        const message = `Há ${affected.length} reserva(s) nesse período.`;
        throw new ApiError(message, 409, { cancel_bookings: [message] });
      }
      for (const booking of affected) booking.status = 'cancelled';
      ctx.db.waitlist = ctx.db.waitlist.filter((entry) => !(entry.court_id === court.id
        && start < Date.parse(entry.starts_at) + HOUR && Date.parse(entry.starts_at) < end));
      court.maintenance.push({
        id: ctx.db.nextId++,
        starts_at: new Date(start).toISOString(),
        ends_at: new Date(end).toISOString(),
        reason,
      });
      ctx.persist();
      return copy(court);
    },
    async removeMaintenance(token, id, maintenanceId) {
      await ctx.wait();
      ctx.authenticate(token, true);
      const court = findCourt(id);
      const index = court.maintenance.findIndex((item) => item.id === maintenanceId);
      if (index < 0) throw new ApiError('Manutenção não encontrada.', 404);
      court.maintenance.splice(index, 1);
      ctx.persist();
      return copy(court);
    },
  };
}
