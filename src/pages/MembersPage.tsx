import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { deleteMember, listMembers } from '../api/members';
import { isExpired } from '../api/error';
import type { Member, MemberList, MemberStatus, Session } from '../api/types';
import { AccessStatus } from '../components/AccessStatus';
import { ConfirmAction } from '../components/ConfirmAction';
import { LoadError, Loading } from '../components/LoadStatus';
import { MEMBER_STATUS_LABELS, MemberForm } from '../components/MemberForm';
import { useLoad } from '../hooks/useLoad';
import type { MemberAccess } from '../hooks/useMemberAccess';
import { routePaths } from '../navigation';

type Props = { session: Session; access: MemberAccess; onRetry: () => void; onExpired: () => void };
type Editing = 'new' | Member | null;
type Filters = { q: string; status: MemberStatus | ''; page: number };

export const MEMBERS_PAGE_SIZE = 10;

function MemberManager({ session, onExpired }: Pick<Props, 'session' | 'onExpired'>) {
  const uid = useId();
  const [filters, setFilters] = useState<Filters>({ q: '', status: '', page: 1 });
  const [search, setSearch] = useState('');
  const { state, reload, setData } = useLoad<MemberList>(
    `members:${JSON.stringify(filters)}`,
    () => listMembers(session.token, {
      page: filters.page,
      page_size: MEMBERS_PAGE_SIZE,
      q: filters.q || undefined,
      status: filters.status || undefined,
    }),
    onExpired,
  );
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const opener = useRef<string | null>(null);

  // Ao fechar um formulário, o foco volta ao botão que o abriu.
  const closed = editing === null && deleting === null;
  useEffect(() => {
    if (closed && opener.current) {
      root.current?.querySelector<HTMLElement>(`[data-opener="${opener.current}"]`)?.focus();
      opener.current = null;
    }
  }, [closed, state.status]);

  function open(key: string, form: { editing?: Editing; deleting?: number }) {
    opener.current = key;
    setNotice('');
    setEditing(form.editing ?? null);
    setDeleting(form.deleting ?? null);
  }
  function close() {
    setEditing(null);
    setDeleting(null);
  }
  function applySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFilters({ ...filters, q: search.trim(), page: 1 });
  }
  function handleSaved(saved: Member) {
    const isNew = editing === 'new';
    close();
    setNotice(isNew ? `Membro ${saved.name} cadastrado.` : 'Membro atualizado.');
    if (isNew) {
      opener.current = 'new';
      reload(); // A posição na lista (ordem, filtros, total) vem do servidor.
    } else {
      setData((list) => ({ ...list, data: list.data.map((item) => (item.id === saved.id ? saved : item)) }));
    }
  }
  async function handleDelete(member: Member) {
    try {
      await deleteMember(session.token, member.id);
    } catch (error) {
      if (isExpired(error)) return onExpired();
      throw error; // O ConfirmAction mostra a mensagem e continua aberto.
    }
    setDeleting(null);
    opener.current = 'new';
    setNotice(`Membro ${member.name} excluído.`);
    // Se era o único da página, volta uma página.
    const list = state.status === 'ready' ? state.data : null;
    if (list && list.data.length === 1 && filters.page > 1) setFilters({ ...filters, page: filters.page - 1 });
    else reload();
  }

  const list = state.status === 'ready' ? state.data : state.status === 'loading' ? state.previous : undefined;
  const filtered = filters.q !== '' || filters.status !== '';

  return (
    <div ref={root}>
      {notice && <p className="notice" role="status">{notice}</p>}
      {editing === 'new' ? (
        <MemberForm key="new" token={session.token} onSaved={handleSaved} onCancel={close} onExpired={onExpired} />
      ) : (
        <button type="button" className="submit court-new" data-opener="new" onClick={() => open('new', { editing: 'new' })}>
          Novo membro
        </button>
      )}
      {editing && editing !== 'new' && (
        <MemberForm key={editing.id} member={editing} token={session.token} onSaved={handleSaved} onCancel={close} onExpired={onExpired} />
      )}

      <div className="member-filters" role="search">
        <form className="member-search" onSubmit={applySearch}>
          <label htmlFor={`${uid}-q`} className="visually-hidden">Buscar por nome ou e-mail</label>
          <input
            id={`${uid}-q`} type="search" placeholder="Buscar por nome ou e-mail" maxLength={120}
            value={search} onChange={(event) => setSearch(event.target.value)}
          />
          <button type="submit" className="button button--secondary">Buscar</button>
        </form>
        <div className="field member-status-filter">
          <label htmlFor={`${uid}-status`}>Situação</label>
          <select
            id={`${uid}-status`} value={filters.status}
            onChange={(event) => setFilters({ ...filters, status: event.target.value as Filters['status'], page: 1 })}
          >
            <option value="">Todos</option>
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
          </select>
        </div>
      </div>

      {state.status === 'error' ? (
        <LoadError message={state.message} onRetry={reload} />
      ) : !list ? (
        <Loading>Carregando membros…</Loading>
      ) : list.data.length === 0 ? (
        <section className="content-panel empty-panel">
          {filtered ? (
            <>
              <h2>Nenhum membro encontrado</h2>
              <p>Ajuste a busca ou o filtro de situação.</p>
            </>
          ) : (
            <>
              <h2>Nenhum membro cadastrado</h2>
              <p>Use “Novo membro” para cadastrar o primeiro.</p>
            </>
          )}
        </section>
      ) : (
        <>
          <p className="muted member-count" aria-live="polite">
            {list.meta.total} {list.meta.total === 1 ? 'membro' : 'membros'}
            {state.status === 'loading' && ' · atualizando…'}
          </p>
          <table className="member-table">
            <thead>
              <tr>
                <th scope="col">Nome</th>
                <th scope="col">E-mail</th>
                <th scope="col">Telefone</th>
                <th scope="col">Situação</th>
                <th scope="col"><span className="visually-hidden">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((member) => (
                <tr key={member.id}>
                  <th scope="row" data-label="Nome">{member.name}</th>
                  <td data-label="E-mail">{member.email}</td>
                  <td data-label="Telefone">{member.phone ?? <span className="muted">—</span>}</td>
                  <td data-label="Situação">
                    <span className={member.status === 'active' ? 'badge badge--active' : 'badge'}>
                      {MEMBER_STATUS_LABELS[member.status]}
                    </span>
                  </td>
                  <td className="member-actions">
                    {deleting === member.id ? (
                      <ConfirmAction
                        title={`Excluir ${member.name}?`}
                        description="O cadastro do membro será apagado. Isso não pode ser desfeito."
                        confirmLabel="Excluir membro" keepLabel="Manter membro" danger
                        onConfirm={() => handleDelete(member)} onKeep={close}
                      />
                    ) : (
                      <div className="form-actions">
                        <button
                          type="button" className="button button--secondary" data-opener={`edit-${member.id}`}
                          aria-label={`Editar ${member.name}`} onClick={() => open(`edit-${member.id}`, { editing: member })}
                        >
                          Editar
                        </button>
                        <button
                          type="button" className="button button--secondary" data-opener={`delete-${member.id}`}
                          aria-label={`Excluir ${member.name}`} onClick={() => open(`delete-${member.id}`, { deleting: member.id })}
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
            <nav className="pagination" aria-label="Páginas de membros">
              <button
                type="button" className="button button--secondary" disabled={filters.page <= 1}
                onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
              >
                Anterior
              </button>
              <span>Página {list.meta.page} de {list.meta.total_pages}</span>
              <button
                type="button" className="button button--secondary" disabled={filters.page >= list.meta.total_pages}
                onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
              >
                Próxima
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

export function MembersPage({ session, access, onRetry, onExpired }: Props) {
  let content;
  if (access.status === 'allowed') {
    content = <MemberManager session={session} onExpired={onExpired} />;
  } else if (access.status === 'denied') {
    content = (
      <section className="content-panel empty-panel" aria-labelledby="members-status-title">
        <span className="badge">Acesso restrito</span>
        <h2 id="members-status-title">Área administrativa</h2>
        <p>Esta área está disponível apenas para administradores do clube.</p>
        <button type="button" className="button button--secondary" onClick={onRetry}>Verificar acesso novamente</button>
      </section>
    );
  } else {
    content = (
      <section className="content-panel empty-panel" aria-labelledby="members-status-title">
        <h2 id="members-status-title">
          {access.status === 'error' ? 'Acesso ainda não confirmado' : 'Verificando seu acesso'}
        </h2>
        <AccessStatus access={access} onRetry={onRetry} />
      </section>
    );
  }

  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">Administração</p>
        <h1>Membros</h1>
        <p>Consulte, cadastre e atualize os membros do clube. O cadastro de um membro é independente de uma conta de acesso.</p>
      </div>
      {content}
      <a className="text-link" href={routePaths.home}>Voltar ao início <span aria-hidden="true">→</span></a>
    </>
  );
}
