import { useId, useRef, useState, useTransition, type FormEvent } from 'react';
import { register } from '../api/auth';
import { ApiError, errorMessage } from '../api/error';
import type { RegisterInput } from '../api/types';
import { routePaths } from '../navigation';

const fields = [
  { name: 'name', label: 'Nome completo', type: 'text', autoComplete: 'name', maxLength: 120 },
  { name: 'email', label: 'E-mail', type: 'email', autoComplete: 'email', maxLength: 254 },
  { name: 'password', label: 'Senha', type: 'password', autoComplete: 'new-password', maxLength: 128 },
  { name: 'password_confirmation', label: 'Confirme a senha', type: 'password', autoComplete: 'new-password', maxLength: 128 },
] as const;
const passwordHelp = 'Use de 12 a 128 caracteres, com letras maiúsculas, minúsculas e números.';
type Errors = Partial<Record<keyof RegisterInput, string>>;

export function RegisterForm() {
  const id = useId();
  const sending = useRef(false);
  const [busy, startSubmit] = useTransition();
  const [created, setCreated] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState('');

  function showErrors(form: HTMLFormElement, next: Errors) {
    setErrors(next);
    const field = fields.find(({ name }) => next[name]);
    if (field) (form.elements.namedItem(field.name) as HTMLElement | null)?.focus();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const input: RegisterInput = {
      name: String(data.get('name')).trim(),
      email: String(data.get('email')).trim(),
      password: String(data.get('password')),
      password_confirmation: String(data.get('password_confirmation')),
    };
    const next: Errors = {};
    if (!input.name) next.name = 'Informe seu nome.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) next.email = 'Informe um e-mail válido.';
    if (Array.from(input.password).length < 12 || !/\p{Lu}/u.test(input.password) ||
      !/\p{Ll}/u.test(input.password) || !/\p{Nd}/u.test(input.password)) next.password = passwordHelp;
    if (!input.password_confirmation || input.password_confirmation !== input.password) {
      next.password_confirmation = 'As senhas precisam ser iguais.';
    }
    setFormError('');
    if (Object.keys(next).length) return showErrors(form, next);
    setErrors({});
    sending.current = true;
    startSubmit(async () => {
      try {
        await register(input);
        setCreated(true);
      } catch (error) {
        const server: Errors = {};
        if (error instanceof ApiError) {
          for (const { name } of fields) {
            const message = error.fieldErrors[name]?.[0];
            if (message) server[name] = message;
          }
        }
        if (Object.keys(server).length) showErrors(form, server);
        else setFormError(errorMessage(error, 'Não foi possível criar sua conta. Tente novamente.'));
      } finally {
        sending.current = false;
      }
    });
  }

  if (created) return (
    <section className="card recovery-card" aria-labelledby={`${id}-title`}>
      <h2 className="card-title" id={`${id}-title`}>Conta criada</h2>
      <p className="card-lead" role="status">Entre com o e-mail e a senha que você cadastrou.</p>
      <a className="button" href={routePaths.login}>Ir para o login</a>
    </section>
  );

  return (
    <form className="card login-card" noValidate onSubmit={submit} aria-labelledby={`${id}-title`}>
      <h2 className="card-title" id={`${id}-title`}>Crie sua conta</h2>
      {formError && <p className="alert" role="alert">{formError}</p>}
      {fields.map(({ name, label, ...attributes }) => {
        const fieldId = `${id}-${name}`;
        const errorId = `${fieldId}-error`;
        const hintId = `${fieldId}-hint`;
        const description = errors[name] ? errorId : name === 'password' ? hintId : undefined;
        return (
          <div className="field" key={name}>
            <label htmlFor={fieldId}>{label}</label>
            <input {...attributes} id={fieldId} name={name} readOnly={busy}
              aria-invalid={!!errors[name]} aria-describedby={description} required />
            {errors[name] && <p className="field-error" id={errorId}>{errors[name]}</p>}
            {name === 'password' && !errors[name] && <p className="card-help" id={hintId}>{passwordHelp}</p>}
          </div>
        );
      })}
      <button type="submit" className="submit" disabled={busy} aria-busy={busy}>{busy ? 'Criando conta…' : 'Criar conta'}</button>
      <p className="card-help">Já tem conta? <a className="text-link" href={routePaths.login}>Entrar</a></p>
    </form>
  );
}
