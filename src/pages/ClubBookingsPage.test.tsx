import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Session } from '../api/types';
import { setupTestApi } from '../test/api';
import { ClubBookingsPage } from './ClubBookingsPage';

function renderPage(session: Session, status: 'allowed' | 'denied' = 'allowed') {
  return render(<ClubBookingsPage session={session} access={{ status }} onRetry={vi.fn()} onExpired={vi.fn()} />);
}
const organizers = () => screen.getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell')[1].textContent);

describe('ClubBookingsPage (US26, US27 e US29)', () => {
  it('mostra todas as reservas futuras do clube, de qualquer organizador', async () => {
    const { admin } = await setupTestApi();
    renderPage(admin);
    await screen.findByText('2 reservas');
    expect(organizers()).toEqual(['Bruno Usuário', 'Camila Oliveira']);
  });

  it('filtra por quadra', async () => {
    const { admin } = await setupTestApi();
    const user = userEvent.setup();
    renderPage(admin);
    await screen.findByText('2 reservas');
    await waitFor(() => expect(within(screen.getByLabelText('Quadra')).getAllByRole('option')).toHaveLength(4));
    await user.selectOptions(screen.getByLabelText('Quadra'), 'Quadra 2');
    await screen.findByText('1 reserva');
    expect(organizers()).toEqual(['Camila Oliveira']);
  });

  it('administração cancela uma reserva de outra pessoa', async () => {
    const { admin, api, player } = await setupTestApi();
    const user = userEvent.setup();
    renderPage(admin);
    await user.click(await screen.findByRole('button', { name: 'Cancelar reserva de Bruno Usuário' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar reserva' }));
    expect(await screen.findByText('Reserva de Bruno Usuário cancelada. Os jogadores foram avisados.')).toBeInTheDocument();
    await screen.findByText('1 reserva');
    expect((await api.getBooking(player.token, 5)).status).toBe('cancelled');
  });

  it('o histórico mostra reservas passadas e canceladas, sem ações', async () => {
    const { admin } = await setupTestApi();
    const user = userEvent.setup();
    renderPage(admin);
    await user.click(screen.getByRole('tab', { name: 'Histórico' }));
    await screen.findByText('1 reserva');
    const row = screen.getAllByRole('row')[1];
    expect(within(row).getByText('Concluída')).toBeInTheDocument();
    expect(within(row).queryByRole('button')).toBeNull();
  });

  it('remarcar leva à agenda de remarcação da reserva', async () => {
    const { admin } = await setupTestApi();
    renderPage(admin);
    expect(await screen.findByRole('link', { name: 'Remarcar reserva de Camila Oliveira' })).toHaveAttribute('href', '#/agenda/remarcar/6');
  });

  it('conta sem acesso administrativo não vê as reservas do clube', async () => {
    const { player } = await setupTestApi();
    renderPage(player, 'denied');
    expect(screen.getByRole('heading', { name: 'Área administrativa' })).toBeInTheDocument();
  });
});
