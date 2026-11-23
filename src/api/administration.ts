import { getApi } from './client';
import { refreshNotifications } from './notifications';
import type { ClubBookingQuery, SlotRef } from './types';

export async function listClubBookings(token: string, query: ClubBookingQuery) { return (await getApi()).listClubBookings(token, query); }
export async function getOccupancy(token: string, query: Pick<ClubBookingQuery, 'from' | 'to'>) { return (await getApi()).getOccupancy(token, query); }
export async function cancelClubBooking(token: string, id: number) {
  const booking = await (await getApi()).cancelClubBooking(token, id);
  refreshNotifications();
  return booking;
}
export async function rescheduleClubBooking(token: string, id: number, input: SlotRef) {
  const booking = await (await getApi()).rescheduleClubBooking(token, id, input);
  refreshNotifications();
  return booking;
}
