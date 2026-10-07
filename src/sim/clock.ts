import { useEffect } from 'react'
import { useSim } from '@/store/sim'
import { SHIFT_START_SEC } from './model'

/** Ход модельного времени и пауза по пробелу. Монтируется один раз в корне приложения. */
export function useSimClock() {
  useEffect(() => {
    let last = performance.now()
    let raf = 0
    const tick = (now: number) => {
      // Ограничиваем шаг, чтобы после сворачивания вкладки время не «прыгало».
      const dt = Math.min(0.25, (now - last) / 1000)
      last = now
      useSim.getState().advance(dt)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      const el = e.target as HTMLElement
      if (/input|textarea|select|button/i.test(el.tagName) || el.isContentEditable) return
      e.preventDefault()
      useSim.getState().togglePlay()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKey)
    }
  }, [])
}

/** 21:42:10 для момента смены. */
export function clockText(t: number, withSeconds = true): string {
  const abs = Math.floor(SHIFT_START_SEC + t) % 86400
  const h = Math.floor(abs / 3600)
  const m = Math.floor((abs % 3600) / 60)
  const s = abs % 60
  const hm = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  return withSeconds ? `${hm}:${String(s).padStart(2, '0')}` : hm
}
