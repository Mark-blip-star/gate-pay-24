/**
 * Multiplier to convert 1 unit of currency to EUR.
 * Override via env: CURRENCY_RATE_UAH, CURRENCY_RATE_USD, etc.
 */
const DEFAULT_RATES_TO_EUR: Record<string, number> = {
  EUR: 1,
  USD: 0.92,
  UAH: 0.021,
  GBP: 1.17,
};

function getEnvRate(currency: string): number | undefined {
  const key = `CURRENCY_RATE_${currency.toUpperCase()}`;
  const val = process.env[key];
  if (val == null || val === '') return undefined;
  const n = parseFloat(val);
  return Number.isFinite(n) ? n : undefined;
}

export function getRateToEur(currency: string): number {
  const code = (currency || 'EUR').toUpperCase();
  return getEnvRate(code) ?? DEFAULT_RATES_TO_EUR[code] ?? 0;
}
