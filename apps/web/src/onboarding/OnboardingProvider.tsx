import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { api } from '../api'
import { OnboardingContext, type Tour } from './state'
import { TourOverlay } from './TourOverlay'

/**
 * Yo'riqnomalar (walkthrough): har sahifa o'zinikini `usePageTour` bilan beradi.
 * Ko'rilgani serverga yoziladi — Telegram Mini App va brauzerda takrorlanmaydi.
 */
export function OnboardingProvider({ initialSeen, children }: { initialSeen: string[]; children: ReactNode }) {
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set(initialSeen))
  const [pageTour, setPageTour] = useState<Tour | null>(null)
  const [active, setActive] = useState<Tour | null>(null)

  const start = useCallback((tour: Tour) => setActive(tour), [])
  const finish = useCallback(() => {
    if (active && !seen.has(active.id)) {
      const id = active.id
      setSeen((s) => new Set([...s, id]))
      // Saqlanmasa ham ish to'xtamaydi: eng yomoni, keyingi safar yana ko'rsatiladi.
      void api(`/auth/me/onboarding`, { method: 'POST', body: JSON.stringify({ tour: id }) }).catch(() => undefined)
    }
    setActive(null)
  }, [active, seen])

  const value = useMemo(
    () => ({
      seen,
      register: setPageTour,
      start,
      replay: () => pageTour && setActive(pageTour),
      hasPageTour: !!pageTour,
      active: !!active,
    }),
    [seen, start, pageTour, active],
  )

  return (
    <OnboardingContext.Provider value={value}>
      {children}
      {active && <TourOverlay key={active.id} steps={active.steps} onClose={finish} />}
    </OnboardingContext.Provider>
  )
}
