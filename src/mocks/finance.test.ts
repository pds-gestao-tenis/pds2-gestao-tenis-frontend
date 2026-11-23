import { describe, expect, it } from 'vitest';
import { setupTestApi } from '../test/api';
import { parseMoney } from '../lib/money';

const NOW = Date.parse('2026-11-09T12:00:00-03:00');
const input = { member_id: 1, description: ' Mensalidade de novembro ', amount_cents: 12050, due_date: '2026-11-10' };

describe('US19–US20: taxas e pagamentos', () => {
  it('administrador lança taxa para membro e só a conta vinculada a vê', async () => {
    const { api, admin, player, mariana, pedro } = await setupTestApi({ now: () => NOW });
    const fee = await api.createFee(admin.token, input);
    expect(fee).toMatchObject({ description: 'Mensalidade de novembro', amount_cents: 12050, balance_cents: 12050, paid_cents: 0, status: 'pending', member: { id: 1, name: 'Mariana Silva' } });
    expect(await api.listFees(mariana.token)).toEqual([fee]);
    expect(await api.listFees(player.token)).toEqual([]);
    expect(await api.listFees(pedro.token)).toEqual([]);
    expect(await api.listFees(pedro.token, { member_id: 1 })).toEqual([]);
    await expect(api.listFees(pedro.token, { scope: 'all' })).rejects.toMatchObject({ status: 403 });
    expect(await api.listFees(admin.token, { scope: 'all' })).toHaveLength(1);
  });

  it('permissão é verificada em cada gravação e saldo não pode ser adulterado', async () => {
    const { api, admin, player } = await setupTestApi({ now: () => NOW });
    await expect(api.createFee(player.token, input)).rejects.toMatchObject({ status: 403 });
    await expect(api.createFee(admin.token, { ...input, paid_cents: 12050 } as never)).rejects.toMatchObject({ status: 422 });
    const fee = await api.createFee(admin.token, input);
    await expect(api.recordPayment(player.token, fee.id, { amount_cents: 12050, paid_on: '2026-11-09' })).rejects.toMatchObject({ status: 403 });
  });

  it('pagamentos parciais somam centavos exatos até quitar a taxa', async () => {
    const { api, admin, mariana } = await setupTestApi({ now: () => NOW });
    const fee = await api.createFee(admin.token, { ...input, amount_cents: 2000 });
    const partial = await api.recordPayment(admin.token, fee.id, { amount_cents: 1210, paid_on: '2026-11-09' });
    expect(partial).toMatchObject({ paid_cents: 1210, balance_cents: 790, status: 'partial' });
    expect(await api.listFees(mariana.token, { status: 'pending' })).toHaveLength(1);
    const paid = await api.recordPayment(admin.token, fee.id, { amount_cents: 790, paid_on: '2026-11-09' });
    expect(paid).toMatchObject({ paid_cents: 2000, balance_cents: 0, status: 'paid' });
    expect(paid.payments).toHaveLength(2);
    expect(await api.listFees(mariana.token, { status: 'pending' })).toHaveLength(0);
    expect(await api.listFees(mariana.token, { status: 'paid' })).toHaveLength(1);
  });

  it('dois registros simultâneos do saldo total não geram pagamento excedente', async () => {
    const { api, admin } = await setupTestApi({ now: () => NOW });
    const fee = await api.createFee(admin.token, input);
    const results = await Promise.allSettled([1, 2].map(() => api.recordPayment(admin.token, fee.id, { amount_cents: 12050, paid_on: '2026-11-09' })));
    expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((item) => item.status === 'rejected')).toMatchObject({ reason: { status: 409 } });
    const [saved] = await api.listFees(admin.token, { scope: 'all' });
    expect(saved.payments).toHaveLength(1);
  });

  it('valida valores, datas e membro sem persistir lançamentos inválidos', async () => {
    const { api, admin } = await setupTestApi({ now: () => NOW });
    for (const patch of [{ amount_cents: 0 }, { amount_cents: -1 }, { amount_cents: 1.5 }, { amount_cents: NaN }, { member_id: 999 }, { description: ' ' }, { due_date: '2026-02-30' }, { due_date: 'amanhã' }]) {
      await expect(api.createFee(admin.token, { ...input, ...patch })).rejects.toMatchObject({ status: 422 });
    }
    expect(await api.listFees(admin.token, { scope: 'all' })).toEqual([]);
    const fee = await api.createFee(admin.token, input);
    await expect(api.recordPayment(admin.token, fee.id, { amount_cents: 12051, paid_on: '2026-11-09' })).rejects.toMatchObject({ status: 409 });
    await expect(api.recordPayment(admin.token, fee.id, { amount_cents: 1, paid_on: '2026-11-10' })).rejects.toMatchObject({ status: 422 });
    await expect(api.recordPayment(admin.token, 999, { amount_cents: 1, paid_on: '2026-11-09' })).rejects.toMatchObject({ status: 404 });
    await expect(api.listFees('invalid')).rejects.toMatchObject({ status: 401 });
  });

  it('histórico retornado é uma cópia e mantém o nome se o membro for removido', async () => {
    const { api, admin } = await setupTestApi({ now: () => NOW });
    const fee = await api.createFee(admin.token, input);
    const paid = await api.recordPayment(admin.token, fee.id, { amount_cents: 100, paid_on: '2026-11-09' });
    paid.payments[0].amount_cents = 99999;
    await api.deleteMember(admin.token, 1);
    const [saved] = await api.listFees(admin.token, { scope: 'all' });
    expect(saved.paid_cents).toBe(100);
    expect(saved.member.name).toBe('Mariana Silva');
  });

  it('entrada decimal não perde centavos nem aceita casas extras', () => {
    expect(parseMoney('120,50')).toBe(12050);
    expect(parseMoney('0.10')).toBe(10);
    expect(parseMoney('12,1')).toBe(1210);
    for (const value of ['0', '-1', '1,001', '1e2', '1.000,00', '', 'NaN']) expect(parseMoney(value)).toBeNull();
  });
});

