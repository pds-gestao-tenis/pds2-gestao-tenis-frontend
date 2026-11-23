import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Session } from '../api/types';
import { setupTestApi } from '../test/api';
import { PaymentsPage } from './PaymentsPage';

function renderPage(session: Session, status: 'allowed' | 'denied' = 'allowed') {
  return render(<PaymentsPage session={session} access={{ status }} onRetry={vi.fn()} onExpired={vi.fn()} />);
}
const row = (name: string) => screen.getAllByRole('rowheader', { name: new RegExp(name) })[0].closest('tr') as HTMLElement;

describe('PaymentsPage (US19 e US21)', () => {
  it('lista quem tem pendências, quem deve há mais tempo primeiro', async () => {
    const { admin } = await setupTestApi();
    renderPage(admin);
    await screen.findByRole('rowheader', { name: /Mariana Silva/ });
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.map((item) => within(item).getByRole('rowheader').textContent)).toEqual([
      'Mariana Silvamariana@clube.example', 'Camila Oliveiracamila@clube.example',
    ]);
    const mariana = row('Mariana Silva');
    expect(within(mariana).getByText('R$ 300,00')).toBeInTheDocument();
    expect(within(mariana).getByText('2')).toBeInTheDocument();
  });

  it('registra o pagamento de uma taxa', async () => {
    const { admin, api } = await setupTestApi();
    const user = userEvent.setup();
    renderPage(admin);
    await user.click(screen.getByRole('tab', { name: 'Taxas' }));
    await user.click(await screen.findByRole('button', { name: 'Registrar pagamento de Mensalidade do mês passado de Mariana Silva' }));
    await user.selectOptions(screen.getByLabelText('Forma de pagamento'), 'Dinheiro');
    await user.click(screen.getByRole('button', { name: 'Registrar pagamento' }));

    expect(await screen.findByText('Pagamento de Mariana Silva registrado.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('rowheader', { name: 'Mensalidade do mês passado' })).not.toBeInTheDocument());
    const paid = (await api.listFees(admin.token, { status: 'paid' })).data.map((fee) => [fee.description, fee.payment_method]);
    expect(paid).toContainEqual(['Mensalidade do mês passado', 'cash']);
  });

  it('lança uma taxa para um membro e valida os campos', async () => {
    const { admin } = await setupTestApi();
    const user = userEvent.setup();
    renderPage(admin);
    await user.click(screen.getByRole('tab', { name: 'Taxas' }));
    await user.click(await screen.findByRole('button', { name: 'Nova taxa' }));
    await user.click(await screen.findByRole('button', { name: 'Lançar taxa' }));
    expect(screen.getByText('Escolha o membro.')).toBeInTheDocument();
    expect(screen.getByText('Informe a descrição.')).toBeInTheDocument();

    await waitFor(() => expect(screen.getByLabelText('Membro')).toBeEnabled());
    await user.selectOptions(screen.getByLabelText('Membro'), 'Camila Oliveira (camila@clube.example)');
    await user.type(screen.getByLabelText('Descrição'), 'Aula de tênis');
    await user.type(screen.getByLabelText('Valor (R$)'), '75,50');
    await user.type(screen.getByLabelText('Vencimento'), '2030-01-10');
    await user.click(screen.getByRole('button', { name: 'Lançar taxa' }));

    expect(await screen.findByText('Taxa lançada para Camila Oliveira.')).toBeInTheDocument();
    const created = await screen.findByRole('rowheader', { name: 'Aula de tênis' });
    expect(within(created.closest('tr')!).getByText('R$ 75,50')).toBeInTheDocument();
  });

  it('exclui uma taxa pendente depois de confirmar', async () => {
    const { admin } = await setupTestApi();
    const user = userEvent.setup();
    renderPage(admin);
    await user.click(screen.getByRole('tab', { name: 'Taxas' }));
    await user.click(await screen.findByRole('button', { name: 'Excluir Mensalidade de Camila Oliveira' }));
    await user.click(screen.getByRole('button', { name: 'Excluir taxa' }));
    expect(await screen.findByText('Taxa Mensalidade excluída.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Camila Oliveira')).not.toBeInTheDocument());
  });

  it('conta sem acesso administrativo não vê os pagamentos', async () => {
    const { player } = await setupTestApi();
    renderPage(player, 'denied');
    expect(screen.getByRole('heading', { name: 'Área administrativa' })).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });
});
