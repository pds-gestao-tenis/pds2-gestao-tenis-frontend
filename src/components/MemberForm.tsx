import { useEffect, useId, useRef, useState, useTransition, type FormEvent, type RefObject } from 'react';
import { createMember, updateMember } from '../api/members';
import { ApiError, errorMessage, isExpired } from '../api/error';
import type { CreateMemberInput, Member, MemberStatus } from '../api/types';

type Props = {
  member?: Member;
  token: string;
  onSaved: (member: Member) => void;
  onCancel: () => void;
  onExpired: () => void;
};
type TextField = 'name' | 'email' | 'phone';
type Errors = Partial<Record<TextField | 'status', string>>;

// Ordem dos campos na tela: o foco vai ao primeiro com erro.
const ORDER: TextField[] = ['name', 'email', 'phone'];
export const MEMBER_STATUS_LABELS: Record<MemberStatus, string> = { active: 'Ativo', inactive: 'Inativo' };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Mesmas regras do backend (app/schemas/members.py); o servidor continua sendo a autoridade.
export function memberErrors(input: CreateMemberInput): Errors {
  const errors: Errors = {};
  if (!input.name) errors.name = 'Informe o nome.';
  else if (input.name.length > 120) errors.name = 'O nome deve ter no máximo 120 caracteres.';
  if (!input.email) errors.email = 'Informe o e-mail.';
  else if (input.email.length > 254 || !EMAIL.test(input.email)) errors.email = 'Informe um e-mail válido.';
  if (input.phone) {
    const digits = input.phone.replace(/\D/g, '').length;
    if (input.phone.length > 32 || !/^\+?[0-9(). -]+$/.test(input.phone) || digits < 7 || digits > 15) {
      errors.phone = 'Informe um telefone com 7 a 15 dígitos e formato válido.';
    }
  }
  return errors;
}

export function MemberForm({ member, token, onSaved, onCancel, onExpired }: Props) {
  const id = useId();
  const refs: Record<TextField, RefObject<HTMLInputElement | null>> = {
    name: useRef<HTMLInputElement>(null),
    email: useRef<HTMLInputElement>(null),
    phone: useRef<HTMLInputElement>(null),
  };
  const sending = useRef(false);
  const [values, setValues] = useState<Record<TextField, string>>({
    name: member?.name ?? '',
    email: member?.email ?? '',
    phone: member?.phone ?? '',
  });
  const [status, setStatus] = useState<MemberStatus>(member?.status ?? 'active');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState('');
  const [submitting, startSubmit] = useTransition();

  const nameRef = refs.name;
  useEffect(() => nameRef.current?.focus(), [nameRef]);

  function fail(next: Errors) {
    setErrors(next);
    const first = ORDER.find((field) => next[field]);
    if (first) refs[first].current?.focus();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || sending.current) return;
    setFormError('');
    const input: CreateMemberInput = {
      name: values.name.trim(),
      email: values.email.trim().toLowerCase(),
      phone: values.phone.trim() || null,
      status,
    };
    const found = memberErrors(input);
    if (Object.keys(found).length > 0) return fail(found);
    setErrors({});
    sending.current = true;
    startSubmit(async () => {
      try {
        onSaved(member ? await updateMember(token, member.id, input) : await createMember(token, input));
      } catch (error) {
        if (isExpired(error)) return onExpired();
        const fields = error instanceof ApiError ? error.fieldErrors : {};
        const server: Errors = {};
        for (const field of [...ORDER, 'status'] as const) {
          if (fields[field]?.length) server[field] = fields[field][0];
        }
        if (Object.keys(server).length > 0) fail(server);
        else setFormError(errorMessage(error, 'Não foi possível salvar o membro. Tente de novo.'));
      } finally {
        sending.current = false;
      }
    });
  }

  function field(name: TextField, label: string, options: { type?: string; autoComplete?: string; maxLength: number; hint?: string }) {
    const errorId = `${id}-${name}-error`;
    const hintId = `${id}-${name}-hint`;
    const describedBy = [errors[name] ? errorId : undefined, options.hint ? hintId : undefined].filter(Boolean).join(' ');
    return (
      <div className="field">
        <label htmlFor={`${id}-${name}`}>{label}</label>
        <input
          ref={refs[name]} id={`${id}-${name}`} name={name} type={options.type ?? 'text'}
          autoComplete={options.autoComplete ?? 'off'} maxLength={options.maxLength}
          value={values[name]} onChange={(event) => setValues({ ...values, [name]: event.target.value })}
          aria-invalid={errors[name] ? true : undefined} aria-describedby={describedBy || undefined}
        />
        {options.hint && !errors[name] && <p id={hintId} className="field-hint">{options.hint}</p>}
        {errors[name] && <p id={errorId} className="field-error">{errors[name]}</p>}
      </div>
    );
  }

  return (
    <form className="content-panel court-form" onSubmit={handleSubmit} noValidate aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{member ? 'Editar membro' : 'Novo membro'}</h2>
      {formError && <p className="alert" role="alert">{formError}</p>}

      {field('name', 'Nome', { maxLength: 120, autoComplete: 'off' })}
      <div className="field-grid">
        {field('email', 'E-mail', { type: 'email', maxLength: 254 })}
        {field('phone', 'Telefone (opcional)', { type: 'tel', maxLength: 32, hint: 'Ex.: +55 (31) 99999-1234' })}
      </div>

      <div className="field">
        <label htmlFor={`${id}-status`}>Situação</label>
        <select id={`${id}-status`} name="status" value={status} onChange={(event) => setStatus(event.target.value as MemberStatus)}>
          {(Object.keys(MEMBER_STATUS_LABELS) as MemberStatus[]).map((value) => (
            <option key={value} value={value}>{MEMBER_STATUS_LABELS[value]}</option>
          ))}
        </select>
        {errors.status && <p className="field-error">{errors.status}</p>}
      </div>

      <div className="form-actions">
        <button type="submit" className="submit" disabled={submitting} aria-busy={submitting}>
          {submitting ? <><span className="rally" aria-hidden="true" />Salvando…</> : 'Salvar membro'}
        </button>
        <button type="button" className="button button--secondary" onClick={onCancel} disabled={submitting}>Cancelar</button>
      </div>
    </form>
  );
}
