import { useEffect, useRef, useState } from 'react';
import { myFees, payMyFee } from '../api/extras';
import { errorMessage, isExpired } from '../api/error';
import type { Fee, MyFees, Session } from '../api/types';
import { LoadError, Loading } from '../components/LoadStatus';
import { useLoad } from '../hooks/useLoad';
import { formatPrice } from '../lib/court-rules';
import { formatDay, PAYMENT_LABELS } from '../lib/labels';
import { routePaths } from '../navigation';

type Props = { session: Session; onExpired: () => void };

function FeeStatus({ fee }: { fee: Fee }) {
  if (fee.status === 'paid') return <span className="badge badge--active">Paga</span>;
  if (fee.overdue) return <span className="badge badge--danger">Atrasada</span>;
  return <span className="badge">Pendente</span>;
}

/** Pagar uma taxa: escolhe Pix ou cartão e confirma (US22). */
function PayPanel({ fee, token, onPaid, onCancel, onExpired }: {
  fee: Fee; token: string; onPaid: (fee: Fee) => void; onCancel: () => void; onExpired: () => void;
}) {
  const [method, setMethod] = useState<'pix' | 'card'>('pix');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => first.current?.focus(), []);

  async function pay() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      onPaid(await payMyFee(token, fee.id, method));
    } catch (failure) {
      if (isExpired(failure)) return onExpired();
      setError(errorMessage(failure, 'Não foi possível concluir o pagamento. Tente de novo.'));
      setBusy(false);
    }
  }

  return (
    <div className="confirm-action pay-panel" role="group" aria-label={`Pagar ${fee.description}`}>
      <h4>Pagar {formatPrice(fee.amount)}</h4>
      <fieldset className="choice-group">
        <legend>Forma de pagamento</legend>
        {(['pix', 'card'] as const).map((value, index) => (
          <label key={value} className="choice">
            <input
              ref={index === 0 ? first : undefined} type="radio" name={`method-${fee.id}`} value={value}
              checked={method === value} onChange={() => setMethod(value)}
            />
            {PAYMENT_LABELS[value]}
          </label>
        ))}
      </fieldset>
      <div className="confirm-buttons">
        <button className="button button--secondary" type="button" disabled={busy} onClick={onCancel}>Voltar</button>
        <button className="button" type="button" disabled={busy} aria-busy={busy} onClick={pay}>
          {busy ? 'Processando…' : 'Confirmar pagamento'}
        </button>
      </div>
      {error && <p className="alert" role="alert">{error}</p>}
    </div>
  );
}

function FeeList({ data, session, onExpired }: { data: MyFees; session: Session; onExpired: () => void }) {
  const [fees, setFees] = useState(data);
  const [paying, setPaying] = useState<number | null>(null);
  const [notice, setNotice] = useState('');

  if (!fees.member) {
    return (
      <section className="content-panel empty-panel">
        <h2>Nenhuma taxa encontrada</h2>
        <p>Sua conta não está vinculada a um cadastro de membro do clube. Procure a administração para confirmar o e-mail cadastrado.</p>
      </section>
    );
  }

  function handlePaid(paid: Fee) {
    setPaying(null);
    setNotice(`Pagamento de ${paid.description} confirmado.`);
    const data = fees.data.map((item) => (item.id === paid.id ? paid : item));
    const pending = data.filter((item) => item.status === 'pending');
    setFees({
      ...fees,
      data,
      summary: {
        pending_total: pending.reduce((sum, item) => sum + item.amount, 0),
        paid_total: data.filter((item) => item.status === 'paid').reduce((sum, item) => sum + item.amount, 0),
        overdue_count: pending.filter((item) => item.overdue).length,
      },
    });
  }

  return (
    <>
      {notice && <p className="notice" role="status">{notice}</p>}
      <dl className="stat-grid">
        <div className="stat">
          <dt>A pagar</dt>
          <dd>{formatPrice(fees.summary.pending_total)}</dd>
        </div>
        <div className="stat">
          <dt>Atrasadas</dt>
          <dd>{fees.summary.overdue_count}</dd>
        </div>
        <div className="stat">
          <dt>Já pago</dt>
          <dd>{formatPrice(fees.summary.paid_total)}</dd>
        </div>
      </dl>
      {fees.data.length === 0 ? (
        <p className="muted">Nenhuma taxa lançada para você.</p>
      ) : (
        <ul className="fee-list" aria-label="Taxas">
          {fees.data.map((fee) => (
            <li key={fee.id} className="fee-item" data-overdue={fee.overdue || undefined}>
              <div className="fee-main">
                <h3>{fee.description}</h3>
                <p className="muted">
                  {fee.status === 'paid' && fee.paid_at
                    ? `Paga em ${new Date(fee.paid_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}${fee.payment_method ? ` · ${PAYMENT_LABELS[fee.payment_method]}` : ''}`
                    : `Vence em ${formatDay(fee.due_date)}`}
                </p>
              </div>
              <strong className="fee-amount">{formatPrice(fee.amount)}</strong>
              <FeeStatus fee={fee} />
              {fee.status === 'pending' && (
                paying === fee.id ? (
                  <PayPanel
                    fee={fee} token={session.token} onPaid={handlePaid}
                    onCancel={() => setPaying(null)} onExpired={onExpired}
                  />
                ) : (
                  <button
                    type="button" className="button" aria-label={`Pagar ${fee.description}`}
                    onClick={() => { setNotice(''); setPaying(fee.id); }}
                  >
                    Pagar
                  </button>
                )
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function FeesPage({ session, onExpired }: Props) {
  const { state, reload } = useLoad('my-fees', () => myFees(session.token), onExpired);
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">Financeiro</p>
        <h1>Minhas taxas</h1>
        <p>Acompanhe as taxas pagas e pendentes e pague pelo sistema.</p>
      </div>
      {state.status === 'loading' ? (
        <Loading>Carregando taxas…</Loading>
      ) : state.status === 'error' ? (
        <LoadError message={state.message} onRetry={reload} />
      ) : (
        <FeeList data={state.data} session={session} onExpired={onExpired} />
      )}
      <a className="text-link" href={routePaths.home}>Voltar ao início <span aria-hidden="true">→</span></a>
    </>
  );
}
