import type { CourtInput } from '../api/types';

/** Mesmas regras do backend (CreateCourtRequest), para avisar antes de enviar. */
export const COURT_LIMITS = { name: 120, address: 255, maxPlayers: 50, maxSize: 999999.99, maxPrice: 99999999.99 } as const;

export const COURT_MESSAGES = {
  name: `Informe o nome da quadra, com até ${COURT_LIMITS.name} caracteres.`,
  address: `Informe o endereço, com até ${COURT_LIMITS.address} caracteres.`,
  size_m2: 'Informe a área em m², maior que zero e com até 2 casas decimais.',
  max_players: `Informe de 1 a ${COURT_LIMITS.maxPlayers} jogadores.`,
  hourly_price: 'Informe o preço da hora, a partir de zero e com até 2 casas decimais.',
  surface: 'Escolha um piso válido.',
  covered: 'Informe se a quadra é coberta.',
} as const;

export type CourtField = keyof typeof COURT_MESSAGES;

const hasTwoDecimalsAtMost = (value: number) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
const length = (value: string) => Array.from(value).length;

export function courtFieldError(field: CourtField, value: unknown): string | undefined {
  const valid = (() => {
    switch (field) {
      case 'name':
        return typeof value === 'string' && length(value.trim()) >= 1 && length(value.trim()) <= COURT_LIMITS.name;
      case 'address':
        return typeof value === 'string' && length(value.trim()) >= 1 && length(value.trim()) <= COURT_LIMITS.address;
      case 'size_m2':
        return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= COURT_LIMITS.maxSize && hasTwoDecimalsAtMost(value);
      case 'max_players':
        return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= COURT_LIMITS.maxPlayers;
      case 'hourly_price':
        return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= COURT_LIMITS.maxPrice && hasTwoDecimalsAtMost(value);
      case 'surface':
        return value === 'clay' || value === 'hard' || value === 'grass' || value === 'synthetic';
      case 'covered':
        return typeof value === 'boolean';
    }
  })();
  return valid ? undefined : COURT_MESSAGES[field];
}

/** Erros de cada campo presente em `input` (todos os campos quando `partial` é falso). */
export function courtErrors(input: Partial<CourtInput>, partial = false): Partial<Record<CourtField, string>> {
  const errors: Partial<Record<CourtField, string>> = {};
  for (const field of Object.keys(COURT_MESSAGES) as CourtField[]) {
    if (partial && !(field in input)) continue;
    const message = courtFieldError(field, input[field]);
    if (message) errors[field] = message;
  }
  return errors;
}

/** "120,50" ou "120.5" → 120.5; texto inválido → NaN (o validador recusa). */
export function parseDecimal(text: string): number {
  const normalized = text.trim().replace(/\s/g, '').replace(',', '.');
  return /^\d+(\.\d+)?$/.test(normalized) ? Number(normalized) : Number.NaN;
}

/** 120.5 → "120,5", para preencher campos de texto no formato brasileiro. */
export const decimalText = (value: number) => String(value).replace('.', ',');

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const area = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
export const formatPrice = (value: number) => currency.format(value);
export const formatArea = (value: number) => `${area.format(value)} m²`;
