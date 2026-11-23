import { useId, useRef, useState, type FormEvent } from 'react';
import { recordPayment } from '../api/finance';
import { ApiError, errorMessage, isExpired } from '../api/error';
import type { Fee } from '../api/types';
import { clubDate } from '../lib/club-time';
import { formatMoney, parseMoney } from '../lib/money';

export function PaymentForm({ fee, token, onSaved, onCancel, onExpired, onConflict }: {
  fee: Fee; token: string; onSaved: (fee: Fee) => void; onCancel: () => void; onExpired: () => void; onConflict: (message: string) => void;
}) {
  const id = useId();
  const amountRef = useRef<HTMLInputElement>(null);
  const sending = useRef(false);
  const [amount, setAmount] = useState((fee.balance_cents / 100).toFixed(2).replace('.', ','));
  const [paidOn, setPaidOn] = useState(() => clubDate(Date.now()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending.current) return;
    const cents = parseMoney(amount);
    if (cents === null || cents > fee.balance_cents) {
      setError(`Informe um valor positivo de até ${formatMoney(fee.balance_cents)}.`);
      return amountRef.current?.focus();
    }
    if (!paidOn || paidOn > clubDate(Date.now())) return setError('Informe uma data de pagamento válida, até hoje.');
    sending.current = true; setBusy(true); setError('');
    try { onSaved(await recordPayment(token, fee.id, { amount_cents: cents, paid_on: paidOn })); }
    catch (failure) {
      if (isExpired(failure)) return onExpired();
      const message = errorMessage(failure, 'Não foi possível registrar o pagamento.');
      setError(message);
      if (failure instanceof ApiError && failure.status === 409) onConflict(message);
    } finally { sending.current = false; setBusy(false); }
  }
  return (
    <form className="payment-form" aria-label={`Pagamento de ${fee.description}`} onSubmit={submit} noValidate>
      <h3>Registrar pagamento</h3><p className="muted">Saldo atual: {formatMoney(fee.balance_cents)}</p>
      {error && <p className="alert" role="alert">{error}</p>}
      <div className="finance-fields">
        <div className="field"><label htmlFor={`${id}-amount`}>Valor pago (R$)</label><input ref={amountRef} id={`${id}-amount`} name="amount_cents" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} maxLength={10} /></div>
        <div className="field"><label htmlFor={`${id}-paid-on`}>Data do pagamento</label><input id={`${id}-paid-on`} name="paid_on" type="date" value={paidOn} max={clubDate(Date.now())} onChange={(event) => setPaidOn(event.target.value)} /></div>
      </div>
      <div className="form-actions"><button className="button" type="submit" disabled={busy}>{busy ? 'Registrando…' : 'Confirmar pagamento'}</button><button className="button button--secondary" type="button" onClick={onCancel} disabled={busy}>Cancelar</button></div>
    </form>
  );
}
