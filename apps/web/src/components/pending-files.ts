import { useState, type ClipboardEvent } from 'react'

/** Server cheklovi bilan bir xil (MAX_UPLOAD_MB, bitta xabarga 10 ta). */
export const MAX_FILES = 10
export const MAX_MB = 20

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** Yuborishdan oldingi fayl: rasm bo'lsa — kichik ko'rinish. */
export interface PendingFile {
  key: string
  file: File
  preview: string | null
}

/** Yuboriladigan fayllar ro'yxati: hajm va son tekshiruvi, ko'rinish URL'larini tozalash. */
export function usePendingFiles() {
  const [pending, setPending] = useState<PendingFile[]>([])
  const [notice, setNotice] = useState<string | null>(null)

  const add = (list: FileList | File[]) => {
    const incoming = [...list]
    const tooBig = incoming.filter((f) => f.size > MAX_MB * 1024 * 1024)
    const ok = incoming.filter((f) => f.size <= MAX_MB * 1024 * 1024)
    const room = MAX_FILES - pending.length
    if (tooBig.length > 0) setNotice(`${tooBig.map((f) => f.name).join(', ')}: ${MAX_MB} MB dan katta`)
    else if (ok.length > room) setNotice(`Bir martada ko‘pi bilan ${MAX_FILES} ta fayl`)
    else setNotice(null)
    setPending((p) => [
      ...p,
      ...ok.slice(0, Math.max(0, room)).map((file) => ({
        key: `${file.name}-${file.size}-${Math.random()}`,
        file,
        preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      })),
    ])
  }

  /** Kichik ko'rinish uchun yaratilgan URL xotiradan tozalanadi. */
  const remove = (keys: Set<string> | 'all') =>
    setPending((list) => {
      const removed = keys === 'all' ? list : list.filter((p) => keys.has(p.key))
      removed.forEach((p) => p.preview && URL.revokeObjectURL(p.preview))
      return keys === 'all' ? [] : list.filter((p) => !keys.has(p.key))
    })

  /** Ctrl/⌘+V bilan joylangan rasm yoki fayl. */
  const onPaste = (e: ClipboardEvent) => {
    const files = [...e.clipboardData.files]
    if (files.length > 0) {
      e.preventDefault()
      add(files)
    }
  }

  return { pending, add, remove, notice, setNotice, onPaste }
}
