import type { ChatAttachment } from '../types'
import { fileSize, type PendingFile } from './pending-files'

/** Biriktirilgan fayllar: rasmlar ko'rinadi (bosilsa — to'liq hajmda), qolgani yuklab olinadi. */
export function Attachments({ items, mine = false, onMediaLoad }: { items: ChatAttachment[]; mine?: boolean; onMediaLoad?: () => void }) {
  const images = items.filter((a) => a.kind === 'image')
  const files = items.filter((a) => a.kind !== 'image')
  return (
    <div className="space-y-1.5">
      {images.length > 0 && (
        <div className={`grid gap-1 ${images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {images.map((a) => (
            <a key={a.id} href={a.url} target="_blank" rel="noreferrer" title={a.fileName} className="block w-fit overflow-hidden rounded-lg bg-slate-200">
              <img
                src={a.url}
                alt={a.fileName}
                loading="lazy"
                onLoad={onMediaLoad}
                className={images.length === 1 ? 'max-h-72 w-full max-w-xs object-contain' : 'aspect-square w-36 object-cover'}
              />
            </a>
          ))}
        </div>
      )}
      {files.map((a) => (
        <a
          key={a.id}
          href={a.url}
          download={a.fileName}
          className={`flex max-w-xs items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${mine ? 'bg-white/15 text-white hover:bg-white/25' : 'bg-white text-slate-800 ring-1 ring-slate-200 hover:ring-slate-400'}`}
        >
          <span aria-hidden className="text-lg">
            📄
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{a.fileName}</span>
            <span className={`text-xs ${mine ? 'text-white/70' : 'text-slate-500'}`}>{fileSize(a.size)} · yuklab olish</span>
          </span>
        </a>
      ))}
    </div>
  )
}


/** Yuborishdan oldingi fayllar: kichik ko'rinish va olib tashlash tugmasi. */
export function PendingFiles({ items, onRemove }: { items: PendingFile[]; onRemove: (key: string) => void }) {
  if (items.length === 0) return null
  return (
    <ul className="mb-2 flex flex-wrap gap-2" aria-label="Biriktirilgan fayllar">
      {items.map((p) => (
        <li key={p.key} className="relative">
          {p.preview ? (
            <img src={p.preview} alt={p.file.name} className="size-16 rounded-md object-cover ring-1 ring-slate-200" />
          ) : (
            <span className="flex h-16 w-40 items-center gap-2 rounded-md bg-slate-50 px-2 text-xs ring-1 ring-slate-200">
              <span aria-hidden className="text-lg">
                📄
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium">{p.file.name}</span>
                <span className="text-slate-500">{fileSize(p.file.size)}</span>
              </span>
            </span>
          )}
          <button
            type="button"
            aria-label={`${p.file.name} ni olib tashlash`}
            onClick={() => onRemove(p.key)}
            className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-slate-900 text-[11px] text-white"
          >
            ✕
          </button>
        </li>
      ))}
    </ul>
  )
}
