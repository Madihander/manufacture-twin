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

/** Русское согласование с числом: plural(5, ['кузов', 'кузова', 'кузовов']) → «кузовов». */
export function plural(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return forms[2]
  if (b > 1 && b < 5) return forms[1]
  if (b === 1) return forms[0]
  return forms[2]
}
