import { useRef, useState } from 'react';
import { errorMessage, isExpired } from '../api/error';
import { LoadError, Loading } from '../components/LoadStatus';
import type { NotificationController } from '../hooks/useNotifications';
import { formatClubDateTime } from '../lib/club-time';
import { bookingPath } from '../navigation';

export function NotificationsPage({ notifications, onExpired }: { notifications: NotificationController; onExpired: () => void }) {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sending = useRef(false);
  async function read(id?: number) {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      if (id === undefined) await notifications.markAll();
      else await notifications.markRead(id);
    } catch (failure) {
      if (isExpired(failure)) return onExpired();
      setError(errorMessage(failure, 'Não foi possível atualizar a notificação.'));
    } finally { sending.current = false; setBusy(false); }
  }
  const { state, entries, unreadCount } = notifications;
  const shown = entries.filter((item) => !unreadOnly || !item.read_at);
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">Seu clube</p><h1>Notificações</h1>
        <p>Confirmações, alterações e lembretes das suas reservas.</p>
      </div>
      <section className="content-panel" aria-label="Notificações das reservas">
        <div className="notification-toolbar">
          <label className="check-label"><input type="checkbox" checked={unreadOnly} onChange={(event) => setUnreadOnly(event.target.checked)} />Somente não lidas</label>
          <button type="button" className="button button--secondary" disabled={busy || unreadCount === 0} onClick={() => read()}>Marcar todas como lidas</button>
        </div>
        {error && <p className="alert" role="alert">{error}</p>}
        {state.status === 'loading' && !state.previous && <Loading>Carregando notificações…</Loading>}
        {state.status === 'error' && <LoadError message={state.message} onRetry={notifications.reload} />}
        {state.status !== 'error' && (state.status === 'ready' || entries.length > 0) && (
          shown.length === 0 ? <p className="muted">{unreadOnly ? 'Nenhuma notificação não lida.' : 'Você ainda não tem notificações.'}</p> : (
            <ul className="notification-list">
              {shown.map((item) => (
                <li key={item.id} className={`notification-item${item.read_at ? '' : ' notification-item--unread'}`}>
                  <div>
                    <div className="notification-title"><h2>{item.title}</h2>{!item.read_at && <span className="badge">Não lida</span>}</div>
                    <p>{item.message}</p>
                    <time dateTime={item.created_at} className="muted">{formatClubDateTime(item.created_at)}</time>
                  </div>
                  <div className="notification-actions">
                    <a className="text-link" href={bookingPath(item.booking_id)}>Ver reserva</a>
                    {!item.read_at && <button type="button" className="button button--secondary" disabled={busy} aria-label={`Marcar como lida: ${item.title}`} onClick={() => read(item.id)}>Marcar como lida</button>}
                  </div>
                </li>
              ))}
            </ul>
          )
        )}
      </section>
      <p className="muted notification-help">Os lembretes aparecem 30 minutos antes do início. Os avisos são atualizados automaticamente enquanto você usa o clube.</p>
    </>
  );
}
