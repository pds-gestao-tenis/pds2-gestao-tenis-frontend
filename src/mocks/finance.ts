import { ApiError } from '../api/error';
import type { ApiServices, Fee, FeeInput, PaymentInput } from '../api/types';
import { clubDate } from '../lib/club-time';
import type { MockContext, MockFee } from './context';

function invalid(field: string, message: string): never {
  throw new ApiError('Os dados informados são inválidos.', 422, { [field]: [message] });
}
function checkKeys(input: object, allowed: string[]) {
  for (const key of Object.keys(input)) if (!allowed.includes(key)) invalid(key, 'Este campo não pode ser informado.');
}
function amount(value: number) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 999999999) invalid('amount_cents', 'Informe um valor positivo de até R$ 9.999.999,99.');
}
function date(value: string, field: string) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(`${value}T12:00:00Z`)) || new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value) {
    invalid(field, 'Informe uma data válida.');
  }
}
function toFee(ctx: MockContext, item: MockFee): Fee {
  const paid = item.payments.reduce((total, payment) => total + payment.amount_cents, 0);
  return {
    id: item.id, member: { id: item.member_id, name: ctx.db.members.find((member) => member.id === item.member_id)?.name ?? item.member_name },
    description: item.description, amount_cents: item.amount_cents, paid_cents: paid,
    balance_cents: item.amount_cents - paid, due_date: item.due_date,
    status: paid === item.amount_cents ? 'paid' : paid > 0 ? 'partial' : 'pending',
    payments: item.payments.map((payment) => ({ ...payment })), created_at: item.created_at,
  };
}

export function financeHandlers(ctx: MockContext): Pick<ApiServices, 'listFees' | 'createFee' | 'recordPayment' | 'payFee'> {
  return {
    async payFee(token, id, input) {
      await ctx.wait();
      const viewer = ctx.authenticate(token);
      checkKeys(input, ['idempotency_key']);
      if (typeof input.idempotency_key !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(input.idempotency_key)) invalid('idempotency_key', 'Identificador do pagamento inválido.');
      const fee = Number.isSafeInteger(id) && ctx.db.fees.find((item) => item.id === id && item.member_id === viewer.member_id);
      if (!fee) throw new ApiError('Taxa não encontrada.', 404);
      if (fee.checkout_keys?.includes(input.idempotency_key)) return toFee(ctx, fee);
      const balance = toFee(ctx, fee).balance_cents;
      if (balance <= 0) throw new ApiError('Esta taxa já foi paga. Atualize a lista.', 409);
      // Somente o simulador confirma imediatamente; o backend deverá confirmar pelo provedor de pagamento.
      fee.payments.push({ id: ctx.db.nextPaymentId++, amount_cents: balance, paid_on: clubDate(ctx.now()), created_at: new Date(ctx.now()).toISOString() });
      (fee.checkout_keys ??= []).push(input.idempotency_key);
      ctx.persist();
      return toFee(ctx, fee);
    },
    async listFees(token, query = {}) {
      await ctx.wait();
      const viewer = ctx.authenticate(token);
      checkKeys(query, ['scope', 'status', 'member_id']);
      const scope = query.scope ?? 'mine';
      if (scope !== 'mine' && scope !== 'all') invalid('scope', 'Escopo inválido.');
      if (query.status !== undefined && query.status !== 'pending' && query.status !== 'paid') invalid('status', 'Filtro inválido.');
      if (query.member_id !== undefined && (!Number.isSafeInteger(query.member_id) || query.member_id < 1)) invalid('member_id', 'Membro inválido.');
      if (scope === 'all') ctx.authenticate(token, true);
      const items = ctx.db.fees.filter((item) =>
        (scope === 'all' || item.member_id === viewer.member_id) &&
        (query.member_id === undefined || item.member_id === query.member_id));
      return items.map((item) => toFee(ctx, item))
        .filter((item) => !query.status || (query.status === 'paid' ? item.status === 'paid' : item.status !== 'paid'))
        .sort((a, b) => a.due_date.localeCompare(b.due_date) || b.id - a.id);
    },
    async createFee(token, input: FeeInput) {
      await ctx.wait();
      ctx.authenticate(token, true);
      checkKeys(input, ['member_id', 'description', 'amount_cents', 'due_date']);
      const member = Number.isSafeInteger(input.member_id) && ctx.db.members.find((item) => item.id === input.member_id);
      if (!member) invalid('member_id', 'Escolha um membro válido.');
      const description = typeof input.description === 'string' ? input.description.trim() : '';
      if (!description || Array.from(description).length > 120) invalid('description', 'Informe uma descrição de 1 a 120 caracteres.');
      amount(input.amount_cents);
      date(input.due_date, 'due_date');
      const fee: MockFee = {
        id: ctx.db.nextFeeId++, member_id: member.id, member_name: member.name, description,
        amount_cents: input.amount_cents, due_date: input.due_date, payments: [], created_at: new Date(ctx.now()).toISOString(),
      };
      ctx.db.fees.push(fee);
      ctx.persist();
      return toFee(ctx, fee);
    },
    async recordPayment(token, id, input: PaymentInput) {
      await ctx.wait();
      ctx.authenticate(token, true);
      checkKeys(input, ['amount_cents', 'paid_on']);
      const fee = Number.isSafeInteger(id) && ctx.db.fees.find((item) => item.id === id);
      if (!fee) throw new ApiError('Taxa não encontrada.', 404);
      amount(input.amount_cents);
      date(input.paid_on, 'paid_on');
      if (input.paid_on > clubDate(ctx.now())) invalid('paid_on', 'O pagamento não pode ter uma data futura.');
      const balance = toFee(ctx, fee).balance_cents;
      if (input.amount_cents > balance) throw new ApiError('O valor supera o saldo pendente desta taxa.', 409, { amount_cents: ['Confira o saldo atualizado antes de registrar o pagamento.'] });
      fee.payments.push({ id: ctx.db.nextPaymentId++, amount_cents: input.amount_cents, paid_on: input.paid_on, created_at: new Date(ctx.now()).toISOString() });
      ctx.persist();
      return toFee(ctx, fee);
    },
  };
}
