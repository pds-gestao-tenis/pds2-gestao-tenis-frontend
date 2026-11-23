import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { setupTestApi } from '../test/api';
import { CourtsPage } from './CourtsPage';

const NOW = Date.parse('2026-11-09T12:00:00-03:00');

describe('Bloqueio de horários por evento (US28)', () => {
  it('admin bloqueia a quadra para um evento e o cartão mostra o tipo', async () => {
    const { admin, api } = await setupTestApi({ now: () => NOW });
    const user = userEvent.setup();
    render(<CourtsPage session={admin} access={{ status: 'allowed' }} now={() => NOW} onRetry={vi.fn()} onExpired={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: 'Marcar manutenção em Quadra 1' }));
    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '2026-11-12T08:00' } });
    fireEvent.change(screen.getByLabelText('Fim'), { target: { value: '2026-11-12T12:00' } });
    await user.selectOptions(screen.getByLabelText('Tipo de bloqueio'), 'Evento do clube');
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Torneio interno' } });
    await user.click(screen.getByRole('button', { name: 'Salvar manutenção' }));

    const card = (await screen.findByText('Evento: Torneio interno')).closest('article') as HTMLElement;
    expect(within(card).getByRole('heading', { name: 'Quadra 1' })).toBeInTheDocument();
    const court = (await api.listCourts(admin.token)).find((item) => item.name === 'Quadra 1');
    expect(court?.maintenance.at(-1)).toMatchObject({ reason: 'Torneio interno', kind: 'event' });
  });

  it('manutenção continua sendo o tipo padrão', async () => {
    const { admin, api } = await setupTestApi({ now: () => NOW });
    const user = userEvent.setup();
    render(<CourtsPage session={admin} access={{ status: 'allowed' }} now={() => NOW} onRetry={vi.fn()} onExpired={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: 'Marcar manutenção em Quadra 2' }));
    expect(screen.getByLabelText('Tipo de bloqueio')).toHaveValue('maintenance');
    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '2026-11-12T08:00' } });
    fireEvent.change(screen.getByLabelText('Fim'), { target: { value: '2026-11-12T09:00' } });
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Pintura das linhas' } });
    await user.click(screen.getByRole('button', { name: 'Salvar manutenção' }));
    await screen.findByText('Pintura das linhas');
    const court = (await api.listCourts(admin.token)).find((item) => item.name === 'Quadra 2');
    expect(court?.maintenance.at(-1)?.kind).toBe('maintenance');
  });
});
