import type { ReactNode } from 'react';
import type { MemberAccess } from '../hooks/useMemberAccess';
import { AccessStatus } from './AccessStatus';

export function AdminGate({ access, onRetry, children }: { access: MemberAccess; onRetry: () => void; children: ReactNode }) {
  return access.status === 'allowed' ? children : <section className="content-panel">{access.status === 'denied' ? <><h2>Acesso restrito</h2><p>Esta área está disponível apenas para administradores do clube.</p></> : <AccessStatus access={access} onRetry={onRetry} />}</section>;
}
