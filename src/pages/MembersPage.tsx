import { useId, useState, type FormEvent } from 'react';
import { isExpired } from '../api/error';
import { deleteMember, listMembers } from '../api/members';
import type { Member, MemberStatus, Session } from '../api/types';
import { AdminGate } from '../components/AdminGate';
import { ConfirmAction } from '../components/ConfirmAction';
import { LoadError, Loading } from '../components/LoadStatus';
import { MemberForm } from '../components/MemberForm';
import { useLoad } from '../hooks/useLoad';
import type { MemberAccess } from '../hooks/useMemberAccess';

type Props = {
  session: Session;
  access: MemberAccess;
  onRetry: () => void;
  onExpired: () => void;
};

export function MembersPage({ session, access, onRetry, onExpired }: Props) {
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">Administração</p>
        <h1>Membros</h1>
        <p>Cadastre e atualize os dados dos membros do clube.</p>
      </div>
      <AdminGate access={access} onRetry={onRetry}>
        <MemberManager token={session.token} onExpired={onExpired} />
      </AdminGate>
    </>
  );
}

const PAGE_SIZE = 12;
type StatusFilter = MemberStatus | '';
type MemberAction = { kind: 'new' } | { kind: 'edit' | 'delete'; member: Member };

function MemberManager({ token, onExpired }: { token: string; onExpired: () => void }) {
  const id = useId();
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('');
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<MemberAction | null>(null);
  const [notice, setNotice] = useState('');

  const { state, reload } = useLoad(
    JSON.stringify(['members', token, page, status, search]),
    () => listMembers(token, { page, page_size: PAGE_SIZE, status: status || undefined, q: search || undefined }),
    onExpired,
  );

  const list = state.status === 'ready' ? state.data : undefined;

  function applySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch(draft.trim());
    setPage(1);
  }

  function begin(next: MemberAction) {
    setNotice('');
    setAction(next);
  }

  function saved() {
    if (action?.kind === 'new') {
      setDraft('');
      setSearch('');
      setStatus('');
      setPage(1);
      setNotice('Membro cadastrado.');
    } else {
      setNotice('Dados do membro atualizados.');
    }
    setAction(null);
    reload();
  }

  async function remove(member: Member) {
    try {
      await deleteMember(token, member.id);
      if (page > 1 && list?.data.length === 1) setPage(page - 1);
      setAction(null);
      setNotice('Membro removido.');
      reload();
    } catch (error) {
      if (isExpired(error)) return onExpired();
      throw error;
    }
  }

  return (
    <>
      {!action && (
        <div className="form-actions member-toolbar">
          <button type="button" className="button" onClick={() => begin({ kind: 'new' })}>Novo membro</button>
        </div>
      )}
      {action && action.kind !== 'delete' && (
        <MemberForm token={token} member={action.kind === 'edit' ? action.member : undefined}
          onSaved={saved} onCancel={() => setAction(null)} onExpired={onExpired} />
      )}
      {notice && <p className="notice" role="status">{notice}</p>}

      <section className="content-panel" aria-label="Lista de membros">
        <form className="member-filters" onSubmit={applySearch} role="search" aria-label="Buscar membros">
          <div className="field">
            <label htmlFor={id + '-search'}>Buscar por nome ou e-mail</label>
            <input id={id + '-search'} type="search" maxLength={120} value={draft}
              onChange={(event) => setDraft(event.target.value)} disabled={!!action} />
          </div>
          <div className="field">
            <label htmlFor={id + '-filter'}>Situação</label>
            <select id={id + '-filter'} value={status} disabled={!!action}
              onChange={(event) => { setStatus(event.target.value as StatusFilter); setPage(1); }}>
              <option value="">Todos</option>
              <option value="active">Ativos</option>
              <option value="inactive">Inativos</option>
            </select>
          </div>
          <button className="button button--secondary" type="submit" disabled={!!action}>Buscar</button>
        </form>

        {state.status === 'loading' && <Loading>Carregando membros…</Loading>}
        {state.status === 'error' && <LoadError message={state.message} onRetry={reload} />}
        {list && (
          <>
            {list.data.length === 0 && <p className="muted">Nenhum membro encontrado.</p>}
            {list.data.length > 0 && (
              <ul className="member-list">
                {list.data.map((member) => (
                  <li key={member.id}>
                    <div className="member-details">
                      <h2>{member.name}</h2>
                      <span className={member.status === 'active' ? 'badge badge--active' : 'badge'}>
                        {member.status === 'active' ? 'Ativo' : 'Inativo'}
                      </span>
                      <p>{member.email}{member.phone && <> · {member.phone}</>}</p>
                    </div>
                    {action?.kind === 'delete' && action.member.id === member.id ? (
                      <ConfirmAction title="Remover membro?"
                        description={member.name + ' será retirado da lista de membros. Para manter o cadastro, você pode editar a situação para Inativo.'}
                        confirmLabel="Confirmar remoção" keepLabel="Manter membro" danger
                        onKeep={() => setAction(null)} onConfirm={() => remove(member)} />
                    ) : (
                      <div className="form-actions">
                        <button type="button" className="button button--secondary" disabled={!!action}
                          aria-label={'Editar ' + member.name} onClick={() => begin({ kind: 'edit', member })}>Editar</button>
                        <button type="button" className="button button--secondary" disabled={!!action}
                          aria-label={'Remover ' + member.name} onClick={() => begin({ kind: 'delete', member })}>Remover</button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {(page > 1 || list.meta.total_pages > 1) && (
              <nav className="member-pagination" aria-label="Páginas de membros">
                <button type="button" className="button button--secondary" disabled={!!action || page === 1}
                  onClick={() => setPage(page - 1)}>Anterior</button>
                <span>Página {page} de {Math.max(page, list.meta.total_pages)}</span>
                <button type="button" className="button button--secondary" disabled={!!action || page >= list.meta.total_pages}
                  onClick={() => setPage(page + 1)}>Próxima</button>
              </nav>
            )}
          </>
        )}
      </section>
    </>
  );
}
