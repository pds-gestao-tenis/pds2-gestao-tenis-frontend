import { useState, type FormEvent } from 'react';
import { occupancyReport } from '../api/extras';
import type { OccupancyReport, Session, Usage } from '../api/types';
import { AccessStatus } from '../components/AccessStatus';
import { LoadError, Loading } from '../components/LoadStatus';
import { useLoad } from '../hooks/useLoad';
import type { MemberAccess } from '../hooks/useMemberAccess';
import { clubDate } from '../lib/club-time';
import { formatDay, percent, WEEKDAY_LABELS } from '../lib/labels';
import { routePaths } from '../navigation';

type Props = { session: Session; access: MemberAccess; onRetry: () => void; onExpired: () => void; now?: () => number };

function shiftDay(day: string, offset: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

const hours = (value: number) => `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`;

/** Linha de barra horizontal: rótulo, barra proporcional à ocupação e o percentual. */
function Bar({ label, usage }: { label: string; usage: Usage }) {
  return (
    <li className="bar-row">
      <span className="bar-label">{label}</span>
      <span className="bar-track" aria-hidden="true">
        <span className="bar-fill" style={{ width: `${Math.min(100, usage.occupancy_rate * 100)}%` }} />
      </span>
      <span className="bar-value">
        {percent(usage.occupancy_rate)}
        <span className="visually-hidden"> de ocupação, {hours(usage.booked_hours)} de {hours(usage.available_hours)}</span>
      </span>
    </li>
  );
}

function Report({ data }: { data: OccupancyReport }) {
  const openHours = data.by_hour.filter((item) => item.available_hours > 0);
  return (
    <>
      <dl className="stat-grid">
        <div className="stat">
          <dt>Ocupação geral</dt>
          <dd>{percent(data.totals.occupancy_rate)}</dd>
        </div>
        <div className="stat">
          <dt>Horas reservadas</dt>
          <dd>{hours(data.totals.booked_hours)}</dd>
        </div>
        <div className="stat">
          <dt>Reservas</dt>
          <dd>{data.totals.bookings}</dd>
        </div>
        <div className="stat">
          <dt>Cancelamentos</dt>
          <dd>{data.totals.cancelled}</dd>
        </div>
      </dl>

      <section className="content-panel report-section" aria-labelledby="report-courts">
        <h2 id="report-courts">Por quadra</h2>
        {data.courts.length === 0 ? (
          <p className="muted">Nenhuma quadra cadastrada.</p>
        ) : (
          <table className="member-table">
            <thead>
              <tr>
                <th scope="col">Quadra</th>
                <th scope="col">Ocupação</th>
                <th scope="col">Reservadas</th>
                <th scope="col">Disponíveis</th>
                <th scope="col">Bloqueadas</th>
                <th scope="col">Reservas</th>
              </tr>
            </thead>
            <tbody>
              {data.courts.map((item) => (
                <tr key={item.court.id}>
                  <th scope="row" data-label="Quadra">{item.court.name}</th>
                  <td data-label="Ocupação">{percent(item.occupancy_rate)}</td>
                  <td data-label="Reservadas">{hours(item.booked_hours)}</td>
                  <td data-label="Disponíveis">{hours(item.available_hours)}</td>
                  <td data-label="Bloqueadas">{hours(item.blocked_hours)}</td>
                  <td data-label="Reservas">{item.bookings}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className="report-columns">
        <section className="content-panel report-section" aria-labelledby="report-weekday">
          <h2 id="report-weekday">Por dia da semana</h2>
          <ul className="bar-list">
            {data.by_weekday.map((item) => <Bar key={item.weekday} label={WEEKDAY_LABELS[item.weekday]} usage={item} />)}
          </ul>
        </section>
        <section className="content-panel report-section" aria-labelledby="report-hour">
          <h2 id="report-hour">Por horário</h2>
          <ul className="bar-list">
            {openHours.map((item) => <Bar key={item.hour} label={`${String(item.hour).padStart(2, '0')}h`} usage={item} />)}
          </ul>
        </section>
      </div>
    </>
  );
}

function ReportView({ session, onExpired, now }: { session: Session; onExpired: () => void; now: () => number }) {
  const today = clubDate(now());
  const [range, setRange] = useState({ from: shiftDay(today, -29), to: today });
  const [draft, setDraft] = useState(range);
  const [error, setError] = useState('');
  const { state, reload } = useLoad(`occupancy:${range.from}:${range.to}`, () => occupancyReport(session.token, range.from, range.to), onExpired);

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.from || !draft.to) return setError('Informe as duas datas.');
    if (draft.from > draft.to) return setError('A data inicial deve ser anterior à final.');
    setError('');
    setRange(draft);
  }

  return (
    <>
      <form className="member-filters" onSubmit={apply} aria-label="Período">
        <div className="field member-status-filter">
          <label htmlFor="report-from">De</label>
          <input id="report-from" type="date" value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} />
        </div>
        <div className="field member-status-filter">
          <label htmlFor="report-to">Até</label>
          <input id="report-to" type="date" value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} />
        </div>
        <button type="submit" className="button button--secondary">Atualizar</button>
      </form>
      {error && <p className="alert" role="alert">{error}</p>}
      <p className="muted">
        Período de {formatDay(range.from)} a {formatDay(range.to)}. Ocupação = horas reservadas sobre horas disponíveis (07h às 22h, sem os bloqueios).
      </p>
      {state.status === 'loading' ? (
        <Loading>Calculando indicadores…</Loading>
      ) : state.status === 'error' ? (
        <LoadError message={state.message} onRetry={reload} />
      ) : (
        <Report data={state.data} />
      )}
    </>
  );
}

export function ReportsPage({ session, access, onRetry, onExpired, now = Date.now }: Props) {
  let content;
  if (access.status === 'allowed') {
    content = <ReportView session={session} onExpired={onExpired} now={now} />;
  } else if (access.status === 'denied') {
    content = (
      <section className="content-panel empty-panel">
        <span className="badge">Acesso restrito</span>
        <h2>Área administrativa</h2>
        <p>Os indicadores estão disponíveis apenas para administradores.</p>
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
        <h1>Indicadores</h1>
        <p>Veja como as quadras estão sendo usadas: ocupação por quadra, dia da semana e horário.</p>
      </div>
      {content}
      <a className="text-link" href={routePaths.home}>Voltar ao início <span aria-hidden="true">→</span></a>
    </>
  );
}
