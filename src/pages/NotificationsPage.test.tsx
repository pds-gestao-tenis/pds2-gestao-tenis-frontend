import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { NOTIFICATIONS_CHANGED } from '../api/notifications';
import { ApiError } from '../api/error';
import { useNotifications } from '../hooks/useNotifications';
import { setupTestApi } from '../test/api';
import { NotificationsPage } from './NotificationsPage';
const NOW = Date.parse('2026-11-09T10:00:00-03:00');
function Page({ token, expired = vi.fn() }: { token: string; expired?: () => void }) {
  const notifications = useNotifications(token, expired);
  return <><output aria-label="Não lidas">{notifications.unreadCount}</output><NotificationsPage notifications={notifications} onExpired={expired} /></>;
}
it('mostra confirmação, filtra não lidas, marca individualmente e todas', async () => {
  const { api, player } = await setupTestApi({ now: () => NOW });
  const booking = await api.createBooking(player.token, { court_id: 2, starts_at: '2026-11-09T18:00:00Z', participant_ids: [] });
  await api.rescheduleBooking(player.token, booking.id, { court_id: 2, starts_at: '2026-11-09T19:00:00Z' });
  render(<Page token={player.token} />); const user = userEvent.setup();
  await screen.findByRole('heading', { name: 'Reserva confirmada' });
  expect(screen.getByLabelText('Não lidas')).toHaveTextContent('2');
  await user.click(screen.getByRole('checkbox', { name: 'Somente não lidas' }));
  await user.click(screen.getByRole('button', { name: 'Marcar como lida: Reserva confirmada' }));
  await waitFor(() => expect(screen.queryByRole('heading', { name: 'Reserva confirmada' })).not.toBeInTheDocument());
  expect(screen.getByRole('link', { name: 'Ver reserva' })).toHaveAttribute('href', `#/reservas/${booking.id}`);
  await user.click(screen.getByRole('button', { name: 'Marcar todas como lidas' }));
  await screen.findByText('Nenhuma notificação não lida.');
  expect(screen.getByLabelText('Não lidas')).toHaveTextContent('0');
});
it('atualiza por evento e trata expiração da sessão', async () => {
  const { api, player } = await setupTestApi({ now: () => NOW });
  const expired = vi.fn(); render(<Page token={player.token} expired={expired} />);
  await screen.findByText('Você ainda não tem notificações.');
  await api.cancelBooking(player.token, 5);
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
  await screen.findByRole('heading', { name: 'Reserva cancelada' });
  vi.spyOn(api, 'listNotifications').mockRejectedValue(new ApiError('Sessão expirada.', 401));
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
  await waitFor(() => expect(expired).toHaveBeenCalledTimes(1));
});
