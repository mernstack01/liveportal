/** Izoh matnida loyiha a'zolarining @username'larini ajratib ko'rsatadi. */
export function MentionText({ text, usernames, onDark = false }: { text: string; usernames: Set<string>; onDark?: boolean }) {
  const parts = text.split(/(@[A-Za-z0-9_]{5,32})/g)
  return (
    <p className={`whitespace-pre-wrap break-words text-sm ${onDark ? 'text-white' : 'text-slate-800'}`}>
      {parts.map((part, i) =>
        part.startsWith('@') && usernames.has(part.slice(1).toLowerCase()) ? (
          <span key={i} className={`rounded px-0.5 font-medium ${onDark ? 'bg-white/20 text-white' : 'bg-sky-50 text-sky-700'}`}>
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </p>
  )
}
