export type User = { id: number; name: string; email: string; created_at: string };
export type Session = { token: string; expiresAt: string; user: User };
export type RegisterInput = {
  name: string;
  email: string;
  password: string;
  password_confirmation: string;
};
export type MemberStatus = 'active' | 'inactive';
export type Member = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  status: MemberStatus;
  created_at: string;
  updated_at: string;
};
export type CreateMemberInput = { name: string; email: string; phone?: string | null; status?: MemberStatus };
export type UpdateMemberInput = Partial<CreateMemberInput>;
export type MemberQuery = { page?: number; page_size?: number; status?: MemberStatus; q?: string };
export type MemberList = {
  data: Member[];
  meta: { page: number; page_size: number; total: number; total_pages: number };
};

export type Surface = 'clay' | 'hard' | 'grass' | 'synthetic';
export type MaintenanceWindow = { id: number; starts_at: string; ends_at: string; reason: string };
export type Court = {
  id: number;
  name: string;
  address: string;
  /** Área em m². */
  size_m2: number;
  /** Máximo de jogadores por partida, contando quem reserva. */
  max_players: number;
  /** Preço da hora, em reais. */
  hourly_price: number;
  surface: Surface;
  covered: boolean;
  maintenance: MaintenanceWindow[];
};
export type CourtInput = Omit<Court, 'id' | 'maintenance'>;
export type MaintenanceInput = { starts_at: string; ends_at: string; reason: string; cancel_bookings?: boolean };
export type Player = { id: number; name: string };
export type SlotStatus = 'free' | 'booked' | 'mine' | 'maintenance';
export type Slot = {
  court_id: number;
  starts_at: string;
  ends_at: string;
  status: SlotStatus;
  booking_id: number | null;
  waitlist_size: number;
  waitlist_entry_id: number | null;
};
export type Schedule = { date: string; courts: Court[]; slots: Slot[] };
export type Attendance = 'pending' | 'confirmed' | 'declined';
export type Participant = Player & { attendance: Attendance };
export type Booking = {
  id: number;
  court: { id: number; name: string };
  starts_at: string;
  ends_at: string;
  status: 'active' | 'cancelled' | 'completed';
  organizer: Player;
  participants: Participant[];
  my_role: 'organizer' | 'participant' | 'administrator';
};
export type BookingInput = { court_id: number; starts_at: string; participant_ids: number[] };
export type SlotRef = { court_id: number; starts_at: string };
export type WaitlistEntry = {
  id: number;
  court: { id: number; name: string };
  starts_at: string;
  ends_at: string;
  position: number;
  offer: { expires_at: string } | null;
};

export type NotificationKind = 'booking_confirmed' | 'booking_cancelled' | 'booking_changed' | 'booking_reminder' | 'booking_invitation';
export type ClubNotification = {
  id: number;
  kind: NotificationKind;
  title: string;
  message: string;
  booking_id: number;
  created_at: string;
  read_at: string | null;
};
export type FeePayment = { id: number; amount_cents: number; paid_on: string; created_at: string };
export type Fee = {
  id: number;
  member: { id: number; name: string };
  description: string;
  amount_cents: number;
  paid_cents: number;
  balance_cents: number;
  due_date: string;
  status: 'pending' | 'partial' | 'paid';
  payments: FeePayment[];
  created_at: string;
};
export type FeeInput = { member_id: number; description: string; amount_cents: number; due_date: string };
export type PaymentInput = { amount_cents: number; paid_on: string };
export type FeeQuery = { scope?: 'mine' | 'all'; status?: 'pending' | 'paid'; member_id?: number };
export type Availability = { weekday: number; start_time: string; end_time: string };
export type PlayerProfile = { level: 1 | 2 | 3 | 4 | 5 | null; availability: Availability[] };
export type CompatiblePlayer = Player & { level: number; common_availability: Availability[] };
export type ClubBookingQuery = { from: string; to: string; court_id?: number; status?: Booking['status'] };
export type Occupancy = { court: { id: number; name: string }; available_hours: number; booked_hours: number; blocked_hours: number; cancelled_bookings: number; occupancy_percent: number };

/** Contrato único usado tanto pela API HTTP quanto pelo simulador. */
export interface ApiServices {
  login(email: string, password: string): Promise<Session>;
  fetchCurrentUser(token: string): Promise<User>;
  logout(token: string): Promise<void>;
  register(input: RegisterInput): Promise<User>;
  listMembers(token: string, query?: MemberQuery): Promise<MemberList>;
  getMember(token: string, id: number): Promise<Member>;
  createMember(token: string, input: CreateMemberInput): Promise<Member>;
  updateMember(token: string, id: number, input: UpdateMemberInput): Promise<Member>;
  deleteMember(token: string, id: number): Promise<void>;
  listCourts(token: string): Promise<Court[]>;
  getCourt(token: string, id: number): Promise<Court>;
  createCourt(token: string, input: CourtInput): Promise<Court>;
  updateCourt(token: string, id: number, input: Partial<CourtInput>): Promise<Court>;
  deleteCourt(token: string, id: number): Promise<void>;
  addMaintenance(token: string, courtId: number, input: MaintenanceInput): Promise<Court>;
  removeMaintenance(token: string, courtId: number, maintenanceId: number): Promise<Court>;
  getSchedule(token: string, date: string): Promise<Schedule>;
  searchPlayers(token: string, q: string): Promise<Player[]>;
  createBooking(token: string, input: BookingInput): Promise<Booking>;
  listBookings(token: string, scope: 'upcoming' | 'past'): Promise<Booking[]>;
  getBooking(token: string, id: number): Promise<Booking>;
  cancelBooking(token: string, id: number): Promise<Booking>;
  rescheduleBooking(token: string, id: number, input: SlotRef): Promise<Booking>;
  respondAttendance(token: string, id: number, response: 'confirmed' | 'declined'): Promise<Booking>;
  listWaitlist(token: string): Promise<WaitlistEntry[]>;
  joinWaitlist(token: string, input: SlotRef): Promise<WaitlistEntry>;
  leaveWaitlist(token: string, id: number): Promise<void>;
  acceptOffer(token: string, id: number): Promise<Booking>;
  declineOffer(token: string, id: number): Promise<void>;
  listNotifications(token: string): Promise<ClubNotification[]>;
  markNotificationRead(token: string, id: number): Promise<ClubNotification>;
  markAllNotificationsRead(token: string): Promise<void>;
  listFees(token: string, query?: FeeQuery): Promise<Fee[]>;
  createFee(token: string, input: FeeInput): Promise<Fee>;
  recordPayment(token: string, id: number, input: PaymentInput): Promise<Fee>;
  payFee(token: string, id: number, input: { idempotency_key: string }): Promise<Fee>;
  getPlayerProfile(token: string): Promise<PlayerProfile>;
  updatePlayerProfile(token: string, input: PlayerProfile): Promise<PlayerProfile>;
  listCompatiblePlayers(token: string): Promise<CompatiblePlayer[]>;
  invitePlayer(token: string, bookingId: number, playerId: number): Promise<Booking>;
  listClubBookings(token: string, query: ClubBookingQuery): Promise<Booking[]>;
  cancelClubBooking(token: string, id: number): Promise<Booking>;
  rescheduleClubBooking(token: string, id: number, input: SlotRef): Promise<Booking>;
  getOccupancy(token: string, query: Pick<ClubBookingQuery, 'from' | 'to'>): Promise<Occupancy[]>;
}
