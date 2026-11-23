const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const formatMoney = (cents: number) => currency.format(cents / 100);

/** Conversão decimal exata: aceita 123,45 ou 123.45, sem arredondar casas extras. */
export function parseMoney(value: string): number | null {
  const match = /^(\d{1,7})(?:[,.](\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return cents > 0 && cents <= 999999999 ? cents : null;
}

export function formatDateOnly(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', dateStyle: 'short' }).format(new Date(`${value}T12:00:00Z`));
}
