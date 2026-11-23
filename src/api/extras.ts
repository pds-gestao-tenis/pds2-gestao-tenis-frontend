import { getApi } from './client';
import type { ClubBookingQuery, FeeInput, FeeQuery, PaymentMethod, PlayerProfile } from './types';

// Taxas e pagamentos (US19-US22)
export const myFees = async (token: string) => (await getApi()).myFees(token);
export const payMyFee = async (token: string, id: number, method: 'pix' | 'card') => (await getApi()).payMyFee(token, id, method);
export const listFees = async (token: string, query?: FeeQuery) => (await getApi()).listFees(token, query);
export const createFee = async (token: string, input: FeeInput) => (await getApi()).createFee(token, input);
export const registerPayment = async (token: string, id: number, method: PaymentMethod) => (await getApi()).registerPayment(token, id, method);
export const deleteFee = async (token: string, id: number) => (await getApi()).deleteFee(token, id);
export const pendingMembers = async (token: string) => (await getApi()).pendingMembers(token);

// Perfil de jogo e parceiros (US23-US25)
export const getPlayerProfile = async (token: string) => (await getApi()).getPlayerProfile(token);
export const savePlayerProfile = async (token: string, profile: PlayerProfile) => (await getApi()).savePlayerProfile(token, profile);
export const listPartners = async (token: string) => (await getApi()).listPartners(token);
export const invitePlayer = async (token: string, bookingId: number, playerId: number) => (await getApi()).invitePlayer(token, bookingId, playerId);

// Administração da agenda (US26-US30)
export const listClubBookings = async (token: string, query: ClubBookingQuery) => (await getApi()).listClubBookings(token, query);
export const occupancyReport = async (token: string, from: string, to: string) => (await getApi()).occupancyReport(token, from, to);
