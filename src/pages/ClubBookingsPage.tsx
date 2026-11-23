import { useId, useState } from 'react';
import { cancelClubBooking, listClubBookings } from '../api/administration';
import { listCourts } from '../api/courts';
import { isExpired } from '../api/error';
import type { Booking, Session } from '../api/types';
import { AdminGate } from '../components/AdminGate';
import { AdminRescheduleForm } from '../components/AdminRescheduleForm';
import { ConfirmAction } from '../components/ConfirmAction';
import { DateRangeForm, type DateRange } from '../components/DateRangeForm';
import { LoadError, Loading } from '../components/LoadStatus';
import { useLoad } from '../hooks/useLoad';
import type { MemberAccess } from '../hooks/useMemberAccess';
import { clubDate, clubTime, formatClubDateTime } from '../lib/club-time';
import { routePaths } from '../navigation';

export function ClubBookingsPage({ session, access, onRetry, onExpired }: { session: Session; access: MemberAccess; onRetry: () => void; onExpired: () => void }) {
  return <><div className="page-heading"><p className="eyebrow">Administração</p><h1>Reservas do clube</h1><p>Consulte a agenda geral e o histórico de todas as quadras.</p></div><AdminGate access={access} onRetry={onRetry}><ClubBookings token={session.token} onExpired={onExpired} /></AdminGate></>;
}
function ClubBookings({ token, onExpired }: { token: string; onExpired: () => void }) {
  const id = useId();
  const today = clubDate(Date.now());
  const [range, setRange] = useState<DateRange>({ from: today, to: today });
  const [court, setCourt] = useState('');
  const [status, setStatus] = useState('');
  const [action, setAction] = useState<{ id: number; type: 'cancel' | 'edit' } | null>(null);
  const [notice, setNotice] = useState('');
  const { state, reload } = useLoad(`club-bookings:${token}:${range.from}:${range.to}:${court}:${status}`, async () => {
    const [bookings, courts] = await Promise.all([listClubBookings(token, { ...range, ...(court ? { court_id: Number(court) } : {}), ...(status ? { status: status as Booking['status'] } : {}) }), listCourts(token)]);
    return { bookings, courts };
  }, onExpired);
  function changeRange(value: DateRange) { setRange(value); setAction(null); }
  const data = state.status === 'ready' ? state.data : undefined;
  return <section className="content-panel" aria-label="Agenda administrativa">
    <div className="form-actions"><button className="button button--secondary" type="button" onClick={() => changeRange({ from: today, to: today })}>Agenda de hoje</button><button className="button button--secondary" type="button" onClick={() => changeRange({ from: clubDate(Date.now() - 30 * 86400000), to: clubDate(Date.now() - 86400000) })}>Histórico dos últimos 30 dias</button><a className="text-link" href={routePaths.courts}>Bloquear horário para evento ou manutenção</a></div>
    <DateRangeForm key={`${range.from}:${range.to}`} value={range} onChange={changeRange} />
    <div className="finance-fields"><div className="field"><label htmlFor={`${id}-court`}>Quadra</label><select id={`${id}-court`} value={court} onChange={(event) => { setCourt(event.target.value); setAction(null); }}><option value="">Todas as quadras</option>{data?.courts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><div className="field"><label htmlFor={`${id}-status`}>Situação</label><select id={`${id}-status`} value={status} onChange={(event) => { setStatus(event.target.value); setAction(null); }}><option value="">Todas as situações</option><option value="active">Ativa</option><option value="cancelled">Cancelada</option><option value="completed">Concluída</option></select></div></div>
    {notice && <p className="notice" role="status">{notice}</p>}
    {state.status === 'loading' && <Loading>Carregando reservas do clube…</Loading>}
    {state.status === 'error' && <LoadError message={state.message} onRetry={reload} />}
    {data && (data.bookings.length === 0 ? <p className="muted">Nenhuma reserva encontrada neste período.</p> : <div className="fee-list">{data.bookings.map((booking) => <article className="fee-card" key={booking.id} aria-label={`Reserva ${booking.id}`}>
      <div className="fee-card-heading"><h2>{booking.court.name} · {formatClubDateTime(booking.starts_at)}–{clubTime(booking.ends_at)}</h2><span className="badge">{booking.status === 'cancelled' ? 'Cancelada' : booking.status === 'completed' ? 'Concluída' : 'Ativa'}</span></div><p>Organizador: <strong>{booking.organizer.name}</strong></p><details className="payment-history"><summary>Participantes ({booking.participants.length})</summary><ul>{booking.participants.map((person) => <li key={person.id}>{person.name}<span>{person.attendance === 'confirmed' ? 'Confirmado' : person.attendance === 'declined' ? 'Recusado' : 'Pendente'}</span></li>)}</ul></details>
      {booking.status === 'active' && Date.parse(booking.starts_at) > Date.now() && (action?.id === booking.id ? action.type === 'edit' ? <AdminRescheduleForm booking={booking} token={token} onExpired={onExpired} onCancel={() => setAction(null)} onDone={() => { setAction(null); setNotice('Reserva alterada. Os participantes foram avisados.'); reload(); }} /> : <ConfirmAction title="Cancelar esta reserva?" description={`${booking.court.name} · ${formatClubDateTime(booking.starts_at)}. Os participantes serão avisados e a vaga será liberada para a fila de espera.`} confirmLabel="Confirmar cancelamento" keepLabel="Manter reserva" danger onKeep={() => setAction(null)} onConfirm={async () => { try { await cancelClubBooking(token, booking.id); setAction(null); setNotice('Reserva cancelada. Os participantes foram avisados.'); reload(); } catch (failure) { if (isExpired(failure)) return onExpired(); throw failure; } }} /> : <div className="form-actions"><button className="button button--secondary" type="button" onClick={() => setAction({ id: booking.id, type: 'edit' })}>Alterar reserva</button><button className="button button--danger" type="button" onClick={() => setAction({ id: booking.id, type: 'cancel' })}>Cancelar reserva</button></div>)}
    </article>)}</div>)}
    <button className="text-link" type="button" disabled={state.status === 'loading'} onClick={reload}>Atualizar agenda</button>
  </section>;
}
