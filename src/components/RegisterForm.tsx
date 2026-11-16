import { useId, useRef, useState, useTransition, type FormEvent, type RefObject } from 'react';
import { ApiError, register, type User } from '../api/auth';
import { routePaths } from '../navigation';

type Field = 'name' | 'email' | 'password' | 'password_confirmation';
type FieldErrors = Partial<Record<Field, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MESSAGE = 'Informe um e-mail válido, como nome@exemplo.com.';
const PASSWORD_RULE = 'Use de 12 a 128 caracteres, com letras maiúsculas, minúsculas e números.';
const FIELDS: Field[] = ['name', 'email', 'password', 'password_confirmation'];

// Mesmas exigências do backend (RegisterRequest); o máximo de 128 fica no maxLength do campo.
const PASSWORD_REQUIREMENTS = [
  { label: 'Pelo menos 12 caracteres', test: (value: string) => [...value].length >= 12 },
  { label: 'Uma letra maiúscula', test: (value: string) => /\p{Lu}/u.test(value) },
  { label: 'Uma letra minúscula', test: (value: string) => /\p{Ll}/u.test(value) },
  { label: 'Um número', test: (value: string) => /\p{Nd}/u.test(value) },
];
const meetsRequirements = (value: string) => PASSWORD_REQUIREMENTS.every((item) => item.test(value));

// Mesmas regras do backend (RegisterRequest), para avisar antes de enviar.
function validate(name: string, email: string, password: string, confirmation: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!name.trim()) errors.name = 'Informe seu nome.';
  if (!email.trim()) errors.email = 'Informe seu e-mail.';
  else if (!EMAIL_PATTERN.test(email.trim())) errors.email = EMAIL_MESSAGE;
  if (!password) errors.password = 'Crie uma senha.';
  else if (!meetsRequirements(password)) errors.password = 'A senha ainda não atende a todas as exigências.';
  if (!confirmation) errors.password_confirmation = 'Repita a senha.';
  else if (confirmation !== password) errors.password_confirmation = 'A confirmação de senha não confere.';
  return errors;
}

type Props = {
  onRegistered: (user: User) => void;
};

