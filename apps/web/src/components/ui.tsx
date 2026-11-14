import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import type { Person } from '../types'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-slate-900 text-white hover:bg-slate-800',
  secondary: 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50',
  ghost: 'text-slate-600 hover:bg-slate-100',
  danger: 'text-red-600 hover:bg-red-50',
}

export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
    />
  )
}

export const inputClass =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200'

export function Avatar({ person, size = 'md' }: { person: Pick<Person, 'name' | 'avatarUrl'>; size?: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'size-6 text-[11px]' : 'size-9 text-sm'
  return person.avatarUrl ? (
    <img src={person.avatarUrl} alt="" title={person.name} className={`${cls} shrink-0 rounded-full object-cover`} />
  ) : (
    <span title={person.name} className={`${cls} inline-flex shrink-0 items-center justify-center rounded-full bg-slate-200 font-medium text-slate-700`}>
      {person.name.trim().slice(0, 1).toUpperCase()}
    </span>
  )
}

export function Badge({ className = '', children }: { className?: string; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${className}`}>{children}</span>
}

export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null
  return <p className="text-sm text-red-600">{error instanceof Error ? error.message : String(error)}</p>
}

/** Native <dialog>: fokus, Esc va fon avtomatik. */
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      // showModal fokusni birinchi tugmaga (✕) beradi; React autoFocus esa ochilishdan oldin ishlaydi.
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-xl p-0 shadow-xl backdrop:bg-slate-900/40"
    >
      {open && (
        <div className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            <button onClick={onClose} aria-label="Yopish" className="-m-1 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              ✕
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  )
}

export function Spinner({ label = 'Yuklanmoqda…' }: { label?: string }) {
  return <p className="py-10 text-center text-sm text-slate-500">{label}</p>
}
