import { useState } from 'react';
import { listBookings } from '../api/bookings';
import type { Booking, Session } from '../api/types';
import { useLoad } from '../hooks/useLoad';
import { clubDateLabel, clubTime } from '../lib/club-time';
import { routePaths } from '../navigation';
import { AttendanceActions } from './AttendanceActions';
import { BookingCard } from './BookingCard';

type Props = { session: Session; onExpired: () => void; now?: () => number };

/** Convites que ainda esperam resposta: reserva futura e ativa, em que a conta joga e não respondeu. */
export function pendingInvites(bookings: Booking[], userId: number, now: number): Booking[] {
  return bookings.filter((booking) =>
    booking.my_role === 'participant' &&
    booking.status === 'active' &&
    Date.parse(booking.starts_at) > now &&
    booking.participants.some((player) => player.id === userId && player.attendance === 'pending'));
}

/** Aviso no Início com os convites para partidas que ainda não foram respondidos. */
export function PendingInvites({ session, onExpired, now = Date.now }: Props) {
  const { state } = useLoad('pending-invites', () => listBookings(session.token, 'upcoming'), onExpired);
  const [answered, setAnswered] = useState<Record<number, Booking>>({});
  const [notice, setNotice] = useState('');

  // Sem convites (ou falha ao carregar), o Início segue sem o aviso: as reservas continuam em "Minhas reservas".
  if (state.status !== 'ready') return null;
  const invites = pendingInvites(state.data, session.user.id, now()).filter((booking) => !answered[booking.id]);
  if (invites.length === 0 && !notice) return null;

  function handleAnswer(booking: Booking) {
    setAnswered((current) => ({ ...current, [booking.id]: booking }));
    const mine = booking.participants.find((player) => player.id === session.user.id);
    const when = `${booking.court.name}, ${clubDateLabel(booking.starts_at)} às ${clubTime(booking.starts_at)}`;
    setNotice(mine?.attendance === 'declined' ? `Você avisou que não vai à partida em ${when}.` : `Presença confirmada na partida em ${when}.`);
  }

  return (
    <section className="pending-invites" aria-labelledby="pending-invites-title">
      <div className="section-heading">
        <h2 id="pending-invites-title">
          {invites.length === 0
            ? 'Convites respondidos'
            : invites.length === 1 ? '1 convite para responder' : `${invites.length} convites para responder`}
        </h2>
        <a className="text-link" href={routePaths.bookings}>Ver minhas reservas <span aria-hidden="true">→</span></a>
      </div>
      {notice && <p className="notice" role="status">{notice}</p>}
      {invites.length > 0 && (
        <div className="booking-list">
          {invites.map((booking) => (
            <BookingCard key={booking.id} booking={booking}>
              <AttendanceActions booking={booking} session={session} onChange={handleAnswer} onExpired={onExpired} now={now} />
            </BookingCard>
          ))}
        </div>
      )}
    </section>
  );
}
