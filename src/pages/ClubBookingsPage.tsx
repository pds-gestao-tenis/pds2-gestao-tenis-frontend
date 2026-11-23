import { useState } from 'react';
import { cancelBooking } from '../api/bookings';
import { listCourts } from '../api/courts';
import { listClubBookings } from '../api/extras';
import { isExpired } from '../api/error';
import type { Booking, ClubBookingQuery, Session } from '../api/types';
import { AccessStatus } from '../components/AccessStatus';
import { ConfirmAction } from '../components/ConfirmAction';
import { LoadError, Loading } from '../components/LoadStatus';
import { panelId, tabId, Tabs } from '../components/Tabs';
import { useLoad } from '../hooks/useLoad';
import type { MemberAccess } from '../hooks/useMemberAccess';
import { clubDateLabel, clubTime } from '../lib/club-time';
import { bookingPath, reschedulePath, routePaths } from '../navigation';

type Props = { session: Session; access: MemberAccess; onRetry: () => void; onExpired: () => void };
type Scope = ClubBookingQuery['scope'];

const STATUS: Record<Booking['status'], { label: string; className: string }> = {
  active: { label: 'Confirmada', className: 'badge badge--active' },
  completed: { label: 'Concluída', className: 'badge' },
  cancelled: { label: 'Cancelada', className: 'badge badge--danger' },
};

