import { useRef, useState, type ReactNode } from 'react';
import { USE_MOCK_API } from '../api/config';
import { ApiError, isExpired } from '../api/error';
import { listFees, payFee } from '../api/finance';
import type { Fee, Session } from '../api/types';
import { AccessStatus } from '../components/AccessStatus';
import { ConfirmAction } from '../components/ConfirmAction';
import { FeeForm } from '../components/FeeForm';
import { LoadError, Loading } from '../components/LoadStatus';
import { PaymentForm } from '../components/PaymentForm';
import { panelId, tabId, Tabs } from '../components/Tabs';
import { useLoad } from '../hooks/useLoad';
import type { MemberAccess } from '../hooks/useMemberAccess';
import { clubDate } from '../lib/club-time';
import { formatDateOnly, formatMoney } from '../lib/money';

type Props = { session: Session; onExpired: () => void };

export function FeesPage(props: Props) {
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">Sua conta no clube</p>
        <h1>Minhas taxas</h1>
        <p>Acompanhe suas taxas pagas, pendentes e o histórico de pagamentos.</p>
      </div>
      <FeeList {...props} admin={false} />
    </>
  );
}

export function FinancePage({ access, onRetry, ...props }: Props & { access: MemberAccess; onRetry: () => void }) {
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">Administração</p>
        <h1>Financeiro</h1>
        <p>Registre taxas e pagamentos dos membros do clube.</p>
      </div>
      {access.status === 'allowed' ? <FeeList {...props} admin /> : (
        <section className="content-panel">
          {access.status === 'denied' ? (
            <>
              <h2>Acesso restrito</h2>
              <p>Somente administradores podem lançar taxas e registrar pagamentos.</p>
            </>
          ) : <AccessStatus access={access} onRetry={onRetry} />}
        </section>
      )}
    </>
  );
}

const feeTabs = [{ id: 'pending', label: 'Pendentes' }, { id: 'paid', label: 'Pagas' }];
const paymentNotices = {
  paid: 'Pagamento registrado. A taxa está quitada.',
  partial: 'Pagamento parcial registrado.',
  pending: 'Aguardando confirmação do pagamento.',
};

function FeeList({ session, onExpired, admin }: Props & { admin: boolean }) {
  const { token } = session;
  const { state, reload, setData } = useLoad(
    'fees:' + token + ':' + admin,
    () => listFees(token, { scope: admin ? 'all' : 'mine' }),
    onExpired,
  );
  const [tab, setTab] = useState('pending');
  const [creating, setCreating] = useState(false);
  const [paying, setPaying] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const fees = state.status === 'ready' ? state.data : state.status === 'loading' ? state.previous : undefined;
  const query = search.toLowerCase();
  const shown = fees?.filter((fee) =>
    (fee.status === 'paid') === (tab === 'paid') &&
    (fee.member.name + ' ' + fee.description).toLowerCase().includes(query));

  function savedFee(fee: Fee) {
    setData((current) => [fee, ...current]);
    reload();
    setCreating(false);
    setTab('pending');
    setNotice('Taxa lançada.');
    setError('');
  }

  function savedPayment(fee: Fee) {
    setData((current) => current.map((item) => item.id === fee.id ? fee : item));
    reload();
    setPaying(null);
    setNotice(paymentNotices[fee.status]);
    setError('');
  }

  function paymentAction(fee: Fee) {
    if (fee.balance_cents <= 0) return null;
    if (paying !== fee.id) {
      return (
        <button className={admin ? 'button button--secondary' : 'button'} type="button"
          onClick={() => { setPaying(fee.id); if (admin) setError(''); }}>
          {admin ? 'Registrar pagamento' : USE_MOCK_API ? 'Simular pagamento' : 'Pagar taxa'}
        </button>
      );
    }
    const props = {
      fee, token, onSaved: savedPayment, onCancel: () => setPaying(null), onExpired,
    };
    return admin ? (
      <PaymentForm {...props} onConflict={(message) => { setError(message); reload(); }} />
    ) : <FeeCheckout {...props} onConflict={reload} />;
  }

  return (
    <>
      {admin && (creating ? (
        <FeeForm token={token} onSaved={savedFee} onCancel={() => setCreating(false)} onExpired={onExpired} />
      ) : (
        <button className="button finance-new" type="button" onClick={() => { setCreating(true); setError(''); }}>
          Nova taxa
        </button>
      ))}
      {notice && <p className="notice" role="status">{notice}</p>}
      {error && <p className="alert" role="alert">{error}</p>}
      {fees && (
        <div className="finance-summary">
          <span>Saldo pendente <strong>{formatMoney(fees.reduce((sum, fee) => sum + fee.balance_cents, 0))}</strong></span>
          <span>Pagamentos registrados <strong>{formatMoney(fees.reduce((sum, fee) => sum + fee.paid_cents, 0))}</strong></span>
        </div>
      )}
      {admin && fees && <PendingMembers fees={fees} onSelect={(name) => { setSearch(name); setTab('pending'); }} />}

      <section className="content-panel" aria-label={admin ? 'Taxas dos membros' : 'Minhas taxas'}>
        <Tabs tabs={feeTabs} value={tab} onChange={setTab} label="Taxas" />
        <div role="tabpanel" id={panelId(tab)} aria-labelledby={tabId(tab)}>
          {admin && (
            <div className="field finance-search">
              <label htmlFor="fee-search">Filtrar por membro ou descrição</label>
              <input id="fee-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
          )}
          {state.status === 'loading' && !fees && <Loading>Carregando taxas…</Loading>}
          {state.status === 'error' && <LoadError message={state.message} onRetry={reload} />}
          {shown && (shown.length === 0 ? (
            <p className="muted">{tab === 'paid' ? 'Nenhuma taxa paga encontrada.' : 'Nenhuma taxa pendente encontrada.'}</p>
          ) : (
            <div className="fee-list">
              {shown.map((fee) => (
                <FeeCard key={fee.id} fee={fee} showMember={admin}>{paymentAction(fee)}</FeeCard>
              ))}
            </div>
          ))}
          <button className="text-link" type="button" disabled={state.status === 'loading'} onClick={reload}>
            Atualizar taxas
          </button>
        </div>
      </section>
    </>
  );
}

