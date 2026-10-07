/** 15.10.2026 */
export function formatDate(d: Date): string {
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Число в русской записи: 2,6 / 5 500. */
export function formatNumber(n: number, fractionDigits = 0): string {
  return n.toLocaleString('ru-RU', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })
}

/** Разбирает ввод пользователя с запятой или точкой; NaN — если это не число. */
export function parseDecimal(input: string): number {
  const s = input.trim().replace(',', '.')
  return s === '' ? Number.NaN : Number(s)
}