export function RegisterForm({ onRegistered }: Props) {
  const id = useId();
  const refs: Record<Field, RefObject<HTMLInputElement | null>> = {
    name: useRef<HTMLInputElement>(null),
    email: useRef<HTMLInputElement>(null),
    password: useRef<HTMLInputElement>(null),
    password_confirmation: useRef<HTMLInputElement>(null),
  };

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [submitting, startSubmit] = useTransition();

  function focusFirst(found: FieldErrors) {
    const first = FIELDS.find((field) => found[field]);
    if (first) refs[first].current?.focus();
    return Boolean(first);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const found = validate(name, email, password, confirmation);
    setErrors(found);
    setFormError('');
    if (focusFirst(found)) return;

    startSubmit(async () => {
      try {
        onRegistered(await register({
          name: name.trim(),
          email: email.trim(),
          password,
          password_confirmation: confirmation,
        }));
      } catch (error) {
        showApiError(error instanceof ApiError ? error : new ApiError('Algo deu errado. Tente de novo.', 0));
      }
    });
  }

  function showApiError(apiError: ApiError) {
    const server = apiError.fieldErrors;
    if (apiError.status === 422 && FIELDS.some((field) => server[field])) {
      // As mensagens próprias do backend vêm em português; as do Pydantic, não.
      const emailMessage = server.email?.find((message) => message.includes('cadastrado'));
      const found: FieldErrors = {
        name: server.name && 'Informe seu nome com até 120 caracteres.',
        email: server.email && (emailMessage ?? EMAIL_MESSAGE),
        password: server.password && PASSWORD_RULE,
        password_confirmation: server.password_confirmation && 'A confirmação de senha não confere.',
      };
      setErrors(found);
      focusFirst(found);
      return;
    }
    setFormError(apiError.message);
  }

  const errorId = (field: Field) => `${id}-${field}-error`;
  const describe = (field: Field, extra?: string) =>
    [errors[field] ? errorId(field) : undefined, extra].filter(Boolean).join(' ') || undefined;
  const fieldError = (field: Field) =>
    errors[field] && (
      <p id={errorId(field)} className="field-error">
        {errors[field]}
      </p>
    );
  const passwordHintId = `${id}-password-hint`;
  // Fica vermelho assim que a pessoa começa a digitar e some quando tudo é atendido.
  const passwordInvalid = Boolean(errors.password) || (password !== '' && !meetsRequirements(password));

  return (
    <form className="card login-card" onSubmit={handleSubmit} noValidate aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="card-title">
        Crie sua conta
      </h2>

      {formError && (
        <p className="alert" role="alert">
          {formError}
        </p>
      )}

      <div className="field">
        <label htmlFor={`${id}-name`}>Nome</label>
        <input
          ref={refs.name}
          id={`${id}-name`}
          type="text"
          name="name"
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={describe('name')}
          maxLength={120}
        />
        {fieldError('name')}
      </div>

      <div className="field">
        <label htmlFor={`${id}-email`}>E-mail</label>
        <input
          ref={refs.email}
          id={`${id}-email`}
          type="email"
          name="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={describe('email')}
          maxLength={254}
        />
        {fieldError('email')}
      </div>

      <div className="field">
        <label htmlFor={`${id}-password`}>Senha</label>
        <div className="password">
          <input
            ref={refs.password}
            id={`${id}-password`}
            type={showPassword ? 'text' : 'password'}
            name="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              // A mensagem do envio sai quando a checklist já diz que está tudo certo.
              if (errors.password && meetsRequirements(event.target.value)) {
                setErrors((current) => ({ ...current, password: undefined }));
              }
            }}
            aria-invalid={passwordInvalid ? true : undefined}
            aria-describedby={describe('password', passwordHintId)}
            maxLength={128}
          />
          <button
            type="button"
            className="password-toggle"
            onClick={() => setShowPassword((value) => !value)}
            aria-pressed={showPassword}
            aria-controls={`${id}-password ${id}-password_confirmation`}
          >
            {showPassword ? 'Ocultar' : 'Mostrar'}
            <span className="visually-hidden"> senhas</span>
          </button>
        </div>
        {fieldError('password')}
        <ul id={passwordHintId} className="password-rules" aria-label="Exigências da senha">
          {PASSWORD_REQUIREMENTS.map(({ label, test }) => {
            const met = test(password);
            return (
              <li key={label} className={met ? 'is-met' : undefined}>
                <span className="password-rule-icon" aria-hidden="true">{met ? '✓' : '✕'}</span>
                {label}
                <span className="visually-hidden">{met ? ': atendida' : ': pendente'}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="field">
        <label htmlFor={`${id}-password_confirmation`}>Confirme a senha</label>
        <input
          ref={refs.password_confirmation}
          id={`${id}-password_confirmation`}
          type={showPassword ? 'text' : 'password'}
          name="password_confirmation"
          autoComplete="new-password"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          aria-invalid={errors.password_confirmation ? true : undefined}
          aria-describedby={describe('password_confirmation')}
          maxLength={128}
        />
        {fieldError('password_confirmation')}
      </div>

      <button type="submit" className="submit" disabled={submitting} aria-busy={submitting}>
        {submitting ? (
          <>
            <span className="rally" aria-hidden="true" />
            Criando conta…
          </>
        ) : (
          'Criar conta'
        )}
      </button>

      <p className="card-switch">
        Já tem conta? <a className="text-link" href={routePaths.login}>Entrar</a>
      </p>

      <p className="card-help">
        Não consegue entrar?<br />
        Fale com a secretaria do clube.
      </p>
    </form>
  );
}
