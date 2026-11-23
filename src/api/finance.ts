import { getApi } from './client';
import type { FeeInput, FeeQuery, PaymentInput } from './types';

export async function listFees(token: string, query?: FeeQuery) {
  return (await getApi()).listFees(token, query);
}
export async function createFee(token: string, input: FeeInput) {
  return (await getApi()).createFee(token, input);
}
export async function recordPayment(token: string, id: number, input: PaymentInput) {
  return (await getApi()).recordPayment(token, id, input);
}
export async function payFee(token: string, id: number, idempotencyKey: string) {
  return (await getApi()).payFee(token, id, { idempotency_key: idempotencyKey });
}
