import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from 'react';
import { createFee } from '../api/extras';
import { ApiError, errorMessage, isExpired } from '../api/error';
import { listMembers } from '../api/members';
import type { Fee, Member } from '../api/types';
import { useLoad } from '../hooks/useLoad';
import { parseDecimal } from '../lib/court-rules';

type Props = { token: string; onSaved: (fee: Fee) => void; onCancel: () => void; onExpired: () => void };
type Field = 'member_id' | 'description' | 'amount' | 'due_date';
type Errors = Partial<Record<Field, string>>;
const ORDER: Field[] = ['member_id', 'description', 'amount', 'due_date'];

/** US19: lançar uma taxa para um membro. */
export function FeeForm({ token, onSaved, onCancel, onExpired }: Props) {
  const id = useId();
  const refs = {
    member_id: useRef<HTMLSelectElement>(null),
    description: useRef<HTMLInputElement>(null),
    amount: useRef<HTMLInputElement>(null),
    due_date: useRef<HTMLInputElement>(null),
  };
  const [values, setValues] = useState({ member_id: '', description: '', amount: '', due_date: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState('');
  const [submitting, startSubmit] = useTransition();
  const sending = useRef(false);

  // Membros ativos para escolher (até 100, o limite de uma página da API).
  const { state: membersState } = useLoad('fee-form-members', () => listMembers(token, { page_size: 100, status: 'active' }), onExpired);
  const members: Member[] | null = membersState.status === 'ready' ? membersState.data.data : null;
  const membersError = membersState.status === 'error' ? membersState.message : '';
  const memberRef = refs.member_id;
  useEffect(() => { if (members) memberRef.current?.focus(); }, [members, memberRef]);

  function fail(next: Errors) {
    setErrors(next);
    const first = ORDER.find((field) => next[field]);
    if (first) refs[first].current?.focus();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || sending.current) return;
    setFormError('');
    const amount = parseDecimal(values.amount);
    const next: Errors = {};
    if (!values.member_id) next.member_id = 'Escolha o membro.';
    if (!values.description.trim()) next.description = 'Informe a descrição.';
    if (!/^\d+([.,]\d{1,2})?$/.test(values.amount.trim()) || !(amount > 0)) next.amount = 'Informe um valor maior que zero, como 150,00.';
    if (!values.due_date) next.due_date = 'Informe o vencimento.';
    if (Object.keys(next).length) return fail(next);
    setErrors({});
    sending.current = true;
    startSubmit(async () => {
      try {
        onSaved(await createFee(token, {
          member_id: Number(values.member_id), description: values.description.trim(), amount, due_date: values.due_date,
        }));
      } catch (error) {
        if (isExpired(error)) return onExpired();
        const fields = error instanceof ApiError ? error.fieldErrors : {};
        const server: Errors = {};
        for (const field of ORDER) if (fields[field]?.length) server[field] = fields[field][0];
        if (Object.keys(server).length) fail(server);
        else setFormError(errorMessage(error, 'Não foi possível lançar a taxa. Tente de novo.'));
      } finally {
        sending.current = false;
      }
    });
  }

  const describe = (field: Field) => (errors[field] ? `${id}-${field}-error` : undefined);
  const error = (field: Field) => errors[field] && <p id={`${id}-${field}-error`} className="field-error">{errors[field]}</p>;

  return (
    <form className="content-panel court-form" onSubmit={handleSubmit} noValidate aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Nova taxa</h2>
      {(formError || membersError) && <p className="alert" role="alert">{formError || membersError}</p>}
      <div className="field">
        <label htmlFor={`${id}-member`}>Membro</label>
        <select
          ref={refs.member_id} id={`${id}-member`} value={values.member_id} disabled={!members}
          onChange={(event) => setValues({ ...values, member_id: event.target.value })}
          aria-invalid={errors.member_id ? true : undefined} aria-describedby={describe('member_id')}
        >
          <option value="">{members ? 'Escolha o membro' : 'Carregando membros…'}</option>
          {members?.map((member) => <option key={member.id} value={member.id}>{member.name} ({member.email})</option>)}
        </select>
        {error('member_id')}
      </div>
      <div className="field">
        <label htmlFor={`${id}-description`}>Descrição</label>
        <input
          ref={refs.description} id={`${id}-description`} type="text" maxLength={120} autoComplete="off"
          placeholder="Ex.: Mensalidade de dezembro" value={values.description}
          onChange={(event) => setValues({ ...values, description: event.target.value })}
          aria-invalid={errors.description ? true : undefined} aria-describedby={describe('description')}
        />
        {error('description')}
      </div>
      <div className="field-grid">
        <div className="field">
          <label htmlFor={`${id}-amount`}>Valor (R$)</label>
          <input
            ref={refs.amount} id={`${id}-amount`} type="text" inputMode="decimal" maxLength={14} autoComplete="off"
            value={values.amount} onChange={(event) => setValues({ ...values, amount: event.target.value })}
            aria-invalid={errors.amount ? true : undefined} aria-describedby={describe('amount')}
          />
          {error('amount')}
        </div>
        <div className="field">
          <label htmlFor={`${id}-due`}>Vencimento</label>
          <input
            ref={refs.due_date} id={`${id}-due`} type="date" value={values.due_date}
            onChange={(event) => setValues({ ...values, due_date: event.target.value })}
            aria-invalid={errors.due_date ? true : undefined} aria-describedby={describe('due_date')}
          />
          {error('due_date')}
        </div>
      </div>
      <div className="form-actions">
        <button type="submit" className="submit" disabled={submitting || !members} aria-busy={submitting}>
          {submitting ? <><span className="rally" aria-hidden="true" />Salvando…</> : 'Lançar taxa'}
        </button>
        <button type="button" className="button button--secondary" onClick={onCancel} disabled={submitting}>Cancelar</button>
      </div>
    </form>
  );
}
