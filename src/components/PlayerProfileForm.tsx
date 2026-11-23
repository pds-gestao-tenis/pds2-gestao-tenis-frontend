import { useId, useRef, useState, type FormEvent } from 'react';
import { errorMessage, isExpired } from '../api/error';
import { updatePlayerProfile } from '../api/players';
import type { Availability, PlayerProfile } from '../api/types';

export const WEEKDAYS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
export const LEVELS = ['Iniciante', 'Básico', 'Intermediário', 'Avançado', 'Competitivo'];
const hours = Array.from({ length: 16 }, (_, i) => `${String(i + 7).padStart(2, '0')}:00`);

export function PlayerProfileForm({ token, profile, onSaved, onCancel, onExpired }: {
  token: string; profile: PlayerProfile; onSaved: () => void; onCancel: () => void; onExpired: () => void;
}) {
  const id = useId();
  const [level, setLevel] = useState(profile.level ? String(profile.level) : '');
  const [availability, setAvailability] = useState<Availability[]>(profile.availability);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  function changeDay(weekday: number, key: 'start_time' | 'end_time', value: string) {
    setAvailability((items) => items.map((item) => item.weekday === weekday ? { ...item, [key]: value } : item));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending.current) return;
    if (availability.some((item) => item.start_time >= item.end_time)) return setError('Em cada dia, o fim precisa ser depois do início.');
    if (!level && availability.length > 0) return setError('Informe seu nível para encontrar parceiros.');
    sending.current = true; setBusy(true); setError('');
    try { await updatePlayerProfile(token, { level: level ? Number(level) as PlayerProfile['level'] : null, availability }); onSaved(); }
    catch (failure) { if (isExpired(failure)) return onExpired(); setError(errorMessage(failure, 'Não foi possível salvar seu perfil.')); }
    finally { sending.current = false; setBusy(false); }
  }
  return <form className="content-panel" onSubmit={submit} aria-label="Perfil de jogador" noValidate>
    <h2>Seu perfil de jogador</h2>
    <p className="muted">Seu nível e os horários em comum aparecem para outros jogadores. Sem disponibilidade, você deixa de aparecer na busca.</p>
    {error && <p className="alert" role="alert">{error}</p>}
    <div className="field"><label htmlFor={`${id}-level`}>Nível de habilidade</label><select id={`${id}-level`} value={level} onChange={(event) => setLevel(event.target.value)}><option value="">Não informado</option>{LEVELS.map((name, i) => <option key={name} value={i + 1}>{i + 1} · {name}</option>)}</select></div>
    <fieldset className="availability-fields"><legend>Disponibilidade semanal · horário do clube</legend>
      {WEEKDAYS.map((day, weekday) => {
        const slot = availability.find((item) => item.weekday === weekday);
        return <div className="availability-row" key={day}>
          <label className="check-label"><input type="checkbox" checked={!!slot} onChange={(event) => setAvailability((items) => event.target.checked ? [...items, { weekday, start_time: '18:00', end_time: '21:00' }] : items.filter((item) => item.weekday !== weekday))} />{day}</label>
          {slot && <div className="availability-times"><div className="field"><label htmlFor={`${id}-${weekday}-start`}>Início · {day}</label><select id={`${id}-${weekday}-start`} value={slot.start_time} onChange={(event) => changeDay(weekday, 'start_time', event.target.value)}>{hours.slice(0, -1).map((hour) => <option key={hour}>{hour}</option>)}</select></div><div className="field"><label htmlFor={`${id}-${weekday}-end`}>Fim · {day}</label><select id={`${id}-${weekday}-end`} value={slot.end_time} onChange={(event) => changeDay(weekday, 'end_time', event.target.value)}>{hours.slice(1).map((hour) => <option key={hour}>{hour}</option>)}</select></div></div>}
        </div>;
      })}
    </fieldset>
    <div className="form-actions"><button className="button" type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar perfil'}</button><button className="button button--secondary" type="button" onClick={onCancel} disabled={busy}>Cancelar</button></div>
  </form>;
}
