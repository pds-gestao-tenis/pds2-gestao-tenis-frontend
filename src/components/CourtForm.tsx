import { useEffect, useId, useRef, useState, useTransition, type FormEvent, type RefObject } from 'react';
import { createCourt, updateCourt } from '../api/courts';
import { ApiError, errorMessage, isExpired } from '../api/error';
import type { Court, CourtInput, Surface } from '../api/types';
import { COURT_LIMITS, courtErrors, decimalText, parseDecimal, type CourtField } from '../lib/court-rules';
import { SURFACE_LABELS } from './CourtCard';

type Props = {
  court?: Court;
  token: string;
  onSaved: (court: Court) => void;
  onCancel: () => void;
  onExpired: () => void;
};
type TextField = 'name' | 'address' | 'size_m2' | 'max_players' | 'hourly_price';
type Errors = Partial<Record<CourtField, string>>;

// Ordem dos campos na tela: o foco vai ao primeiro com erro.
const ORDER: TextField[] = ['name', 'address', 'size_m2', 'max_players', 'hourly_price'];

export function CourtForm({ court, token, onSaved, onCancel, onExpired }: Props) {
  const id = useId();
  const refs: Record<TextField, RefObject<HTMLInputElement | null>> = {
    name: useRef<HTMLInputElement>(null),
    address: useRef<HTMLInputElement>(null),
    size_m2: useRef<HTMLInputElement>(null),
    max_players: useRef<HTMLInputElement>(null),
    hourly_price: useRef<HTMLInputElement>(null),
  };
  const sending = useRef(false);
  const [values, setValues] = useState<Record<TextField, string>>({
    name: court?.name ?? '',
    address: court?.address ?? '',
    size_m2: court ? decimalText(court.size_m2) : '',
    max_players: court ? String(court.max_players) : '4',
    hourly_price: court ? decimalText(court.hourly_price) : '',
  });
  const [surface, setSurface] = useState<Surface>(court?.surface ?? 'clay');
  const [covered, setCovered] = useState(court?.covered ?? false);
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
    // Campo a campo: o corpo nunca herda chaves do estado do formulário.
    const input: CourtInput = {
      name: values.name.trim(),
      address: values.address.trim(),
      size_m2: parseDecimal(values.size_m2),
      max_players: values.max_players.trim() ? Number(values.max_players) : Number.NaN,
      hourly_price: parseDecimal(values.hourly_price),
      surface,
      covered,
    };
    const found = courtErrors(input);
    if (Object.keys(found).length > 0) return fail(found);
    setErrors({});
    sending.current = true;
    startSubmit(async () => {
      try {
        onSaved(court ? await updateCourt(token, court.id, input) : await createCourt(token, input));
      } catch (error) {
        if (isExpired(error)) return onExpired();
        const fields = error instanceof ApiError ? error.fieldErrors : {};
        const server: Errors = {};
        for (const field of ORDER) {
          // O nome traz mensagem própria (ex.: duplicado); nos demais, a regra local já explica o limite.
          if (fields[field]?.length) server[field] = field === 'name' ? fields[field][0] : courtErrors({ [field]: Number.NaN }, true)[field];
        }
        if (Object.keys(server).length > 0) fail(server);
        else setFormError(errorMessage(error, 'Não foi possível salvar a quadra. Tente de novo.'));
      } finally {
        sending.current = false;
      }
    });
  }

  function field(name: TextField, label: string, options: { hint?: string; inputMode?: 'decimal' | 'numeric'; maxLength?: number; prefix?: string }) {
    const errorId = `${id}-${name}-error`;
    const hintId = `${id}-${name}-hint`;
    const describedBy = [errors[name] ? errorId : undefined, options.hint ? hintId : undefined].filter(Boolean).join(' ');
    return (
      <div className="field">
        <label htmlFor={`${id}-${name}`}>{label}</label>
        <input
          ref={refs[name]} id={`${id}-${name}`} name={name} type="text" autoComplete="off"
          inputMode={options.inputMode} maxLength={options.maxLength}
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
      <h2 id={`${id}-title`}>{court ? 'Editar quadra' : 'Nova quadra'}</h2>
      {formError && <p className="alert" role="alert">{formError}</p>}

      {field('name', 'Nome', { maxLength: COURT_LIMITS.name })}
      {field('address', 'Endereço', { maxLength: COURT_LIMITS.address, hint: 'Onde fica a quadra no clube, ex.: Setor A, ao lado da sede.' })}

      <div className="field-grid">
        {field('size_m2', 'Área (m²)', { inputMode: 'decimal', maxLength: 12 })}
        {field('max_players', 'Máximo de jogadores', { inputMode: 'numeric', maxLength: 2, hint: 'Contando quem reserva.' })}
        {field('hourly_price', 'Preço da hora (R$)', { inputMode: 'decimal', maxLength: 14 })}
      </div>

      <div className="field">
        <label htmlFor={`${id}-surface`}>Piso</label>
        <select id={`${id}-surface`} name="surface" value={surface} onChange={(event) => setSurface(event.target.value as Surface)}>
          {(Object.keys(SURFACE_LABELS) as Surface[]).map((value) => (
            <option key={value} value={value}>{SURFACE_LABELS[value]}</option>
          ))}
        </select>
      </div>

      <div className="field field--check">
        <input id={`${id}-covered`} name="covered" type="checkbox" checked={covered} onChange={(event) => setCovered(event.target.checked)} />
        <label htmlFor={`${id}-covered`}>Coberta</label>
      </div>

      <div className="form-actions">
        <button type="submit" className="submit" disabled={submitting} aria-busy={submitting}>
          {submitting ? <><span className="rally" aria-hidden="true" />Salvando…</> : 'Salvar quadra'}
        </button>
        <button type="button" className="button button--secondary" onClick={onCancel} disabled={submitting}>Cancelar</button>
      </div>
    </form>
  );
}
