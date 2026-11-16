import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { TourStep } from './state'

const PAD = 6
const CARD_W = 340

const find = (target?: string) => (target ? document.querySelector<HTMLElement>(`[data-tour="${target}"]`) : null)

/**
 * Walkthrough: yoritilgan element + yonida qadam kartochkasi.
 * Sahifada yo'q element (masalan, ruxsat yo'qligi uchun yashirin tugma) qadami tashlab ketiladi.
 */
export function TourOverlay({ steps: all, onClose }: { steps: TourStep[]; onClose: () => void }) {
  // Boshlanishda ko'rinadigan qadamlar: yo'q elementlar uchun bo'sh joyni yoritmaymiz.
  const [steps] = useState(() => all.filter((s) => !s.target || find(s.target)))
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [mobile, setMobile] = useState(() => window.innerWidth < 640)
  const step = steps[i]
  const last = i === steps.length - 1

  const measure = useCallback(() => {
    setMobile(window.innerWidth < 640)
    const el = find(step?.target)
    setRect(el ? el.getBoundingClientRect() : null)
  }, [step])

  useLayoutEffect(() => {
    const el = find(step?.target)
    if (el) el.scrollIntoView({ block: 'center', inline: 'center' })
    // Aylantirish tugagach o'lchaymiz (keyingi kadrda).
    const frame = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(frame)
  }, [step, measure])

  useEffect(() => {
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [measure])

  const next = useCallback(() => (last ? onClose() : setI((n) => n + 1)), [last, onClose])
  const back = useCallback(() => setI((n) => Math.max(0, n - 1)), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight' || e.key === 'Enter') next()
      else if (e.key === 'ArrowLeft') back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, back, onClose])

  // Hamma qadam tashlab ketilgan bo'lsa (sahifa bo'sh) — yopamiz.
  useEffect(() => {
    if (steps.length === 0) onClose()
  }, [steps.length, onClose])
  if (!step) return null

  // Kartochka: element ostida joy bo'lsa — pastda, bo'lmasa — tepada; telefonda — ekran pastida.
  let cardStyle: React.CSSProperties
  if (mobile) cardStyle = { left: 12, right: 12, bottom: 12 }
  else if (!rect) cardStyle = { left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: CARD_W + 60 }
  else {
    const left = Math.min(Math.max(16, rect.left), window.innerWidth - CARD_W - 16)
    const below = rect.bottom + PAD + 12
    cardStyle =
      below + 200 < window.innerHeight
        ? { left, top: below, width: CARD_W }
        : { left, bottom: window.innerHeight - rect.top + PAD + 12, width: CARD_W }
  }

  return createPortal(
    <div className="fixed inset-0 z-50" aria-live="polite">
      {/* Orqadagi sahifa bosilmaydi: yo'riqnoma vaqtida tasodifiy amal bo'lmasin */}
      <div className={`absolute inset-0 ${rect ? '' : 'bg-slate-900/55'}`} />
      {rect && (
        <div
          className="pointer-events-none absolute rounded-lg ring-2 ring-white transition-all duration-200"
          style={{
            left: rect.left - PAD,
            top: rect.top - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.55)',
          }}
        />
      )}
      <div role="dialog" aria-modal="true" aria-label={step.title} className="absolute rounded-xl bg-white p-4 shadow-2xl ring-1 ring-slate-200" style={cardStyle}>
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-slate-400">
            {i + 1} / {steps.length}
          </span>
          <span className="flex gap-1" aria-hidden>
            {steps.map((_, n) => (
              <span key={n} className={`h-1.5 rounded-full transition-all ${n === i ? 'w-4 bg-slate-900' : 'w-1.5 bg-slate-200'}`} />
            ))}
          </span>
        </div>
        <h2 className="text-base font-semibold text-slate-900">{step.title}</h2>
        <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-600">{step.body}</p>
        <div className="mt-4 flex items-center gap-2">
          {!last && (
            <button type="button" onClick={onClose} className="text-sm text-slate-500 hover:text-slate-800">
              O‘tkazib yuborish
            </button>
          )}
          <span className="flex-1" />
          {i > 0 && (
            <button type="button" onClick={back} className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100">
              Orqaga
            </button>
          )}
          <button data-autofocus type="button" onClick={next} className="rounded-md bg-slate-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-slate-800">
            {last ? 'Tushunarli' : 'Keyingi'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
