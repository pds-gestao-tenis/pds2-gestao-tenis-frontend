import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from 'react';
import { ApiError, errorMessage, isExpired } from '../api/error';
import { createMember, updateMember } from '../api/members';
import type { CreateMemberInput, Member } from '../api/types';

const fields = [
  { name: 'name', label: 'Nome', type: 'text', autoComplete: 'name', maxLength: 120, required: true },
  { name: 'email', label: 'E-mail', type: 'email', autoComplete: 'email', maxLength: 254, required: true },
  { name: 'phone', label: 'Telefone (opcional)', type: 'tel', autoComplete: 'tel', maxLength: 32 },
] as const;
type Errors = Partial<Record<keyof CreateMemberInput, string>>;
type Props = {
  token: string;
  member?: Member;
  onSaved: () => void;
  onCancel: () => void;
  onExpired: () => void;
};

export function MemberForm({ token, member, onSaved, onCancel, onExpired }: Props) {
  const id = useId();
  const nameInput = useRef<HTMLInputElement>(null);
  const sending = useRef(false);
  const [busy, startSubmit] = useTransition();
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState('');

  useEffect(() => { nameInput.current?.focus(); }, []);

  function showErrors(form: HTMLFormElement, next: Errors) {
    setErrors(next);
    const field = Object.keys(next)[0];
    (form.elements.namedItem(field) as HTMLElement | null)?.focus();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const input: CreateMemberInput = {
      name: String(data.get('name')).trim(),
      email: String(data.get('email')).trim(),
      phone: String(data.get('phone')).trim() || null,
      status: data.get('status') === 'inactive' ? 'inactive' : 'active',
    };
    const next: Errors = {};
    if (!input.name) next.name = 'Informe o nome do membro.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) next.email = 'Informe um e-mail válido.';
    if (input.phone) {
      const digits = input.phone.replace(/\D/g, '').length;
      if (digits < 7 || digits > 15 || !/^\+?[0-9(). -]+$/.test(input.phone)) {
        next.phone = 'Informe um telefone com 7 a 15 dígitos.';
      }
    }
    setFormError('');
    if (Object.keys(next).length) return showErrors(form, next);
    setErrors({});
    sending.current = true;
    startSubmit(async () => {
      try {
        if (member) await updateMember(token, member.id, input);
        else await createMember(token, input);
        onSaved();
      } catch (error) {
        if (isExpired(error)) return onExpired();
        const server: Errors = {};
        if (error instanceof ApiError) {
          for (const key of ['name', 'email', 'phone', 'status'] as const) {
            const message = error.fieldErrors[key]?.[0];
            if (message) server[key] = message;
          }
        }
        if (Object.keys(server).length) showErrors(form, server);
        else setFormError(errorMessage(error, 'Não foi possível salvar o membro. Tente novamente.'));
      } finally {
        sending.current = false;
      }
    });
  }

  return (
    <form className="content-panel court-form" onSubmit={submit} noValidate aria-labelledby={id + '-title'}>
      <h2 id={id + '-title'}>{member ? 'Editar membro' : 'Novo membro'}</h2>
      {formError && <p className="alert" role="alert">{formError}</p>}
      <div className="member-fields">
        {fields.map(({ name, label, ...attributes }) => {
          const fieldId = id + '-' + name;
          return (
            <div className="field" key={name}>
              <label htmlFor={fieldId}>{label}</label>
              <input {...attributes} id={fieldId} name={name} defaultValue={member?.[name] ?? ''}
                ref={name === 'name' ? nameInput : undefined} readOnly={busy}
                aria-invalid={!!errors[name]} aria-describedby={errors[name] ? fieldId + '-error' : undefined} />
              {errors[name] && <p className="field-error" id={fieldId + '-error'}>{errors[name]}</p>}
            </div>
          );
        })}
        <div className="field">
          <label htmlFor={id + '-status'}>Situação do membro</label>
          <select id={id + '-status'} name="status" defaultValue={member?.status ?? 'active'} disabled={busy}
            aria-invalid={!!errors.status} aria-describedby={errors.status ? id + '-status-error' : undefined}>
            <option value="active">Ativo</option>
            <option value="inactive">Inativo</option>
          </select>
          {errors.status && <p className="field-error" id={id + '-status-error'}>{errors.status}</p>}
        </div>
      </div>
      <div className="form-actions">
        <button type="submit" className="button" disabled={busy} aria-busy={busy}>{busy ? 'Salvando…' : 'Salvar membro'}</button>
        <button type="button" className="button button--secondary" onClick={onCancel} disabled={busy}>Cancelar</button>
      </div>
    </form>
  );
}
