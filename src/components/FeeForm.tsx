import { useId, useRef, useState, type FormEvent } from 'react';
import { createFee } from '../api/finance';
import { ApiError, errorMessage, isExpired } from '../api/error';
import { listMembers } from '../api/members';
import type { Fee } from '../api/types';
import { useLoad } from '../hooks/useLoad';
import { parseMoney } from '../lib/money';
import { LoadError, Loading } from './LoadStatus';

type Values = { member_id: string; description: string; amount_cents: string; due_date: string };
export function FeeForm({ token, onSaved, onCancel, onExpired }: { token: string; onSaved: (fee: Fee) => void; onCancel: () => void; onExpired: () => void }) {
  const id = useId();
  const form = useRef<HTMLFormElement>(null);
  const sending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [values, setValues] = useState<Values>({ member_id: '', description: '', amount_cents: '', due_date: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof Values, string>>>({});
  const [error, setError] = useState('');
  const members = useLoad(`fee-members:${search}`, () => listMembers(token, { q: search.trim(), page_size: 100 }), onExpired);
  function change(name: keyof Values, value: string) { setValues((current) => ({ ...current, [name]: value })); }
  function showErrors(next: typeof errors) {
    setErrors(next);
    (form.current?.elements.namedItem(Object.keys(next)[0]) as HTMLElement | null)?.focus();
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending.current) return;
    const next: typeof errors = {};
    const cents = parseMoney(values.amount_cents);
    if (!values.member_id) next.member_id = 'Escolha um membro.';
    if (!values.description.trim()) next.description = 'Informe a descrição da taxa.';
    if (cents === null) next.amount_cents = 'Informe um valor válido, como 120,50.';
    if (!values.due_date) next.due_date = 'Informe o vencimento.';
    if (Object.keys(next).length) return showErrors(next);
    setErrors({}); setError(''); setBusy(true); sending.current = true;
    try {
      onSaved(await createFee(token, { member_id: Number(values.member_id), description: values.description.trim(), amount_cents: cents!, due_date: values.due_date }));
    } catch (failure) {
      if (isExpired(failure)) return onExpired();
      if (failure instanceof ApiError && Object.keys(failure.fieldErrors).length) {
        const fields: typeof errors = {};
        for (const key of Object.keys(values) as (keyof Values)[]) if (failure.fieldErrors[key]?.[0]) fields[key] = failure.fieldErrors[key][0];
        if (Object.keys(fields).length) showErrors(fields);
        else setError(failure.message);
      } else setError(errorMessage(failure, 'Não foi possível lançar a taxa.'));
    } finally { sending.current = false; setBusy(false); }
  }
  const fieldError = (name: keyof Values) => errors[name] && <p className="field-error" id={`${id}-${name}-error`}>{errors[name]}</p>;
  return (
    <form ref={form} className="content-panel finance-form" onSubmit={submit} noValidate aria-label="Nova taxa">
      <h2>Nova taxa</h2>
      {error && <p className="alert" role="alert">{error}</p>}
      <div className="field"><label htmlFor={`${id}-search`}>Buscar membro por nome ou e-mail</label><input id={`${id}-search`} type="search" maxLength={120} value={search} onChange={(event) => { setSearch(event.target.value); change('member_id', ''); }} /></div>
      {members.state.status === 'loading' && <Loading>Buscando membros…</Loading>}
      {members.state.status === 'error' && <LoadError message={members.state.message} onRetry={members.reload} />}
      <div className="field">
        <label htmlFor={`${id}-member`}>Membro</label>
        <select id={`${id}-member`} name="member_id" value={values.member_id} onChange={(event) => change('member_id', event.target.value)} disabled={members.state.status !== 'ready'} aria-invalid={!!errors.member_id} aria-describedby={errors.member_id ? `${id}-member_id-error` : undefined}>
          <option value="">Selecione um membro</option>
          {members.state.status === 'ready' && members.state.data.data.map((member) => <option key={member.id} value={member.id}>{member.name}{member.status === 'inactive' ? ' (inativo)' : ''}</option>)}
        </select>{fieldError('member_id')}
        {members.state.status === 'ready' && members.state.data.data.length === 0 && <p className="muted">Nenhum membro encontrado.</p>}
      </div>
      <div className="finance-fields">
        <div className="field"><label htmlFor={`${id}-description`}>Descrição</label><input id={`${id}-description`} name="description" maxLength={120} value={values.description} onChange={(event) => change('description', event.target.value)} aria-invalid={!!errors.description} aria-describedby={errors.description ? `${id}-description-error` : undefined} />{fieldError('description')}</div>
        <div className="field"><label htmlFor={`${id}-amount`}>Valor (R$)</label><input id={`${id}-amount`} name="amount_cents" inputMode="decimal" maxLength={10} placeholder="0,00" value={values.amount_cents} onChange={(event) => change('amount_cents', event.target.value)} aria-invalid={!!errors.amount_cents} aria-describedby={errors.amount_cents ? `${id}-amount_cents-error` : undefined} />{fieldError('amount_cents')}</div>
        <div className="field"><label htmlFor={`${id}-due`}>Vencimento</label><input id={`${id}-due`} name="due_date" type="date" value={values.due_date} onChange={(event) => change('due_date', event.target.value)} aria-invalid={!!errors.due_date} aria-describedby={errors.due_date ? `${id}-due_date-error` : undefined} />{fieldError('due_date')}</div>
      </div>
      <div className="form-actions"><button className="button" type="submit" disabled={busy || members.state.status !== 'ready'}>{busy ? 'Salvando…' : 'Lançar taxa'}</button><button className="button button--secondary" type="button" onClick={onCancel} disabled={busy}>Cancelar</button></div>
    </form>
  );
}
