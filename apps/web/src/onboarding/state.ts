import { createContext, useContext, useEffect } from 'react'

/** Yo'riqnomaning bitta qadami. `target` — sahifadagi `data-tour="..."` elementi; bo'lmasa, qadam markazda chiqadi. */
export interface TourStep {
  target?: string
  title: string
  body: string
}

export interface Tour {
  id: string
  steps: TourStep[]
}

export interface OnboardingContextValue {
  /** Ko'rib bo'lingan yo'riqnomalar (serverda saqlanadi). */
  seen: ReadonlySet<string>
  /** Joriy sahifa o'z yo'riqnomasini ro'yxatdan o'tkazadi ("?" tugmasi shuni qayta ochadi). */
  register: (tour: Tour | null) => void
  start: (tour: Tour) => void
  /** Joriy sahifa yo'riqnomasini qayta ko'rsatish. */
  replay: () => void
  hasPageTour: boolean
  active: boolean
}

export const OnboardingContext = createContext<OnboardingContextValue | null>(null)

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext)
  if (!ctx) throw new Error('useOnboarding faqat OnboardingProvider ichida')
  return ctx
}

/**
 * Sahifa yo'riqnomasi: sahifa tayyor bo'lganda (`ready`) va odam uni hali ko'rmagan bo'lsa, o'zi boshlanadi.
 * Ko'rgan bo'lsa ham "?" tugmasidan qayta ochiladi.
 */
export function usePageTour(id: string, steps: TourStep[], ready: boolean) {
  const { seen, register, start, active } = useOnboarding()
  // Qadamlar har renderda yangi massiv: o'zgarganini mazmuni bo'yicha aniqlaymiz.
  const key = steps.map((s) => `${s.target ?? ''}:${s.title}`).join('|')
  useEffect(() => {
    register({ id, steps })
    return () => register(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key qadamlar mazmunini ifodalaydi
  }, [id, key, register])
  useEffect(() => {
    if (!ready || active || seen.has(id)) return
    // Sahifa chizilib bo'lsin (elementlar joyiga tushsin).
    const timer = setTimeout(() => start({ id, steps }), 400)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key qadamlar mazmunini ifodalaydi
  }, [id, key, ready, active, seen, start])
}