describe('US22: pagamento pelo jogador', () => {
  it('paga apenas o saldo próprio e repetir a chave não duplica o pagamento', async () => {
    const { api, admin, mariana, ctx } = await setupTestApi({ now: () => NOW });
    const fee = await api.createFee(admin.token, { member_id: 1, description: 'Mensalidade', amount_cents: 12345, due_date: '2026-11-15' });
    await api.recordPayment(admin.token, fee.id, { amount_cents: 2345, paid_on: '2026-11-09' });
    const first = await api.payFee(mariana.token, fee.id, { idempotency_key: 'payment-key-1' });
    expect(first).toMatchObject({ status: 'paid', paid_cents: 12345, balance_cents: 0 });
    expect(first.payments.map((item) => item.amount_cents)).toEqual([2345, 10000]);
    expect(await api.payFee(mariana.token, fee.id, { idempotency_key: 'payment-key-1' })).toEqual(first);
    expect(ctx.db.fees[0].payments).toHaveLength(2);
    await expect(api.payFee(mariana.token, fee.id, { idempotency_key: 'payment-key-2' })).rejects.toMatchObject({ status: 409 });
  });
  it('não permite pagar taxa de outro membro nem forjar valor ou status', async () => {
    const { api, admin, mariana, pedro, player } = await setupTestApi({ now: () => NOW });
    const fee = await api.createFee(admin.token, { member_id: 1, description: 'Taxa', amount_cents: 100, due_date: '2026-11-15' });
    for (const token of [pedro.token, player.token, admin.token]) await expect(api.payFee(token, fee.id, { idempotency_key: 'payment-key-1' })).rejects.toMatchObject({ status: 404 });
    await expect(api.payFee(mariana.token, fee.id, { idempotency_key: 'payment-key-1', amount_cents: 1 } as never)).rejects.toMatchObject({ status: 422 });
    const results = await Promise.allSettled(['payment-key-1', 'payment-key-2'].map((key) => api.payFee(mariana.token, fee.id, { idempotency_key: key })));
    expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
  });
});
