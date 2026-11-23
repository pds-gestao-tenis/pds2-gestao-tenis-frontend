import { getApi } from './client';
import { ApiError } from './error';
import type { BookingInput, SlotRef } from './types';
import { refreshNotifications } from './notifications';

export async function getSchedule(token: string, date: string) {
  return (await getApi()).getSchedule(token, date);
}
export async function searchPlayers(token: string, q: string) {
  return (await getApi()).searchPlayers(token, q);
}
export async function createBooking(token: string, input: BookingInput) {
  const booking = await (await getApi()).createBooking(token, input);
  refreshNotifications();
  return booking;
}
export async function listBookings(token: string, scope: 'upcoming' | 'past') {
  return (await getApi()).listBookings(token, scope);
}
export async function getBooking(token: string, id: number) {
  return (await getApi()).getBooking(token, id);
}
/** Como getBooking, mas 404 (reserva inexistente ou de outra pessoa) vira `null`. */
export async function findBooking(token: string, id: number) {
  try {
    return await getBooking(token, id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}
export async function cancelBooking(token: string, id: number) {
  const booking = await (await getApi()).cancelBooking(token, id);
  refreshNotifications();
  return booking;
}
export async function rescheduleBooking(token: string, id: number, input: SlotRef) {
  const booking = await (await getApi()).rescheduleBooking(token, id, input);
  refreshNotifications();
  return booking;
}
export async function respondAttendance(token: string, id: number, response: 'confirmed' | 'declined') {
  return (await getApi()).respondAttendance(token, id, response);
}
