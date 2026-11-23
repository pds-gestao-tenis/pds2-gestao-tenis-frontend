import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Session } from '../api/types';
import { setupTestApi } from '../test/api';
import { FeesPage } from './FeesPage';

const renderPage = (session: Session) => render(<FeesPage session={session} onExpired={vi.fn()} />);
const item = (name: string) => screen.getByRole('heading', { name }).closest('li') as HTMLElement;

describe('FeesPage (US20 e US22)', () => {
  it('mostra o resumo e as taxas pendentes, atrasadas e pagas', async () => {
    const { mariana } = await setupTestApi();
    renderPage(mariana);
    await screen.findByRole('heading', { name: 'Mensalidade do mês passado' });
    expect(screen.getByText('A pagar').nextElementSibling).toHaveTextContent('R$ 300,00');
    expect(screen.getByText('Atrasadas').nextElementSibling).toHaveTextContent('1');
    expect(screen.getByText('Já pago').nextElementSibling).toHaveTextContent('R$ 80,00');
    expect(within(item('Mensalidade do mês passado')).getByText('Atrasada')).toBeInTheDocument();
    expect(within(item('Inscrição no torneio interno')).getByText('Paga')).toBeInTheDocument();
    expect(within(item('Inscrição no torneio interno')).queryByRole('button', { name: /Pagar/ })).toBeNull();
  });

  it('paga uma taxa por Pix ou cartão e atualiza o resumo', async () => {
    const { mariana, api } = await setupTestApi();
    const user = userEvent.setup();
    renderPage(mariana);
    await user.click(await screen.findByRole('button', { name: 'Pagar Mensalidade do mês passado' }));
    await user.click(screen.getByRole('radio', { name: 'Cartão' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar pagamento' }));

    expect(await screen.findByText('Pagamento de Mensalidade do mês passado confirmado.')).toBeInTheDocument();
    expect(within(item('Mensalidade do mês passado')).getByText('Paga')).toBeInTheDocument();
    expect(screen.getByText('A pagar').nextElementSibling).toHaveTextContent('R$ 150,00');
    expect(screen.getByText('Atrasadas').nextElementSibling).toHaveTextContent('0');
    const saved = (await api.myFees(mariana.token)).data.find((fee) => fee.description === 'Mensalidade do mês passado');
    expect(saved).toMatchObject({ status: 'paid', payment_method: 'card', paid_via: 'online' });
  });

  it('conta sem cadastro de membro vê a orientação', async () => {
    const { player } = await setupTestApi();
    renderPage(player);
    expect(await screen.findByRole('heading', { name: 'Nenhuma taxa encontrada' })).toBeInTheDocument();
  });
});
