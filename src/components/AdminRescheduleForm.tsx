import { useId, useRef, useState, type FormEvent } from 'react';
import { rescheduleClubBooking } from '../api/administration';
import { getSchedule } from '../api/bookings';
import { ApiError, errorMessage, isExpired } from '../api/error';
import type { Booking } from '../api/types';
import { useLoad } from '../hooks/useLoad';
import { clubDate, clubTime, formatClubDateTime, nextClubDays } from '../lib/club-time';
import { LoadError, Loading } from './LoadStatus';

export function AdminRescheduleForm({ booking, token, onDone, onCancel, onExpired }: { booking: Booking; token: string; onDone: () => void; onCancel: () => void; onExpired: () => void }) {
  const id = useId();
  const days = nextClubDays(Date.now(), 7);
  const [date, setDate] = useState(days.includes(clubDate(booking.starts_at)) ? clubDate(booking.starts_at) : days[0]);
  const [courtId, setCourtId] = useState(booking.court.id);
  const [start, setStart] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const { state, reload } = useLoad(`admin-slots:${token}:${date}`, () => getSchedule(token, date), onExpired);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending.current) return;
    if (!start) return setError('Escolha um novo horário livre.');
    sending.current = true; setBusy(true); setError('');
    try { await rescheduleClubBooking(token, booking.id, { court_id: courtId, starts_at: start }); onDone(); }
    catch (failure) { if (isExpired(failure)) return onExpired(); setError(errorMessage(failure, 'Não foi possível alterar a reserva.')); if (failure instanceof ApiError && failure.status === 409) { setStart(''); reload(); } }
    finally { sending.current = false; setBusy(false); }
  }
  return <form className="payment-form" onSubmit={submit} aria-label={`Alterar reserva ${booking.id}`}>
    <h3>Alterar reserva</h3><p>Atual: {booking.court.name} · {formatClubDateTime(booking.starts_at)}</p><p className="muted">Os participantes serão avisados e precisarão confirmar presença novamente.</p>
    {error && <p className="alert" role="alert">{error}</p>}
    <div className="finance-fields"><div className="field"><label htmlFor={`${id}-date`}>Novo dia</label><select id={`${id}-date`} value={date} onChange={(event) => { setDate(event.target.value); setStart(''); }}>{days.map((day) => <option key={day} value={day}>{day.split('-').reverse().join('/')}</option>)}</select></div>
    {state.status === 'loading' && <Loading>Consultando horários…</Loading>}{state.status === 'error' && <LoadError message={state.message} onRetry={reload} />}
    {state.status === 'ready' && <><div className="field"><label htmlFor={`${id}-court`}>Nova quadra</label><select id={`${id}-court`} value={courtId} onChange={(event) => { setCourtId(Number(event.target.value)); setStart(''); }}>{state.data.courts.map((court) => <option key={court.id} value={court.id}>{court.name}</option>)}</select></div><div className="field"><label htmlFor={`${id}-time`}>Novo horário</label><select id={`${id}-time`} value={start} onChange={(event) => setStart(event.target.value)}><option value="">Selecione um horário livre</option>{state.data.slots.filter((slot) => slot.court_id === courtId && slot.status === 'free' && Date.parse(slot.starts_at) > Date.now()).map((slot) => <option key={slot.starts_at} value={slot.starts_at}>{clubTime(slot.starts_at)}–{clubTime(slot.ends_at)}</option>)}</select></div></>}
    </div><div className="form-actions"><button className="button" type="submit" disabled={busy || state.status !== 'ready'}>{busy ? 'Alterando…' : 'Confirmar alteração'}</button><button className="button button--secondary" type="button" onClick={onCancel} disabled={busy}>Voltar</button></div>
  </form>;
}
