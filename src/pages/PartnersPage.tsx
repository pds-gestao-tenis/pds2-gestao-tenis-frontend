import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react';
import { listBookings } from '../api/bookings';
import { getPlayerProfile, invitePlayer, listPartners, savePlayerProfile } from '../api/extras';
import { ApiError, errorMessage, isExpired } from '../api/error';
import type { AvailabilitySlot, Booking, DayPeriod, Partner, PlayerProfile, Session, SkillLevel } from '../api/types';
import { LoadError, Loading } from '../components/LoadStatus';
import { useLoad } from '../hooks/useLoad';
import { clubDateLabel, clubTime } from '../lib/club-time';
import { PERIOD_HINTS, PERIOD_LABELS, SKILL_LABELS, WEEKDAY_LABELS, WEEKDAY_SHORT } from '../lib/labels';
import { routePaths } from '../navigation';

type Props = { session: Session; onExpired: () => void };
const PERIODS = Object.keys(PERIOD_LABELS) as DayPeriod[];
const key = (slot: AvailabilitySlot) => `${slot.weekday}-${slot.period}`;
const slotLabel = (slot: AvailabilitySlot) => `${WEEKDAY_SHORT[slot.weekday]} · ${PERIOD_LABELS[slot.period].toLowerCase()}`;

