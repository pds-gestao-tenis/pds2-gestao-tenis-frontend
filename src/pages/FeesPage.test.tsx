import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { setupTestApi } from '../test/api';
import { FeesPage, FinancePage } from './FeesPage';

const NOW = Date.parse('2026-11-09T10:00:00-03:00');
const input = { member_id: 1, description: 'Mensalidade de novembro', amount_cents: 12050, due_date: '2026-11-08' };
const allowed = { status: 'allowed' } as const;

it('admin lança taxa, registra parcela e quita o restante; pendências desaparecem', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  const { admin, api } = await setupTestApi({ now: () => NOW });
  const user = userEvent.setup();
  render(<FinancePage session={admin} access={allowed} onRetry={vi.fn()} onExpired={vi.fn()} />);
  await screen.findByText('Nenhuma taxa pendente encontrada.');
  await user.click(screen.getByRole('button', { name: 'Nova taxa' }));
  await screen.findByRole('option', { name: 'Mariana Silva' });
  await user.selectOptions(await screen.findByRole('combobox', { name: 'Membro' }), '1');
  await user.type(screen.getByLabelText('Descrição'), input.description);
  await user.type(screen.getByLabelText('Valor (R$)'), '120,50');
  await user.type(screen.getByLabelText('Vencimento'), '2026-11-08');
  await user.click(screen.getByRole('button', { name: 'Lançar taxa' }));
  await screen.findByText('Taxa lançada.');
  expect(await screen.findByRole('button', { name: 'Mariana Silva' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Registrar pagamento' }));
  await user.clear(screen.getByLabelText('Valor pago (R$)')); await user.type(screen.getByLabelText('Valor pago (R$)'), '20,50');
  await user.click(screen.getByRole('button', { name: 'Confirmar pagamento' }));
  await screen.findByText('Pagamento parcial registrado.');
  expect((await api.listFees(admin.token, { scope: 'all' }))[0].balance_cents).toBe(10000);
  await user.click(screen.getByRole('button', { name: 'Registrar pagamento' }));
  await user.click(screen.getByRole('button', { name: 'Confirmar pagamento' }));
  await screen.findByText('Pagamento registrado. A taxa está quitada.');
  await screen.findByText('Nenhum membro com taxas pendentes.');
  await user.click(screen.getByRole('tab', { name: 'Pagas' }));
  expect(await screen.findByRole('article', { name: /Mensalidade de novembro/ })).toHaveTextContent('Paga');
});

it('jogadora vê apenas suas taxas e paga seu saldo com confirmação explícita', async () => {
  const { api, admin, mariana, pedro } = await setupTestApi({ now: () => NOW });
  await api.createFee(admin.token, input);
  await api.createFee(admin.token, { ...input, member_id: 2, description: 'Taxa exclusiva de Pedro' });
  const user = userEvent.setup();
  render(<FeesPage session={mariana} onExpired={vi.fn()} />);
  await screen.findByRole('article', { name: /Mensalidade de novembro/ });
  expect(screen.queryByText('Taxa exclusiva de Pedro')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Registrar pagamento' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /^(Simular pagamento|Pagar taxa)$/ }));
  const dialog = await screen.findByRole('alertdialog');
  await user.click(within(dialog).getByRole('button', { name: /^(Confirmar simulação|Confirmar pagamento)$/ }));
  await screen.findByText('Pagamento registrado. A taxa está quitada.');
  await user.click(screen.getByRole('tab', { name: 'Pagas' }));
  expect(await screen.findByRole('article', { name: /Mensalidade de novembro/ })).toHaveTextContent('Paga');
  expect((await api.listFees(pedro.token))[0].status).toBe('pending');
});

it('área financeira bloqueia jogador e exibe erro com nova tentativa', async () => {
  const { player, admin, api } = await setupTestApi({ now: () => NOW });
  const spy = vi.spyOn(api, 'listFees');
  render(<FinancePage session={player} access={{ status: 'denied' }} onRetry={vi.fn()} onExpired={vi.fn()} />);
  expect(screen.getByText('Acesso restrito')).toBeInTheDocument(); expect(spy).not.toHaveBeenCalled();
  cleanup();
  spy.mockRejectedValueOnce(new Error('Falha ao consultar taxas.'));
  render(<FeesPage session={admin} onExpired={vi.fn()} />);
  await screen.findByRole('alert');
  await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
  await waitFor(() => expect(screen.getByText('Nenhuma taxa pendente encontrada.')).toBeInTheDocument());
});
