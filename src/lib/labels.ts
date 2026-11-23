import type { DayPeriod, PaymentMethod, SkillLevel } from '../api/types';

export const SKILL_LABELS: Record<SkillLevel, string> = {
  beginner: 'Iniciante',
  intermediate: 'Intermediário',
  advanced: 'Avançado',
  competitive: 'Competitivo',
};

export const PERIOD_LABELS: Record<DayPeriod, string> = {
  morning: 'Manhã',
  afternoon: 'Tarde',
  evening: 'Noite',
};
export const PERIOD_HINTS: Record<DayPeriod, string> = {
  morning: '7h às 12h',
  afternoon: '12h às 18h',
  evening: '18h às 22h',
};

/** 0 = segunda-feira, como na API. */
export const WEEKDAY_LABELS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
export const WEEKDAY_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: 'Dinheiro',
  pix: 'Pix',
  card: 'Cartão',
  transfer: 'Transferência',
};

/** "2026-12-10" → "10/12/2026". */
export function formatDay(date: string): string {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}

export const percent = (rate: number) => `${Math.round(rate * 100)}%`;
