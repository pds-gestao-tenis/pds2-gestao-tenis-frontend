import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import type { Session } from '../api/types';
import { setupTestApi } from '../test/api';
import { PartnersPage } from './PartnersPage';
import { ClubBookingsPage } from './ClubBookingsPage';
import { OccupancyPage } from './OccupancyPage';

const NOW = Date.parse('2026-11-09T10:00:00-03:00');
const profile = { level: 3 as const, availability: [{ weekday: 1, start_time: '18:00', end_time: '21:00' }] };
const adminProps = (session: Session) => ({ session, access: { status: 'allowed' as const }, onRetry: vi.fn(), onExpired: vi.fn() });

it('edita perfil com nível e disponibilidade semanal e encontra parceiro compatível', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  const { api, player, mariana } = await setupTestApi({ now: () => NOW });
  await api.updatePlayerProfile(mariana.token, profile);
  render(<PartnersPage session={player} onExpired={vi.fn()} />); const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Editar perfil' }));
  await user.selectOptions(screen.getByLabelText('Nível de habilidade'), '3');
  await user.click(screen.getByLabelText('Segunda-feira', { selector: 'input' }));
  await user.click(screen.getByRole('button', { name: 'Salvar perfil' }));
  expect(await screen.findByRole('article', { name: 'Mariana Silva' })).toHaveTextContent('Segunda-feira · 18:00–21:00');
  expect(await api.getPlayerProfile(player.token)).toEqual(profile);
});

it('envia convite para reserva organizada pelo jogador e oculta reservas já convidadas', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  const { api, player, pedro } = await setupTestApi({ now: () => NOW });
  await api.updatePlayerProfile(player.token, profile); await api.updatePlayerProfile(pedro.token, profile);
  render(<PartnersPage session={player} onExpired={vi.fn()} />); const user = userEvent.setup();
  const card = await screen.findByRole('article', { name: 'Pedro Santos' });
  await user.click(within(card).getByRole('button', { name: 'Convidar para jogar' }));
  const select = within(card).getByLabelText('Reserva para o convite');
  expect(within(select).getAllByRole('option')).toHaveLength(2);
  await user.selectOptions(select, '5'); await user.click(within(card).getByRole('button', { name: 'Enviar convite' }));
  await waitFor(() => expect(window.location.hash).toBe('#/reservas/5'));
  expect((await api.getBooking(pedro.token, 5)).participants.find((item) => item.id === 4)?.attendance).toBe('pending');
});

it('agenda administrativa consulta futuro e passado e cancela reserva de outra conta com confirmação', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  const { api, admin, player } = await setupTestApi({ now: () => NOW });
  render(<ClubBookingsPage {...adminProps(admin)} />); const user = userEvent.setup();
  await screen.findByText('Nenhuma reserva encontrada neste período.');
  await user.clear(screen.getByLabelText('Até', { selector: 'input' }));
  await user.type(screen.getByLabelText('Até', { selector: 'input' }), '2026-11-15');
  await user.click(screen.getByRole('button', { name: 'Consultar período' }));
  const booking = await screen.findByRole('article', { name: 'Reserva 5' });
  expect(booking).toHaveTextContent('Bruno Usuário');
  await user.click(within(booking).getByRole('button', { name: 'Cancelar reserva' }));
  await user.click(within(booking).getByRole('button', { name: 'Confirmar cancelamento' }));
  await screen.findByText('Reserva cancelada. Os participantes foram avisados.');
  expect((await api.getBooking(player.token, 5)).status).toBe('cancelled');
  await user.click(screen.getByRole('button', { name: 'Histórico dos últimos 30 dias' }));
  expect(await screen.findByRole('article', { name: 'Reserva 7' })).toHaveTextContent('Concluída');
  expect(screen.queryByRole('button', { name: 'Cancelar reserva' })).not.toBeInTheDocument();
});

it('administrador remarca com seleção de horário livre', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  const { api, admin, player } = await setupTestApi({ now: () => NOW });
  render(<ClubBookingsPage {...adminProps(admin)} />); const user = userEvent.setup();
  await screen.findByText('Nenhuma reserva encontrada neste período.');
  await user.clear(screen.getByLabelText('Até', { selector: 'input' }));
  await user.type(screen.getByLabelText('Até', { selector: 'input' }), '2026-11-15');
  await user.click(screen.getByRole('button', { name: 'Consultar período' }));
  const booking = await screen.findByRole('article', { name: 'Reserva 5' });
  await user.click(within(booking).getByRole('button', { name: 'Alterar reserva' }));
  await user.selectOptions(await screen.findByLabelText('Novo horário'), '2026-11-10T23:00:00.000Z');
  await user.click(screen.getByRole('button', { name: 'Confirmar alteração' }));
  await screen.findByText('Reserva alterada. Os participantes foram avisados.');
  expect((await api.getBooking(player.token, 5)).starts_at).toBe('2026-11-10T23:00:00.000Z');
});

it('indicadores são acessíveis e áreas administrativas não consultam dados para jogador', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  const { api, admin, player } = await setupTestApi({ now: () => NOW });
  render(<OccupancyPage {...adminProps(admin)} />);
  expect(await screen.findByRole('meter', { name: 'Ocupação de Quadra 1' })).toBeInTheDocument();
  cleanup();
  const report = vi.spyOn(api, 'getOccupancy'), bookings = vi.spyOn(api, 'listClubBookings');
  render(<><OccupancyPage {...adminProps(player)} access={{ status: 'denied' }} /><ClubBookingsPage {...adminProps(player)} access={{ status: 'denied' }} /></>);
  expect(screen.getAllByText('Acesso restrito')).toHaveLength(2);
  expect(report).not.toHaveBeenCalled(); expect(bookings).not.toHaveBeenCalled();
});
