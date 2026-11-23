import { ApiError } from '../api/error';
import type { Attendance, ClubNotification, Court, FeePayment, Member } from '../api/types';
import { initialAccounts, initialClubData, initialMembers, MOCK_DATA_KEY, type MockAccount } from './fixtures';

export type MockSession = { token: string; userId: number; expiresAt: string };
export type MockBooking = {
  id: number;
  court_id: number;
  starts_at: string;
  ends_at: string;
  status: 'active' | 'cancelled';
  organizer_id: number;
  participants: { user_id: number; attendance: Attendance }[];
  notification_version?: number;
};
export type MockNotification = ClubNotification & { user_id: number; reminder_key?: string };
export type MockFee = {
  id: number;
  member_id: number;
  member_name: string;
  description: string;
  amount_cents: number;
  due_date: string;
  payments: FeePayment[];
  created_at: string;
  checkout_keys?: string[];
};
export type MockWaitlistEntry = {
  id: number;
  user_id: number;
  court_id: number;
  starts_at: string;
  created_at: string;
  offer_expires_at: string | null;
};
export type Database = {
  accounts: MockAccount[];
  members: Member[];
  sessions: MockSession[];
  courts: Court[];
  bookings: MockBooking[];
  waitlist: MockWaitlistEntry[];
  nextUserId: number;
  nextMemberId: number;
  nextId: number;
  notifications: MockNotification[];
  fees: MockFee[];
  nextNotificationId: number;
  nextFeeId: number;
  nextPaymentId: number;
};
export type MockOptions = { delayMs?: number; scenario?: string; storage?: Pick<Storage, 'getItem' | 'setItem'>; now?: () => number };

// Os handlers só mutam propriedades de ctx.db, nunca reatribuem ctx.db.
export type MockContext = {
  db: Database;
  now: () => number;
  scenario: string;
  persist(): void;
  /** `members` liga o cenário `members-error`, que só afeta as rotas de membros. */
  wait(members?: boolean): Promise<void>;
  authenticate(token: string, admin?: boolean): MockAccount;
};

function isDatabase(value: unknown): value is Database {
  const db = value as Partial<Database> | null;
  return !!db && typeof db === 'object' &&
    [db.accounts, db.members, db.sessions, db.courts, db.bookings, db.waitlist].every(Array.isArray) &&
    [db.nextUserId, db.nextMemberId, db.nextId].every(Number.isInteger);
}

function loadDatabase(storage: MockOptions['storage']): Database | null {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(MOCK_DATA_KEY) ?? 'null');
    if (!isDatabase(parsed)) return null;
    // Migração aditiva: preserva reservas, contas e sessões salvas antes de US16–US20.
    parsed.notifications = Array.isArray(parsed.notifications) ? parsed.notifications : [];
    parsed.fees = Array.isArray(parsed.fees) ? parsed.fees : [];
    parsed.nextNotificationId = Math.max(0, ...parsed.notifications.map((item) => item.id)) + 1;
    parsed.nextFeeId = Math.max(0, ...parsed.fees.map((item) => item.id)) + 1;
    parsed.nextPaymentId = Math.max(0, ...parsed.fees.flatMap((item) => item.payments.map((payment) => payment.id))) + 1;
    for (const account of parsed.accounts) {
      const demo = initialAccounts().find((item) => item.user.id === account.user.id && item.user.email === account.user.email);
      if (account.member_id === undefined && demo?.member_id !== undefined) account.member_id = demo.member_id;
    }
    return parsed;
  } catch {
    return null; // Dados inválidos ou armazenamento indisponível: usa fixtures.
  }
}

export function createMockContext({ delayMs = 450, scenario = 'success', storage, now = Date.now }: MockOptions = {}): MockContext {
  const ctx: MockContext = {
    db: loadDatabase(storage) ?? {
      accounts: initialAccounts(),
      members: scenario === 'empty' ? [] : initialMembers(),
      sessions: [],
      ...initialClubData(now()),
      nextUserId: 6,
      nextMemberId: 4,
      notifications: [],
      fees: [],
      nextNotificationId: 1,
      nextFeeId: 1,
      nextPaymentId: 1,
    },
    now,
    scenario,
    persist() {
      try { storage?.setItem(MOCK_DATA_KEY, JSON.stringify(ctx.db)); } catch { /* Continua em memória. */ }
    },
    async wait(members = false) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      if (ctx.scenario === 'error' || (members && ctx.scenario === 'members-error')) throw new ApiError('Falha simulada no servidor. Tente novamente.', 500);
      if (ctx.scenario === 'offline') throw new ApiError('Não foi possível falar com o servidor do clube. Tente de novo em instantes.', 0);
      if (ctx.scenario === 'rate-limit') throw new ApiError('Muitas tentativas seguidas. Tente de novo em 60 segundos.', 429);
    },
    authenticate(token, admin = false) {
      const session = ctx.db.sessions.find((item) => item.token === token && Date.parse(item.expiresAt) > ctx.now());
      const account = session && ctx.db.accounts.find((item) => item.user.id === session.userId);
      if (!account || ctx.scenario === 'expired') throw new ApiError('Autenticação necessária ou sessão inválida.', 401);
      if (admin && !account.admin) throw new ApiError('Acesso restrito a administradores.', 403);
      return account;
    },
  };
  return ctx;
}
