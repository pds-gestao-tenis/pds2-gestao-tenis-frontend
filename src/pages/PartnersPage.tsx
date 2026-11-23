import { useId, useRef, useState, type FormEvent } from 'react';
import { listBookings } from '../api/bookings';
import { errorMessage, isExpired } from '../api/error';
import { getPlayerProfile, invitePlayer, listCompatiblePlayers } from '../api/players';
import type { Booking, CompatiblePlayer, Session } from '../api/types';
import { LoadError, Loading } from '../components/LoadStatus';
import { LEVELS, PlayerProfileForm, WEEKDAYS } from '../components/PlayerProfileForm';
import { useLoad } from '../hooks/useLoad';
import { formatClubDateTime } from '../lib/club-time';
import { bookingPath, routePaths } from '../navigation';

export function PartnersPage({ session, onExpired }: { session: Session; onExpired: () => void }) {
  const { state, reload } = useLoad(`partners:${session.token}`, async () => {
    const [profile, players, bookings] = await Promise.all([getPlayerProfile(session.token), listCompatiblePlayers(session.token), listBookings(session.token, 'upcoming')]);
    return { profile, players, bookings };
  }, onExpired);
  const [editing, setEditing] = useState(false);
  const [inviting, setInviting] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  const data = state.status === 'ready' ? state.data : state.status === 'loading' ? state.previous : undefined;
  return <>
    <div className="page-heading"><p className="eyebrow">Dentro de quadra</p><h1>Encontrar parceiros</h1><p>Encontre jogadores com nível próximo ao seu e disponibilidade em comum.</p></div>
    {notice && <p role="status" className="notice">{notice}</p>}
    {state.status === 'loading' && !data && <Loading>Carregando jogadores…</Loading>}
    {state.status === 'error' && <LoadError message={state.message} onRetry={reload} />}
    {data && <>
      {editing ? <PlayerProfileForm profile={data.profile} token={session.token} onSaved={() => { setEditing(false); setNotice('Perfil atualizado.'); reload(); }} onCancel={() => setEditing(false)} onExpired={onExpired} /> : <section className="content-panel"><div className="panel-heading"><h2>Seu perfil de jogador</h2><button className="button button--secondary" type="button" onClick={() => setEditing(true)}>Editar perfil</button></div><p>{data.profile.level ? `${data.profile.level} · ${LEVELS[data.profile.level - 1]}` : 'Nível ainda não informado'}</p><p className="muted">{data.profile.availability.length ? `${data.profile.availability.length} dia(s) com disponibilidade informada.` : 'Informe seu nível e os dias em que costuma jogar para aparecer na busca.'}</p></section>}
      <section className="content-panel" aria-label="Jogadores compatíveis"><h2>Jogadores compatíveis</h2><p className="muted">Níveis iguais ou com diferença de até 1, com pelo menos uma hora semanal em comum. A disponibilidade informada não garante uma quadra livre.</p>
        {data.players.length === 0 ? <p>Nenhum jogador compatível encontrado. Você pode atualizar seu perfil e consultar novamente.</p> : <div className="partner-grid">{data.players.map((player) => <article className="fee-card" key={player.id} aria-label={player.name}><h3>{player.name}</h3><span className="badge">Nível {player.level} · {LEVELS[player.level - 1]}</span><ul className="common-times">{player.common_availability.map((slot) => <li key={slot.weekday}>{WEEKDAYS[slot.weekday]} · {slot.start_time}–{slot.end_time}</li>)}</ul>
          {inviting === player.id ? <InviteForm player={player} bookings={data.bookings.filter((booking) => booking.my_role === 'organizer' && booking.status === 'active' && Date.parse(booking.starts_at) > Date.now() && booking.participants.length < 4 && !booking.participants.some((item) => item.id === player.id))} token={session.token} onDone={(booking) => { setInviting(null); setNotice(`Convite enviado para ${player.name}. A confirmação aparece na reserva.`); reload(); window.location.hash = bookingPath(booking.id); }} onCancel={() => setInviting(null)} onExpired={onExpired} /> : <button className="button button--secondary" type="button" onClick={() => setInviting(player.id)}>Convidar para jogar</button>}
        </article>)}</div>}
        <button className="text-link" type="button" disabled={state.status === 'loading'} onClick={reload}>Atualizar jogadores</button>
      </section>
    </>}
  </>;
}

function InviteForm({ player, bookings, token, onDone, onCancel, onExpired }: { player: CompatiblePlayer; bookings: Booking[]; token: string; onDone: (booking: Booking) => void; onCancel: () => void; onExpired: () => void }) {
  const id = useId();
  const [bookingId, setBookingId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sending = useRef(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending.current) return;
    if (!bookingId) return setError('Escolha uma reserva para enviar o convite.');
    sending.current = true; setBusy(true); setError('');
    try { onDone(await invitePlayer(token, Number(bookingId), player.id)); }
    catch (failure) { if (isExpired(failure)) return onExpired(); setError(errorMessage(failure, 'Não foi possível enviar o convite.')); }
    finally { sending.current = false; setBusy(false); }
  }
  return <form onSubmit={submit} className="payment-form" aria-label={`Convidar ${player.name}`}>
    {error && <p className="alert" role="alert">{error}</p>}
    {bookings.length === 0 ? <p>Nenhuma reserva sua disponível para este convite. <a className="text-link" href={routePaths.schedule}>Reserve um horário</a> ou consulte suas reservas.</p> : <div className="field"><label htmlFor={id}>Reserva para o convite</label><select id={id} value={bookingId} onChange={(event) => setBookingId(event.target.value)}><option value="">Selecione uma reserva</option>{bookings.map((booking) => <option value={booking.id} key={booking.id}>{booking.court.name} · {formatClubDateTime(booking.starts_at)}</option>)}</select></div>}
    <div className="form-actions">{bookings.length > 0 && <button className="button" type="submit" disabled={busy}>{busy ? 'Enviando…' : 'Enviar convite'}</button>}<button className="button button--secondary" type="button" onClick={onCancel} disabled={busy}>Cancelar</button></div>
  </form>;
}
