import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Booking, Session } from '../api/types';
import { HomePage } from '../pages/HomePage';
import { setupTestApi } from '../test/api';
import { pendingInvites } from './PendingInvites';

const renderHome = (session: Session) =>
  render(<HomePage session={session} access={{ status: 'denied' }} onRetry={vi.fn()} onExpired={vi.fn()} />);

describe('aviso de convites no Início', () => {
  it('mostra o convite pendente com quem convidou e os botões de resposta', async () => {
    const { mariana } = await setupTestApi();
    renderHome(mariana);
    const section = (await screen.findByRole('heading', { name: '1 convite para responder' })).closest('section') as HTMLElement;
    expect(within(section).getByText('Convidado por Bruno Usuário')).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: 'Confirmar presença' })).toBeInTheDocument();
    expect(within(section).getByRole('link', { name: /Ver minhas reservas/ })).toHaveAttribute('href', '#/reservas');
  });

  it('confirmar presença tira o convite do aviso e registra a resposta', async () => {
    const { mariana, api } = await setupTestApi();
    const user = userEvent.setup();
    renderHome(mariana);
    await user.click(await screen.findByRole('button', { name: 'Confirmar presença' }));
    expect(await screen.findByText(/Presença confirmada na partida em Quadra 1/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Convites respondidos' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar presença' })).not.toBeInTheDocument();
    const booking = await api.getBooking(mariana.token, 5);
    expect(booking.participants.find((item) => item.id === mariana.user.id)?.attendance).toBe('confirmed');
  });

  it('recusar também responde o convite', async () => {
    const { player, api } = await setupTestApi();
    const user = userEvent.setup();
    renderHome(player);
    await user.click(await screen.findByRole('button', { name: 'Não vou' }));
    expect(await screen.findByText(/Você avisou que não vai à partida em Quadra 2/)).toBeInTheDocument();
    const booking = await api.getBooking(player.token, 6);
    expect(booking.participants.find((item) => item.id === player.user.id)?.attendance).toBe('declined');
  });

  it('sem convites pendentes, o Início não mostra o aviso', async () => {
    const { pedro } = await setupTestApi();
    renderHome(pedro);
    await screen.findByRole('heading', { name: 'Acesso rápido' });
    await waitFor(() => expect(screen.queryByText(/convite/i)).not.toBeInTheDocument());
  });
});

describe('pendingInvites', () => {
  const base: Booking = {
    id: 1, court: { id: 1, name: 'Quadra 1' }, starts_at: '2030-01-10T22:00:00Z', ends_at: '2030-01-10T23:00:00Z',
    status: 'active', organizer: { id: 9, name: 'Org' }, my_role: 'participant',
    participants: [{ id: 9, name: 'Org', attendance: 'confirmed' }, { id: 2, name: 'Eu', attendance: 'pending' }],
  };
  const now = Date.parse('2030-01-01T00:00:00Z');

  it('só convites futuros, ativos, em que a conta ainda não respondeu', () => {
    expect(pendingInvites([base], 2, now)).toHaveLength(1);
    expect(pendingInvites([{ ...base, my_role: 'organizer' }], 2, now)).toHaveLength(0);
    expect(pendingInvites([{ ...base, status: 'cancelled' }], 2, now)).toHaveLength(0);
    expect(pendingInvites([base], 2, Date.parse('2030-01-11T00:00:00Z'))).toHaveLength(0);
    const answered = { ...base, participants: [base.participants[0], { ...base.participants[1], attendance: 'confirmed' as const }] };
    expect(pendingInvites([answered], 2, now)).toHaveLength(0);
  });
});
