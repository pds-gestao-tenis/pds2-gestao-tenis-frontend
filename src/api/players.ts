import { getApi } from './client';
import type { PlayerProfile } from './types';
import { refreshNotifications } from './notifications';

export async function getPlayerProfile(token: string) { return (await getApi()).getPlayerProfile(token); }
export async function updatePlayerProfile(token: string, input: PlayerProfile) { return (await getApi()).updatePlayerProfile(token, input); }
export async function listCompatiblePlayers(token: string) { return (await getApi()).listCompatiblePlayers(token); }
export async function invitePlayer(token: string, bookingId: number, playerId: number) {
  const booking = await (await getApi()).invitePlayer(token, bookingId, playerId);
  refreshNotifications();
  return booking;
}
