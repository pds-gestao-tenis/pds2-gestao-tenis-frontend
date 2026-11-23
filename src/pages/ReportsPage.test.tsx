import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { setupTestApi } from '../test/api';
import { ReportsPage } from './ReportsPage';

// 12:00 em São Paulo; as fixtures do simulador são relativas a este instante.
const NOW = Date.parse('2026-11-09T12:00:00-03:00');

describe('ReportsPage (US30)', () => {
  it('mostra a ocupação por quadra, dia da semana e horário dos últimos 30 dias', async () => {
    const { admin } = await setupTestApi({ now: () => NOW });
    render(<ReportsPage session={admin} access={{ status: 'allowed' }} now={() => NOW} onRetry={vi.fn()} onExpired={vi.fn()} />);
    expect(await screen.findByText('Período de 11/10/2026 a 09/11/2026.', { exact: false })).toBeInTheDocument();
    await screen.findByRole('heading', { name: 'Por quadra' });
    expect(screen.getByText('Reservas', { selector: 'dt' }).nextElementSibling).toHaveTextContent('1');
    const quadra2 = screen.getByRole('rowheader', { name: 'Quadra 2' }).closest('tr') as HTMLElement;
    expect(within(quadra2).getByText('1 h')).toBeInTheDocument();
    // A manutenção de 2 h da Quadra 3 sai do disponível.
    const quadra3 = screen.getByRole('rowheader', { name: 'Quadra 3' }).closest('tr') as HTMLElement;
    expect(within(quadra3).getByText('2 h')).toBeInTheDocument();
    expect(within(screen.getByRole('heading', { name: 'Por horário' }).parentElement!).getAllByRole('listitem')).toHaveLength(15);
  });

  it('valida o período antes de buscar', async () => {
    const { admin } = await setupTestApi({ now: () => NOW });
    const user = userEvent.setup();
    render(<ReportsPage session={admin} access={{ status: 'allowed' }} now={() => NOW} onRetry={vi.fn()} onExpired={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Por quadra' });
    await user.clear(screen.getByLabelText('De'));
    await user.type(screen.getByLabelText('De'), '2026-12-01');
    await user.click(screen.getByRole('button', { name: 'Atualizar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('A data inicial deve ser anterior à final.');
  });
});
