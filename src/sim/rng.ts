// Детерминированный «случай»: одно и то же зерно — одна и та же смена. Демо проходит одинаково каждый раз.

/** Генератор mulberry32: быстрый, с хорошим распределением для наших нужд. */
export function mulberry32(seed: number): () => number {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** FNV-1a по набору частей — стабильное зерно из строк и чисел. */
export function hash(...parts: (string | number)[]): number {
  let h = 0x811c9dc5
  for (const part of parts) {
    const s = String(part)
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i)
      h = Math.imul(h, 0x01000193)
    }
    h ^= 0x2c
  }
  return h >>> 0
}

/** Число 0..1, зависящее только от аргументов. */
export function rand01(...parts: (string | number)[]): number {
  return mulberry32(hash(...parts))()
}

/** Гладкий шум −1..1 по времени: интерполяция случайных узлов с шагом `step` секунд. */
export function smoothNoise(key: string, t: number, step: number): number {
  const i = Math.floor(t / step)
  const f = t / step - i
  const a = rand01(key, i) * 2 - 1
  const b = rand01(key, i + 1) * 2 - 1
  const s = f * f * (3 - 2 * f)
  return a + (b - a) * s
}

/** Нормальное распределение (Бокс — Мюллер) от равномерного генератора. */
export function gaussian(rnd: () => number, mean = 0, sd = 1): number {
  const u = Math.max(rnd(), 1e-9)
  const v = rnd()
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}
