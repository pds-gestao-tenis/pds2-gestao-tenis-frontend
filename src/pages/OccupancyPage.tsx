import { useState } from 'react';
import { getOccupancy } from '../api/administration';
import type { Session } from '../api/types';
import { AdminGate } from '../components/AdminGate';
import { DateRangeForm } from '../components/DateRangeForm';
import { LoadError, Loading } from '../components/LoadStatus';
import { useLoad } from '../hooks/useLoad';
import type { MemberAccess } from '../hooks/useMemberAccess';
import { clubDate } from '../lib/club-time';

export function OccupancyPage({ session, access, onRetry, onExpired }: { session: Session; access: MemberAccess; onRetry: () => void; onExpired: () => void }) {
  return <><div className="page-heading"><p className="eyebrow">Administração</p><h1>Ocupação das quadras</h1><p>Acompanhe as horas reservadas e disponíveis no período escolhido.</p></div><AdminGate access={access} onRetry={onRetry}><OccupancyReport token={session.token} onExpired={onExpired} /></AdminGate></>;
}
function OccupancyReport({ token, onExpired }: { token: string; onExpired: () => void }) {
  const [range, setRange] = useState({ from: clubDate(Date.now() - 29 * 86400000), to: clubDate(Date.now()) });
  const { state, reload } = useLoad(`occupancy:${token}:${range.from}:${range.to}`, () => getOccupancy(token, range), onExpired);
  const data = state.status === 'ready' ? state.data : undefined;
  const available = data?.reduce((sum, row) => sum + row.available_hours, 0) ?? 0;
  const booked = data?.reduce((sum, row) => sum + row.booked_hours, 0) ?? 0;
  return <section className="content-panel" aria-label="Indicadores de ocupação"><DateRangeForm value={range} onChange={setRange} />
    <p className="muted">Ocupação = horas reservadas ÷ horas disponíveis, entre 07:00 e 22:00. Bloqueios saem das horas disponíveis; reservas canceladas não entram nas horas reservadas. Períodos futuros mostram reservas agendadas.</p>
    {state.status === 'loading' && <Loading>Calculando ocupação…</Loading>}{state.status === 'error' && <LoadError message={state.message} onRetry={reload} />}
    {data && <><div className="finance-summary"><span>Ocupação geral<strong>{available ? (booked / available * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '0'}%</strong></span><span>Horas reservadas<strong>{booked} h</strong></span><span>Horas disponíveis<strong>{available} h</strong></span><span>Cancelamentos<strong>{data.reduce((sum, row) => sum + row.cancelled_bookings, 0)}</strong></span></div>
      {data.length === 0 ? <p>Nenhuma quadra cadastrada.</p> : <div className="partner-grid">{data.map((row) => <article className="fee-card" key={row.court.id}><h2>{row.court.name}</h2><p className="occupancy-value">{row.occupancy_percent.toLocaleString('pt-BR')}%</p><meter min={0} max={100} value={row.occupancy_percent} aria-label={`Ocupação de ${row.court.name}`}>{row.occupancy_percent}%</meter><dl className="fee-details"><div><dt>Reservadas</dt><dd>{row.booked_hours} h</dd></div><div><dt>Disponíveis</dt><dd>{row.available_hours} h</dd></div><div><dt>Bloqueadas</dt><dd>{row.blocked_hours} h</dd></div><div><dt>Cancelamentos</dt><dd>{row.cancelled_bookings}</dd></div></dl>{row.available_hours === 0 && <p className="muted">Sem horários disponíveis neste período.</p>}</article>)}</div>}
    </>}
    <button className="text-link" type="button" onClick={reload} disabled={state.status === 'loading'}>Atualizar indicadores</button>
  </section>;
}
