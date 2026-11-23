import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Session } from '../api/types';
import { setupTestApi } from '../test/api';
import { PartnersPage } from './PartnersPage';

const renderPage = (session: Session) => render(<PartnersPage session={session} onExpired={vi.fn()} />);
const card = (name: string) => screen.getByRole('heading', { name }).closest('li') as HTMLElement;

describe('PartnersPage (US23 a US25)', () => {
  it('sem nível informado, pede o nível antes de sugerir parceiros', async () => {
    const { player } = await setupTestApi();
    renderPage(player);
    expect(await screen.findByText('Informe seu nível de habilidade para ver sugestões de parceiros.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nível de habilidade')).toHaveValue('');
  });

  it('salva nível e disponibilidade e mostra parceiros parecidos', async () => {
    const { player, api } = await setupTestApi();
    const user = userEvent.setup();
    renderPage(player);
    await user.selectOptions(await screen.findByLabelText('Nível de habilidade'), 'Intermediário');
    await user.click(screen.getByRole('checkbox', { name: 'Terça à noite' }));
    await user.click(screen.getByRole('button', { name: 'Salvar perfil' }));

    expect(await screen.findByText('Perfil salvo.')).toBeInTheDocument();
    expect(await api.getPlayerProfile(player.token)).toEqual({
      skill_level: 'intermediate', availability: [{ weekday: 1, period: 'evening' }],
    });
    // Mariana (intermediária) e Pedro (avançado) jogam terça à noite; Camila (iniciante) não.
    await screen.findByRole('heading', { name: 'Mariana Silva' });
    expect(within(card('Mariana Silva')).getByText('Em comum: Ter · noite')).toBeInTheDocument();
    expect(within(card('Pedro Santos')).getByText('Avançado')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Camila Oliveira' })).not.toBeInTheDocument();
  });

  it('convida um parceiro para uma reserva organizada pela conta', async () => {
    const { player, api } = await setupTestApi();
    await api.savePlayerProfile(player.token, { skill_level: 'intermediate', availability: [{ weekday: 1, period: 'evening' }] });
    const user = userEvent.setup();
    renderPage(player);
    await user.click(await screen.findByRole('button', { name: 'Convidar Pedro Santos' }));
    const select = await screen.findByLabelText('Convidar para a reserva');
    await user.selectOptions(select, within(select).getAllByRole('option')[1]);
    await user.click(screen.getByRole('button', { name: 'Enviar convite' }));

    expect(await screen.findByText(/Pedro Santos foi convidado para Quadra 1/)).toBeInTheDocument();
    const booking = await api.getBooking(player.token, 5);
    expect(booking.participants.map((item) => item.name)).toContain('Pedro Santos');
  });

  it('sem reservas próprias, orienta a reservar antes de convidar', async () => {
    const { mariana } = await setupTestApi();
    const user = userEvent.setup();
    renderPage(mariana);
    await user.click(await screen.findByRole('button', { name: 'Convidar Pedro Santos' }));
    expect(await screen.findByText(/Você não tem reservas futuras organizadas por você/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('link', { name: 'Ir para a agenda' })).toHaveAttribute('href', '#/agenda'));
  });
});
