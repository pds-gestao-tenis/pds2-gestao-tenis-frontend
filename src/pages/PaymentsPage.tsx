import { useEffect, useRef, useState } from 'react';
import { deleteFee, listFees, pendingMembers, registerPayment } from '../api/extras';
import { isExpired } from '../api/error';
import type { Fee, FeeStatus, PaymentMethod, Session } from '../api/types';
import { AccessStatus } from '../components/AccessStatus';
import { ConfirmAction } from '../components/ConfirmAction';
import { FeeForm } from '../components/FeeForm';
import { LoadError, Loading } from '../components/LoadStatus';
import { panelId, tabId, Tabs } from '../components/Tabs';
import { useLoad } from '../hooks/useLoad';
import type { MemberAccess } from '../hooks/useMemberAccess';
import { formatPrice } from '../lib/court-rules';
import { formatDay, PAYMENT_LABELS } from '../lib/labels';
import { routePaths } from '../navigation';

type Props = { session: Session; access: MemberAccess; onRetry: () => void; onExpired: () => void };
type Tab = 'pending' | 'fees';
type Filter = 'all' | FeeStatus | 'overdue';

/** US21: quem tem pagamentos pendentes, quem deve há mais tempo primeiro. */
function PendingMembers({ session, onExpired }: { session: Session; onExpired: () => void }) {
  const { state, reload } = useLoad('pending-members', () => pendingMembers(session.token), onExpired);
  if (state.status === 'loading') return <Loading>Carregando pendências…</Loading>;
  if (state.status === 'error') return <LoadError message={state.message} onRetry={reload} />;
  if (state.data.length === 0) return <p className="muted">Nenhum membro com pagamento pendente.</p>;
  return (
    <table className="member-table">
      <thead>
        <tr>
          <th scope="col">Membro</th>
          <th scope="col">Taxas pendentes</th>
          <th scope="col">Total</th>
          <th scope="col">Atrasadas</th>
          <th scope="col">Vencimento mais antigo</th>
        </tr>
      </thead>
      <tbody>
        {state.data.map((item) => (
          <tr key={item.member.id}>
            <th scope="row" data-label="Membro">{item.member.name}<br /><span className="muted">{item.member.email}</span></th>
            <td data-label="Taxas pendentes">{item.pending_count}</td>
            <td data-label="Total">{formatPrice(item.pending_total)}</td>
            <td data-label="Atrasadas">
              {item.overdue_count > 0 ? <span className="badge badge--danger">{item.overdue_count}</span> : '0'}
            </td>
            <td data-label="Vencimento mais antigo">{formatDay(item.oldest_due_date)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PaymentRegister({ fee, onConfirm, onCancel }: {
  fee: Fee; onConfirm: (method: PaymentMethod) => Promise<void>; onCancel: () => void;
}) {
  const [method, setMethod] = useState<PaymentMethod>('pix');
  const select = useRef<HTMLSelectElement>(null);
  useEffect(() => select.current?.focus(), []);
  return (
    <div className="payment-register">
      <label className="visually-hidden" htmlFor={`method-${fee.id}`}>Forma de pagamento</label>
      <select ref={select} id={`method-${fee.id}`} value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>
        {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((value) => <option key={value} value={value}>{PAYMENT_LABELS[value]}</option>)}
      </select>
      <ConfirmAction
        title={`Registrar pagamento de ${fee.member.name}?`}
        description={`${fee.description} · ${formatPrice(fee.amount)}`}
        confirmLabel="Registrar pagamento" keepLabel="Cancelar"
        onConfirm={() => onConfirm(method)} onKeep={onCancel}
      />
    </div>
  );
}

/** US19: taxas lançadas, registro de pagamento e exclusão de pendentes. */
function FeeManager({ session, onExpired }: { session: Session; onExpired: () => void }) {
  const [filter, setFilter] = useState<Filter>('pending');
  const [page, setPage] = useState(1);
  const query = {
    page, page_size: 20,
    ...(filter === 'overdue' ? { overdue: true } : filter === 'all' ? {} : { status: filter }),
  };
  const { state, reload, setData } = useLoad(`fees:${filter}:${page}`, () => listFees(session.token, query), onExpired);
  const [creating, setCreating] = useState(false);
  const [paying, setPaying] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [notice, setNotice] = useState('');

  async function guard<T>(action: () => Promise<T>) {
    try {
      return await action();
    } catch (error) {
      if (isExpired(error)) { onExpired(); return undefined; }
      throw error;
    }
  }
  async function pay(fee: Fee, method: PaymentMethod) {
    const paid = await guard(() => registerPayment(session.token, fee.id, method));
    if (!paid) return;
    setPaying(null);
    setNotice(`Pagamento de ${fee.member.name} registrado.`);
    if (filter === 'all') setData((list) => ({ ...list, data: list.data.map((item) => (item.id === paid.id ? paid : item)) }));
    else reload();
  }
  async function remove(fee: Fee) {
    const done = await guard(async () => { await deleteFee(session.token, fee.id); return true; });
    if (!done) return;
    setDeleting(null);
    setNotice(`Taxa ${fee.description} excluída.`);
    reload();
  }

  const list = state.status === 'ready' ? state.data : state.status === 'loading' ? state.previous : undefined;
  return (
    <>
      {notice && <p className="notice" role="status">{notice}</p>}
      {creating ? (
        <FeeForm
          token={session.token} onCancel={() => setCreating(false)} onExpired={onExpired}
          onSaved={(fee) => { setCreating(false); setNotice(`Taxa lançada para ${fee.member.name}.`); reload(); }}
        />
      ) : (
        <button type="button" className="submit court-new" onClick={() => { setNotice(''); setCreating(true); }}>Nova taxa</button>
      )}
      <div className="member-filters">
        <div className="field member-status-filter">
          <label htmlFor="fee-filter">Mostrar</label>
          <select id="fee-filter" value={filter} onChange={(event) => { setFilter(event.target.value as Filter); setPage(1); }}>
            <option value="pending">Pendentes</option>
            <option value="overdue">Atrasadas</option>
            <option value="paid">Pagas</option>
            <option value="all">Todas</option>
          </select>
        </div>
      </div>
      {state.status === 'error' ? (
        <LoadError message={state.message} onRetry={reload} />
      ) : !list ? (
        <Loading>Carregando taxas…</Loading>
      ) : list.data.length === 0 ? (
        <p className="muted">Nenhuma taxa neste filtro.</p>
      ) : (
        <>
          <table className="member-table">
            <thead>
              <tr>
                <th scope="col">Taxa</th>
                <th scope="col">Membro</th>
                <th scope="col">Valor</th>
                <th scope="col">Vencimento</th>
                <th scope="col">Situação</th>
                <th scope="col"><span className="visually-hidden">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((fee) => (
                <tr key={fee.id}>
                  <th scope="row" data-label="Taxa">{fee.description}</th>
                  <td data-label="Membro">{fee.member.name}</td>
                  <td data-label="Valor">{formatPrice(fee.amount)}</td>
                  <td data-label="Vencimento">{formatDay(fee.due_date)}</td>
                  <td data-label="Situação">
                    {fee.status === 'paid' ? (
                      <span className="badge badge--active">
                        Paga{fee.payment_method ? ` · ${PAYMENT_LABELS[fee.payment_method]}` : ''}{fee.paid_via === 'online' ? ' (online)' : ''}
                      </span>
                    ) : fee.overdue ? <span className="badge badge--danger">Atrasada</span> : <span className="badge">Pendente</span>}
                  </td>
                  <td className="member-actions">
                    {fee.status === 'paid' ? null : paying === fee.id ? (
                      <PaymentRegister fee={fee} onConfirm={(method) => pay(fee, method)} onCancel={() => setPaying(null)} />
                    ) : deleting === fee.id ? (
                      <ConfirmAction
                        title={`Excluir ${fee.description}?`} description={`Taxa de ${fee.member.name}, ${formatPrice(fee.amount)}.`}
                        confirmLabel="Excluir taxa" keepLabel="Manter taxa" danger
                        onConfirm={() => remove(fee)} onKeep={() => setDeleting(null)}
                      />
                    ) : (
                      <div className="form-actions">
                        <button
                          type="button" className="button button--secondary" aria-label={`Registrar pagamento de ${fee.description} de ${fee.member.name}`}
                          onClick={() => { setNotice(''); setDeleting(null); setPaying(fee.id); }}
                        >
                          Registrar pagamento
                        </button>
                        <button
                          type="button" className="button button--secondary" aria-label={`Excluir ${fee.description} de ${fee.member.name}`}
                          onClick={() => { setNotice(''); setPaying(null); setDeleting(fee.id); }}
                        >
                          Excluir
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.meta.total_pages > 1 && (
            <nav className="pagination" aria-label="Páginas de taxas">
              <button type="button" className="button button--secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button>
              <span>Página {list.meta.page} de {list.meta.total_pages}</span>
              <button type="button" className="button button--secondary" disabled={page >= list.meta.total_pages} onClick={() => setPage(page + 1)}>Próxima</button>
            </nav>
          )}
        </>
      )}
    </>
  );
}

export function PaymentsPage({ session, access, onRetry, onExpired }: Props) {
  const [tab, setTab] = useState<Tab>('pending');
  let content;
  if (access.status === 'allowed') {
    content = (
      <>
        <Tabs
          label="Pagamentos" value={tab} onChange={(id) => setTab(id as Tab)}
          tabs={[{ id: 'pending', label: 'Pendências' }, { id: 'fees', label: 'Taxas' }]}
        />
        <section id={panelId(tab)} role="tabpanel" aria-labelledby={tabId(tab)} className="tab-panel">
          {tab === 'pending'
            ? <PendingMembers session={session} onExpired={onExpired} />
            : <FeeManager session={session} onExpired={onExpired} />}
        </section>
      </>
    );
  } else if (access.status === 'denied') {
    content = (
      <section className="content-panel empty-panel">
        <span className="badge">Acesso restrito</span>
        <h2>Área administrativa</h2>
        <p>Os pagamentos do clube estão disponíveis apenas para administradores.</p>
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
        <h1>Pagamentos</h1>
        <p>Lance taxas, registre os pagamentos recebidos e acompanhe quem está com pendências.</p>
      </div>
      {content}
      <a className="text-link" href={routePaths.home}>Voltar ao início <span aria-hidden="true">→</span></a>
    </>
  );
}