/** US23: nível de habilidade e quando a pessoa costuma jogar. */
function ProfileForm({ profile, token, onSaved, onExpired }: {
  profile: PlayerProfile; token: string; onSaved: (profile: PlayerProfile) => void; onExpired: () => void;
}) {
  const [level, setLevel] = useState<SkillLevel | ''>(profile.skill_level ?? '');
  const [slots, setSlots] = useState(() => new Set(profile.availability.map(key)));
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, startSaving] = useTransition();

  function toggle(slot: AvailabilitySlot) {
    const next = new Set(slots);
    if (next.has(key(slot))) next.delete(key(slot));
    else next.add(key(slot));
    setSlots(next);
    setNotice('');
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setError('');
    setNotice('');
    const availability = [...slots].map((item) => {
      const [weekday, period] = item.split('-');
      return { weekday: Number(weekday), period: period as DayPeriod };
    });
    startSaving(async () => {
      try {
        onSaved(await savePlayerProfile(token, { skill_level: level || null, availability }));
        setNotice('Perfil salvo.');
      } catch (failure) {
        if (isExpired(failure)) return onExpired();
        setError(errorMessage(failure, 'Não foi possível salvar o perfil. Tente de novo.'));
      }
    });
  }

  return (
    <form className="content-panel court-form" onSubmit={submit} noValidate aria-labelledby="profile-title">
      <h2 id="profile-title">Meu perfil de jogo</h2>
      {error && <p className="alert" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}
      <div className="field">
        <label htmlFor="skill-level">Nível de habilidade</label>
        <select id="skill-level" value={level} onChange={(event) => { setLevel(event.target.value as SkillLevel | ''); setNotice(''); }}>
          <option value="">Prefiro não informar</option>
          {(Object.keys(SKILL_LABELS) as SkillLevel[]).map((value) => <option key={value} value={value}>{SKILL_LABELS[value]}</option>)}
        </select>
      </div>
      <fieldset className="availability">
        <legend>Quando costumo jogar</legend>
        <table className="availability-grid">
          <thead>
            <tr>
              <td />
              {PERIODS.map((period) => (
                <th key={period} scope="col">{PERIOD_LABELS[period]}<span className="field-hint">{PERIOD_HINTS[period]}</span></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {WEEKDAY_LABELS.map((day, weekday) => (
              <tr key={day}>
                <th scope="row">{day}</th>
                {PERIODS.map((period) => {
                  const slot = { weekday, period };
                  return (
                    <td key={period}>
                      <input
                        type="checkbox" aria-label={`${day} à ${PERIOD_LABELS[period].toLowerCase()}`}
                        checked={slots.has(key(slot))} onChange={() => toggle(slot)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </fieldset>
      <div className="form-actions">
        <button type="submit" className="submit" disabled={saving} aria-busy={saving}>
          {saving ? <><span className="rally" aria-hidden="true" />Salvando…</> : 'Salvar perfil'}
        </button>
      </div>
    </form>
  );
}

/** US25: convida o parceiro para uma reserva futura que a própria conta organiza. */
function InvitePanel({ partner, session, onDone, onCancel, onExpired }: {
  partner: Partner; session: Session; onDone: (message: string) => void; onCancel: () => void; onExpired: () => void;
}) {
  const { state, reload } = useLoad(`invite-bookings:${partner.id}`, () => listBookings(session.token, 'upcoming'), onExpired);
  const [chosen, setChosen] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const select = useRef<HTMLSelectElement>(null);
  const mine = state.status === 'ready'
    ? state.data.filter((item) => item.my_role === 'organizer' && item.status === 'active' && !item.participants.some((player) => player.id === partner.id))
    : [];
  useEffect(() => { if (mine.length) select.current?.focus(); }, [mine.length]);

  if (state.status === 'loading') return <Loading>Carregando suas reservas…</Loading>;
  if (state.status === 'error') return <LoadError message={state.message} onRetry={reload} />;

  async function invite(booking: Booking) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await invitePlayer(session.token, booking.id, partner.id);
      onDone(`${partner.name} foi convidado para ${booking.court.name}, ${clubDateLabel(booking.starts_at)} às ${clubTime(booking.starts_at)}.`);
    } catch (failure) {
      if (isExpired(failure)) return onExpired();
      setError(failure instanceof ApiError ? Object.values(failure.fieldErrors)[0]?.[0] ?? failure.message : 'Não foi possível enviar o convite.');
      setBusy(false);
    }
  }

  return (
    <div className="confirm-action pay-panel" role="group" aria-label={`Convidar ${partner.name}`}>
      {mine.length === 0 ? (
        <>
          <p>Você não tem reservas futuras organizadas por você. Reserve um horário e volte para convidar.</p>
          <div className="confirm-buttons">
            <button className="button button--secondary" type="button" onClick={onCancel}>Voltar</button>
            <a className="button" href={routePaths.schedule}>Ir para a agenda</a>
          </div>
        </>
      ) : (
        <>
          <label htmlFor={`invite-${partner.id}`}>Convidar para a reserva</label>
          <select ref={select} id={`invite-${partner.id}`} value={chosen} onChange={(event) => setChosen(event.target.value)}>
            <option value="">Escolha a reserva</option>
            {mine.map((item) => (
              <option key={item.id} value={item.id}>{item.court.name} · {clubDateLabel(item.starts_at)} · {clubTime(item.starts_at)}</option>
            ))}
          </select>
          <div className="confirm-buttons">
            <button className="button button--secondary" type="button" disabled={busy} onClick={onCancel}>Voltar</button>
            <button
              className="button" type="button" disabled={busy || !chosen} aria-busy={busy}
              onClick={() => { const booking = mine.find((item) => String(item.id) === chosen); if (booking) void invite(booking); }}
            >
              {busy ? 'Enviando…' : 'Enviar convite'}
            </button>
          </div>
        </>
      )}
      {error && <p className="alert" role="alert">{error}</p>}
    </div>
  );
}

/** US24: jogadores com nível e disponibilidade semelhantes. */
function Partners({ session, version, onExpired }: { session: Session; version: number; onExpired: () => void }) {
  const { state, reload } = useLoad(`partners:${version}`, () => listPartners(session.token), onExpired);
  const [inviting, setInviting] = useState<number | null>(null);
  const [notice, setNotice] = useState('');

  if (state.status === 'loading') return <Loading>Procurando parceiros…</Loading>;
  if (state.status === 'error') return <LoadError message={state.message} onRetry={reload} />;
  return (
    <>
      {notice && <p className="notice" role="status">{notice}</p>}
      {state.data.length === 0 ? (
        <p className="muted">Nenhum jogador com nível e horários parecidos com os seus por enquanto.</p>
      ) : (
        <ul className="partner-list" aria-label="Parceiros sugeridos">
          {state.data.map((partner) => (
            <li key={partner.id} className="partner-card">
              <div className="partner-head">
                <h3>{partner.name}</h3>
                <span className="badge">{SKILL_LABELS[partner.skill_level]}</span>
              </div>
              {partner.shared_availability.length > 0 && (
                <p className="muted">Em comum: {partner.shared_availability.map(slotLabel).join(', ')}</p>
              )}
              {inviting === partner.id ? (
                <InvitePanel
                  partner={partner} session={session} onExpired={onExpired} onCancel={() => setInviting(null)}
                  onDone={(message) => { setInviting(null); setNotice(message); }}
                />
              ) : (
                <button
                  type="button" className="button button--secondary" aria-label={`Convidar ${partner.name}`}
                  onClick={() => { setNotice(''); setInviting(partner.id); }}
                >
                  Convidar para partida
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function PartnersPage({ session, onExpired }: Props) {
  const { state, reload, setData } = useLoad('player-profile', () => getPlayerProfile(session.token), onExpired);
  const [version, setVersion] = useState(0);

  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">Jogar</p>
        <h1>Parceiros</h1>
        <p>Informe seu nível e quando costuma jogar para encontrar parceiros parecidos com você e convidá-los para uma partida.</p>
      </div>
      {state.status === 'loading' ? (
        <Loading>Carregando seu perfil…</Loading>
      ) : state.status === 'error' ? (
        <LoadError message={state.message} onRetry={reload} />
      ) : (
        <>
          <ProfileForm
            profile={state.data} token={session.token} onExpired={onExpired}
            onSaved={(profile) => { setData(profile); setVersion((value) => value + 1); }}
          />
          <section className="content-panel" aria-labelledby="partners-title">
            <h2 id="partners-title">Parceiros sugeridos</h2>
            {state.data.skill_level ? (
              <Partners session={session} version={version} onExpired={onExpired} />
            ) : (
              <p className="muted">Informe seu nível de habilidade para ver sugestões de parceiros.</p>
            )}
          </section>
        </>
      )}
      <a className="text-link" href={routePaths.home}>Voltar ao início <span aria-hidden="true">→</span></a>
    </>
  );
}
