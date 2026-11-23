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
/** US28: bloqueio por manutenção ou por evento do clube. */
export type BlockKind = 'maintenance' | 'event';
export type MaintenanceWindow = { id: number; starts_at: string; ends_at: string; reason: string; kind?: BlockKind };
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
export type MaintenanceInput = { starts_at: string; ends_at: string; reason: string; kind?: BlockKind; cancel_bookings?: boolean };
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
  my_role: 'organizer' | 'participant';
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

// ---------- Taxas e pagamentos (US19-US22) ----------
export type FeeStatus = 'pending' | 'paid';
export type PaymentMethod = 'cash' | 'pix' | 'card' | 'transfer';
export type Fee = {
  id: number;
  member: { id: number; name: string; email: string };
  description: string;
  amount: number;
  due_date: string;
  status: FeeStatus;
  overdue: boolean;
  paid_at: string | null;
  payment_method: PaymentMethod | null;
  paid_via: 'admin' | 'online' | null;
  created_at: string;
};
export type FeeInput = { member_id: number; description: string; amount: number; due_date: string };
export type FeeQuery = { page?: number; page_size?: number; member_id?: number; status?: FeeStatus; overdue?: boolean };
export type FeeList = { data: Fee[]; meta: MemberList['meta'] };
export type MyFees = {
  member: { id: number; name: string; email: string } | null;
  data: Fee[];
  summary: { pending_total: number; paid_total: number; overdue_count: number };
};
export type PendingMember = {
  member: { id: number; name: string; email: string };
  pending_count: number;
  pending_total: number;
  overdue_count: number;
  oldest_due_date: string;
};

// ---------- Perfil de jogo e parceiros (US23-US25) ----------
export type SkillLevel = 'beginner' | 'intermediate' | 'advanced' | 'competitive';
export type DayPeriod = 'morning' | 'afternoon' | 'evening';
/** weekday: 0 = segunda-feira ... 6 = domingo. */
export type AvailabilitySlot = { weekday: number; period: DayPeriod };
export type PlayerProfile = { skill_level: SkillLevel | null; availability: AvailabilitySlot[] };
export type Partner = { id: number; name: string; skill_level: SkillLevel; shared_availability: AvailabilitySlot[] };

// ---------- Administração da agenda (US26-US30) ----------
export type ClubBookingQuery = { scope: 'upcoming' | 'past'; court_id?: number; from?: string; to?: string };
export type Usage = { booked_hours: number; available_hours: number; occupancy_rate: number };
export type OccupancyReport = {
  period: { from: string; to: string; days: number };
  totals: Usage & { bookings: number; cancelled: number };
  courts: (Usage & { court: { id: number; name: string }; blocked_hours: number; bookings: number })[];
  by_weekday: (Usage & { weekday: number })[];
  by_hour: (Usage & { hour: number })[];
};

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
  // US19-US22
  myFees(token: string): Promise<MyFees>;
  payMyFee(token: string, id: number, method: 'pix' | 'card'): Promise<Fee>;
  listFees(token: string, query?: FeeQuery): Promise<FeeList>;
  createFee(token: string, input: FeeInput): Promise<Fee>;
  registerPayment(token: string, id: number, method: PaymentMethod): Promise<Fee>;
  deleteFee(token: string, id: number): Promise<void>;
  pendingMembers(token: string): Promise<PendingMember[]>;
  // US23-US25
  getPlayerProfile(token: string): Promise<PlayerProfile>;
  savePlayerProfile(token: string, profile: PlayerProfile): Promise<PlayerProfile>;
  listPartners(token: string): Promise<Partner[]>;
  invitePlayer(token: string, bookingId: number, playerId: number): Promise<Booking>;
  // US26-US30
  listClubBookings(token: string, query: ClubBookingQuery): Promise<Booking[]>;
  occupancyReport(token: string, from: string, to: string): Promise<OccupancyReport>;
}
