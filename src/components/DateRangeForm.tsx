import { useId, useState, type FormEvent } from 'react';

export type DateRange = { from: string; to: string };
export function DateRangeForm({ value, onChange }: { value: DateRange; onChange: (range: DateRange) => void }) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState('');
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.from || !draft.to || draft.from > draft.to || Date.parse(draft.to) - Date.parse(draft.from) > 365 * 86400000) return setError('Escolha um período válido de até 366 dias.');
    setError(''); onChange(draft);
  }
  return <form className="range-form" onSubmit={submit} aria-label="Período da consulta">
    <div className="field"><label htmlFor={`${id}-from`}>De</label><input id={`${id}-from`} type="date" value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} required /></div>
    <div className="field"><label htmlFor={`${id}-to`}>Até</label><input id={`${id}-to`} type="date" value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} required /></div>
    <button className="button" type="submit">Consultar período</button>
    {error && <p className="field-error" role="alert">{error}</p>}
  </form>;
}