/** US26 (agenda centralizada), US27 (cancelar ou alterar) e US29 (histórico). */
function ClubBookings({ session, scope, onExpired }: { session: Session; scope: Scope; onExpired: () => void }) {
  const [filters, setFilters] = useState({ court_id: '', from: '', to: '' });
  const query: ClubBookingQuery = {
    scope,
    ...(filters.court_id ? { court_id: Number(filters.court_id) } : {}),
    ...(filters.from ? { from: filters.from } : {}),
    ...(filters.to ? { to: filters.to } : {}),
  };
  const { state, reload } = useLoad(`club-bookings:${JSON.stringify(query)}`, () => listClubBookings(session.token, query), onExpired);
  const courts = useLoad('club-bookings-courts', () => listCourts(session.token), onExpired).state;
  const [cancelling, setCancelling] = useState<number | null>(null);
  const [notice, setNotice] = useState('');

  async function cancel(booking: Booking) {
    try {
      await cancelBooking(session.token, booking.id);
    } catch (error) {
      if (isExpired(error)) return onExpired();
      throw error;
    }
    setCancelling(null);
    setNotice(`Reserva de ${booking.organizer.name} cancelada. Os jogadores foram avisados.`);
    reload();
  }

  const list = state.status === 'ready' ? state.data : state.status === 'loading' ? state.previous : undefined;
  return (
    <>
      {notice && <p className="notice" role="status">{notice}</p>}
      <div className="member-filters" role="search" aria-label="Filtrar reservas">
        <div className="field member-status-filter">
          <label htmlFor={`${scope}-court`}>Quadra</label>
          <select
            id={`${scope}-court`} value={filters.court_id}
            onChange={(event) => setFilters({ ...filters, court_id: event.target.value })}
          >
            <option value="">Todas</option>
            {courts.status === 'ready' && courts.data.map((court) => <option key={court.id} value={court.id}>{court.name}</option>)}
          </select>
        </div>
        <div className="field member-status-filter">
          <label htmlFor={`${scope}-from`}>De</label>
          <input id={`${scope}-from`} type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} />
        </div>
        <div className="field member-status-filter">
          <label htmlFor={`${scope}-to`}>Até</label>
          <input id={`${scope}-to`} type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} />
        </div>
      </div>
      {state.status === 'error' ? (
        <LoadError message={state.message} onRetry={reload} />
      ) : !list ? (
        <Loading>Carregando reservas…</Loading>
      ) : list.length === 0 ? (
        <p className="muted">{scope === 'upcoming' ? 'Nenhuma reserva futura neste filtro.' : 'Nenhuma reserva no histórico deste filtro.'}</p>
      ) : (
        <>
          <p className="muted member-count" aria-live="polite">{list.length} {list.length === 1 ? 'reserva' : 'reservas'}</p>
          <table className="member-table">
            <thead>
              <tr>
                <th scope="col">Horário</th>
                <th scope="col">Quadra</th>
                <th scope="col">Organizador</th>
                <th scope="col">Jogadores</th>
                <th scope="col">Situação</th>
                <th scope="col"><span className="visually-hidden">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {list.map((booking) => {
                const confirmed = booking.participants.filter((item) => item.attendance === 'confirmed').length;
                const editable = booking.status === 'active' && Date.parse(booking.starts_at) > Date.now();
                return (
                  <tr key={booking.id}>
                    <th scope="row" data-label="Horário">
                      <a className="booking-link" href={bookingPath(booking.id)}>
                        {clubDateLabel(booking.starts_at)} · {clubTime(booking.starts_at)}–{clubTime(booking.ends_at)}
                      </a>
                    </th>
                    <td data-label="Quadra">{booking.court.name}</td>
                    <td data-label="Organizador">{booking.organizer.name}</td>
                    <td data-label="Jogadores">{confirmed} de {booking.participants.length} confirmados</td>
                    <td data-label="Situação"><span className={STATUS[booking.status].className}>{STATUS[booking.status].label}</span></td>
                    <td className="member-actions">
                      {!editable ? null : cancelling === booking.id ? (
                        <ConfirmAction
                          title="Cancelar esta reserva?"
                          description={`${booking.court.name}, ${clubDateLabel(booking.starts_at)} às ${clubTime(booking.starts_at)}, de ${booking.organizer.name}. Os jogadores serão avisados por e-mail.`}
                          confirmLabel="Cancelar reserva" keepLabel="Manter reserva" danger
                          onConfirm={() => cancel(booking)} onKeep={() => setCancelling(null)}
                        />
                      ) : (
                        <div className="form-actions">
                          <a className="button button--secondary" href={reschedulePath(booking.id)} aria-label={`Remarcar reserva de ${booking.organizer.name}`}>
                            Remarcar
                          </a>
                          <button
                            type="button" className="button button--secondary" aria-label={`Cancelar reserva de ${booking.organizer.name}`}
                            onClick={() => { setNotice(''); setCancelling(booking.id); }}
                          >
                            Cancelar
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}

export function ClubBookingsPage({ session, access, onRetry, onExpired }: Props) {
  const [scope, setScope] = useState<Scope>('upcoming');
  let content;
  if (access.status === 'allowed') {
    content = (
      <>
        <Tabs
          label="Reservas do clube" value={scope} onChange={(id) => setScope(id as Scope)}
          tabs={[{ id: 'upcoming', label: 'Agenda' }, { id: 'past', label: 'Histórico' }]}
        />
        <section id={panelId(scope)} role="tabpanel" aria-labelledby={tabId(scope)} className="tab-panel">
          <ClubBookings key={scope} session={session} scope={scope} onExpired={onExpired} />
        </section>
      </>
    );
  } else if (access.status === 'denied') {
    content = (
      <section className="content-panel empty-panel">
        <span className="badge">Acesso restrito</span>
        <h2>Área administrativa</h2>
        <p>As reservas de todo o clube estão disponíveis apenas para administradores.</p>
        <button type="button" className="button button--secondary" onClick={onRetry}>Verificar acesso novamente</button>
      </section>
    );
  } else {
    content = (
      <section className="content-panel empty-panel">
        <h2>{access.status === 'error' ? 'Acesso ainda não confirmado' : 'Verificando seu acesso'}</h2>
        <AccessStatus access={access} onRetry={onRetry} />
      </section>
    );
  }
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">Administração</p>
        <h1>Reservas do clube</h1>
        <p>Todas as reservas em um só lugar: acompanhe a agenda, consulte o histórico e cancele ou remarque quando necessário.</p>
      </div>
      {content}
      <a className="text-link" href={routePaths.home}>Voltar ao início <span aria-hidden="true">→</span></a>
    </>
  );
}