const feeLabels = { pending: 'Pendente', partial: 'Pagamento parcial', paid: 'Paga' };

function FeeCard({ fee, showMember, children }: { fee: Fee; showMember: boolean; children: ReactNode }) {
  return (
    <article className="fee-card" aria-label={'Taxa ' + fee.description + ' de ' + fee.member.name}>
      <div className="fee-card-heading">
        <h2>{fee.description}</h2>
        <span className={fee.status === 'paid' ? 'badge badge--active' : 'badge'}>{feeLabels[fee.status]}</span>
      </div>
      {showMember && <p className="fee-member">{fee.member.name}</p>}
      <dl className="fee-details">
        <div><dt>Vencimento</dt><dd>{formatDateOnly(fee.due_date)}</dd></div>
        <div><dt>Valor da taxa</dt><dd>{formatMoney(fee.amount_cents)}</dd></div>
        <div><dt>Total pago</dt><dd>{formatMoney(fee.paid_cents)}</dd></div>
        <div><dt>Saldo pendente</dt><dd>{formatMoney(fee.balance_cents)}</dd></div>
      </dl>
      {fee.payments.length > 0 && (
        <details className="payment-history">
          <summary>Histórico de pagamentos ({fee.payments.length})</summary>
          <ul>
            {fee.payments.map((item) => (
              <li key={item.id}>
                <time dateTime={item.paid_on}>{formatDateOnly(item.paid_on)}</time>
                <span>{formatMoney(item.amount_cents)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {children}
    </article>
  );
}

function FeeCheckout({ token, fee, onSaved, onCancel, onExpired, onConflict }: {
  token: string;
  fee: Fee;
  onSaved: (fee: Fee) => void;
  onCancel: () => void;
  onExpired: () => void;
  onConflict: () => void;
}) {
  const key = useRef(crypto.randomUUID());
  const explanation = USE_MOCK_API
    ? 'Demonstração: nenhum valor será cobrado.'
    : 'A quitação depende da confirmação do serviço de pagamento.';

  async function confirm() {
    try {
      onSaved(await payFee(token, fee.id, key.current));
    } catch (failure) {
      if (isExpired(failure)) return onExpired();
      if (failure instanceof ApiError && failure.status === 409) onConflict();
      throw failure;
    }
  }

  return (
    <ConfirmAction
      title={USE_MOCK_API ? 'Simular pagamento da taxa?' : 'Pagar taxa?'}
      description={fee.description + ': ' + formatMoney(fee.balance_cents) + '. ' + explanation}
      confirmLabel={USE_MOCK_API ? 'Confirmar simulação' : 'Confirmar pagamento'}
      keepLabel="Voltar"
      onKeep={onCancel}
      onConfirm={confirm}
    />
  );
}

function PendingMembers({ fees, onSelect }: { fees: Fee[]; onSelect: (name: string) => void }) {
  const grouped = new Map<number, { name: string; count: number; balance: number; overdue: number }>();
  const today = clubDate(Date.now());
  for (const fee of fees) {
    if (fee.balance_cents <= 0) continue;
    const member = grouped.get(fee.member.id) ?? { name: fee.member.name, count: 0, balance: 0, overdue: 0 };
    member.count++;
    member.balance += fee.balance_cents;
    if (fee.due_date < today) member.overdue += fee.balance_cents;
    grouped.set(fee.member.id, member);
  }
  const members = [...grouped.entries()].sort((a, b) => b[1].balance - a[1].balance);

  return (
    <section className="pending-members" aria-labelledby="pending-members-title">
      <h2 id="pending-members-title">Membros com pendências</h2>
      {members.length === 0 ? <p className="muted">Nenhum membro com taxas pendentes.</p> : (
        <ul>
          {members.map(([id, member]) => (
            <li key={id}>
              <button type="button" className="text-link" onClick={() => onSelect(member.name)}>{member.name}</button>
              <span>
                {member.count} taxa(s) · <strong>{formatMoney(member.balance)}</strong>
                {member.overdue > 0 && <small>Vencido: {formatMoney(member.overdue)}</small>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
