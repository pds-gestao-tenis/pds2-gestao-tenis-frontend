import type { Attendance, Booking, WaitlistEntry } from './types';

/**
 * Tradução entre a agenda do backend e o contrato das telas.
 *
 * No backend, a fila de espera não é uma entidade à parte: é uma reserva com status "waitlisted",
 * promovida a "confirmed" automaticamente quando o horário fica livre (por ordem de pedido).
 * Por isso não existem ofertas para aceitar ou recusar, e cada entrada da fila tem o id da reserva.
 */

/** Reserva como a API devolve (BookingResponse). */
export type ApiBooking = {
  id: number;
  court: { id: number; name: string };
  organizer: { id: number; name: string };
  players: { id: number; name: string; attendance: Attendance }[];
  starts_at: string;
  ends_at: string;
  status: 'confirmed' | 'waitlisted' | 'cancelled';
  requested_at: string;
  cancelled_at: string | null;
  waitlist_position: number | null;
  duration_minutes: number;
  my_role: 'organizer' | 'participant' | null;
};

/** Reservas têm sempre 1 hora na grade do frontend. */
export const BOOKING_MINUTES = 60;

export function toBooking(item: ApiBooking, now: number): Booking {
  let status: Booking['status'] = 'active';
  if (item.status === 'cancelled') status = 'cancelled';
  // Confirmada que já terminou aparece como concluída, como no simulador.
  else if (item.status === 'confirmed' && Date.parse(item.ends_at) <= now) status = 'completed';
  // Quem organiza aparece primeiro, como nas telas; os demais vêm em ordem de nome.
  const organizer = item.players.filter((player) => player.id === item.organizer.id);
  const others = item.players.filter((player) => player.id !== item.organizer.id);
  return {
    id: item.id,
    court: { id: item.court.id, name: item.court.name },
    starts_at: item.starts_at,
    ends_at: item.ends_at,
    status,
    organizer: { id: item.organizer.id, name: item.organizer.name },
    participants: [...organizer, ...others].map(({ id, name, attendance }) => ({ id, name, attendance })),
    // null só para admin vendo reserva de outra pessoa, o que as telas não fazem.
    my_role: item.my_role ?? 'participant',
  };
}

export function toWaitlistEntry(item: ApiBooking): WaitlistEntry {
  return {
    id: item.id,
    court: { id: item.court.id, name: item.court.name },
    starts_at: item.starts_at,
    ends_at: item.ends_at,
    position: item.waitlist_position ?? 1,
    // A fila do backend confirma sozinha: nunca há oferta pendente.
    offer: null,
  };
}
